"""Incident reports: a structured record the person can share with police, a platform,
a counsellor or a lawyer. SAHELI does not submit reports anywhere itself."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.common import Strict, error, iso, not_found, parse_uuid
from app.db import get_db
from app.deps import current_user, limit
from app.engine.reports import INCIDENT_TYPES, draft_narrative
from app.models import EvidenceItem, Incident, Profile
from app.security import audit
from app.security.crypto import decrypt_json, decrypt_text, encrypt_json, encrypt_text
from app.services import llm

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

IncidentType = Literal[
    "romance_scam",
    "sextortion",
    "financial_fraud",
    "harassment",
    "stalking",
    "identity_misuse",
    "phishing",
    "grooming",
    "threats",
    "other",
]
assert set(IncidentType.__args__) == set(INCIDENT_TYPES)


class TimelineEntry(Strict):
    when: str = Field(default="", max_length=40)  # free text: people often only know "early March"
    what: str = Field(max_length=2000)


class Person(Strict):
    name: str = Field(default="", max_length=120)
    handle: str = Field(default="", max_length=120)
    platform: str = Field(default="", max_length=60)
    profile_url: str = Field(default="", max_length=500)
    phone: str = Field(default="", max_length=40)
    payment_ids: str = Field(default="", max_length=300)  # UPI IDs, account numbers they used
    role: str = Field(default="", max_length=120)


class FinancialLoss(Strict):
    amount: str = Field(default="", max_length=20)
    currency: str = Field(default="INR", max_length=5)
    method: str = Field(default="", max_length=60)
    transaction_refs: str = Field(default="", max_length=500)
    date: str = Field(default="", max_length=40)
    bank_informed: bool = False


class ReportedTo(Strict):
    where: str = Field(max_length=120)
    reference: str = Field(default="", max_length=120)
    date: str = Field(default="", max_length=40)


class Details(Strict):
    summary: str = Field(default="", max_length=5000)
    timeline: list[TimelineEntry] = Field(default_factory=list, max_length=60)
    people: list[Person] = Field(default_factory=list, max_length=20)
    financial_loss: FinancialLoss = FinancialLoss()
    narrative: str = Field(default="", max_length=10000)
    notes: str = Field(default="", max_length=5000)
    reported_to: list[ReportedTo] = Field(default_factory=list, max_length=20)


class IncidentBody(Strict):
    incident_type: IncidentType
    title: str = Field(min_length=1, max_length=200)
    details: Details = Details()
    evidence_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)


def _owned(db: Session, user: Profile, incident_id: str) -> Incident:
    incident = db.get(Incident, parse_uuid(incident_id))
    if not incident or incident.owner_id != user.id:
        raise not_found("That report")
    return incident


def _valid_evidence(db: Session, user: Profile, ids: list[uuid.UUID]) -> list[uuid.UUID]:
    if not ids:
        return []
    owned = set(db.scalars(select(EvidenceItem.id).where(EvidenceItem.owner_id == user.id, EvidenceItem.id.in_(ids))).all())
    return [i for i in ids if i in owned]


def _out(db: Session, incident: Incident, full: bool = True) -> dict:
    out = {
        "id": str(incident.id),
        "incident_type": incident.incident_type,
        "title": decrypt_text(incident.title_enc, f"incident.title:{incident.id}"),
        "created_at": iso(incident.created_at),
        "updated_at": iso(incident.updated_at),
        "evidence_count": len(incident.evidence_ids or []),
    }
    if full:
        out["details"] = decrypt_json(incident.details_enc, f"incident.details:{incident.id}")
        evidence = []
        if incident.evidence_ids:
            items = db.scalars(select(EvidenceItem).where(EvidenceItem.id.in_(incident.evidence_ids))).all()
            by_id = {i.id: i for i in items}
            for eid in incident.evidence_ids:
                item = by_id.get(eid)
                if item:  # Items deleted from the vault drop out of the report.
                    evidence.append(
                        {
                            "id": str(item.id),
                            "kind": item.kind,
                            "title": decrypt_text(item.title_enc, f"evidence.title:{item.id}"),
                            "occurred_at": iso(item.occurred_at),
                            "saved_at": iso(item.created_at),
                        }
                    )
        out["evidence"] = evidence
        out["evidence_count"] = len(evidence)
    return out


@router.get("")
def list_incidents(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Incident).where(Incident.owner_id == user.id).order_by(Incident.updated_at.desc())).all()
    return {"items": [_out(db, i, full=False) for i in rows]}


@router.post("")
def create_incident(
    body: IncidentBody, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    incident = Incident(id=uuid.uuid4(), owner_id=user.id, incident_type=body.incident_type)
    incident.title_enc = encrypt_text(body.title, f"incident.title:{incident.id}")
    incident.details_enc = encrypt_json(body.details.model_dump(), f"incident.details:{incident.id}")
    incident.evidence_ids = _valid_evidence(db, user, body.evidence_ids)
    db.add(incident)
    audit.record(db, request, user.id, "incident.created", "incident", incident.id)
    db.commit()
    return _out(db, incident)


@router.get("/{incident_id}")
def get_incident(incident_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return _out(db, _owned(db, user, incident_id))


@router.put("/{incident_id}")
def update_incident(
    incident_id: str, body: IncidentBody, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    incident = _owned(db, user, incident_id)
    incident.incident_type = body.incident_type
    incident.title_enc = encrypt_text(body.title, f"incident.title:{incident.id}")
    incident.details_enc = encrypt_json(body.details.model_dump(), f"incident.details:{incident.id}")
    incident.evidence_ids = _valid_evidence(db, user, body.evidence_ids)
    db.commit()
    db.refresh(incident)
    return _out(db, incident)


@router.delete("/{incident_id}")
def delete_incident(
    incident_id: str, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    incident = _owned(db, user, incident_id)
    db.delete(incident)
    audit.record(db, request, user.id, "incident.deleted", "incident", incident.id)
    db.commit()
    return {"deleted": True}


class DraftRequest(Strict):
    language: Literal["en", "hi", "hi-Latn"] = "en"


@router.post("/{incident_id}/draft", dependencies=[Depends(limit("incident_draft", 20, 20))])
def draft(incident_id: str, body: DraftRequest, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """AI help writing the narrative. Returned for the person to review; never saved automatically."""
    incident = _owned(db, user, incident_id)
    details = decrypt_json(incident.details_enc, f"incident.details:{incident.id}")
    try:
        return draft_narrative(incident.incident_type, details, body.language)
    except llm.AIUnavailable as exc:
        raise error(
            503, f"ai_{exc.reason}", "Writing help isn't available right now. You can still write the account yourself."
        ) from exc
