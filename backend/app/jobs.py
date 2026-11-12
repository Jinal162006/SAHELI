"""Background work: missed check-ins every minute, clean-up of expired data every hour.

A Postgres advisory lock makes sure only one server instance runs the jobs at a time.
"""

import logging
import threading
from datetime import timedelta

from sqlalchemy import delete, select, text, update

from app.api.common import now
from app.api.meetings import escalate_missed
from app.db import SessionLocal
from app.models import (
    EvidenceFile,
    EvidenceItem,
    GuardianInvite,
    LiveShare,
    LocationReport,
    Notification,
    PairingCode,
)
from app.security import ratelimit
from app.services import storage

log = logging.getLogger(__name__)
_LOCK_ID = 7_210_431  # arbitrary, unique to SAHELI
LOCATION_RETENTION_DAYS = 30
NOTIFICATION_RETENTION_DAYS = 90


def purge_expired() -> dict:
    counts = {}
    with SessionLocal() as db:
        expired = db.scalars(
            select(EvidenceItem).where(EvidenceItem.expires_at.is_not(None), EvidenceItem.expires_at < now())
        ).all()
        for item in expired:
            keys = list(db.scalars(select(EvidenceFile.object_key).where(EvidenceFile.evidence_id == item.id)).all())
            try:
                storage.delete(keys)
            except storage.StorageError:
                log.warning("Could not delete files for expired evidence; will retry")
                continue
            db.delete(item)
        counts["evidence"] = len(expired)
        counts["locations"] = db.execute(
            delete(LocationReport).where(LocationReport.created_at < now() - timedelta(days=LOCATION_RETENTION_DAYS))
        ).rowcount
        counts["notifications"] = db.execute(
            delete(Notification).where(Notification.created_at < now() - timedelta(days=NOTIFICATION_RETENTION_DAYS))
        ).rowcount
        db.execute(delete(PairingCode).where(PairingCode.expires_at < now() - timedelta(days=1)))
        db.execute(delete(GuardianInvite).where(GuardianInvite.expires_at < now() - timedelta(days=7)))
        db.execute(update(LiveShare).where(LiveShare.ended_at.is_(None), LiveShare.expires_at < now()).values(ended_at=now()))
        db.commit()
        ratelimit.prune(db)
    return counts


def _run_once(tick: int) -> None:
    with SessionLocal() as db:
        got_lock = db.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": _LOCK_ID}).scalar()
        if not got_lock:
            return
        try:
            escalated = escalate_missed(db)
            if escalated:
                log.info("Escalated %d missed meeting check-in(s)", escalated)
            if tick % 60 == 0:
                log.info("Clean-up: %s", purge_expired())
        finally:
            db.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": _LOCK_ID})
            db.commit()


def start(stop: threading.Event) -> threading.Thread:
    def loop() -> None:
        tick = 0
        while not stop.is_set():
            try:
                _run_once(tick)
            except Exception:  # A failed run must never stop future runs.
                log.exception("Background job failed")
            tick += 1
            stop.wait(60)

    thread = threading.Thread(target=loop, name="saheli-jobs", daemon=True)
    thread.start()
    return thread
