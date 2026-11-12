"""Safe-zone events for guardians.

Evaluated only when the child's device shares a location (check-in, SOS, live sharing or a
paired watch). There is no background tracking.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import distance_m
from app.models import GuardianLink, Profile, SafeZone, ZoneEvent
from app.services.notify import display_name, in_app


def evaluate(db: Session, child: Profile, lat: float, lng: float) -> None:
    rows = db.execute(
        select(SafeZone, GuardianLink)
        .join(GuardianLink, GuardianLink.id == SafeZone.link_id)
        .where(GuardianLink.child_id == child.id, GuardianLink.status == "active")
    ).all()
    for zone, link in rows:
        if not link.permissions.get("safe_zones"):
            continue
        inside = distance_m(lat, lng, zone.lat, zone.lng) <= zone.radius_m
        last = db.scalar(select(ZoneEvent.event).where(ZoneEvent.zone_id == zone.id).order_by(ZoneEvent.created_at.desc()))
        if inside and last != "entered":
            event = "entered"
        elif not inside and last == "entered":
            event = "left"
        else:
            continue
        db.add(ZoneEvent(zone_id=zone.id, event=event))
        name = link.child_label or display_name(child)
        verb = "arrived at" if event == "entered" else "left"
        in_app(
            db,
            link.guardian_id,
            f"zone_{event}",
            f"{name} {verb} {zone.name}",
            f"Based on a location {name} shared.",
            f"/guardian/{link.id}",
        )
