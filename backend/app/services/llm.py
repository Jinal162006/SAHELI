"""Provider-neutral AI access.

Every caller must handle AIUnavailable and fall back to a result that does not need the AI.
Content sent here has already been redacted by the caller where it contains personal data.
"""

import json
import logging
from functools import lru_cache

import anthropic
import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

# Server-side fallback: if the main model declines, the API retries on a recommended model.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"
_GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class AIUnavailable(Exception):
    """reason: not_configured | refused | timeout | rate_limited | error | invalid_output"""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@lru_cache
def _client() -> anthropic.Anthropic:
    settings = get_settings()
    return anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=settings.llm_timeout_seconds, max_retries=1)


def _provider() -> str:
    settings = get_settings()
    if settings.llm_provider in {"anthropic", "gemini"}:
        return settings.llm_provider
    return "anthropic" if settings.anthropic_api_key else "gemini"


def _gemini_schema(schema: dict) -> dict:
    """Translate the portable schema subset used by SAHELI to Gemini's schema format."""
    out = {}
    for key, value in schema.items():
        if key == "type":
            out[key] = str(value).upper()
        elif key in {"properties", "items"}:
            out[key] = _gemini_schema(value) if key == "items" else {
                name: _gemini_schema(child) for name, child in value.items()
            }
        elif key in {"required", "enum", "description"}:
            out[key] = value
    return out


def _gemini_parts(content: list[dict] | str) -> list[dict]:
    if isinstance(content, str):
        return [{"text": content}]
    parts = []
    for item in content:
        if item.get("type") == "text":
            parts.append({"text": item.get("text", "")})
        elif item.get("type") == "image":
            source = item.get("source", {})
            parts.append(
                {
                    "inline_data": {
                        "mime_type": source.get("media_type", "application/octet-stream"),
                        "data": source.get("data", ""),
                    }
                }
            )
    return parts


def _gemini_content(messages: list[dict]) -> list[dict]:
    return [{"role": message.get("role", "user"), "parts": _gemini_parts(message.get("content", ""))} for message in messages]


def _gemini_call(system: str, messages: list[dict], *, max_tokens: int, schema: dict | None) -> str:
    settings = get_settings()
    model = settings.llm_model or "gemini-2.5-flash"
    generation_config: dict = {"maxOutputTokens": max_tokens}
    if schema is not None:
        generation_config.update({"responseMimeType": "application/json", "responseSchema": _gemini_schema(schema)})
    body = {
        "systemInstruction": {"parts": _gemini_parts(system)},
        "contents": _gemini_content(messages),
        "generationConfig": generation_config,
    }
    try:
        response = httpx.post(
            _GEMINI_ENDPOINT.format(model=model),
            params={"key": settings.gemini_api_key},
            json=body,
            timeout=settings.llm_timeout_seconds,
        )
        if response.status_code == 429:
            raise AIUnavailable("rate_limited")
        response.raise_for_status()
        payload = response.json()
    except AIUnavailable:
        raise
    except httpx.TimeoutException as exc:
        raise AIUnavailable("timeout") from exc
    except httpx.HTTPError as exc:
        log.warning("Gemini API request failed: %s", type(exc).__name__)
        raise AIUnavailable("error") from exc
    candidates = payload.get("candidates") or []
    if not candidates:
        raise AIUnavailable("refused" if payload.get("promptFeedback", {}).get("blockReason") else "invalid_output")
    text = "".join(part.get("text", "") for part in candidates[0].get("content", {}).get("parts", [])).strip()
    if not text:
        raise AIUnavailable("invalid_output")
    return text


def _call(system: str, messages: list[dict], *, effort: str, max_tokens: int, schema: dict | None) -> str:
    settings = get_settings()
    if not settings.ai_enabled:
        raise AIUnavailable("not_configured")
    if _provider() == "gemini":
        return _gemini_call(system, messages, max_tokens=max_tokens, schema=schema)
    output_config: dict = {"effort": effort}
    if schema is not None:
        output_config["format"] = {"type": "json_schema", "schema": schema}
    try:
        response = _client().beta.messages.create(
            model=settings.llm_model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
            output_config=output_config,
            betas=[_FALLBACK_BETA],
            fallbacks="default",
        )
    except anthropic.APITimeoutError as exc:
        raise AIUnavailable("timeout") from exc
    except anthropic.RateLimitError as exc:
        raise AIUnavailable("rate_limited") from exc
    except anthropic.APIStatusError as exc:
        log.warning("Claude API error %s (request %s)", exc.status_code, getattr(exc, "request_id", None))
        raise AIUnavailable("error") from exc
    except anthropic.APIConnectionError as exc:
        raise AIUnavailable("error") from exc

    if response.stop_reason == "refusal":
        raise AIUnavailable("refused")
    if response.stop_reason == "max_tokens":
        raise AIUnavailable("invalid_output")
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise AIUnavailable("invalid_output")
    return text


def structured(system: str, content: list[dict] | str, schema: dict, *, effort: str = "medium", max_tokens: int = 8000) -> dict:
    """One request whose answer must match `schema`. Returns the parsed JSON object."""
    text = _call(system, [{"role": "user", "content": content}], effort=effort, max_tokens=max_tokens, schema=schema)
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AIUnavailable("invalid_output") from exc
    if not isinstance(value, dict):
        raise AIUnavailable("invalid_output")
    return value


def chat(system: str, messages: list[dict], *, effort: str = "low", max_tokens: int = 4000) -> str:
    """A plain-text reply in an ongoing conversation."""
    return _call(system, messages, effort=effort, max_tokens=max_tokens, schema=None)


def strict_schema(properties: dict, required: list[str] | None = None) -> dict:
    return {
        "type": "object",
        "properties": properties,
        "required": required if required is not None else list(properties),
        "additionalProperties": False,
    }
