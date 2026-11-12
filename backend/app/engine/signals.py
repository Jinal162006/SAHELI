"""Find warning signs in a parsed conversation, message by message and across the sequence."""

import re
from dataclasses import dataclass, field
from datetime import timedelta

from app.engine import lexicon
from app.engine.links import LinkResult, analyse_link, find_links
from app.engine.parsing import Message, ParsedConversation
from app.engine.redaction import redact

MAX_LINKS_CHECKED = 5
_REQUEST_SIGNALS = {
    "intimate_request",
    "money_request",
    "credential_request",
    "move_off_platform",
    "personal_info_request",
    "alone_check",
    "gift_card_crypto",
    "remote_access_request",
}
_PAYMENT_IDENTIFIERS = {"upi_id", "account_number", "ifsc", "card_number"}
# Threats of violence said with obvious laughter are usually banter ("haha I'll kill you if
# you're late"). Those are set aside, and shown to the user as set aside. Threats to share
# private content are never treated this way.
_JOKE_MARKERS = re.compile(
    r"\b(ha){2,}\w*|\bhehe+\b|\blo+l+\b|\blmf?ao\b|\brofl\b|\bjk\b|\bjust kidding\b|\bmaza+k\b|😂|🤣|😆|😜|😝"
)
_JOKE_SENSITIVE = {"threat_harm"}


@dataclass
class Hit:
    signal: str
    message_index: int
    excerpt: str
    source: str = "rules"  # rules | sequence | links | ai


@dataclass
class Detection:
    messages: list[Message]
    redacted: list[str]
    from_them: list[bool]
    senders_known: bool
    hits: list[Hit] = field(default_factory=list)
    links: list[LinkResult] = field(default_factory=list)
    injection_detected: bool = False
    refusals: list[int] = field(default_factory=list)
    set_aside: list[Hit] = field(default_factory=list)

    def first_index(self) -> dict[str, int]:
        first: dict[str, int] = {}
        for hit in self.hits:
            if hit.signal not in first or hit.message_index < first[hit.signal]:
                first[hit.signal] = hit.message_index
        return first


def excerpt(text: str, needle: str | None = None, width: int = 160) -> str:
    flat = " ".join(text.split())
    if len(flat) <= width:
        return flat
    start = 0
    if needle:
        pos = flat.lower().find(needle.lower())
        if pos > 0:
            start = max(0, pos - width // 3)
    snippet = flat[start : start + width]
    return ("…" if start else "") + snippet + ("…" if start + width < len(flat) else "")


def detect(
    parsed: ParsedConversation, me: str | None, known_duration: str | None = None, check_links_online: bool = True
) -> Detection:
    messages = parsed.messages
    senders_known = bool(parsed.senders) and me is not None and me in parsed.senders
    from_them = [not senders_known or m.sender != me for m in messages]
    detection = Detection(messages=messages, redacted=[], from_them=from_them, senders_known=senders_known)

    links_seen: dict[str, LinkResult] = {}
    for message, theirs in zip(messages, from_them, strict=True):
        red = redact(message.text)
        detection.redacted.append(red.text)
        normalised = lexicon.normalise(message.text)

        if any(p.search(normalised) for p in lexicon.PROMPT_INJECTION):
            detection.injection_detected = True

        if not theirs:
            if any(p.search(normalised) for p in lexicon.REFUSAL):
                detection.refusals.append(message.index)
            continue

        for signal in lexicon.SIGNALS:
            for pattern in signal.patterns:
                match = pattern.search(normalised)
                if match:
                    hit = Hit(signal.id, message.index, excerpt(message.text, match.group(0)))
                    if signal.id in _JOKE_SENSITIVE and _JOKE_MARKERS.search(message.text.lower()):
                        detection.set_aside.append(hit)
                    else:
                        detection.hits.append(hit)
                    break

        if set(red.found) & _PAYMENT_IDENTIFIERS:
            detection.hits.append(Hit("payment_details_shared", message.index, excerpt(red.text), "rules"))

        for url in find_links(message.text):
            if len(links_seen) >= MAX_LINKS_CHECKED and url not in links_seen:
                break
            if url not in links_seen:
                links_seen[url] = analyse_link(url, network=check_links_online)
            if links_seen[url].status in {"high_risk", "suspicious"}:
                detection.hits.append(Hit("suspicious_link", message.index, excerpt(red.text), "links"))

    detection.links = list(links_seen.values())
    _sequence_signals(detection, parsed, known_duration)
    return detection


def _sequence_signals(detection: Detection, parsed: ParsedConversation, known_duration: str | None) -> None:
    messages = detection.messages
    first = detection.first_index()

    # Strong romantic language very early in the relationship.
    if "love_bombing" in first:
        index = first["love_bombing"]
        fast = known_duration in {"days", "weeks"}
        start, at = messages[0].timestamp if messages else None, messages[index].timestamp
        if start and at and at - start <= timedelta(days=7):
            fast = True
        if fast:
            detection.hits.append(Hit("rapid_intensity", index, excerpt(messages[index].text), "sequence"))

    # The same kind of request again after the user said no.
    if detection.senders_known and detection.refusals:
        requests = [h for h in detection.hits if h.signal in _REQUEST_SIGNALS]
        for refusal in detection.refusals:
            before = {h.signal for h in requests if h.message_index < refusal}
            after = [h for h in requests if h.message_index > refusal and h.signal in before]
            if after:
                hit = after[0]
                detection.hits.append(Hit("repeated_pressure", hit.message_index, hit.excerpt, "sequence"))
                break
