"""Image safety checks.

Without AI: validate the file, read hidden metadata (location, device, author, editing
software, AI-generator labels, Content Credentials) and offer a copy with metadata removed.

With the person's consent: an AI review of what is visible in the image (faces, uniforms,
documents, house numbers...) and of visible signs of manipulation. AI-generated image
detection is unreliable, so results are always phrased as uncertain.
"""

import base64
import io
from dataclasses import dataclass, field

from PIL import Image, ImageOps, UnidentifiedImageError

from app.services import llm

MAX_BYTES = 10 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 40_000_000  # decompression-bomb guard
ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}

_GPS_IFD = 0x8825
_EXIF_IFD = 0x8769
_EDIT_APPS = (
    "photoshop",
    "lightroom",
    "gimp",
    "snapseed",
    "picsart",
    "faceapp",
    "facetune",
    "meitu",
    "canva",
    "remini",
    "airbrush",
    "b612",
    "beautyplus",
)
_AI_MARKERS = (
    b"trainedAlgorithmicMedia",
    b"compositeWithTrainedAlgorithmicMedia",
    b"Adobe Firefly",
    b"DALL-E",
    b"DALL\xc2\xb7E",
    b"Midjourney",
    b"Stable Diffusion",
)


class ImageRejected(Exception):
    """reason: too_large | unsupported | corrupt"""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass
class Finding:
    id: str
    severity: int  # 1 low, 2 medium, 3 high
    detail: dict = field(default_factory=dict)


def load(data: bytes) -> Image.Image:
    if len(data) > MAX_BYTES:
        raise ImageRejected("too_large")
    try:
        probe = Image.open(io.BytesIO(data))
        if probe.format not in ALLOWED_FORMATS:
            raise ImageRejected("unsupported")
        probe.verify()
        image = Image.open(io.BytesIO(data))
        image.load()
    except ImageRejected:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise ImageRejected("unsupported" if isinstance(exc, UnidentifiedImageError) else "corrupt") from exc
    return image


