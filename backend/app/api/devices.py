"""Paired devices and the SAHELI Safety Mode (watch) API.

A watch never holds a user session. Pairing exchanges a short-lived code, shown on the
person's phone, for a device token with a fixed set of scopes. The watch API returns only
what the watch needs: first name, emergency status, and up to four trusted contacts.
"""

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import Coordinates, Strict, error, iso, not_found, now, parse_uuid
from app.api.location import CheckInBody, record_checkin
from app.db import get_db
from app.deps import current_user, device_for_scope, limit
from app.models import CheckIn, Device, PairingCode, Profile, TrustedContact
from app.security import audit
from app.security.crypto import keyed_hash, new_code, new_token, normalise_code
from app.services import emergency
from app.services.notify import display_name

router = APIRouter(prefix="/api", tags=["devices"])

PAIRING_MINUTES = 10
WATCH_SCOPES = ["sos", "checkin", "location", "contacts"]
MAX_DEVICES = 5


class PairingRequest(Strict):
    name: str = Field(default="My watch", min_length=1, max_length=60)


@router.post("/devices/pairing-code", dependencies=[Depends(limit("pairing_code", 10, 10))])
def pairing_code(body: PairingRequest, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    active = db.scalars(select(Device).where(Device.user_id == user.id, Device.revoked_at.is_(None))).all()
    if len(active) >= MAX_DEVICES:
        raise error(400, "too_many_devices", f"You can pair up to {MAX_DEVICES} devices. Remove one first.")
    code = new_code(8)

    db.add(
        PairingCode(
            user_id=user.id,
            code_hash=keyed_hash(code),
            device_name=body.name,
            expires_at=now() + timedelta(minutes=PAIRING_MINUTES),
        )
    )
    db.commit()
    return {"code": code, "expires_in_minutes": PAIRING_MINUTES}


@router.get("/devices")
def list_devices(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(
        select(Device).where(Device.user_id == user.id, Device.revoked_at.is_(None)).order_by(Device.created_at)
    ).all()
    return {
        "items": [
            {
                "id": str(d.id),
                "kind": d.kind,
                "name": d.name,
                "scopes": d.scopes,
                "paired_at": iso(d.created_at),
                "last_seen_at": iso(d.last_seen_at),
            }
            for d in rows
        ]
    }


@router.delete("/devices/{device_id}")
def revoke_device(device_id: str, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    device = db.get(Device, parse_uuid(device_id))
    if not device or device.user_id != user.id or device.revoked_at:
        raise not_found("That device")
    device.revoked_at = now()
    audit.record(db, request, user.id, "device.removed", "device", device.id)
    db.commit()
    return {"removed": True}


# Watch ---------------------------------------------------------------------------------------


class PairBody(Strict):
    code: str = Field(min_length=6, max_length=20)


@router.post("/watch/pair", dependencies=[Depends(limit("watch_pair", 10, 10))])
def pair(body: PairBody, request: Request, db: Session = Depends(get_db)) -> dict:
    record = db.scalar(select(PairingCode).where(PairingCode.code_hash == keyed_hash(normalise_code(body.code))))
    if not record or record.used_at or record.expires_at < now():
        raise error(404, "invalid_code", "That code isn't valid or has expired. Make a new one on your phone.")
    record.used_at = now()
    token = new_token()
    device = Device(
        user_id=record.user_id, kind="watch", name=record.device_name, token_hash=keyed_hash(token), scopes=WATCH_SCOPES
    )
    db.add(device)
    db.flush()
    audit.record(db, request, record.user_id, "device.paired", "device", device.id)
    db.commit()
    return {"device_token": token, "name": device.name}


def _owner(db: Session, device: Device) -> Profile:
    user = db.get(Profile, device.user_id)
    if user is None:
        raise error(401, "unauthorised", "This device is no longer paired.")
    return user


@router.get("/watch/home")
def watch_home(device: Device = Depends(device_for_scope("contacts")), db: Session = Depends(get_db)) -> dict:
    user = _owner(db, device)
    event = emergency.active_event(db, user.id)
    contacts = db.scalars(
        select(TrustedContact)
        .where(TrustedContact.owner_id == user.id, TrustedContact.phone.is_not(None))
        .order_by(TrustedContact.created_at)
        .limit(4)
    ).all()
    last = db.scalar(select(CheckIn.created_at).where(CheckIn.user_id == user.id).order_by(CheckIn.created_at.desc()))
    return {
        "first_name": display_name(user).split(" ")[0],
        "emergency": {"active": True, "started_at": iso(event.started_at)} if event else {"active": False},
        "contacts": [{"name": c.name.split(" ")[0], "phone": c.phone} for c in contacts],
        "last_checkin_at": iso(last),
    }


class WatchSos(Strict):
    location: Coordinates | None = None


@router.post("/watch/sos", dependencies=[Depends(limit("watch_sos", 20, 20))])
def watch_sos(body: WatchSos, device: Device = Depends(device_for_scope("sos")), db: Session = Depends(get_db)) -> dict:
    user = _owner(db, device)
    loc = (body.location.lat, body.location.lng, body.location.accuracy) if body.location else None
    result = emergency.start(db, None, user, "watch", loc)
    return {
        "active": True,
        "created": result.created,
        "alerts": [{"recipient": d["recipient"].split(" ")[0], "status": d["status"]} for d in result.deliveries],
    }


@router.post("/watch/sos/end")
def watch_sos_end(device: Device = Depends(device_for_scope("sos")), db: Session = Depends(get_db)) -> dict:
    user = _owner(db, device)
    event = emergency.active_event(db, user.id)
    if event:
        emergency.end(db, None, user, event)
    return {"active": False}


class WatchCheckIn(Strict):
    status: Literal["safe", "need_help"] = "safe"
    location: Coordinates | None = None


@router.post("/watch/checkin", dependencies=[Depends(limit("watch_checkin", 60, 20))])
def watch_checkin(
    body: WatchCheckIn, device: Device = Depends(device_for_scope("checkin")), db: Session = Depends(get_db)
) -> dict:
    user = _owner(db, device)
    record_checkin(db, user, CheckInBody(status=body.status, location=body.location), "watch")
    return {"ok": True}


@router.post("/watch/location", dependencies=[Depends(limit("watch_location", 400, 20))])
def watch_location(
    body: Coordinates, device: Device = Depends(device_for_scope("location")), db: Session = Depends(get_db)
) -> dict:
    """Location from the watch is accepted only during an emergency."""
    user = _owner(db, device)
    event = emergency.active_event(db, user.id)
    if not event:
        raise error(409, "not_active", "Location is only shared from the watch during an emergency.")
    emergency.record_location(db, user, event, body.lat, body.lng, body.accuracy, "watch")
    db.commit()
    return {"ok": True}
