"""Replace personal and financial identifiers before any text leaves the server.

The redacted text is what the AI review sees. What was found (not the values) also feeds
the rule signals, for example "a UPI ID was shared".
"""

import re
from dataclasses import dataclass, field

_EMAIL = re.compile(r"\b[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+\b")
_URL = re.compile(r"\b(?:https?://|www\.)[^\s<>\"']+", re.IGNORECASE)
# UPI handles: name@bank with no dot after the @ (emails were already removed).
_UPI = re.compile(r"\b[\w.\-]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,30}\b")
_CARD = re.compile(r"\b(?:\d[ \-]?){13,19}\b")
_AADHAAR = re.compile(r"\b[2-9]\d{3}[ \-]?\d{4}[ \-]?\d{4}\b")
_PAN = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
_IFSC = re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b")
_PHONE = re.compile(r"(?<![\w])(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{2,5}\)?[\s\-]?)?\d{3,5}[\s\-]?\d{4,5}(?![\w])")
_OTP_CONTEXT = re.compile(
    r"\b(otp|one[\s\-]?time[\s\-]?password|verification code|code|pin|cvv)\b[^\d\n]{0,25}(\d{4,8})\b"
    r"|\b(\d{4,8})\b[^\d\n]{0,15}\b(is your|is the)?\s*(otp|code|pin)\b",
    re.IGNORECASE,
)
_ACCOUNT_CONTEXT = re.compile(r"\b(a/?c|acc(?:ount)?(?:\s*(?:no|number|num))?\.?)\s*[:\-#]?\s*(\d{9,18})\b", re.IGNORECASE)


@dataclass
class Redaction:
    text: str
    found: dict[str, int] = field(default_factory=dict)
    domains: list[str] = field(default_factory=list)


def _luhn_ok(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        n = int(ch)
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0


def _domain_of(url: str) -> str:
    stripped = re.sub(r"^(https?://)", "", url, flags=re.IGNORECASE)
    host = re.split(r"[/?#]", stripped, maxsplit=1)[0].split("@")[-1].split(":")[0]
    return host.lower().removeprefix("www.")


def redact(text: str) -> Redaction:
    found: dict[str, int] = {}
    domains: list[str] = []

    def count(kind: str) -> None:
        found[kind] = found.get(kind, 0) + 1

    def url_sub(match: re.Match) -> str:
        domain = _domain_of(match.group(0))
        if domain and domain not in domains:
            domains.append(domain)
        count("link")
        return f"[LINK:{domain}]" if domain else "[LINK]"

    def simple(kind: str, label: str):
        def sub(_: re.Match) -> str:
            count(kind)
            return label

        return sub

    def card_sub(match: re.Match) -> str:
        digits = re.sub(r"\D", "", match.group(0))
        if 13 <= len(digits) <= 19 and _luhn_ok(digits):
            count("card_number")
            return "[CARD_NUMBER]"
        return match.group(0)

    def otp_sub(match: re.Match) -> str:
        count("otp")
        return re.sub(r"\d{4,8}", "[CODE]", match.group(0))

    def account_sub(match: re.Match) -> str:
        count("account_number")
        return match.group(0).replace(match.group(2), "[ACCOUNT_NUMBER]")

    def phone_sub(match: re.Match) -> str:
        digits = re.sub(r"\D", "", match.group(0))
        if 8 <= len(digits) <= 15:
            count("phone")
            return "[PHONE]"
        return match.group(0)

    out = _URL.sub(url_sub, text)
    out = _EMAIL.sub(simple("email", "[EMAIL]"), out)
    out = _UPI.sub(simple("upi_id", "[UPI_ID]"), out)
    out = _CARD.sub(card_sub, out)
    out = _AADHAAR.sub(simple("aadhaar", "[AADHAAR]"), out)
    out = _PAN.sub(simple("pan", "[PAN]"), out)
    out = _IFSC.sub(simple("ifsc", "[IFSC]"), out)
    out = _ACCOUNT_CONTEXT.sub(account_sub, out)
    out = _OTP_CONTEXT.sub(otp_sub, out)
    out = _PHONE.sub(phone_sub, out)
    return Redaction(out, found, domains)
