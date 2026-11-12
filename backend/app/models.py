"""Database tables.

Conventions:
- Every user-owned row carries the owner's id and is deleted when the profile is deleted.
- Columns ending in `_enc` hold AES-GCM ciphertext produced by app.security.crypto.
- No table stores the text of a checked conversation.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _id() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, default=uuid.uuid4)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def _owner(column: str = "profiles.id", index: bool = True) -> Mapped[uuid.UUID]:
    return mapped_column(ForeignKey(column, ondelete="CASCADE"), index=index, nullable=False)


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)  # Supabase auth user id
    email: Mapped[str | None] = mapped_column(String(320))
    display_name: Mapped[str | None] = mapped_column(String(80))
    # under_13 | 13_17 | 18_plus | None (not answered yet)
    age_group: Mapped[str | None] = mapped_column(String(10))
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    keep_check_history: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # None means "keep until I delete it".
    evidence_retention_days: Mapped[int | None] = mapped_column(Integer, default=365)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TrustedContact(Base):
    __tablename__ = "trusted_contacts"

    id: Mapped[uuid.UUID] = _id()
    owner_id: Mapped[uuid.UUID] = _owner()
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    relationship: Mapped[str | None] = mapped_column(String(40))
    phone: Mapped[str | None] = mapped_column(String(20))  # E.164
    email: Mapped[str | None] = mapped_column(String(320))
    notify_on_sos: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    share_location: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = _created()


class Check(Base):
    """A record that a safety check happened. Holds the outcome, never the checked content."""

    __tablename__ = "checks"

    id: Mapped[uuid.UUID] = _id()
    owner_id: Mapped[uuid.UUID] = _owner()
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # conversation | link | image | profile
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str | None] = mapped_column(String(120))  # e.g. "Link to bit.ly"; never message text
    signals: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    patterns: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    stages: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    ai_review: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = _created()


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    id: Mapped[uuid.UUID] = _id()
    owner_id: Mapped[uuid.UUID] = _owner()
    # screenshot | image | conversation | link | note | recording | document
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    notes_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    content_enc: Mapped[bytes | None] = mapped_column(LargeBinary)  # pasted text or a URL
    platform: Mapped[str | None] = mapped_column(String(40))
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String(30), default="upload", nullable=False)
    emergency_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("emergency_events.id", ondelete="SET NULL"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = _created()


class EvidenceFile(Base):
    """An encrypted file (or one piece of a recording) belonging to an evidence item."""

    __tablename__ = "evidence_files"

    id: Mapped[uuid.UUID] = _id()
    evidence_id: Mapped[uuid.UUID] = _owner("evidence_items.id")
    part: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    object_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    filename_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)  # of the original bytes
    created_at: Mapped[datetime] = _created()

    __table_args__ = (UniqueConstraint("evidence_id", "part"),)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = _id()
    owner_id: Mapped[uuid.UUID] = _owner()
    # romance_scam | sextortion | financial_fraud | harassment | identity_misuse | phishing | grooming | other
    incident_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    details_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)  # JSON document
    evidence_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(Uuid), default=list, nullable=False)
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class EmergencyEvent(Base):
    __tablename__ = "emergency_events"

    id: Mapped[uuid.UUID] = _id()
    owner_id: Mapped[uuid.UUID] = _owner()
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active | ended
    trigger: Mapped[str] = mapped_column(String(30), nullable=False)  # button | voice | watch | missed_checkin
    started_at: Mapped[datetime] = _created()
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Status links stop working at this time (set when the emergency ends).
    share_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_lat: Mapped[float | None] = mapped_column(Float)
    last_lng: Mapped[float | None] = mapped_column(Float)
    last_accuracy_m: Mapped[float | None] = mapped_column(Float)
    last_location_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recording_evidence_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("evidence_items.id", ondelete="SET NULL", use_alter=True)
    )


class EmergencyShare(Base):
    """A private status link for one trusted contact during one emergency."""

    __tablename__ = "emergency_shares"

    id: Mapped[uuid.UUID] = _id()
    event_id: Mapped[uuid.UUID] = _owner("emergency_events.id")
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("trusted_contacts.id", ondelete="SET NULL"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    token_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)  # so the owner can re-send it
    show_location: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = _created()


class EmergencyNotification(Base):
    __tablename__ = "emergency_notifications"

    id: Mapped[uuid.UUID] = _id()
    event_id: Mapped[uuid.UUID] = _owner("emergency_events.id")
    recipient: Mapped[str] = mapped_column(String(120), nullable=False)  # display name only
    channel: Mapped[str] = mapped_column(String(20), nullable=False)  # email | in_app
    # sent | failed | not_configured | no_address
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="started", nullable=False)  # started | ended
    created_at: Mapped[datetime] = _created()


class SafeMeeting(Base):
    __tablename__ = "safe_meetings"

    id: Mapped[uuid.UUID] = _id()
    owner_id: Mapped[uuid.UUID] = _owner()
    details_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)  # who, where, notes
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("trusted_contacts.id", ondelete="SET NULL"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expected_end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    checkin_interval_min: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    grace_min: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    share_location: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # planned | active | ended | escalated
    status: Mapped[str] = mapped_column(String(20), default="planned", nullable=False)
    next_checkin_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    last_checkin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    emergency_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("emergency_events.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _created()


class GuardianInvite(Base):
    __tablename__ = "guardian_invites"

    id: Mapped[uuid.UUID] = _id()
    guardian_id: Mapped[uuid.UUID] = _owner()
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    child_label: Mapped[str] = mapped_column(String(60), nullable=False)
    permissions: Mapped[dict] = mapped_column(JSONB, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class GuardianLink(Base):
    __tablename__ = "guardian_links"

    id: Mapped[uuid.UUID] = _id()
    guardian_id: Mapped[uuid.UUID] = _owner()
    child_id: Mapped[uuid.UUID] = _owner()
    child_label: Mapped[str] = mapped_column(String(60), nullable=False)
    permissions: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active | ended
    ended_by: Mapped[uuid.UUID | None] = mapped_column()
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class SafeZone(Base):
    __tablename__ = "safe_zones"

    id: Mapped[uuid.UUID] = _id()
    link_id: Mapped[uuid.UUID] = _owner("guardian_links.id")
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = _created()


class LocationReport(Base):
    """A location the user chose to share (check-in, SOS, live sharing, watch). Kept 30 days."""

    __tablename__ = "location_reports"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = _owner()
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_m: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # checkin | sos | live | watch | meeting
    created_at: Mapped[datetime] = _created()


class LiveShare(Base):
    """A time-limited period in which the user shares their location with linked guardians."""

    __tablename__ = "live_shares"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = _owner()
    started_at: Mapped[datetime] = _created()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CheckIn(Base):
    __tablename__ = "checkins"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = _owner()
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # safe | need_help
    note: Mapped[str | None] = mapped_column(String(200))
    location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("location_reports.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(String(20), default="app", nullable=False)  # app | watch | meeting
    created_at: Mapped[datetime] = _created()


class ZoneEvent(Base):
    __tablename__ = "zone_events"

    id: Mapped[uuid.UUID] = _id()
    zone_id: Mapped[uuid.UUID] = _owner("safe_zones.id")
    event: Mapped[str] = mapped_column(String(10), nullable=False)  # entered | left
    created_at: Mapped[datetime] = _created()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = _owner()
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(String(400), nullable=False)
    link: Mapped[str | None] = mapped_column(String(200))  # in-app path
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = _owner()
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # watch
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    scopes: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class PairingCode(Base):
    __tablename__ = "pairing_codes"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = _owner()
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    device_name: Mapped[str] = mapped_column(String(60), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class AuditEntry(Base):
    """Sensitive actions on an account. Visible to the account owner."""

    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = _owner()
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    device: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = _created()


class RateLimitWindow(Base):
    __tablename__ = "rate_limits"

    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
