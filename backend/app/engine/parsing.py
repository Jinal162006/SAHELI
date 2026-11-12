"""Turn pasted chat text into a list of messages.

Recognises WhatsApp exports (Android and iOS styles), simple "Name: message" transcripts,
and falls back to one message per line with an unknown sender.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime

MAX_INPUT_CHARS = 60_000

# Invisible marks WhatsApp and phones insert (LRM, RLM, narrow no-break space, BOM...).
_INVISIBLE = dict.fromkeys(map(ord, "‎‏‪‫‬‭‮﻿⁦⁧⁨⁩"))
_SPACES = {ord(" "): " ", ord(" "): " ", ord(" "): " "}

_DATE = r"(?P<d1>\d{1,2})[/.\-](?P<d2>\d{1,2})[/.\-](?P<y>\d{2,4})"
_TIME = r"(?P<h>\d{1,2})[:.](?P<m>\d{2})(?:[:.](?P<s>\d{2}))?\s*(?P<ampm>[aApP]\.?\s?[mM]\.?)?"

# 12/03/2024, 10:15 pm - Priya: message
_ANDROID = re.compile(rf"^{_DATE},?\s+{_TIME}\s+[-–]\s+(?P<rest>.*)$")
# [12/03/24, 10:15:32 PM] Priya: message
_IOS = re.compile(rf"^\[{_DATE},?\s+{_TIME}\]\s+(?P<rest>.*)$")
# Priya: message   (sender up to 40 chars, no URL scheme)
_NAMED = re.compile(r"^(?P<sender>[^:\n]{1,40}?):\s+(?P<text>.+)$")

_SYSTEM_LINES = (
    "messages and calls are end-to-end encrypted",
    "messages to this group are now secured",
    "created group",
    "changed the subject",
    "changed this group",
    "added you",
    "joined using this group",
    "security code changed",
    "missed voice call",
    "missed video call",
    "this message was deleted",
    "you deleted this message",
    "<media omitted>",
    "image omitted",
    "video omitted",
    "sticker omitted",
    "audio omitted",
    "gif omitted",
    "document omitted",
)


@dataclass
class Message:
    index: int
    sender: str | None
    text: str
    timestamp: datetime | None = None


@dataclass
class ParsedConversation:
    messages: list[Message]
    senders: list[str]
    format: str  # whatsapp | named | lines
    truncated: bool = False
    notes: list[str] = field(default_factory=list)


def clean_text(raw: str) -> str:
    text = unicodedata.normalize("NFC", raw).translate(_INVISIBLE).translate(_SPACES)
    return text.replace("\r\n", "\n").replace("\r", "\n")


def _is_system(text: str) -> bool:
    lowered = text.strip().lower()
    return any(marker in lowered for marker in _SYSTEM_LINES)


def _looks_like_sender(name: str) -> bool:
    name = name.strip()
    if not name or "//" in name or name.lower().startswith(("http", "www")):
        return False
    if len(name.split()) > 5:
        return False
    return not any(ch in name for ch in "?!.,;")


def _date_order(matches: list[re.Match]) -> str:
    """Decide whether dates are day-first or month-first from the whole export."""
    for match in matches:
        if int(match["d1"]) > 12:
            return "dmy"
        if int(match["d2"]) > 12:
            return "mdy"
    return "dmy"  # Default for India and most of the world.


def _timestamp(match: re.Match, order: str) -> datetime | None:
    try:
        day, month = (int(match["d1"]), int(match["d2"])) if order == "dmy" else (int(match["d2"]), int(match["d1"]))
        year = int(match["y"])
        year += 2000 if year < 100 else 0
        hour, minute = int(match["h"]), int(match["m"])
        second = int(match["s"] or 0)
        ampm = (match["ampm"] or "").lower().replace(".", "").replace(" ", "")
        if ampm == "pm" and hour < 12:
            hour += 12
        elif ampm == "am" and hour == 12:
            hour = 0
        return datetime(year, month, day, hour, minute, second)
    except (ValueError, TypeError):
        return None


def _parse_timestamped(lines: list[str]) -> ParsedConversation | None:
    for pattern in (_ANDROID, _IOS):
        matches = [m for line in lines if (m := pattern.match(line.strip()))]
        if len(matches) < 2 or len(matches) < 0.3 * len([ln for ln in lines if ln.strip()]):
            continue
        order = _date_order(matches)
        messages: list[Message] = []
        for line in lines:
            match = pattern.match(line.strip())
            if match:
                rest = match["rest"]
                named = _NAMED.match(rest)
                if not named or not _looks_like_sender(named["sender"]):
                    continue  # A system line such as "Priya created group".
                text = named["text"].strip()
                if _is_system(text):
                    continue
                messages.append(Message(len(messages), named["sender"].strip(), text, _timestamp(match, order)))
            elif messages and line.strip():
                messages[-1].text += "\n" + line.strip()  # Continuation of a multi-line message.
        if messages:
            return ParsedConversation(messages, _senders(messages), "whatsapp")
    return None


def _parse_named(lines: list[str]) -> ParsedConversation | None:
    content = [ln for ln in lines if ln.strip()]
    matches = [m for ln in content if (m := _NAMED.match(ln.strip())) and _looks_like_sender(m["sender"])]
    if len(matches) < 2 or len(matches) < 0.5 * len(content):
        return None
    counts: dict[str, int] = {}
    for match in matches:
        key = match["sender"].strip()
        counts[key] = counts.get(key, 0) + 1
    # Real transcripts reuse a small set of names. Many one-off "names" means prose with colons.
    distinct = len(counts)
    if distinct > 6 or (distinct > 2 and (max(counts.values()) < 2 or distinct > len(matches) / 2)):
        return None
    messages: list[Message] = []
    for line in content:
        match = _NAMED.match(line.strip())
        if match and match["sender"].strip() in counts:
            text = match["text"].strip()
            if not _is_system(text):
                messages.append(Message(len(messages), match["sender"].strip(), text))
        elif messages:
            messages[-1].text += "\n" + line.strip()
    return ParsedConversation(messages, _senders(messages), "named") if messages else None


def _senders(messages: list[Message]) -> list[str]:
    seen: list[str] = []
    for message in messages:
        if message.sender and message.sender not in seen:
            seen.append(message.sender)
    return seen


def parse_conversation(raw: str) -> ParsedConversation:
    text = clean_text(raw)
    truncated = len(text) > MAX_INPUT_CHARS
    if truncated:
        text = text[:MAX_INPUT_CHARS]
    lines = text.split("\n")

    parsed = _parse_timestamped(lines) or _parse_named(lines)
    if parsed is None:
        messages = [
            Message(i, None, line.strip()) for i, line in enumerate(ln for ln in lines if ln.strip() and not _is_system(ln))
        ]
        parsed = ParsedConversation(messages, [], "lines")
    parsed.truncated = truncated
    if truncated:
        parsed.notes.append("truncated")
    return parsed


def from_structured(items: list[dict]) -> ParsedConversation:
    """Build a conversation from already-separated messages (e.g. read from screenshots)."""
    messages = [
        Message(i, (item.get("sender") or None), clean_text(item["text"]).strip())
        for i, item in enumerate(items)
        if clean_text(item.get("text", "")).strip()
    ]
    return ParsedConversation(messages, _senders(messages), "structured")
