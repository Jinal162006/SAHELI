"""The signed-in person's profile, settings, activity log, data export and account deletion."""

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.api.common import Strict, error, iso, now
from app.db import get_db
from app.deps import current_user
from app.models import (
    AuditEntry,
    Check,
    CheckIn,
    Device,
    EmergencyEvent,
    EvidenceFile,
    EvidenceItem,
    GuardianLink,
    Incident,
    LocationReport,
    Profile,
    SafeMeeting,
    TrustedContact,
)
from app.security import audit
from app.security.crypto import decrypt_json, decrypt_text
from app.services import storage, supabase_admin
from app.services.notify import display_name, in_app

router = APIRouter(prefix="/api", tags=["account"])

AgeGroup = Literal["under_13", "13_17", "18_plus"]
Language = Literal["en", "hi", "hi-Latn"]


def profile_out(p: Profile) -> dict:
    return {
        "id": str(p.id),
        "email": p.email,
        "display_name": p.display_name,
        "age_group": p.age_group,
        "language": p.language,
        "keep_check_history": p.keep_check_history,
        "evidence_retention_days": p.evidence_retention_days,
        "created_at": iso(p.created_at),
    }


@router.get("/me")
def get_me(user: Profile = Depends(current_user)) -> dict:
    return profile_out(user)


class ProfileUpdate(Strict):
    display_name: str | None = Field(default=None, max_length=80)
    age_group: AgeGroup | None = None
    language: Language | None = None
    keep_check_history: bool | None = None
    # 0 means "keep until I delete it".
    evidence_retention_days: Literal[0, 90, 365] | None = None


