"""Fixed-window rate limits stored in Postgres, so limits hold across server instances."""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

_UPSERT = text(
    """
    INSERT INTO saheli.rate_limits (key, window_start, count)
    VALUES (:key, :window_start, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = saheli.rate_limits.count + 1
    RETURNING count
    """
)


def hit(db: Session, key: str, limit: int, window_seconds: int) -> None:
    """Count one request against `key`. Raises 429 once `limit` is exceeded in the window."""
    now = datetime.now(UTC)
    epoch = int(now.timestamp())
    window_start = datetime.fromtimestamp(epoch - epoch % window_seconds, UTC)
    count = db.execute(_UPSERT, {"key": key, "window_start": window_start}).scalar_one()
    db.commit()
    if count > limit:
        retry_after = window_seconds - (epoch % window_seconds)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "You've reached the limit for this action. Please try again a little later.",
            },
            headers={"Retry-After": str(retry_after)},
        )


def prune(db: Session) -> int:
    result = db.execute(text("DELETE FROM saheli.rate_limits WHERE window_start < now() - interval '2 days'"))
    db.commit()
    return result.rowcount or 0
