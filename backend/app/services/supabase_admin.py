"""Supabase Auth admin calls made with the service key (server only)."""

import logging
import uuid

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


def delete_auth_user(user_id: uuid.UUID) -> bool:
    settings = get_settings()
    if not settings.supabase_service_key:
        log.error("Cannot delete auth user: SUPABASE_SERVICE_KEY is not set")
        return False
    headers = {"apikey": settings.supabase_service_key}
    if not settings.supabase_service_key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {settings.supabase_service_key}"
    try:
        response = httpx.delete(f"{settings.supabase_url}/auth/v1/admin/users/{user_id}", headers=headers, timeout=10.0)
        if response.status_code == 404:
            return True
        response.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        log.error("Auth user deletion failed: %s", type(exc).__name__)
        return False
