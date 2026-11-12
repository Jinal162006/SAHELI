from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import Field

from app.api.common import Strict, error
from app.deps import current_user, limit
from app.engine import companion
from app.engine.lexicon import BY_ID
from app.models import Profile
from app.services import llm

router = APIRouter(prefix="/api", tags=["companion"])


class Turn(Strict):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=companion.MAX_TURN_CHARS)


class CheckContext(Strict):
    level: Literal["low", "medium", "high", "critical"]
    signals: list[str] = Field(default_factory=list, max_length=40)


class CompanionRequest(Strict):
    messages: list[Turn] = Field(min_length=1, max_length=60)
    language: Literal["en", "hi", "hi-Latn"] = "en"
    check: CheckContext | None = None


@router.post("/companion", dependencies=[Depends(limit("companion", 60, 20))])
def companion_reply(body: CompanionRequest, user: Profile = Depends(current_user)) -> dict:
    last = body.messages[-1]
    if last.role != "user" or not last.content.strip():
        raise error(400, "invalid_turns", "Send a message to continue.")
    flags = companion.detect_flags(last.content)
    check = None
    if body.check:
        check = {"level": body.check.level, "signals": [s for s in body.check.signals if s in BY_ID]}
    minor = user.age_group in {"under_13", "13_17"}
    try:
        text = companion.reply([t.model_dump() for t in body.messages], body.language, minor, check)
        return {"reply": text, "status": "completed", **flags}
    except llm.AIUnavailable as exc:
        # The person still gets the safety flags so the app can show the right help.
        return {"reply": None, "status": exc.reason, **flags}
