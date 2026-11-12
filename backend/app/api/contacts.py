"""Trusted contacts: the people the person chooses to alert in an emergency."""

import re
import uuid

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, Request
from pydantic import Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.common import Strict, error, iso, not_found, parse_uuid
from app.db import get_db
from app.deps import current_user
from app.models import Profile, TrustedContact
from app.security import audit

router = APIRouter(prefix="/api/contacts", tags=["contacts"])
MAX_CONTACTS = 10


def normalise_phone(value: str) -> str:
    digits = re.sub(r"[^\d+]", "", value)
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if not digits.startswith("+"):
        bare = digits.lstrip("0")
        if len(bare) == 10 and bare[0] in "6789":
            digits = "+91" + bare  # Indian mobile number without country code
        else:
            raise ValueError("Add the country code, for example +91 98765 43210.")
    if not re.fullmatch(r"\+\d{8,15}", digits):
        raise ValueError("That phone number doesn't look right.")
    return digits


class ContactBody(Strict):
    name: str = Field(min_length=1, max_length=80)
    relationship: str | None = Field(default=None, max_length=40)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=320)
    notify_on_sos: bool = True
    share_location: bool = True

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str | None) -> str | None:
        return normalise_phone(value) if value else None

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str | None) -> str | None:
        if not value:
            return None
        try:
            return validate_email(value, check_deliverability=False).normalized.lower()
        except EmailNotValidError as exc:
            raise ValueError("That email address doesn't look right.") from exc


def contact_out(c: TrustedContact) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "relationship": c.relationship,
        "phone": c.phone,
        "email": c.email,
        "notify_on_sos": c.notify_on_sos,
        "share_location": c.share_location,
        "created_at": iso(c.created_at),
    }


def _owned(db: Session, user: Profile, contact_id: str) -> TrustedContact:
    contact = db.get(TrustedContact, parse_uuid(contact_id))
    if not contact or contact.owner_id != user.id:
        raise not_found("That contact")
    return contact


@router.get("")
def list_contacts(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(TrustedContact).where(TrustedContact.owner_id == user.id).order_by(TrustedContact.created_at)).all()
    return {"items": [contact_out(c) for c in rows], "max": MAX_CONTACTS}


@router.post("")
def add_contact(
    body: ContactBody, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    if not body.phone and not body.email:
        raise error(400, "no_contact_method", "Add a phone number or an email address so SAHELI can help you reach them.")
    count = db.scalar(select(func.count()).select_from(TrustedContact).where(TrustedContact.owner_id == user.id))
    if count >= MAX_CONTACTS:
        raise error(400, "too_many_contacts", f"You can have up to {MAX_CONTACTS} trusted contacts.")
    contact = TrustedContact(id=uuid.uuid4(), owner_id=user.id, **body.model_dump())
    db.add(contact)
    audit.record(db, request, user.id, "contact.added", "contact", contact.id)
    db.commit()
    return contact_out(contact)


@router.put("/{contact_id}")
def update_contact(
    contact_id: str, body: ContactBody, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    contact = _owned(db, user, contact_id)
    if not body.phone and not body.email:
        raise error(400, "no_contact_method", "Add a phone number or an email address so SAHELI can help you reach them.")
    for key, value in body.model_dump().items():
        setattr(contact, key, value)
    db.commit()
    return contact_out(contact)


@router.delete("/{contact_id}")
def delete_contact(
    contact_id: str, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> dict:
    contact = _owned(db, user, contact_id)
    db.delete(contact)
    audit.record(db, request, user.id, "contact.removed", "contact", contact.id)
    db.commit()
    return {"deleted": True}
