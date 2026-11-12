"""Encrypted file storage.

Files are encrypted with AES-256-GCM before they leave the API, bound to their object key,
so the storage provider only ever holds ciphertext.

Backends: Supabase Storage (private bucket) in production; a local folder for development
and tests.
"""

import logging
import uuid
from pathlib import Path

import httpx

from app.config import get_settings
from app.security.crypto import decrypt_bytes, encrypt_bytes

log = logging.getLogger(__name__)


class StorageError(Exception):
    pass


def new_object_key(owner_id: uuid.UUID) -> str:
    return f"{owner_id}/{uuid.uuid4()}"


def _supabase_headers() -> dict[str, str]:
    key = get_settings().supabase_service_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"  # legacy service_role JWT
    return headers


def _object_url(key: str) -> str:
    settings = get_settings()
    return f"{settings.supabase_url}/storage/v1/object/{settings.storage_bucket}/{key}"


def _local_path(key: str) -> Path:
    root = Path(get_settings().local_storage_dir).resolve()
    path = (root / key).resolve()
    if root not in path.parents:
        raise StorageError("Invalid object key")
    return path


def put(key: str, data: bytes) -> None:
    blob = encrypt_bytes(data, f"object:{key}")
    if get_settings().storage_backend == "local":
        path = _local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(blob)
        return
    try:
        response = httpx.post(
            _object_url(key),
            content=blob,
            headers={**_supabase_headers(), "Content-Type": "application/octet-stream", "x-upsert": "false"},
            timeout=30.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        log.error("Storage upload failed: %s", type(exc).__name__)
        raise StorageError("Upload failed") from exc


def get(key: str) -> bytes:
    if get_settings().storage_backend == "local":
        try:
            blob = _local_path(key).read_bytes()
        except FileNotFoundError as exc:
            raise StorageError("Not found") from exc
    else:
        try:
            response = httpx.get(_object_url(key), headers=_supabase_headers(), timeout=30.0)
            response.raise_for_status()
            blob = response.content
        except httpx.HTTPError as exc:
            log.error("Storage download failed: %s", type(exc).__name__)
            raise StorageError("Download failed") from exc
    return decrypt_bytes(blob, f"object:{key}")


def delete(keys: list[str]) -> None:
    if not keys:
        return
    settings = get_settings()
    if settings.storage_backend == "local":
        for key in keys:
            _local_path(key).unlink(missing_ok=True)
        return
    try:
        response = httpx.request(
            "DELETE",
            f"{settings.supabase_url}/storage/v1/object/{settings.storage_bucket}",
            json={"prefixes": keys},
            headers=_supabase_headers(),
            timeout=30.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        log.error("Storage delete failed: %s", type(exc).__name__)
        raise StorageError("Delete failed") from exc
