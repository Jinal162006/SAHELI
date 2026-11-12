"""Safe Meeting Mode: a plan for meeting someone from online, with check-ins.

If a check-in is missed (after a grace period), SAHELI starts an emergency alert to the
contact chosen for the meeting and includes the meeting details. The person sets all of
this up and can see exactly what will be shared before starting.
"""

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Request
from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import Coordinates, Strict, error, iso, not_found, now, parse_uuid
from app.db import get_db
from app.deps import current_user
from app.models import LocationReport, Profile, SafeMeeting, TrustedContact
from app.security import audit
from app.security.crypto import decrypt_json, encrypt_json
from app.services import email, emergency
from app.services.notify import display_name

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


class MeetingBody(Strict):
    person_name: str = Field(min_length=1, max_length=120)
    profile_link: str = Field(default="", max_length=500)
    place: str = Field(min_length=1, max_length=300)
    notes: str = Field(default="", max_length=1000)
    starts_at: datetime
    expected_end_at: datetime
    checkin_interval_min: int = Field(default=30, ge=10, le=180)
    grace_min: int = Field(default=10, ge=5, le=60)
    contact_id: uuid.UUID | None = None
    share_location: bool = True
    timezone: str = Field(default="Asia/Kolkata", max_length=60)

    @model_validator(mode="after")
    def check_times(self):
        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Unknown time zone.") from exc
        if self.expected_end_at <= self.starts_at:
            raise ValueError("The end time must be after the start time.")
        if self.expected_end_at - self.starts_at > timedelta(hours=24):
            raise ValueError("A meeting plan can cover up to 24 hours.")
        return self


def _details(m: SafeMeeting) -> dict:
    return decrypt_json(m.details_enc, f"meeting.details:{m.id}")


def plan_text(user: Profile, m: SafeMeeting) -> str:
    d = _details(m)
    zone = ZoneInfo(d.get("timezone") or "Asia/Kolkata")
    start, finish = m.starts_at.astimezone(zone), m.expected_end_at.astimezone(zone)
    lines = [
        f"{display_name(user)} is meeting someone and asked SAHELI to let you know the plan.",
        f"Meeting: {d['person_name']}" + (f" ({d['profile_link']})" if d.get("profile_link") else ""),
        f"Place: {d['place']}",
        f"From {start:%d %b %Y, %I:%M %p} to about {finish:%I:%M %p} ({zone.key}).",
        f"They will check in every {m.checkin_interval_min} minutes. If they miss one, SAHELI will alert you.",
    ]
    if d.get("notes"):
        lines.append(f"Notes: {d['notes']}")
    return "\n".join(lines)


def meeting_out(m: SafeMeeting, contact: TrustedContact | None) -> dict:
    d = _details(m)
    return {
        "id": str(m.id),
        **d,
        "starts_at": iso(m.starts_at),
        "expected_end_at": iso(m.expected_end_at),
        "checkin_interval_min": m.checkin_interval_min,
        "grace_min": m.grace_min,
        "share_location": m.share_location,
        "status": m.status,
        "next_checkin_due_at": iso(m.next_checkin_due_at),
        "last_checkin_at": iso(m.last_checkin_at),
        "escalated_at": iso(m.escalated_at),
        "emergency_id": str(m.emergency_id) if m.emergency_id else None,
        "contact": {"id": str(contact.id), "name": contact.name, "phone": contact.phone, "has_email": bool(contact.email)}
        if contact
        else None,
    }


def _owned(db: Session, user: Profile, meeting_id: str) -> tuple[SafeMeeting, TrustedContact | None]:
    meeting = db.get(SafeMeeting, parse_uuid(meeting_id))
    if not meeting or meeting.owner_id != user.id:
        raise not_found("That meeting plan")
    contact = db.get(TrustedContact, meeting.contact_id) if meeting.contact_id else None
    return meeting, contact


