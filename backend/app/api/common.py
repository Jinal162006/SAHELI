import math
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from app.config import get_settings


def error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def not_found(what: str = "That item") -> HTTPException:
    return error(404, "not_found", f"{what} wasn't found. It may have been deleted.")


def now() -> datetime:
    return datetime.now(UTC)


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


class Strict(BaseModel):
    """Request bodies reject unknown fields, so typos fail loudly instead of being ignored."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Coordinates(Strict):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0, le=100_000)


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def maps_link(lat: float, lng: float) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={lat:.5f},{lng:.5f}"


def status_link(token: str) -> str:
    return f"{get_settings().public_url}/s/{token}"


async def read_upload(upload: UploadFile, max_bytes: int) -> bytes:
    """Read an upload, refusing anything over max_bytes without buffering all of it."""
    chunks, total = [], 0
    while chunk := await upload.read(1024 * 1024):
        total += len(chunk)
        if total > max_bytes:
            raise error(413, "file_too_large", f"That file is too large. The limit is {max_bytes // (1024 * 1024)} MB.")
        chunks.append(chunk)
    if total == 0:
        raise error(400, "empty_file", "That file is empty.")
    return b"".join(chunks)


def parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise not_found() from exc


def retention_expiry(days: int | None, start: datetime | None = None) -> datetime | None:
    return (start or now()) + timedelta(days=days) if days else None
