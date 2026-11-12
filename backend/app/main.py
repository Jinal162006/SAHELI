"""SAHELI API and web app server."""

import logging
import threading
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import jobs
from app.api import (
    account,
    checks,
    companion,
    contacts,
    devices,
    emergency,
    evidence,
    guardian,
    incidents,
    location,
    meetings,
    notifications,
    public,
)
from app.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("saheli")

MAX_BODY_BYTES = 110 * 1024 * 1024  # largest legitimate request: five 20 MB evidence files


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    stop = threading.Event()
    if settings.run_background_jobs:
        jobs.start(stop)
    if settings.is_production and settings.storage_backend != "supabase":
        log.warning("Production is configured with local file storage")
    yield
    stop.set()


app = FastAPI(
    title="SAHELI API",
    lifespan=lifespan,
    docs_url=None if get_settings().is_production else "/api/docs",
    redoc_url=None,
    openapi_url=None if get_settings().is_production else "/api/openapi.json",
)

for module in (
    public,
    account,
    checks,
    companion,
    evidence,
    incidents,
    contacts,
    emergency,
    meetings,
    guardian,
    location,
    notifications,
    devices,
):
    app.include_router(module.router)


def _csp() -> str:
    supabase = get_settings().supabase_url
    return "; ".join(
        [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "font-src 'self'",
            "img-src 'self' blob: data:",
            "media-src 'self' blob:",
            f"connect-src 'self' {supabase}",
            "worker-src 'self'",
            "manifest-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'none'",
            "form-action 'self'",
            "object-src 'none'",
        ]
    )


@app.middleware("http")
async def guard(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
        return JSONResponse({"detail": {"code": "too_large", "message": "That upload is too large."}}, status_code=413)

    response: Response = await call_next(request)
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("Referrer-Policy", "no-referrer")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    headers.setdefault("Permissions-Policy", "geolocation=(self), microphone=(self), camera=(self), payment=(), usb=()")
    if get_settings().is_production:
        headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    path = request.url.path
    if path.startswith("/api/"):
        headers.setdefault("Cache-Control", "no-store")
    elif headers.get("content-type", "").startswith("text/html"):
        headers.setdefault("Content-Security-Policy", _csp())
        headers.setdefault("Cache-Control", "no-cache")
        if path.startswith(("/s/", "/watch")):
            headers.setdefault("X-Robots-Tag", "noindex, nofollow")
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = {}
    for err in exc.errors():
        location = ".".join(str(part) for part in err.get("loc", [])[1:]) or "body"
        message = str(err.get("msg", "Invalid value")).removeprefix("Value error, ")
        fields.setdefault(location, message)
    first = next(iter(fields.values()), "Some details need another look.")
    return JSONResponse({"detail": {"code": "invalid_input", "message": first, "fields": fields}}, status_code=422)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = exc.detail
    if not isinstance(detail, dict):
        messages = {404: "That page or item wasn't found.", 405: "That action isn't allowed here."}
        detail = {"code": f"http_{exc.status_code}", "message": messages.get(exc.status_code, str(detail))}
    return JSONResponse({"detail": detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        {"detail": {"code": "server_error", "message": "Something went wrong on our side. Please try again in a moment."}},
        status_code=500,
    )


# Web app ------------------------------------------------------------------------------------

_dist = Path(get_settings().frontend_dist).resolve()


@app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_not_found(rest: str) -> JSONResponse:
    return JSONResponse({"detail": {"code": "not_found", "message": "Unknown API endpoint."}}, status_code=404)


@app.get("/{path:path}", include_in_schema=False)
def web_app(path: str) -> Response:
    if not _dist.is_dir():
        return JSONResponse({"detail": {"code": "no_frontend", "message": "The web app has not been built."}}, status_code=404)
    candidate = (_dist / path).resolve()
    if path and _dist in candidate.parents and candidate.is_file():
        cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "public, max-age=3600"
        return FileResponse(candidate, headers={"Cache-Control": cache})
    # Client-side routes all load the app shell.
    return HTMLResponse(_app_shell())


@lru_cache
def _app_shell() -> str:
    """index.html with absolute URLs for link previews, which crawlers require."""
    base = get_settings().public_url
    html = (_dist / "index.html").read_text(encoding="utf-8")
    html = html.replace('content="/og-image.png"', f'content="{base}/og-image.png"')
    return html.replace(
        '<meta property="og:type"', f'<meta property="og:url" content="{base}/" />\n    <meta property="og:type"', 1
    )
