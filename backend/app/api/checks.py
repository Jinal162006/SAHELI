"""Safety checks: conversations, screenshots, links, images and profiles, plus check history.

Checked content is processed in memory and never stored. Signed-in people can keep a history
of outcomes (level and sign types only) if they choose.
"""

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.common import Strict, error, iso, not_found, parse_uuid, read_upload
from app.data.brands import BRAND_NAMES
from app.db import get_db
from app.deps import current_user, limit, optional_user
from app.engine import guidance, images, profile_check, screenshots
from app.engine.conversation import CheckInput, run
from app.engine.links import analyse_link
from app.engine.parsing import MAX_INPUT_CHARS, from_structured, parse_conversation
from app.models import Check, Profile
from app.services import llm

router = APIRouter(prefix="/api", tags=["checks"])

Language = Literal["en", "hi", "hi-Latn"]


def _is_minor(user: Profile | None, said_minor: bool) -> bool:
    return said_minor or bool(user and user.age_group in {"under_13", "13_17"})


def _remember(db: Session, user: Profile | None, kind: str, level: str, label: str | None = None, **record) -> str | None:
    if not user or not user.keep_check_history:
        return None
    check = Check(
        owner_id=user.id,
        kind=kind,
        level=level,
        label=label,
        signals=record.get("signals", []),
        patterns=record.get("patterns", []),
        stages=record.get("stages", []),
        ai_review=record.get("ai_review", "not_requested"),
    )
    db.add(check)
    db.commit()
    return str(check.id)


# Conversations ------------------------------------------------------------------------------


class SendersRequest(Strict):
    text: str = Field(max_length=MAX_INPUT_CHARS * 2)


@router.post("/check/conversation/senders", dependencies=[Depends(limit("parse", 120, 60))])
def conversation_senders(body: SendersRequest) -> dict:
    """First step of a check: who is in this conversation? Nothing is analysed or stored."""
    parsed = parse_conversation(body.text)
    return {"senders": parsed.senders, "message_count": len(parsed.messages), "format": parsed.format}


class StructuredMessage(Strict):
    sender: str | None = Field(default=None, max_length=40)
    text: str = Field(max_length=4000)


class SituationContext(Strict):
    known_duration: Literal["days", "weeks", "months", "years"] | None = None
    sent_money: bool = False
    shared_images: bool = False
    shared_codes: bool = False
    planning_to_meet: bool = False


class ConversationRequest(Strict):
    text: str | None = Field(default=None, max_length=MAX_INPUT_CHARS * 2)
    messages: list[StructuredMessage] | None = Field(default=None, max_length=400)
    me: str | None = Field(default=None, max_length=40)
    language: Language = "en"
    under_18: bool = False
    use_ai: bool = True
    context: SituationContext = SituationContext()


@router.post("/check/conversation", dependencies=[Depends(limit("check_conversation", 40, 10))])
def check_conversation(
    body: ConversationRequest, user: Profile | None = Depends(optional_user), db: Session = Depends(get_db)
) -> dict:
    if body.messages:
        parsed = from_structured([m.model_dump() for m in body.messages])
    elif body.text and body.text.strip():
        parsed = parse_conversation(body.text)
    else:
        raise error(400, "empty", "Paste a conversation or add some messages to check.")
    if not parsed.messages:
        raise error(400, "empty", "SAHELI couldn't find any messages in that text.")

    minor = _is_minor(user, body.under_18)
    ctx = guidance.Context(**body.context.model_dump(exclude={"known_duration"}))
    result = run(
        CheckInput(
            parsed=parsed,
            me=body.me,
            language=body.language,
            minor=minor,
            known_duration=body.context.known_duration,
            context=ctx,
            use_ai=body.use_ai,
        )
    )
    record = result.pop("_record")
    result["check_id"] = _remember(db, user, "conversation", result["level"], None, **record)
    return result


@router.post("/check/screenshots", dependencies=[Depends(limit("screenshots", 15, 20))])
async def read_screenshots(files: list[UploadFile] = File(...), user: Profile = Depends(current_user)) -> dict:
    if not 1 <= len(files) <= screenshots.MAX_SCREENSHOTS:
        raise error(400, "too_many_files", f"Add between 1 and {screenshots.MAX_SCREENSHOTS} screenshots.")
    loaded = []
    for upload in files:
        data = await read_upload(upload, images.MAX_BYTES)
        try:
            loaded.append(images.load(data))
        except images.ImageRejected as exc:
            raise error(
                400, f"image_{exc.reason}", "One of the screenshots couldn't be read. Use JPG, PNG or WebP images under 10 MB."
            ) from exc
    try:
        return screenshots.read(loaded)
    except llm.AIUnavailable as exc:
        raise error(
            503,
            f"ai_{exc.reason}",
            "Reading screenshots needs SAHELI's AI, which isn't available right now. You can paste the conversation as text instead.",
        ) from exc


# Links --------------------------------------------------------------------------------------


class LinkRequest(Strict):
    url: str = Field(max_length=2100)


