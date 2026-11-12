"""Emergency (SOS) workflow, shared by the app, a paired watch and missed safe-meeting check-ins.

What actually happens when an emergency starts is recorded per recipient (sent, failed, not
configured), and the app shows exactly that. SAHELI never claims to contact the police.
"""

import uuid
from dataclasses import dataclass, field
from datetime import timedelta

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import maps_link, now, status_link
from app.models import (
    EmergencyEvent,
    EmergencyNotification,
    EmergencyShare,
    LocationReport,
    Profile,
    TrustedContact,
)
from app.security import audit
from app.security.crypto import decrypt_text, encrypt_text, keyed_hash, new_token
from app.services import email, zones
from app.services.notify import alert_guardians, display_name, in_app

SHARE_LINK_HOURS_AFTER_END = 24


@dataclass
class StartResult:
    event: EmergencyEvent
    created: bool
    deliveries: list[dict] = field(default_factory=list)


def active_event(db: Session, owner_id: uuid.UUID) -> EmergencyEvent | None:
    return db.scalar(
        select(EmergencyEvent)
        .where(EmergencyEvent.owner_id == owner_id, EmergencyEvent.status == "active")
        .order_by(EmergencyEvent.started_at.desc())
    )


def record_location(
    db: Session, user: Profile, event: EmergencyEvent | None, lat: float, lng: float, accuracy: float | None, source: str
) -> LocationReport:
    report = LocationReport(user_id=user.id, lat=lat, lng=lng, accuracy_m=accuracy, source=source)
    db.add(report)
    if event is not None:
        event.last_lat, event.last_lng, event.last_accuracy_m = lat, lng, accuracy
        event.last_location_at = now()
    db.flush()
    zones.evaluate(db, user, lat, lng)
    return report


def _alert_text(name: str, link: str, location: tuple[float, float] | None, extra: str | None) -> str:
    lines = [
        f"{name} has started an emergency alert on SAHELI.",
        "",
        f"Follow their status here: {link}",
    ]
    if location:
        lines.append(f"Last shared location: {maps_link(*location)}")
    if extra:
        lines += ["", extra]
    lines += [
        "",
        "If you think they are in immediate danger, call 112.",
        "",
        f"You received this because {name} added you as a trusted contact in SAHELI. "
        "SAHELI has not contacted the police or emergency services.",
    ]
    return "\n".join(lines)


def start(
    db: Session,
    request: Request | None,
    user: Profile,
    trigger: str,
    location: tuple[float, float, float | None] | None = None,
    extra_message: str | None = None,
    only_contact_id: uuid.UUID | None = None,
) -> StartResult:
    existing = active_event(db, user.id)
    if existing:
        if location:
            record_location(db, user, existing, *location, source="sos")
        db.commit()
        return StartResult(existing, created=False)

    event = EmergencyEvent(id=uuid.uuid4(), owner_id=user.id, trigger=trigger, status="active")
    db.add(event)
    db.flush()
    if location:
        record_location(db, user, event, *location, source="sos")

    name = display_name(user)
    deliveries: list[dict] = []
    contacts = db.scalars(
        select(TrustedContact).where(TrustedContact.owner_id == user.id, TrustedContact.notify_on_sos.is_(True))
    ).all()
    for contact in contacts:
        if only_contact_id and contact.id != only_contact_id:
            continue
        token = new_token()
        db.add(
            EmergencyShare(
                event_id=event.id,
                contact_id=contact.id,
                token_hash=keyed_hash(token),
                token_enc=encrypt_text(token, f"share:{event.id}"),
                show_location=contact.share_location,
            )
        )
        if contact.email:
            coords = (event.last_lat, event.last_lng) if contact.share_location and event.last_lat is not None else None
            status = email.send(
                contact.email, f"Emergency alert from {name}", _alert_text(name, status_link(token), coords, extra_message)
            )
        else:
            status = "no_address"
        db.add(EmergencyNotification(event_id=event.id, recipient=contact.name, channel="email", status=status))
        deliveries.append({"recipient": contact.name, "channel": "email", "status": status})

    for delivery in alert_guardians(
        db,
        user,
        "sos_alerts",
        "sos",
        f"{name} started an emergency alert",
        "Open SAHELI to see their status and location.",
        None,
        email_subject=f"Emergency alert from {name}",
    ):
        db.add(EmergencyNotification(event_id=event.id, **delivery))
        deliveries.append(delivery)

    if request is not None:
        audit.record(db, request, user.id, "emergency.started", "emergency", event.id)
    db.commit()
    return StartResult(event, created=True, deliveries=deliveries)


def end(db: Session, request: Request | None, user: Profile, event: EmergencyEvent) -> None:
    if event.status != "active":
        return
    event.status = "ended"
    event.ended_at = now()
    event.share_expires_at = event.ended_at + timedelta(hours=SHARE_LINK_HOURS_AFTER_END)
    name = display_name(user)
    for contact in db.scalars(
        select(TrustedContact)
        .join(EmergencyShare, TrustedContact.id == EmergencyShare.contact_id)
        .where(EmergencyShare.event_id == event.id)
    ).all():
        if contact.email:
            status = email.send(
                contact.email,
                f"{name} has ended their emergency alert",
                f"{name} marked themselves safe and ended the emergency alert on SAHELI.\n\n"
                "You may still want to check in with them.",
            )
            db.add(EmergencyNotification(event_id=event.id, recipient=contact.name, channel="email", status=status, kind="ended"))
    alert_guardians(
        db, user, "sos_alerts", "sos_ended", f"{name} ended their emergency alert", "They marked themselves safe.", None
    )
    if request is not None:
        audit.record(db, request, user.id, "emergency.ended", "emergency", event.id)
    db.commit()


def shares_for(db: Session, event: EmergencyEvent) -> list[dict]:
    rows = db.execute(
        select(EmergencyShare, TrustedContact)
        .outerjoin(TrustedContact, TrustedContact.id == EmergencyShare.contact_id)
        .where(EmergencyShare.event_id == event.id)
    ).all()
    out = []
    for share, contact in rows:
        token = decrypt_text(share.token_enc, f"share:{event.id}")
        out.append(
            {
                "contact_id": str(contact.id) if contact else None,
                "name": contact.name if contact else "Removed contact",
                "phone": contact.phone if contact else None,
                "link": status_link(token),
                "shows_location": share.show_location,
            }
        )
    return out


def notify_owner(db: Session, user: Profile, title: str, body: str) -> None:
    in_app(db, user.id, "emergency", title, body, "/emergency")
