import io
import time
import uuid

import jwt
from PIL import Image

SECRET = "test-secret-for-hs256-tokens-only-used-in-tests"
ISSUER = "http://auth.test/auth/v1"


def token_for(user_id: uuid.UUID, email: str = "person@example.com", **overrides) -> str:
    claims = {
        "sub": str(user_id),
        "email": email,
        "role": "authenticated",
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    claims.update(overrides)
    return jwt.encode(claims, SECRET, algorithm="HS256")


def auth(user_id: uuid.UUID, **overrides) -> dict:
    return {"Authorization": f"Bearer {token_for(user_id, **overrides)}"}


def jpeg_with_gps(lat: float = 28.6139, lng: float = 77.2090) -> bytes:
    image = Image.new("RGB", (64, 48), (200, 120, 160))
    exif = Image.Exif()
    exif[271] = "TestMake"
    exif[272] = "TestPhone 1"

    def dms(value: float):
        value = abs(value)
        degrees = int(value)
        minutes = int((value - degrees) * 60)
        seconds = round(((value - degrees) * 60 - minutes) * 60, 2)
        return (degrees, minutes, seconds)

    gps = {1: "N", 2: dms(lat), 3: "E", 4: dms(lng)}
    exif[0x8825] = gps
    out = io.BytesIO()
    image.save(out, format="JPEG", exif=exif)
    return out.getvalue()


def plain_png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 20, 30)).save(out, format="PNG")
    return out.getvalue()
