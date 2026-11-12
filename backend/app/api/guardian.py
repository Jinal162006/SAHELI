"""Guardian and child links.

A guardian creates an invite with the permissions they are asking for. The child, signed in
on their own device, sees exactly what will be shared and accepts or declines. Either side
can end the link and the other side is told. Guardians only ever see locations the child's
device shared (check-ins, SOS, time-limited live sharing); there is no background tracking.
"""

import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import Strict, error, iso, not_found, now, parse_uuid
from app.db import get_db
from app.deps import current_user, limit
from app.models import (
    CheckIn,
    EmergencyEvent,
    GuardianInvite,
    GuardianLink,
    LiveShare,
    LocationReport,
    Profile,
    SafeZone,
    ZoneEvent,
)
from app.security import audit
from app.security.crypto import keyed_hash, new_code, normalise_code
from app.services.notify import display_name, in_app

router = APIRouter(prefix="/api/guardian", tags=["guardian"])

INVITE_HOURS = 24
MAX_ZONES = 10


class Permissions(Strict):
    sos_alerts: bool = True
    checkins: bool = True
    location_on_sos: bool = True
    live_location: bool = True
    safe_zones: bool = True


class InviteBody(Strict):
    child_label: str = Field(min_length=1, max_length=60)
    permissions: Permissions = Permissions()


