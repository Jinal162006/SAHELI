"""Verification of Supabase Auth access tokens.

Supabase projects sign access tokens either with asymmetric keys (published as a JWKS) or,
on older projects, with a shared HS256 secret. Both are supported. Tokens must be issued by
our project, for the "authenticated" audience, and belong to a non-anonymous user.
"""

import uuid
from dataclasses import dataclass
from functools import lru_cache

import jwt
from jwt import PyJWKClient

from app.config import get_settings

ASYMMETRIC_ALGORITHMS = ["ES256", "RS256", "EdDSA"]


class InvalidToken(Exception):
    pass


@dataclass(frozen=True)
class TokenUser:
    id: uuid.UUID
    email: str | None


@lru_cache
def _jwks_client() -> PyJWKClient:
    url = f"{get_settings().supabase_url}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(url, cache_keys=True, lifespan=600, timeout=5)


def verify_access_token(token: str) -> TokenUser:
    settings = get_settings()
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise InvalidToken("Malformed token") from exc

    alg = header.get("alg")
    options = {"require": ["exp", "sub", "aud", "iss"]}
    issuer = f"{settings.supabase_url}/auth/v1"
    try:
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise InvalidToken("HS256 tokens are not accepted by this server")
            claims = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                issuer=issuer,
                options=options,
                leeway=10,
            )
        elif alg in ASYMMETRIC_ALGORITHMS:
            signing_key = _jwks_client().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=ASYMMETRIC_ALGORITHMS,
                audience="authenticated",
                issuer=issuer,
                options=options,
                leeway=10,
            )
        else:
            raise InvalidToken("Unsupported token algorithm")
    except jwt.PyJWTError as exc:
        raise InvalidToken(str(exc)) from exc

    if claims.get("role") != "authenticated" or claims.get("is_anonymous"):
        raise InvalidToken("Token is not for a signed-in user")
    try:
        user_id = uuid.UUID(claims["sub"])
    except (ValueError, TypeError) as exc:
        raise InvalidToken("Invalid subject") from exc
    email = claims.get("email") or None
    return TokenUser(id=user_id, email=email.lower() if email else None)
