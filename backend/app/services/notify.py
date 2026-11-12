"""In-app notifications and guardian alerts."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GuardianLink, Notification, Profile
from app.services import email


def in_app(db: Session, user_id: uuid.UUID, kind: str, title: str, body: str, link: str | None = None) -> None:
    db.add(Notification(user_id=user_id, kind=kind, title=title[:120], body=body[:400], link=link))


def active_guardians(db: Session, child_id: uuid.UUID, permission: str) -> list[tuple[GuardianLink, Profile]]:
    rows = db.execute(
        select(GuardianLink, Profile)
        .join(Profile, Profile.id == GuardianLink.guardian_id)
        .where(GuardianLink.child_id == child_id, GuardianLink.status == "active")
    ).all()
    return [(link, profile) for link, profile in rows if link.permissions.get(permission)]


def alert_guardians(
    db: Session,
    child: Profile,
    permission: str,
    kind: str,
    title: str,
    body: str,
    link_path: str | None,
    email_subject: str | None = None,
) -> list[dict]:
    """Notify every guardian who has `permission` on this child. Returns delivery results."""
    results = []
    for guardian_link, guardian in active_guardians(db, child.id, permission):
        in_app(db, guardian.id, kind, title, body, link_path or f"/guardian/{guardian_link.id}")
        name = display_name(guardian)
        results.append({"recipient": name, "channel": "in_app", "status": "sent"})
        if email_subject and guardian.email:
            results.append({"recipient": name, "channel": "email", "status": email.send(guardian.email, email_subject, body)})
    return results


def display_name(profile: Profile) -> str:
    if profile.display_name:
        return profile.display_name
    if profile.email:
        return profile.email.split("@")[0]
    return "A SAHELI user"
