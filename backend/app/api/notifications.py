import uuid

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.common import Strict, iso, now
from app.db import get_db
from app.deps import current_user
from app.models import Notification, Profile

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(
        select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(50)
    ).all()
    unread = db.scalar(
        select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return {
        "unread": unread,
        "items": [
            {
                "id": str(n.id),
                "kind": n.kind,
                "title": n.title,
                "body": n.body,
                "link": n.link,
                "read": n.read_at is not None,
                "at": iso(n.created_at),
            }
            for n in rows
        ],
    }


class MarkRead(Strict):
    ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)
    all: bool = False


@router.post("/read")
def mark_read(body: MarkRead, user: Profile = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    query = update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    if not body.all:
        query = query.where(Notification.id.in_(body.ids))
    db.execute(query.values(read_at=now()))
    db.commit()
    return {"ok": True}
