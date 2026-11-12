"""Link (URL) risk checks.

Everything here looks at the link itself. The only network calls are an optional lookup in
Google Safe Browsing and redirect lookups on a fixed list of URL-shortener hosts, so the
server never visits arbitrary destination pages (no server-side request forgery).

Statuses:
  high_risk         strong warning signs, or listed as a known threat
  suspicious        warning signs worth taking seriously
  safe              no warning signs found AND either a known-threat check came back clean
                    or the domain is an official one we recognise. Never a guarantee.
  unable_to_verify  no warning signs in the link, but it could not be fully checked
  invalid           not a usable web link
"""

import ipaddress
import re
import unicodedata
from dataclasses import dataclass, field
from urllib.parse import unquote, urlsplit

import httpx
import tldextract

from app.data.brands import (
    BAIT_WORDS,
    FREE_HOSTING_SUFFIXES,
    GOVERNMENT_WORDS,
    MESSAGING_INVITE_HOSTS,
    OFFICIAL_DOMAINS,
    RISKY_TLDS,
    SHORTENERS,
)
from app.services import safebrowsing

_extract = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)
_HOMOGLYPHS = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s"})
MAX_URL_LENGTH = 2048


@dataclass
class LinkSignal:
    id: str
    severity: int  # 0 info, 1 weak, 2 moderate, 3 strong, 4 severe


@dataclass
class LinkResult:
    input: str
    status: str
    url: str | None = None
    host: str | None = None
    registered_domain: str | None = None
    display_host: str | None = None  # Unicode form when the host uses punycode
    signals: list[LinkSignal] = field(default_factory=list)
    official_brand: str | None = None
    expanded_to: str | None = None
    threat_check: str = "not_configured"  # clean | match | error | not_configured
    notes: list[str] = field(default_factory=list)


