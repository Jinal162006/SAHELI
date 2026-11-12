"""Emergency SOS endpoints for the signed-in app."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.common import Coordinates, Strict, error, iso, not_found, parse_uuid, read_upload, retention_expiry
from app.api.evidence import sniff_mime, store_file
from app.db import get_db
from app.deps import current_user, limit
from app.models import EmergencyEvent, EmergencyNotification, EvidenceFile, EvidenceItem, Profile
from app.security import audit
from app.security.crypto import encrypt_text
from app.services import emergency, storage

router = APIRouter(prefix="/api/emergency", tags=["emergency"])

MAX_CHUNK_BYTES = 8 * 1024 * 1024
MAX_PARTS = 720  # two hours of 10-second pieces
RECORDING_TYPES = {"audio/webm", "video/webm", "audio/mp4", "video/mp4", "audio/ogg"}


def event_out(db: Session, event: EmergencyEvent) -> dict:
    notifications = db.scalars(
        select(EmergencyNotification).where(EmergencyNotification.event_id == event.id).order_by(EmergencyNotification.created_at)
    ).all()
    return {
        "id": str(event.id),
        "status": event.status,
        "trigger": event.trigger,
        "started_at": iso(event.started_at),
        "ended_at": iso(event.ended_at),
        "location": (
            {"lat": event.last_lat, "lng": event.last_lng, "accuracy_m": event.last_accuracy_m, "at": iso(event.last_location_at)}
            if event.last_lat is not None
            else None
        ),
        "deliveries": [
            {"recipient": n.recipient, "channel": n.channel, "status": n.status, "kind": n.kind, "at": iso(n.created_at)}
            for n in notifications
        ],
        "shares": emergency.shares_for(db, event),
        "recording_evidence_id": str(event.recording_evidence_id) if event.recording_evidence_id else None,
    }


def _owned(db: Session, user: Profile, event_id: str) -> EmergencyEvent:
    event = db.get(EmergencyEvent, parse_uuid(event_id))
    if not event or event.owner_id != user.id:
        raise not_found("That emergency")
    return event


class StartRequest(Strict):
    trigger: Literal["button", "voice"] = "button"
    location: Coordinates | None = None


@router.post("", dependencies=[Depends(limit("sos", 20, 20))])
def start(body: StartRequest, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    loc = (body.location.lat, body.location.lng, body.location.accuracy) if body.location else None
    result = emergency.start(db, request, user, body.trigger, loc)
    return {"created": result.created, "event": event_out(db, result.event)}


@router.get("/active")
def active(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    event = emergency.active_event(db, user.id)
    return {"event": event_out(db, event) if event else None}


@router.get("")
def history(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(
        select(EmergencyEvent).where(EmergencyEvent.owner_id == user.id).order_by(EmergencyEvent.started_at.desc()).limit(20)
    ).all()
    return {
        "items": [
            {
                "id": str(e.id),
                "status": e.status,
                "trigger": e.trigger,
                "started_at": iso(e.started_at),
                "ended_at": iso(e.ended_at),
            }
            for e in rows
        ]
    }


@router.get("/{event_id}")
def get_event(event_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return event_out(db, _owned(db, user, event_id))


@router.post("/{event_id}/location", dependencies=[Depends(limit("sos_location", 400, 20))])
def update_location(
    event_id: str, body: Coordinates, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    event = _owned(db, user, event_id)
    if event.status != "active":
        raise error(409, "not_active", "This emergency has already ended.")
    emergency.record_location(db, user, event, body.lat, body.lng, body.accuracy, "sos")
    db.commit()
    return {"ok": True, "at": iso(event.last_location_at)}


@router.post("/{event_id}/end")
def end(event_id: str, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    event = _owned(db, user, event_id)
    emergency.end(db, request, user, event)
    return {"event": event_out(db, event)}


@router.post("/{event_id}/recording", dependencies=[Depends(limit("sos_recording", 900, 20))])
async def recording_chunk(
    event_id: str,
    request: Request,
    part: int = Form(..., ge=0, lt=MAX_PARTS),
    mime_type: str = Form(..., max_length=60),
    chunk: UploadFile = File(...),
    user: Profile = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Save one piece of an emergency recording straight into the Evidence Vault."""
    event = _owned(db, user, event_id)
    base_type = mime_type.split(";")[0].strip().lower()
    if base_type not in RECORDING_TYPES:
        raise error(400, "unsupported_recording", "This recording format isn't supported.")
    data = await read_upload(chunk, MAX_CHUNK_BYTES)
    if part == 0 and sniff_mime(data, base_type) not in RECORDING_TYPES:
        raise error(400, "unsupported_recording", "This recording format isn't supported.")

    item = db.get(EvidenceItem, event.recording_evidence_id) if event.recording_evidence_id else None
    if item is None:
        if part != 0:
            raise error(409, "missing_start", "The start of this recording wasn't received.")
        item = EvidenceItem(
            id=uuid.uuid4(),
            owner_id=user.id,
            kind="recording",
            source="emergency",
            emergency_id=event.id,
            occurred_at=event.started_at,
            expires_at=retention_expiry(user.evidence_retention_days),
        )
        item.title_enc = encrypt_text("Emergency recording", f"evidence.title:{item.id}")
        db.add(item)
        db.flush()
        event.recording_evidence_id = item.id
        audit.record(db, request, user.id, "emergency.recording_started", "evidence", item.id)

    exists = db.scalar(
        select(func.count()).select_from(EvidenceFile).where(EvidenceFile.evidence_id == item.id, EvidenceFile.part == part)
    )
    if exists:
        return {"saved": True, "evidence_id": str(item.id), "part": part}
    try:
        store_file(db, item, data, base_type, part, None)
    except storage.StorageError as exc:
        db.rollback()
        raise error(502, "upload_failed", "This part of the recording couldn't be saved.") from exc
    db.commit()
    return {"saved": True, "evidence_id": str(item.id), "part": part}