@router.post("/check/link", dependencies=[Depends(limit("check_link", 120, 30))])
def check_link(body: LinkRequest, user: Profile | None = Depends(optional_user), db: Session = Depends(get_db)) -> dict:
    result = analyse_link(body.url)
    out = {
        "status": result.status,
        "url": result.url,
        "host": result.host,
        "display_host": result.display_host,
        "registered_domain": result.registered_domain,
        "official_brand": result.official_brand,
        "official_brand_name": BRAND_NAMES.get(result.official_brand or ""),
        "expanded_to": result.expanded_to,
        "threat_check": result.threat_check,
        "signals": [{"id": s.id, "severity": s.severity} for s in result.signals],
        "notes": result.notes,
    }
    if result.status != "invalid":
        label = (result.display_host or result.host or "link")[:120]
        out["check_id"] = _remember(
            db, user, "link", result.status, label, signals=[s.id for s in result.signals], ai_review="not_requested"
        )
    return out


# Images -------------------------------------------------------------------------------------


@router.post("/check/image", dependencies=[Depends(limit("check_image", 30, 20))])
async def check_image(
    file: UploadFile = File(...),
    ai_consent: bool = Form(False),
    user: Profile = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    data = await read_upload(file, images.MAX_BYTES)
    try:
        image = images.load(data)
    except images.ImageRejected as exc:
        messages = {
            "too_large": "That image is larger than 10 MB.",
            "unsupported": "SAHELI can check JPG, PNG and WebP images.",
            "corrupt": "That image file seems to be damaged.",
        }
        raise error(400, f"image_{exc.reason}", messages[exc.reason]) from exc

    findings = images.metadata_findings(image, data)
    review, ai_status = None, "not_requested"
    if ai_consent:
        try:
            review = images.ai_review(image)
            ai_status = "completed"
        except llm.AIUnavailable as exc:
            ai_status = exc.reason
    risk = images.sharing_risk(findings, review)
    result = {
        "sharing_risk": risk,
        "format": image.format,
        "width": image.width,
        "height": image.height,
        "metadata": [{"id": f.id, "severity": f.severity, "detail": f.detail} for f in findings],
        "ai": {"status": ai_status, "review": review},
        "can_clean": any(f.id not in {"no_hidden_data"} for f in findings),
    }
    signals = [f.id for f in findings if f.severity > 0] + [p["type"] for p in (review or {}).get("privacy_findings", [])]
    result["check_id"] = _remember(db, user, "image", risk, None, signals=signals, ai_review=ai_status)
    return result


@router.post("/check/image/clean", dependencies=[Depends(limit("clean_image", 60, 20))])
async def clean_image(file: UploadFile = File(...), user: Profile = Depends(current_user)) -> Response:
    data = await read_upload(file, images.MAX_BYTES)
    try:
        image = images.load(data)
    except images.ImageRejected as exc:
        raise error(400, f"image_{exc.reason}", "That image couldn't be read.") from exc
    cleaned, mime = images.clean_copy(image)
    extension = "png" if mime == "image/png" else "jpg"
    return Response(
        cleaned,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="saheli-clean.{extension}"', "Cache-Control": "no-store"},
    )


# Profiles -----------------------------------------------------------------------------------


class ProfileRequest(Strict):
    account_age: Literal["new", "months", "years", "unknown"] = "unknown"
    photo_count: Literal["none", "few", "many", "unknown"] = "unknown"
    connections: Literal["few", "some", "many", "unknown"] = "unknown"
    mutual_connections: Literal["yes", "no", "unknown"] = "unknown"
    video_call: Literal["yes", "refused", "not_asked"] = "not_asked"
    met_in_person: bool = False
    photos_look_professional: bool = False
    story_inconsistent: bool = False
    reverse_image: Literal["different_name", "same_name", "nothing_found", "not_checked"] = "not_checked"
    claims: list[
        Literal["military_abroad", "oil_rig_or_ship", "doctor_abroad", "widowed", "wealthy_investor", "model_or_celebrity"]
    ] = Field(default_factory=list, max_length=6)
    asked_for: list[
        Literal["money", "gift_cards", "crypto", "intimate_images", "personal_details", "move_apps", "secrecy", "investment"]
    ] = Field(default_factory=list, max_length=8)


@router.post("/check/profile", dependencies=[Depends(limit("check_profile", 60, 30))])
def check_profile(body: ProfileRequest, user: Profile | None = Depends(optional_user), db: Session = Depends(get_db)) -> dict:
    result = profile_check.check(profile_check.ProfileAnswers(**body.model_dump()))
    result["check_id"] = _remember(db, user, "profile", result["level"], None, signals=[s["id"] for s in result["signals"]])
    return result


# History ------------------------------------------------------------------------------------


@router.get("/checks")
def list_checks(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Check).where(Check.owner_id == user.id).order_by(Check.created_at.desc()).limit(50)).all()
    return {
        "enabled": user.keep_check_history,
        "items": [
            {
                "id": str(c.id),
                "kind": c.kind,
                "level": c.level,
                "label": c.label,
                "signals": c.signals,
                "patterns": c.patterns,
                "stages": c.stages,
                "ai_review": c.ai_review,
                "at": iso(c.created_at),
            }
            for c in rows
        ],
    }


@router.delete("/checks/{check_id}")
def delete_check(check_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    check = db.get(Check, parse_uuid(check_id))
    if not check or check.owner_id != user.id:
        raise not_found("That check")
    db.delete(check)
    db.commit()
    return {"deleted": True}


@router.delete("/checks")
def clear_checks(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    db.execute(delete(Check).where(Check.owner_id == user.id))
    db.commit()
    return {"deleted": True}