@router.post("/invites", dependencies=[Depends(limit("guardian_invite", 20, 20))])
def create_invite(
    body: InviteBody, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    code = new_code(8)
    invite = GuardianInvite(
        guardian_id=user.id,
        code_hash=keyed_hash(code),
        child_label=body.child_label,
        permissions=body.permissions.model_dump(),
        expires_at=now() + timedelta(hours=INVITE_HOURS),
    )
    db.add(invite)
    audit.record(db, request, user.id, "guardian.invite_created")
    db.commit()
    return {"code": code, "expires_at": iso(invite.expires_at), "permissions": invite.permissions}


class CodeBody(Strict):
    code: str = Field(min_length=6, max_length=20)


def _find_invite(db: Session, code: str) -> GuardianInvite:
    invite = db.scalar(select(GuardianInvite).where(GuardianInvite.code_hash == keyed_hash(normalise_code(code))))
    if not invite or invite.used_at or invite.expires_at < now():
        raise error(404, "invalid_code", "That code isn't valid or has expired. Ask for a new one.")
    return invite


@router.post("/invites/preview", dependencies=[Depends(limit("guardian_code", 10, 10))])
def preview_invite(body: CodeBody, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """What the child sees before accepting: who is asking and what they would see."""
    invite = _find_invite(db, body.code)
    if invite.guardian_id == user.id:
        raise error(400, "own_invite", "This code is yours. Enter it on the other person's phone, signed in to their account.")
    guardian = db.get(Profile, invite.guardian_id)
    return {"guardian_name": display_name(guardian), "child_label": invite.child_label, "permissions": invite.permissions}


@router.post("/invites/accept", dependencies=[Depends(limit("guardian_code", 10, 10))])
def accept_invite(body: CodeBody, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    invite = _find_invite(db, body.code)
    if invite.guardian_id == user.id:
        raise error(400, "own_invite", "You can't link to yourself.")
    existing = db.scalar(
        select(GuardianLink).where(
            GuardianLink.guardian_id == invite.guardian_id, GuardianLink.child_id == user.id, GuardianLink.status == "active"
        )
    )
    if existing:
        raise error(409, "already_linked", "You're already linked with this person.")
    invite.used_at = now()
    link = GuardianLink(
        guardian_id=invite.guardian_id, child_id=user.id, child_label=invite.child_label, permissions=invite.permissions
    )
    db.add(link)
    db.flush()
    in_app(
        db,
        invite.guardian_id,
        "link_accepted",
        f"{invite.child_label} accepted your link",
        "You can now see what they agreed to share.",
        f"/guardian/{link.id}",
    )
    audit.record(db, request, user.id, "guardian.link_accepted", "guardian_link", link.id)
    db.commit()
    return {"link_id": str(link.id)}


def _link_out(db: Session, link: GuardianLink, viewer: Profile) -> dict:
    as_guardian = link.guardian_id == viewer.id
    other = db.get(Profile, link.child_id if as_guardian else link.guardian_id)
    zones = db.scalars(select(SafeZone).where(SafeZone.link_id == link.id)).all()
    return {
        "id": str(link.id),
        "role": "guardian" if as_guardian else "child",
        "name": link.child_label if as_guardian else display_name(other),
        "permissions": link.permissions,
        "status": link.status,
        "since": iso(link.created_at),
        "zones": [{"id": str(z.id), "name": z.name, "lat": z.lat, "lng": z.lng, "radius_m": z.radius_m} for z in zones],
    }


@router.get("/links")
def list_links(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    links = db.scalars(
        select(GuardianLink)
        .where(GuardianLink.status == "active", (GuardianLink.guardian_id == user.id) | (GuardianLink.child_id == user.id))
        .order_by(GuardianLink.created_at)
    ).all()
    out = [_link_out(db, link, user) for link in links]
    return {"as_guardian": [x for x in out if x["role"] == "guardian"], "as_child": [x for x in out if x["role"] == "child"]}


def _link_for(db: Session, user: Profile, link_id: str, role: str | None = None) -> GuardianLink:
    link = db.get(GuardianLink, parse_uuid(link_id))
    if not link or link.status != "active" or user.id not in {link.guardian_id, link.child_id}:
        raise not_found("That link")
    if role == "guardian" and link.guardian_id != user.id:
        raise not_found("That link")
    return link


@router.delete("/links/{link_id}")
def end_link(link_id: str, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = _link_for(db, user, link_id)
    link.status = "ended"
    link.ended_by = user.id
    link.ended_at = now()
    other = link.child_id if link.guardian_id == user.id else link.guardian_id
    in_app(db, other, "link_ended", "A SAHELI link has ended", f"{display_name(user)} ended your guardian link.")
    audit.record(db, request, user.id, "guardian.link_ended", "guardian_link", link.id)
    db.commit()
    return {"ended": True}


@router.get("/links/{link_id}/overview")
def overview(link_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """The guardian's view of a child, limited to what the child agreed to share."""
    link = _link_for(db, user, link_id, role="guardian")
    perms = link.permissions
    child_id = link.child_id
    since = now() - timedelta(days=7)

    sources = set()
    if perms.get("checkins"):
        sources |= {"checkin", "watch"}
    if perms.get("location_on_sos"):
        sources.add("sos")
    live = db.scalar(
        select(LiveShare).where(LiveShare.user_id == child_id, LiveShare.ended_at.is_(None), LiveShare.expires_at > now())
    )
    if perms.get("live_location"):
        sources.add("live")

    last_location = None
    if sources:
        report = db.scalar(
            select(LocationReport)
            .where(
                LocationReport.user_id == child_id,
                LocationReport.source.in_(sources),
                LocationReport.created_at >= link.created_at,
            )
            .order_by(LocationReport.created_at.desc())
        )
        if report:
            last_location = {
                "lat": report.lat,
                "lng": report.lng,
                "accuracy_m": report.accuracy_m,
                "source": report.source,
                "at": iso(report.created_at),
            }

    checkins = []
    if perms.get("checkins"):
        checkins = [
            {"status": c.status, "note": c.note, "source": c.source, "at": iso(c.created_at)}
            for c in db.scalars(
                select(CheckIn)
                .where(CheckIn.user_id == child_id, CheckIn.created_at >= max(since, link.created_at))
                .order_by(CheckIn.created_at.desc())
                .limit(20)
            ).all()
        ]

    emergencies = []
    active_emergency = None
    if perms.get("sos_alerts"):
        rows = db.scalars(
            select(EmergencyEvent)
            .where(EmergencyEvent.owner_id == child_id, EmergencyEvent.started_at >= max(since, link.created_at))
            .order_by(EmergencyEvent.started_at.desc())
        ).all()
        emergencies = [{"status": e.status, "started_at": iso(e.started_at), "ended_at": iso(e.ended_at)} for e in rows]
        active = next((e for e in rows if e.status == "active"), None)
        if active:
            active_emergency = {
                "started_at": iso(active.started_at),
                "location": (
                    {"lat": active.last_lat, "lng": active.last_lng, "at": iso(active.last_location_at)}
                    if perms.get("location_on_sos") and active.last_lat is not None
                    else None
                ),
            }

    zone_events = []
    if perms.get("safe_zones"):
        zone_events = [
            {"zone": z.name, "event": e.event, "at": iso(e.created_at)}
            for e, z in db.execute(
                select(ZoneEvent, SafeZone)
                .join(SafeZone, SafeZone.id == ZoneEvent.zone_id)
                .where(SafeZone.link_id == link.id, ZoneEvent.created_at >= since)
                .order_by(ZoneEvent.created_at.desc())
                .limit(20)
            ).all()
        ]

    return {
        **_link_out(db, link, user),
        "live_sharing": {"active": bool(live) and perms.get("live_location"), "until": iso(live.expires_at) if live else None},
        "last_location": last_location,
        "active_emergency": active_emergency,
        "checkins": checkins,
        "emergencies": emergencies,
        "zone_events": zone_events,
    }


@router.post("/links/{link_id}/request-checkin", dependencies=[Depends(limit("checkin_request", 20, 20))])
def request_checkin(link_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = _link_for(db, user, link_id, role="guardian")
    in_app(
        db,
        link.child_id,
        "checkin_requested",
        f"{display_name(user)} asked you to check in",
        "Tap to let them know you're okay.",
        "/checkin",
    )
    db.commit()
    return {"sent": True}


class ZoneBody(Strict):
    name: str = Field(min_length=1, max_length=60)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(ge=100, le=5000)


@router.post("/links/{link_id}/zones")
def add_zone(link_id: str, body: ZoneBody, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    link = _link_for(db, user, link_id, role="guardian")
    if not link.permissions.get("safe_zones"):
        raise error(403, "not_permitted", "Safe zones weren't part of what was agreed for this link.")
    if len(db.scalars(select(SafeZone.id).where(SafeZone.link_id == link.id)).all()) >= MAX_ZONES:
        raise error(400, "too_many_zones", f"You can add up to {MAX_ZONES} safe zones.")
    zone = SafeZone(id=uuid.uuid4(), link_id=link.id, **body.model_dump())
    db.add(zone)
    in_app(
        db,
        link.child_id,
        "zone_added",
        f"New safe zone: {body.name}",
        "Your guardian added a safe zone. You can see it in your links.",
        "/family",
    )
    db.commit()
    return {"id": str(zone.id)}


@router.delete("/zones/{zone_id}")
def delete_zone(zone_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    zone = db.get(SafeZone, parse_uuid(zone_id))
    link = db.get(GuardianLink, zone.link_id) if zone else None
    if not zone or not link or link.guardian_id != user.id:
        raise not_found("That safe zone")
    db.delete(zone)
    db.commit()
    return {"deleted": True}
