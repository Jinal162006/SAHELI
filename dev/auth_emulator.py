"""Local stand-in for the parts of Supabase Auth that the SAHELI web app uses.

DEVELOPMENT ONLY. It lets the app run end to end on one machine without a Supabase
project. It is not part of the production image and must never be exposed to a network.

    cd backend
    .venv/Scripts/python ../dev/auth_emulator.py      (Windows)
    .venv/bin/python ../dev/auth_emulator.py          (macOS / Linux)

Listens on 127.0.0.1:54321. Users are kept in dev/.auth-users.json. Emails are not sent:
password-reset links are printed to this console instead. Tokens are signed with
SUPABASE_JWT_SECRET from backend/.env, which the API also uses in development.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import jwt
import uvicorn
from dotenv import dotenv_values
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

HERE = Path(__file__).resolve().parent
ENV = dotenv_values(HERE.parent / "backend" / ".env")
SECRET = ENV.get("SUPABASE_JWT_SECRET") or ""
BASE = (ENV.get("SUPABASE_URL") or "http://127.0.0.1:54321").rstrip("/")
ISSUER = f"{BASE}/auth/v1"
STORE = HERE / ".auth-users.json"
HOST, PORT = "127.0.0.1", 54321
ACCESS_TTL = 3600

if ENV.get("SAHELI_ENV") == "production" or not SECRET:
    sys.exit("Refusing to start: the auth emulator is for local development only (needs SUPABASE_JWT_SECRET in backend/.env).")

_lock = threading.Lock()


def _load() -> dict:
    if STORE.exists():
        return json.loads(STORE.read_text(encoding="utf-8"))
    return {"users": {}, "refresh": {}, "codes": {}}


def _save(db: dict) -> None:
    STORE.write_text(json.dumps(db, indent=1), encoding="utf-8")


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${digest}"


def _check_password(password: str, stored: str) -> bool:
    salt = stored.split("$", 1)[0]
    return hmac.compare_digest(_hash_password(password, salt), stored)


def _user_json(user: dict) -> dict:
    return {
        "id": user["id"],
        "aud": "authenticated",
        "role": "authenticated",
        "email": user["email"],
        "email_confirmed_at": user["created_at"],
        "phone": "",
        "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": user.get("metadata", {}),
        "identities": [],
        "created_at": user["created_at"],
        "updated_at": user.get("updated_at", user["created_at"]),
        "is_anonymous": False,
    }


def _session(db: dict, user: dict) -> dict:
    now = int(time.time())
    access = jwt.encode(
        {
            "sub": user["id"],
            "email": user["email"],
            "role": "authenticated",
            "aud": "authenticated",
            "iss": ISSUER,
            "iat": now,
            "exp": now + ACCESS_TTL,
            "session_id": str(uuid.uuid4()),
            "is_anonymous": False,
            "user_metadata": user.get("metadata", {}),
            "app_metadata": {"provider": "email"},
        },
        SECRET,
        algorithm="HS256",
    )
    refresh = secrets.token_urlsafe(24)
    db["refresh"][refresh] = user["id"]
    return {
        "access_token": access,
        "token_type": "bearer",
        "expires_in": ACCESS_TTL,
        "expires_at": now + ACCESS_TTL,
        "refresh_token": refresh,
        "user": _user_json(user),
    }


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"code": status, "error_code": code, "msg": message}, status_code=status)


def _user_from_bearer(request: Request, db: dict) -> dict | None:
    header = request.headers.get("authorization", "")
    token = header.removeprefix("Bearer ").strip()
    try:
        claims = jwt.decode(token, SECRET, algorithms=["HS256"], audience="authenticated", issuer=ISSUER)
    except jwt.PyJWTError:
        return None
    return db["users"].get(claims["sub"])


app = FastAPI(title="SAHELI dev auth emulator", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-supabase-api-version"],
)


@app.post("/auth/v1/signup")
async def signup(request: Request):
    body = await request.json()
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    if "@" not in email:
        return _error(400, "validation_failed", "Unable to validate email address: invalid format")
    if len(password) < 8:
        return _error(422, "weak_password", "Password should be at least 8 characters.")
    with _lock:
        db = _load()
        if any(u["email"] == email for u in db["users"].values()):
            return _error(422, "user_already_exists", "User already registered")
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        user = {"id": str(uuid.uuid4()), "email": email, "password": _hash_password(password), "created_at": now, "metadata": body.get("data") or {}}
        db["users"][user["id"]] = user
        session = _session(db, user)
        _save(db)
    return session


@app.post("/auth/v1/token")
async def token(request: Request):
    grant = request.query_params.get("grant_type")
    body = await request.json()
    with _lock:
        db = _load()
        if grant == "password":
            email = str(body.get("email", "")).strip().lower()
            user = next((u for u in db["users"].values() if u["email"] == email), None)
            if not user or not _check_password(str(body.get("password", "")), user["password"]):
                return _error(400, "invalid_credentials", "Invalid login credentials")
        elif grant == "refresh_token":
            user_id = db["refresh"].pop(str(body.get("refresh_token", "")), None)
            user = db["users"].get(user_id) if user_id else None
            if not user:
                return _error(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found")
        elif grant == "pkce":
            entry = db["codes"].pop(str(body.get("auth_code", "")), None)
            verifier = str(body.get("code_verifier", ""))
            if not entry or entry["expires"] < time.time():
                return _error(400, "flow_state_not_found", "invalid flow state, no valid flow state found")
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
            if not hmac.compare_digest(challenge, entry["challenge"]):
                return _error(400, "bad_code_verifier", "code challenge does not match previously saved code verifier")
            user = db["users"].get(entry["user_id"])
            if not user:
                return _error(400, "user_not_found", "User not found")
        else:
            return _error(400, "unsupported_grant_type", "Unsupported grant type")
        session = _session(db, user)
        _save(db)
    return session


@app.get("/auth/v1/user")
async def get_user(request: Request):
    db = _load()
    user = _user_from_bearer(request, db)
    if not user:
        return _error(401, "bad_jwt", "invalid JWT")
    return _user_json(user)


@app.put("/auth/v1/user")
async def update_user(request: Request):
    body = await request.json()
    with _lock:
        db = _load()
        user = _user_from_bearer(request, db)
        if not user:
            return _error(401, "bad_jwt", "invalid JWT")
        if body.get("password"):
            if len(body["password"]) < 8:
                return _error(422, "weak_password", "Password should be at least 8 characters.")
            if _check_password(body["password"], user["password"]):
                return _error(422, "same_password", "New password should be different from the old password.")
            user["password"] = _hash_password(body["password"])
        if isinstance(body.get("data"), dict):
            user.setdefault("metadata", {}).update(body["data"])
        user["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        _save(db)
    return _user_json(user)


@app.post("/auth/v1/logout")
async def logout(request: Request):
    with _lock:
        db = _load()
        user = _user_from_bearer(request, db)
        if user and request.query_params.get("scope", "global") in {"global", "others", "local"}:
            db["refresh"] = {k: v for k, v in db["refresh"].items() if v != user["id"]}
            _save(db)
    return JSONResponse(None, status_code=204)


@app.post("/auth/v1/recover")
async def recover(request: Request):
    body = await request.json()
    email = str(body.get("email", "")).strip().lower()
    redirect_to = request.query_params.get("redirect_to") or "http://localhost:5173/reset-password"
    if urlsplit(redirect_to).hostname not in {"localhost", "127.0.0.1"}:
        return _error(400, "validation_failed", "redirect_to must be a local address")
    with _lock:
        db = _load()
        user = next((u for u in db["users"].values() if u["email"] == email), None)
        if user and body.get("code_challenge"):
            code = secrets.token_urlsafe(16)
            db["codes"][code] = {"user_id": user["id"], "challenge": body["code_challenge"], "expires": time.time() + 3600}
            _save(db)
            joiner = "&" if "?" in redirect_to else "?"
            print(f"\n[auth emulator] Password reset link for {email}:\n{redirect_to}{joiner}{urlencode({'code': code})}\n", flush=True)
    return {}  # Same response whether or not the account exists.


@app.delete("/auth/v1/admin/users/{user_id}")
async def admin_delete(user_id: str, request: Request):
    expected = ENV.get("SUPABASE_SERVICE_KEY") or ""
    if not expected or request.headers.get("apikey") != expected:
        return _error(401, "no_authorization", "This endpoint requires a valid service key")
    with _lock:
        db = _load()
        removed = db["users"].pop(user_id, None)
        db["refresh"] = {k: v for k, v in db["refresh"].items() if v != user_id}
        _save(db)
    return {} if removed else _error(404, "user_not_found", "User not found")


if __name__ == "__main__":
    os.chdir(HERE)
    print(f"SAHELI dev auth emulator on http://{HOST}:{PORT} (development only)")
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
