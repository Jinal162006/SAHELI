"""Transactional email through Resend (optional).

send() returns "sent", "failed" or "not_configured". Callers show the user exactly which
outcome happened; an alert is never reported as sent unless the provider accepted it.
"""

import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


def send(to: str, subject: str, text: str) -> str:
    settings = get_settings()
    if not settings.email_enabled:
        return "not_configured"
    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "text": text},
            timeout=10.0,
        )
        response.raise_for_status()
        return "sent"
    except httpx.HTTPError as exc:
        log.warning("Email send failed: %s", type(exc).__name__)
        return "failed"
