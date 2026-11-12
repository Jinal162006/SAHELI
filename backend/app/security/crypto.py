"""Application-level encryption and token helpers.

Ciphertext layout: version byte (0x01) | 12-byte nonce | AES-256-GCM ciphertext+tag.
Each ciphertext is bound to a context string (for example "evidence.title:<row id>") through
GCM associated data, so a value copied into another row or column will not decrypt.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings

_VERSION = b"\x01"


@lru_cache
def _aead() -> AESGCM:
    key = base64.b64decode(get_settings().encryption_key)
    if len(key) != 32:
        raise RuntimeError("SAHELI_ENCRYPTION_KEY must be 32 bytes, base64 encoded")
    return AESGCM(key)


def encrypt_bytes(data: bytes, context: str) -> bytes:
    nonce = os.urandom(12)
    return _VERSION + nonce + _aead().encrypt(nonce, data, context.encode())


def decrypt_bytes(blob: bytes, context: str) -> bytes:
    if not blob or blob[:1] != _VERSION:
        raise ValueError("Unknown ciphertext format")
    return _aead().decrypt(blob[1:13], blob[13:], context.encode())


def encrypt_text(text: str, context: str) -> bytes:
    return encrypt_bytes(text.encode("utf-8"), context)


def decrypt_text(blob: bytes | None, context: str) -> str | None:
    if blob is None:
        return None
    return decrypt_bytes(blob, context).decode("utf-8")


def encrypt_json(value: object, context: str) -> bytes:
    return encrypt_text(json.dumps(value, separators=(",", ":"), default=str), context)


def decrypt_json(blob: bytes, context: str) -> object:
    return json.loads(decrypt_text(blob, context) or "null")


def keyed_hash(value: str) -> str:
    """HMAC-SHA256 of a token, code or IP address. Used wherever we only need to compare."""
    secret = get_settings().hash_secret.encode()
    return hmac.new(secret, value.encode(), hashlib.sha256).hexdigest()


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


# Pairing and invite codes are typed by people, so avoid look-alike characters.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_code(length: int = 8) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


def normalise_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
