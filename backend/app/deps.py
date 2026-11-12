"""FastAPI dependencies for authentication and rate limiting."""

from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Device, Profile
from app.security import ratelimit
from app.security.audit import client_ip
from app.security.auth import InvalidToken, verify_access_token
from app.security.crypto import keyed_hash


def _unauthorised(message: str = "Please sign in again.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "unauthorised", "message": message},
        headers={"WWW-Authenticate": "Bearer"},
    )


def _bearer(request: Request, scheme: str = "bearer") -> str | None:
    header = request.headers.get("authorization", "")
    prefix, _, value = header.partition(" ")
    if prefix.lower() == scheme and value:
        return value.strip()
    return None


def _profile_for(db: Session, token: str) -> Profile:
    try:
        user = verify_access_token(token)
    except InvalidToken as exc:
        raise _unauthorised() from exc
    profile = db.get(Profile, user.id)
    if profile is None:
        # First request from this account: create its profile. ON CONFLICT handles a race
        # between two first requests arriving together.
        db.execute(insert(Profile).values(id=user.id, email=user.email).on_conflict_do_nothing())
        db.commit()
        profile = db.get(Profile, user.id)
    elif user.email and profile.email != user.email:
        profile.email = user.email
        db.commit()
    return profile


def current_user(request: Request, db: Session = Depends(get_db)) -> Profile:
    token = _bearer(request)
    if not token:
        raise _unauthorised("Please sign in to continue.")
    return _profile_for(db, token)


def optional_user(request: Request, db: Session = Depends(get_db)) -> Profile | None:
    token = _bearer(request)
    return _profile_for(db, token) if token else None


def device_for_scope(scope: str) -> Callable[..., Device]:
    """Authenticate a paired watch by its device token and require a scope."""

    def dependency(request: Request, db: Session = Depends(get_db)) -> Device:
        token = _bearer(request, "device")
        if not token:
            raise _unauthorised("This device isn't paired.")
        device = db.scalar(select(Device).where(Device.token_hash == keyed_hash(token), Device.revoked_at.is_(None)))
        if device is None:
            raise _unauthorised("This device is no longer paired. Pair it again from your phone.")
        if scope not in device.scopes:
            raise HTTPException(status.HTTP_403_FORBIDDEN, {"code": "forbidden", "message": "Not allowed."})
        device.last_seen_at = datetime.now(UTC)
        db.commit()
        return device

    return dependency


def limit(name: str, per_user: int, per_ip: int, window_seconds: int = 3600) -> Callable[..., None]:
    """Rate limit an endpoint per signed-in user, or per IP address for anonymous requests."""

    def dependency(
        request: Request,
        db: Session = Depends(get_db),
        user: Profile | None = Depends(optional_user),
    ) -> None:
        if user is not None:
            ratelimit.hit(db, f"{name}:u:{user.id}", per_user, window_seconds)
        else:
            ratelimit.hit(db, f"{name}:ip:{keyed_hash(client_ip(request))[:24]}", per_ip, window_seconds)

    return dependency
