"""Check-ins and time-limited live location sharing, chosen and started by the person."""

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.common import Coordinates, Strict, error, iso, now
from app.db import get_db
from app.deps import current_user, limit
from app.models import CheckIn, LiveShare, Profile
from app.services import emergency
from app.services.notify import alert_guardians, display_name

router = APIRouter(prefix="/api", tags=["location"])


class CheckInBody(Strict):
    status: Literal["safe", "need_help"] = "safe"
    note: str | None = Field(default=None, max_length=200)
    location: Coordinates | None = None


def record_checkin(db: Session, user: Profile, body: CheckInBody, source: str) -> CheckIn:
    location_id = None
    if body.location:
        report = emergency.record_location(
            db, user, None, body.location.lat, body.location.lng, body.location.accuracy, "checkin" if source == "app" else source
        )
        location_id = report.id
    checkin = CheckIn(user_id=user.id, status=body.status, note=body.note, location_id=location_id, source=source)
    db.add(checkin)
    name = display_name(user)
    if body.status == "safe":
        alert_guardians(
            db, user, "checkins", "checkin", f"{name} checked in: I'm safe", body.note or "Checked in from SAHELI.", None
        )
    else:
        alert_guardians(
            db,
            user,
            "checkins",
            "checkin_help",
            f"{name} checked in: needs help",
            body.note or "Open SAHELI to see their check-in.",
            None,
            email_subject=f"{name} says they need help",
        )
    db.commit()
    return checkin


@router.post("/checkins", dependencies=[Depends(limit("checkin", 60, 20))])
def checkin(body: CheckInBody, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    c = record_checkin(db, user, body, "app")
    return {"id": str(c.id), "at": iso(c.created_at)}


@router.get("/checkins")
def recent_checkins(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(CheckIn).where(CheckIn.user_id == user.id).order_by(CheckIn.created_at.desc()).limit(10)).all()
    return {"items": [{"status": c.status, "note": c.note, "source": c.source, "at": iso(c.created_at)} for c in rows]}


class LiveShareBody(Strict):
    minutes: int = Field(ge=15, le=480)


def _active_share(db: Session, user: Profile) -> LiveShare | None:
    return db.scalar(
        select(LiveShare).where(LiveShare.user_id == user.id, LiveShare.ended_at.is_(None), LiveShare.expires_at > now())
    )


@router.get("/location/live")
def live_status(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    share = _active_share(db, user)
    return {"active": bool(share), "until": iso(share.expires_at) if share else None}


@router.post("/location/live")
def start_live(body: LiveShareBody, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    db.execute(update(LiveShare).where(LiveShare.user_id == user.id, LiveShare.ended_at.is_(None)).values(ended_at=now()))
    share = LiveShare(user_id=user.id, expires_at=now() + timedelta(minutes=body.minutes))
    db.add(share)
    alert_guardians(
        db,
        user,
        "live_location",
        "live_started",
        f"{display_name(user)} is sharing their location",
        f"For the next {body.minutes} minutes.",
        None,
    )
    db.commit()
    return {"active": True, "until": iso(share.expires_at)}


@router.delete("/location/live")
def stop_live(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    db.execute(update(LiveShare).where(LiveShare.user_id == user.id, LiveShare.ended_at.is_(None)).values(ended_at=now()))
    db.commit()
    return {"active": False}


@router.post("/location", dependencies=[Depends(limit("location", 400, 20))])
def report_location(body: Coordinates, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """A location update during live sharing. Refused when the person isn't sharing."""
    if not _active_share(db, user):
        raise error(409, "not_sharing", "Location sharing isn't on.")
    emergency.record_location(db, user, None, body.lat, body.lng, body.accuracy, "live")
    db.commit()
    return {"ok": True}
