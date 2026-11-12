"""Endpoints that need no account: health, public config, support resources, emergency status links."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.common import error, iso, maps_link, now
from app.config import get_settings
from app.data.resources import CHECKED_ON, RESOURCES
from app.db import get_db
from app.models import EmergencyEvent, EmergencyShare, Profile
from app.security import ratelimit
from app.security.audit import client_ip
from app.security.crypto import keyed_hash
from app.services.notify import display_name

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/config")
def public_config() -> dict:
    s = get_settings()
    return {
        "supabase_url": s.supabase_url,
        "supabase_anon_key": s.supabase_anon_key,
        "operator": {
            "name": s.operator_name or None,
            "support_email": s.support_email or None,
            "governing_law": s.governing_law or None,
        },
        "features": {
            "ai": s.ai_enabled,
            "email_alerts": s.email_enabled,
            "threat_lookup": s.safe_browsing_enabled,
        },
    }


@router.get("/resources")
def resources() -> dict:
    return {"checked_on": CHECKED_ON, "resources": RESOURCES}


@router.get("/status/{token}")
def emergency_status(token: str, request: Request, db: Session = Depends(get_db)) -> dict:
    """What a trusted contact sees through their private link. First name and location only."""
    ratelimit.hit(db, f"status:{keyed_hash(client_ip(request))[:24]}", 600, 3600)
    if len(token) > 100:
        raise error(404, "link_not_found", "This link isn't valid or has expired.")
    share = db.scalar(select(EmergencyShare).where(EmergencyShare.token_hash == keyed_hash(token)))
    event = db.get(EmergencyEvent, share.event_id) if share else None
    if not share or not event or (event.share_expires_at and event.share_expires_at < now()):
        raise error(404, "link_not_found", "This link isn't valid or has expired.")
    owner = db.get(Profile, event.owner_id)
    name = display_name(owner).split(" ")[0] if owner else "Your contact"
    location = None
    if share.show_location and event.last_lat is not None:
        location = {
            "lat": round(event.last_lat, 5),
            "lng": round(event.last_lng, 5),
            "accuracy_m": round(event.last_accuracy_m) if event.last_accuracy_m else None,
            "at": iso(event.last_location_at),
            "maps_url": maps_link(event.last_lat, event.last_lng),
        }
    return {
        "name": name,
        "status": event.status,
        "started_at": iso(event.started_at),
        "ended_at": iso(event.ended_at),
        "location": location,
        "location_shared": share.show_location,
    }