@router.patch("/me")
def update_me(
    body: ProfileUpdate, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    data = body.model_dump(exclude_unset=True)
    if "display_name" in data:
        user.display_name = data["display_name"] or None
    for key in ("age_group", "language", "keep_check_history"):
        if key in data and data[key] is not None:
            setattr(user, key, data[key])
    if "evidence_retention_days" in data and data["evidence_retention_days"] is not None:
        days = data["evidence_retention_days"] or None
        user.evidence_retention_days = days
        # Apply the new period to what is already in the vault, counted from when it was saved.
        db.execute(
            update(EvidenceItem)
            .where(EvidenceItem.owner_id == user.id)
            .values(expires_at=None if days is None else EvidenceItem.created_at + timedelta(days=days))
        )
        audit.record(db, request, user.id, "settings.retention_changed")
    if data.get("keep_check_history") is False:
        db.execute(delete(Check).where(Check.owner_id == user.id))
    db.commit()
    return profile_out(user)


@router.get("/me/activity")
def activity(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(
        select(AuditEntry).where(AuditEntry.user_id == user.id).order_by(AuditEntry.created_at.desc()).limit(100)
    ).all()
    return {
        "items": [{"action": r.action, "target_type": r.target_type, "device": r.device, "at": iso(r.created_at)} for r in rows]
    }


@router.get("/me/export")
def export(request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Everything SAHELI stores about this account, decrypted, in one JSON document."""
    evidence = []
    for item in db.scalars(select(EvidenceItem).where(EvidenceItem.owner_id == user.id)).all():
        files = db.scalars(select(EvidenceFile).where(EvidenceFile.evidence_id == item.id)).all()
        evidence.append(
            {
                "id": str(item.id),
                "kind": item.kind,
                "title": decrypt_text(item.title_enc, f"evidence.title:{item.id}"),
                "notes": decrypt_text(item.notes_enc, f"evidence.notes:{item.id}"),
                "content": decrypt_text(item.content_enc, f"evidence.content:{item.id}"),
                "platform": item.platform,
                "occurred_at": iso(item.occurred_at),
                "saved_at": iso(item.created_at),
                "files": [{"mime_type": f.mime_type, "size_bytes": f.size_bytes, "sha256": f.sha256} for f in files],
            }
        )
    incidents = [
        {
            "id": str(i.id),
            "type": i.incident_type,
            "title": decrypt_text(i.title_enc, f"incident.title:{i.id}"),
            "details": decrypt_json(i.details_enc, f"incident.details:{i.id}"),
            "updated_at": iso(i.updated_at),
        }
        for i in db.scalars(select(Incident).where(Incident.owner_id == user.id)).all()
    ]
    meetings = [
        {
            "id": str(m.id),
            "details": decrypt_json(m.details_enc, f"meeting.details:{m.id}"),
            "starts_at": iso(m.starts_at),
            "status": m.status,
        }
        for m in db.scalars(select(SafeMeeting).where(SafeMeeting.owner_id == user.id)).all()
    ]
    audit.record(db, request, user.id, "account.export")
    db.commit()
    return {
        "exported_at": iso(now()),
        "profile": profile_out(user),
        "trusted_contacts": [
            {
                "name": c.name,
                "relationship": c.relationship,
                "phone": c.phone,
                "email": c.email,
                "notify_on_sos": c.notify_on_sos,
                "share_location": c.share_location,
            }
            for c in db.scalars(select(TrustedContact).where(TrustedContact.owner_id == user.id)).all()
        ],
        "check_history": [
            {"kind": c.kind, "level": c.level, "signals": c.signals, "patterns": c.patterns, "at": iso(c.created_at)}
            for c in db.scalars(select(Check).where(Check.owner_id == user.id)).all()
        ],
        "evidence": evidence,
        "evidence_files_note": "File contents are not included here. Download them from the Evidence Vault.",
        "incidents": incidents,
        "safe_meetings": meetings,
        "emergencies": [
            {"status": e.status, "trigger": e.trigger, "started_at": iso(e.started_at), "ended_at": iso(e.ended_at)}
            for e in db.scalars(select(EmergencyEvent).where(EmergencyEvent.owner_id == user.id)).all()
        ],
        "check_ins": [
            {"status": c.status, "note": c.note, "at": iso(c.created_at)}
            for c in db.scalars(select(CheckIn).where(CheckIn.user_id == user.id)).all()
        ],
        "shared_locations": [
            {"lat": r.lat, "lng": r.lng, "source": r.source, "at": iso(r.created_at)}
            for r in db.scalars(select(LocationReport).where(LocationReport.user_id == user.id)).all()
        ],
        "paired_devices": [
            {"name": d.name, "kind": d.kind, "paired_at": iso(d.created_at), "revoked_at": iso(d.revoked_at)}
            for d in db.scalars(select(Device).where(Device.user_id == user.id)).all()
        ],
        "activity": [
            {"action": a.action, "at": iso(a.created_at)}
            for a in db.scalars(select(AuditEntry).where(AuditEntry.user_id == user.id)).all()
        ],
    }


class DeleteAccount(Strict):
    confirm: Literal["DELETE"]


@router.delete("/me")
def delete_account(body: DeleteAccount, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    keys = list(
        db.scalars(
            select(EvidenceFile.object_key)
            .join(EvidenceItem, EvidenceItem.id == EvidenceFile.evidence_id)
            .where(EvidenceItem.owner_id == user.id)
        ).all()
    )
    try:
        storage.delete(keys)
    except storage.StorageError as exc:
        raise error(
            502, "delete_failed", "We couldn't delete your stored files just now, so nothing was deleted. Please try again."
        ) from exc

    # Let anyone linked to this account know the link has ended.
    name = display_name(user)
    for link in db.scalars(
        select(GuardianLink).where(
            GuardianLink.status == "active", (GuardianLink.child_id == user.id) | (GuardianLink.guardian_id == user.id)
        )
    ).all():
        other = link.guardian_id if link.child_id == user.id else link.child_id
        in_app(
            db, other, "link_ended", "A SAHELI link has ended", f"{name} deleted their SAHELI account, so your link has ended."
        )

    db.delete(user)  # Everything else cascades.
    db.commit()
    auth_deleted = supabase_admin.delete_auth_user(user.id)
    return {"deleted": True, "sign_in_removed": auth_deleted}