def _ratio(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return 0.0


def _gps(exif) -> tuple[float, float] | None:
    try:
        gps = exif.get_ifd(_GPS_IFD)
    except (KeyError, AttributeError):
        return None
    if not gps or 2 not in gps or 4 not in gps:
        return None

    def to_degrees(dms) -> float:
        d, m, s = (_ratio(x) for x in dms)
        return d + m / 60 + s / 3600

    try:
        lat, lng = to_degrees(gps[2]), to_degrees(gps[4])
    except (TypeError, ValueError):
        return None
    if gps.get(1) == "S":
        lat = -lat
    if gps.get(3) == "W":
        lng = -lng
    if lat == 0 and lng == 0:
        return None
    return lat, lng


def metadata_findings(image: Image.Image, raw: bytes) -> list[Finding]:
    findings: list[Finding] = []
    exif = image.getexif()

    coords = _gps(exif)
    if coords:
        # Rounded to about 100 m: enough to show the risk without repeating the exact spot.
        findings.append(Finding("location_embedded", 3, {"lat": round(coords[0], 3), "lng": round(coords[1], 3)}))

    make, model = str(exif.get(271, "")).strip("\x00 "), str(exif.get(272, "")).strip("\x00 ")
    if make or model:
        findings.append(Finding("device_info", 1, {"device": " ".join(p for p in (make, model) if p)[:60]}))

    try:
        taken = exif.get_ifd(_EXIF_IFD).get(36867)
    except (KeyError, AttributeError):
        taken = None
    if taken:
        findings.append(Finding("capture_time", 1, {"taken": str(taken).strip("\x00 ")[:19]}))

    author = str(exif.get(315, "") or exif.get(33432, "")).strip("\x00 ")
    if author:
        findings.append(Finding("author_name", 2, {}))

    software = str(exif.get(305, "")).strip("\x00 ")
    text_chunks = " ".join(
        str(v)
        for k, v in getattr(image, "info", {}).items()
        if isinstance(v, str) and k.lower() in {"software", "parameters", "prompt", "workflow", "comment", "description"}
    )
    if any(app in software.lower() for app in _EDIT_APPS):
        findings.append(Finding("edited_with_app", 1, {"software": software[:40]}))

    has_generator_params = any(k in getattr(image, "info", {}) for k in ("parameters", "prompt", "workflow"))
    if has_generator_params or any(marker in raw for marker in _AI_MARKERS) or "midjourney" in text_chunks.lower():
        findings.append(Finding("ai_label_found", 2, {}))
    if b"c2pa" in raw and b"jumb" in raw:
        findings.append(Finding("content_credentials", 1, {}))

    if not findings:
        findings.append(Finding("no_hidden_data", 0, {}))
    return findings


def clean_copy(image: Image.Image) -> tuple[bytes, str]:
    """Re-encode the visible pixels only: no EXIF, GPS, XMP or text chunks survive."""
    upright = ImageOps.exif_transpose(image)
    out = io.BytesIO()
    if image.format == "PNG" or upright.mode in {"RGBA", "LA", "P"}:
        upright.save(out, format="PNG", optimize=True)
        return out.getvalue(), "image/png"
    upright.convert("RGB").save(out, format="JPEG", quality=92)
    return out.getvalue(), "image/jpeg"


def for_ai(image: Image.Image, max_side: int = 1568) -> tuple[str, str]:
    """A downscaled, metadata-free JPEG for the AI review, base64 encoded."""
    upright = ImageOps.exif_transpose(image).convert("RGB")
    upright.thumbnail((max_side, max_side))
    out = io.BytesIO()
    upright.save(out, format="JPEG", quality=85)
    return base64.standard_b64encode(out.getvalue()).decode(), "image/jpeg"


PRIVACY_TYPES = [
    "face",
    "child",
    "school_uniform_or_logo",
    "home_or_house_number",
    "street_sign_or_landmark",
    "vehicle_number_plate",
    "id_document",
    "financial_document",
    "screen_with_personal_info",
    "address_or_phone_visible",
    "ticket_or_boarding_pass",
    "other_location_clue",
]

_IMAGE_SYSTEM = """You review images for SAHELI, a digital safety companion. A person is deciding whether it is safe to share this image, or wants to understand it. Describe only what is visible. Be calm and factual.

- privacy_findings: things in the image that could reveal who someone is or where they are. Use the given types. Keep each detail short and do not transcribe numbers, names or addresses you can read; say what kind of information is visible instead.
- sensitive_content: "intimate" for nudity or sexual content, "suggestive" for revealing but not explicit content, "none" otherwise, "unclear" if you cannot tell. Do not describe intimate content.
- manipulation: visible signs of editing such as warped backgrounds, mismatched lighting or shadows, cut-out edges, cloned areas. Most edits are harmless; say so if relevant.
- ai_generated: whether the image shows typical signs of AI generation. This cannot be determined reliably from pixels. Use "cannot_tell" when unsure, and never state certainty.
- summary: 2 or 3 plain sentences to the person, no lists, no em dashes. Never shame the person for the image."""


def ai_review(image: Image.Image) -> dict:
    """Raises llm.AIUnavailable when the review cannot run."""
    data, media_type = for_ai(image)
    schema = llm.strict_schema(
        {
            "privacy_findings": {
                "type": "array",
                "items": llm.strict_schema({"type": {"type": "string", "enum": PRIVACY_TYPES}, "detail": {"type": "string"}}),
            },
            "sensitive_content": {"type": "string", "enum": ["none", "suggestive", "intimate", "unclear"]},
            "manipulation": llm.strict_schema(
                {
                    "assessment": {"type": "string", "enum": ["no_visible_signs", "possible_signs", "cannot_tell"]},
                    "detail": {"type": "string"},
                }
            ),
            "ai_generated": llm.strict_schema(
                {
                    "assessment": {"type": "string", "enum": ["no_clear_signs", "some_signs", "strong_signs", "cannot_tell"]},
                    "detail": {"type": "string"},
                }
            ),
            "summary": {"type": "string"},
        }
    )
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}},
        {"type": "text", "text": "Review this image."},
    ]
    result = llm.structured(_IMAGE_SYSTEM, content, schema, effort="medium", max_tokens=4000)
    result["privacy_findings"] = [
        {"type": f["type"], "detail": str(f.get("detail", ""))[:200]}
        for f in result.get("privacy_findings", [])[:10]
        if f.get("type") in PRIVACY_TYPES
    ]
    for key in ("manipulation", "ai_generated"):
        result[key]["detail"] = str(result[key].get("detail", ""))[:400].replace("—", ", ")
    result["summary"] = str(result.get("summary", ""))[:800].replace("—", ", ")
    if result.get("sensitive_content") == "intimate":
        # Never echo descriptions of intimate content back.
        result["privacy_findings"] = [f for f in result["privacy_findings"] if f["type"] not in {"face"}]
        result["summary"] = ""
    return result


_HIGH_PRIVACY = {"id_document", "financial_document", "ticket_or_boarding_pass"}
_MEDIUM_PRIVACY = {
    "child",
    "school_uniform_or_logo",
    "home_or_house_number",
    "vehicle_number_plate",
    "address_or_phone_visible",
    "screen_with_personal_info",
}


def sharing_risk(findings: list[Finding], review: dict | None) -> str:
    ids = {f.id for f in findings}
    visible = {f["type"] for f in (review or {}).get("privacy_findings", [])}
    sensitive = (review or {}).get("sensitive_content")
    if (
        "location_embedded" in ids
        or visible & _HIGH_PRIVACY
        or sensitive == "intimate"
        or {"child", "school_uniform_or_logo"} <= visible
    ):
        return "high"
    if visible & _MEDIUM_PRIVACY or "author_name" in ids or sensitive == "suggestive":
        return "medium"
    return "low"
