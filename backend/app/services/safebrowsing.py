"""Google Safe Browsing lookup (optional). Returns clean | match | error | not_configured."""

import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)
_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find"


def check(url: str) -> str:
    key = get_settings().safe_browsing_api_key
    if not key:
        return "not_configured"
    body = {
        "client": {"clientId": "saheli", "clientVersion": "1.0"},
        "threatInfo": {
            "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            "platformTypes": ["ANY_PLATFORM"],
            "threatEntryTypes": ["URL"],
            "threatEntries": [{"url": url}],
        },
    }
    try:
        response = httpx.post(_ENDPOINT, params={"key": key}, json=body, timeout=5.0)
        response.raise_for_status()
        return "match" if response.json().get("matches") else "clean"
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("Safe Browsing lookup failed: %s", type(exc).__name__)
        return "error"