@router.get("")
def list_meetings(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(
        select(SafeMeeting).where(SafeMeeting.owner_id == user.id).order_by(SafeMeeting.starts_at.desc()).limit(20)
    ).all()
    contacts = {c.id: c for c in db.scalars(select(TrustedContact).where(TrustedContact.owner_id == user.id)).all()}
    return {"items": [meeting_out(m, contacts.get(m.contact_id)) for m in rows]}


@router.post("")
def create_meeting(
    body: MeetingBody, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    contact = None
    if body.contact_id:
        contact = db.get(TrustedContact, body.contact_id)
        if not contact or contact.owner_id != user.id:
            raise error(400, "invalid_contact", "Choose one of your trusted contacts.")
    meeting = SafeMeeting(
        id=uuid.uuid4(),
        owner_id=user.id,
        contact_id=contact.id if contact else None,
        starts_at=body.starts_at,
        expected_end_at=body.expected_end_at,
        checkin_interval_min=body.checkin_interval_min,
        grace_min=body.grace_min,
        share_location=body.share_location,
        status="planned",
    )
    meeting.details_enc = encrypt_json(
        {
            "person_name": body.person_name,
            "profile_link": body.profile_link,
            "place": body.place,
            "notes": body.notes,
            "timezone": body.timezone,
        },
        f"meeting.details:{meeting.id}",
    )
    db.add(meeting)
    audit.record(db, request, user.id, "meeting.planned", "meeting", meeting.id)
    db.commit()
    return meeting_out(meeting, contact)


class StartMeeting(Strict):
    tell_contact_by_email: bool = False
    location: Coordinates | None = None


@router.post("/{meeting_id}/start")
def start_meeting(
    meeting_id: str, body: StartMeeting, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    meeting, contact = _owned(db, user, meeting_id)
    if meeting.status not in {"planned"}:
        raise error(409, "already_started", "This meeting plan has already started.")
    meeting.status = "active"
    meeting.last_checkin_at = now()
    meeting.next_checkin_due_at = now() + timedelta(minutes=meeting.checkin_interval_min)
    told = None
    if body.tell_contact_by_email and contact and contact.email:
        told = email.send(contact.email, f"{display_name(user)} shared a meeting plan with you", plan_text(user, meeting))
    if body.location and meeting.share_location:
        emergency.record_location(db, user, None, body.location.lat, body.location.lng, body.location.accuracy, "meeting")
    db.commit()
    return {"meeting": meeting_out(meeting, contact), "email_status": told, "plan_text": plan_text(user, meeting)}


@router.post("/{meeting_id}/checkin")
def checkin(meeting_id: str, body: StartMeeting, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    meeting, contact = _owned(db, user, meeting_id)
    if meeting.status not in {"active", "escalated"}:
        raise error(409, "not_active", "This meeting plan isn't active.")
    meeting.last_checkin_at = now()
    meeting.next_checkin_due_at = now() + timedelta(minutes=meeting.checkin_interval_min)
    if body.location and meeting.share_location:
        emergency.record_location(db, user, None, body.location.lat, body.location.lng, body.location.accuracy, "meeting")
    db.commit()
    return {"meeting": meeting_out(meeting, contact)}


@router.post("/{meeting_id}/end")
def end_meeting(meeting_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    meeting, contact = _owned(db, user, meeting_id)
    meeting.status = "ended"
    meeting.next_checkin_due_at = None
    db.commit()
    return {"meeting": meeting_out(meeting, contact)}


@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    meeting, _ = _owned(db, user, meeting_id)
    db.delete(meeting)
    db.commit()
    return {"deleted": True}


def escalate_missed(db: Session) -> int:
    """Background job: start an emergency for meetings whose check-in is overdue."""
    overdue = db.scalars(
        select(SafeMeeting).where(SafeMeeting.status == "active", SafeMeeting.next_checkin_due_at.is_not(None))
    ).all()
    count = 0
    for meeting in overdue:
        if meeting.next_checkin_due_at + timedelta(minutes=meeting.grace_min) > now():
            continue
        user = db.get(Profile, meeting.owner_id)
        if user is None:
            continue
        meeting.status = "escalated"
        meeting.escalated_at = now()
        last = None
        if meeting.share_location:
            report = db.scalar(
                select(LocationReport).where(LocationReport.user_id == user.id).order_by(LocationReport.created_at.desc())
            )
            if report and report.created_at > meeting.starts_at - timedelta(hours=1):
                last = (report.lat, report.lng, report.accuracy_m)
        result = emergency.start(
            db,
            None,
            user,
            "missed_checkin",
            last,
            extra_message="They missed a planned check-in during a meeting.\n\n" + plan_text(user, meeting),
            only_contact_id=meeting.contact_id,
        )
        meeting.emergency_id = result.event.id
        emergency.notify_owner(
            db, user, "You missed a check-in", "SAHELI has alerted your contact. If you're safe, open SAHELI to end the alert."
        )
        db.commit()
        count += 1
    return count
