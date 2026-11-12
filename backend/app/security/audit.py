import uuid

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditEntry
from app.security.crypto import keyed_hash


def client_ip(request: Request) -> str:
    # The server runs behind the host's proxy; uvicorn's --proxy-headers sets request.client
    # from X-Forwarded-For only for trusted proxies, so this value is not spoofable by clients.
    return request.client.host if request.client else "unknown"


def _device_label(request: Request) -> str | None:
    agent = request.headers.get("user-agent", "")
    if not agent:
        return None
    for name in ("Android", "iPhone", "iPad", "Windows", "Macintosh", "Linux", "CrOS"):
        if name in agent:
            browser = next((b for b in ("Edg", "Chrome", "Firefox", "Safari") if b in agent), "Browser")
            return f"{'Edge' if browser == 'Edg' else browser} on {'Mac' if name == 'Macintosh' else name}"
    return "Other device"


def record(
    db: Session,
    request: Request,
    user_id: uuid.UUID,
    action: str,
    target_type: str | None = None,
    target_id: object | None = None,
) -> None:
    """Add an audit entry. The caller commits."""
    db.add(
        AuditEntry(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            ip_hash=keyed_hash(client_ip(request))[:16],
            device=_device_label(request),
        )
    )
