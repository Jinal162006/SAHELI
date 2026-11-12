"""Evidence Vault: things the person deliberately chooses to keep.

Text is encrypted in the database; files are encrypted before upload to storage. Every item
records a SHA-256 of each original file, so the person can show it has not changed since it
was saved. Viewing, downloading and deleting are written to the account's activity log.
"""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.common import Strict, error, iso, not_found, parse_uuid, read_upload, retention_expiry
from app.db import get_db
from app.deps import current_user, limit
from app.models import EvidenceFile, EvidenceItem, Profile
from app.security import audit
from app.security.crypto import decrypt_text, encrypt_text, sha256_hex
from app.services import storage

router = APIRouter(prefix="/api/evidence", tags=["evidence"])

KINDS = ("screenshot", "image", "conversation", "link", "note", "recording", "document")
Kind = Literal["screenshot", "image", "conversation", "link", "note", "recording", "document"]
MAX_FILES = 5
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_TEXT = 100_000


def sniff_mime(data: bytes, declared: str | None = None) -> str | None:
    """Work out a file's type from its content. The name and declared type are not trusted."""
    head = data[:16]
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/wav"
    if head.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head[4:8] == b"ftyp":
        return "audio/mp4" if head[8:12] in {b"M4A ", b"M4B "} else "video/mp4"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "audio/webm" if (declared or "").startswith("audio/") else "video/webm"
    if head.startswith(b"OggS"):
        return "audio/ogg"
    if head.startswith(b"ID3") or head[:2] in {b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"}:
        return "audio/mpeg"
    if b"\x00" not in data[:8192]:
        try:
            data[:65536].decode("utf-8")
            return "text/plain"
        except UnicodeDecodeError:
            return None
    return None


def _ctx(field: str, item_id: uuid.UUID) -> str:
    return f"evidence.{field}:{item_id}"


def _owned(db: Session, user: Profile, item_id: str) -> EvidenceItem:
    item = db.get(EvidenceItem, parse_uuid(item_id))
    if not item or item.owner_id != user.id:
        raise not_found("That evidence item")
    return item


def _files(db: Session, item_id: uuid.UUID) -> list[EvidenceFile]:
    return list(db.scalars(select(EvidenceFile).where(EvidenceFile.evidence_id == item_id).order_by(EvidenceFile.part)).all())


def _summary(item: EvidenceItem, file_count: int, total: int) -> dict:
    return {
        "id": str(item.id),
        "kind": item.kind,
        "title": decrypt_text(item.title_enc, _ctx("title", item.id)),
        "platform": item.platform,
        "occurred_at": iso(item.occurred_at),
        "saved_at": iso(item.created_at),
        "expires_at": iso(item.expires_at),
        "source": item.source,
        "file_count": file_count,
        "total_bytes": total,
    }


def store_file(db: Session, item: EvidenceItem, data: bytes, mime: str, part: int, filename: str | None) -> EvidenceFile:
    key = storage.new_object_key(item.owner_id)
    storage.put(key, data)
    record = EvidenceFile(
        evidence_id=item.id,
        part=part,
        object_key=key,
        filename_enc=encrypt_text(filename[:200], f"evidence.filename:{item.id}:{part}") if filename else None,
        mime_type=mime,
        size_bytes=len(data),
        sha256=sha256_hex(data),
    )
    db.add(record)
    return record


@router.get("")
def list_items(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.execute(
        select(EvidenceItem, func.count(EvidenceFile.id), func.coalesce(func.sum(EvidenceFile.size_bytes), 0))
        .outerjoin(EvidenceFile, EvidenceFile.evidence_id == EvidenceItem.id)
        .where(EvidenceItem.owner_id == user.id)
        .group_by(EvidenceItem.id)
        .order_by(EvidenceItem.created_at.desc())
    ).all()
    return {
        "retention_days": user.evidence_retention_days,
        "items": [_summary(item, count, total) for item, count, total in rows],
    }


@router.post("", dependencies=[Depends(limit("evidence_create", 60, 20))])
async def create_item(
    request: Request,
    kind: Kind = Form(...),
    title: str = Form(..., min_length=1, max_length=200),
    notes: str | None = Form(None, max_length=MAX_TEXT),
    content: str | None = Form(None, max_length=MAX_TEXT),
    platform: str | None = Form(None, max_length=40),
    occurred_at: datetime | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    user: Profile = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    if len(files) > MAX_FILES:
        raise error(400, "too_many_files", f"Add up to {MAX_FILES} files to one item.")
    if not files and not (content or "").strip() and not (notes or "").strip():
        raise error(400, "empty", "Add a file, some text or a note to save.")

    payloads = []
    for upload in files:
        data = await read_upload(upload, MAX_FILE_BYTES)
        mime = sniff_mime(data, upload.content_type)
        if mime is None:
            raise error(
                400, "unsupported_file", "That type of file can't be saved. Use images, PDFs, text, audio or video files."
            )
        payloads.append((data, mime, upload.filename))

    item = EvidenceItem(
        id=uuid.uuid4(),
        owner_id=user.id,
        kind=kind,
        platform=platform or None,
        occurred_at=occurred_at,
        source="upload",
        expires_at=retention_expiry(user.evidence_retention_days),
    )
    item.title_enc = encrypt_text(title, _ctx("title", item.id))
    item.notes_enc = encrypt_text(notes, _ctx("notes", item.id)) if notes else None
    item.content_enc = encrypt_text(content, _ctx("content", item.id)) if content else None
    db.add(item)
    db.flush()

    stored_keys: list[str] = []
    try:
        for part, (data, mime, name) in enumerate(payloads):
            stored_keys.append(store_file(db, item, data, mime, part, name).object_key)
    except storage.StorageError as exc:
        db.rollback()
        storage.delete(stored_keys)
        raise error(
            502, "upload_failed", "Your evidence couldn't be saved just now. Nothing was stored. Please try again."
        ) from exc

    audit.record(db, request, user.id, "evidence.saved", "evidence", item.id)
    db.commit()
    return _summary(item, len(payloads), sum(len(p[0]) for p in payloads))


@router.get("/{item_id}")
def get_item(item_id: str, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    item = _owned(db, user, item_id)
    files = _files(db, item.id)
    out = _summary(item, len(files), sum(f.size_bytes for f in files))
    out["notes"] = decrypt_text(item.notes_enc, _ctx("notes", item.id))
    out["content"] = decrypt_text(item.content_enc, _ctx("content", item.id))
    out["files"] = [
        {
            "id": str(f.id),
            "part": f.part,
            "name": decrypt_text(f.filename_enc, f"evidence.filename:{item.id}:{f.part}") if f.filename_enc else None,
            "mime_type": f.mime_type,
            "size_bytes": f.size_bytes,
            "sha256": f.sha256,
            "saved_at": iso(f.created_at),
        }
        for f in files
    ]
    return out


class EvidenceUpdate(Strict):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=MAX_TEXT)
    platform: str | None = Field(default=None, max_length=40)
    occurred_at: datetime | None = None


@router.patch("/{item_id}")
def update_item(item_id: str, body: EvidenceUpdate, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    item = _owned(db, user, item_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("title"):
        item.title_enc = encrypt_text(data["title"], _ctx("title", item.id))
    if "notes" in data:
        item.notes_enc = encrypt_text(data["notes"], _ctx("notes", item.id)) if data["notes"] else None
    if "platform" in data:
        item.platform = data["platform"] or None
    if "occurred_at" in data:
        item.occurred_at = data["occurred_at"]
    db.commit()
    return get_item(item_id, user, db)


@router.delete("/{item_id}")
def delete_item(item_id: str, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    item = _owned(db, user, item_id)
    keys = [f.object_key for f in _files(db, item.id)]
    try:
        storage.delete(keys)
    except storage.StorageError as exc:
        raise error(502, "delete_failed", "That item couldn't be deleted just now. Please try again.") from exc
    db.delete(item)
    audit.record(db, request, user.id, "evidence.deleted", "evidence", item.id)
    db.commit()
    return {"deleted": True}


@router.get("/{item_id}/files/{file_id}")
def download_file(
    item_id: str, file_id: str, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> Response:
    item = _owned(db, user, item_id)
    record = db.get(EvidenceFile, parse_uuid(file_id))
    if not record or record.evidence_id != item.id:
        raise not_found("That file")
    try:
        data = storage.get(record.object_key)
    except storage.StorageError as exc:
        raise error(502, "download_failed", "That file couldn't be opened just now. Please try again.") from exc
    audit.record(db, request, user.id, "evidence.file_opened", "evidence", item.id)
    db.commit()
    return _attachment(data, record.mime_type, f"saheli-evidence-{record.part + 1}")


@router.get("/{item_id}/recording")
def download_recording(
    item_id: str, request: Request, user: Profile = Depends(current_user), db: Session = Depends(get_db)
) -> Response:
    """A recording saved in pieces during an emergency, joined back into one file."""
    item = _owned(db, user, item_id)
    files = _files(db, item.id)
    if item.kind != "recording" or not files:
        raise not_found("That recording")
    try:
        data = b"".join(storage.get(f.object_key) for f in files)
    except storage.StorageError as exc:
        raise error(502, "download_failed", "That recording couldn't be opened just now. Please try again.") from exc
    audit.record(db, request, user.id, "evidence.file_opened", "evidence", item.id)
    db.commit()
    return _attachment(data, files[0].mime_type, "saheli-recording")


_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "text/plain": "txt",
}


def _attachment(data: bytes, mime: str, stem: str) -> Response:
    return Response(
        data,
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="{stem}.{_EXTENSIONS.get(mime, "bin")}"',
            "Cache-Control": "no-store",
            "Content-Security-Policy": "sandbox; default-src 'none'",
        },
    )