def _osa_distance(a: str, b: str) -> int:
    """Edit distance counting a swap of neighbouring letters as one edit."""
    d = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        d[i][0] = i
    for j in range(len(b) + 1):
        d[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[len(a)][len(b)]


def _registered(host: str) -> tuple[str, str]:
    """Return (registered domain, main label)."""
    if host.endswith(".bank.in"):  # RBI's restricted domain for banks
        labels = host.split(".")
        return ".".join(labels[-3:]), labels[-3]
    parts = _extract(host)
    registered = f"{parts.domain}.{parts.suffix}" if parts.suffix else parts.domain
    return registered, parts.domain


# Main labels of official domains that scammers imitate. Short or generic words are left out
# because near-misses of them ("offices", "lives") are ordinary domains.
_LOOKALIKE_TARGETS = sorted(
    {_registered(domain)[1] for domains in OFFICIAL_DOMAINS.values() for domain in domains if not domain.endswith(".bank.in")}
    - {"office", "outlook", "microsoftonline"}
)
_LOOKALIKE_TARGETS = [label for label in _LOOKALIKE_TARGETS if len(label) >= 5]


def _decode_host(host: str) -> str:
    try:
        return host.encode("ascii").decode("idna") if "xn--" in host else host
    except UnicodeError:
        return host


def _mixed_scripts(text: str) -> bool:
    scripts = set()
    for ch in text:
        if ch.isalpha():
            name = unicodedata.name(ch, "")
            scripts.add(name.split(" ")[0] if name else "UNKNOWN")
    return len(scripts) > 1 or any(s not in {"LATIN"} for s in scripts)


def _brand_tokens(text: str) -> list[str]:
    return [t for t in re.split(r"[^a-z]+", text.lower()) if t]


def _brands_mentioned(text: str) -> set[str]:
    found = set()
    for token in _brand_tokens(text):
        for brand in OFFICIAL_DOMAINS:
            if token == brand or (len(brand) >= 3 and token.startswith(brand) and len(token) > len(brand)):
                found.add(brand)
    return found


def normalise_url(raw: str) -> str | None:
    value = raw.strip().strip("<>\"'()[]")
    if not value or len(value) > MAX_URL_LENGTH or any(c.isspace() for c in value):
        return None
    lowered = value.lower()
    if lowered.startswith(("javascript:", "data:", "vbscript:", "file:")):
        return value
    if lowered.startswith("upi://"):
        return value
    if not re.match(r"^[a-z][a-z0-9+.\-]*://", lowered):
        value = "http://" + value
    return value


def analyse_link(raw: str, *, network: bool = True, _depth: int = 0) -> LinkResult:
    url = normalise_url(raw)
    if url is None:
        return LinkResult(input=raw[:200], status="invalid", notes=["not_a_link"])

    result = LinkResult(input=raw[:MAX_URL_LENGTH], status="unable_to_verify", url=url)
    signals = result.signals
    lowered = url.lower()

    if lowered.startswith(("javascript:", "data:", "vbscript:", "file:")):
        signals.append(LinkSignal("dangerous_scheme", 4))
        result.status = "high_risk"
        return result
    if lowered.startswith("upi://"):
        signals.append(LinkSignal("upi_payment_link", 3))
        result.status = "suspicious"
        result.notes.append("payment_link")
        return result

    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").rstrip(".").lower()
    except ValueError:
        return LinkResult(input=raw[:200], status="invalid", notes=["not_a_link"])
    if parts.scheme not in {"http", "https"} or not host or "." not in host and not host.startswith("["):
        return LinkResult(input=raw[:200], status="invalid", notes=["not_a_link"])

    result.host = host
    display = _decode_host(host)
    if display != host:
        result.display_host = display

    # User-info trick: http://sbi.co.in@evil.example/ really goes to evil.example.
    if parts.username or "@" in parts.netloc:
        signals.append(LinkSignal("userinfo_trick", 4))

    try:
        ipaddress.ip_address(host.strip("[]"))
        signals.append(LinkSignal("ip_address_host", 3))
        is_ip = True
    except ValueError:
        is_ip = False

    if not is_ip:
        registered, label = _registered(host)
        result.registered_domain = registered
        subdomain_depth = max(0, host.count(".") - registered.count("."))

        if "xn--" in host and _mixed_scripts(display.replace(".", "")):
            signals.append(LinkSignal("lookalike_characters", 4))

        is_bank_domain = host.endswith(".bank.in")
        is_gov = registered.endswith((".gov.in", ".nic.in")) or host.endswith((".gov.in", ".nic.in"))
        official_brand = next((b for b, ds in OFFICIAL_DOMAINS.items() if registered in ds or host in ds), None)
        if official_brand:
            result.official_brand = official_brand
        elif is_bank_domain:
            result.official_brand = "bank"
        elif is_gov:
            result.official_brand = "government"

        if not result.official_brand:
            host_brands = _brands_mentioned(host)
            if host_brands:
                signals.append(LinkSignal("brand_mismatch", 4))
            elif _brands_mentioned(unquote(parts.path)):
                signals.append(LinkSignal("brand_in_path", 2))

            words = set(_brand_tokens(host))
            if words & GOVERNMENT_WORDS:
                signals.append(LinkSignal("fake_government", 4))

            # Look-alike spelling of an official domain (amaz0n, flipkrat, paytrn).
            folded = label.translate(_HOMOGLYPHS).replace("rn", "m").replace("vv", "w")
            for official_label in _LOOKALIKE_TARGETS:
                if official_label == label:
                    continue
                if folded == official_label or (len(official_label) >= 6 and _osa_distance(label, official_label) == 1):
                    signals.append(LinkSignal("lookalike_domain", 4))
                    break

        tld = registered.rsplit(".", 1)[-1]
        if tld in RISKY_TLDS and not result.official_brand:
            signals.append(LinkSignal("risky_tld", 1))
        if subdomain_depth >= 4:
            signals.append(LinkSignal("many_subdomains", 1))
        if host.endswith(FREE_HOSTING_SUFFIXES) or registered in FREE_HOSTING_SUFFIXES:
            signals.append(LinkSignal("free_hosting", 1))
        if host in MESSAGING_INVITE_HOSTS:
            signals.append(LinkSignal("group_invite", 1))

        if registered in SHORTENERS or host in SHORTENERS:
            signals.append(LinkSignal("shortened", 1))
            if network and _depth < 3:
                destination = _expand_shortener(url)
                if destination:
                    result.expanded_to = destination
                    inner = analyse_link(destination, network=network, _depth=_depth + 1)
                    result.signals.extend(s for s in inner.signals if s.id != "shortened")
                    result.threat_check = inner.threat_check
                    result.official_brand = result.official_brand or inner.official_brand
                else:
                    result.notes.append("could_not_expand")

    if parts.scheme == "http":
        signals.append(LinkSignal("no_https", 1))

    path_and_query = unquote(f"{parts.path} {parts.query}").lower()
    if path_and_query.rstrip().endswith(".apk") or ".apk?" in lowered:
        signals.append(LinkSignal("app_download", 4))
    bait = set(_brand_tokens(path_and_query + " " + host)) & BAIT_WORDS
    if len(bait) >= 2:
        signals.append(LinkSignal("bait_words", 2))
    elif bait:
        signals.append(LinkSignal("bait_words", 1))
    if len(url) > 200 or url.count("%") > 10:
        signals.append(LinkSignal("obfuscated", 1))

    if network and _depth == 0 and result.threat_check == "not_configured":
        result.threat_check = safebrowsing.check(result.expanded_to or url)
    if result.threat_check == "match":
        signals.append(LinkSignal("known_threat", 4))

    # Free hosting is only meaningful together with bait words or a brand.
    ids = {s.id for s in signals}
    if "free_hosting" in ids and ids & {"bait_words", "brand_in_path", "brand_mismatch"}:
        for s in signals:
            if s.id == "free_hosting":
                s.severity = 2

    result.signals = _dedupe(signals)
    result.status = _status(result)
    return result


def _dedupe(signals: list[LinkSignal]) -> list[LinkSignal]:
    best: dict[str, LinkSignal] = {}
    for s in signals:
        if s.id not in best or s.severity > best[s.id].severity:
            best[s.id] = s
    return sorted(best.values(), key=lambda s: -s.severity)


def _status(result: LinkResult) -> str:
    severities = [s.severity for s in result.signals]
    top = max(severities, default=0)
    if top >= 4 or sum(severities) >= 5:
        return "high_risk"
    if top == 3 or sum(severities) >= 4:
        return "suspicious"
    if "could_not_expand" in result.notes:
        return "unable_to_verify"
    meaningful = [s for s in result.signals if s.severity >= 2]
    if meaningful:
        return "suspicious"
    if result.threat_check == "clean" or (result.official_brand and top <= 1):
        return "safe"
    return "unable_to_verify"


def _expand_shortener(url: str) -> str | None:
    """Ask a known shortener where its link points, without visiting the destination."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if _registered(host)[0] not in SHORTENERS and host not in SHORTENERS:
        return None
    # Rebuild the request URL so only the shortener's own host and default port are contacted.
    safe_url = f"https://{host}{parts.path or '/'}" + (f"?{parts.query}" if parts.query else "")
    try:
        with (
            httpx.Client(follow_redirects=False, timeout=4.0, headers={"User-Agent": "SAHELI-link-check"}) as client,
            client.stream("GET", safe_url) as response,
        ):
            location = response.headers.get("location")
            if response.is_redirect and location:
                return str(httpx.URL(safe_url).join(location))[:MAX_URL_LENGTH]
    except httpx.HTTPError:
        return None
    return None


_URL_IN_TEXT = re.compile(r"\b(?:https?://|www\.)[^\s<>\"']+|\bupi://[^\s<>\"']+", re.IGNORECASE)


def find_links(text: str) -> list[str]:
    return [m.group(0).rstrip(".,!?)]}'\"") for m in _URL_IN_TEXT.finditer(text)]
