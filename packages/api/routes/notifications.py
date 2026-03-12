"""Lexio API — In-app notifications routes."""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth.dependencies import get_current_user, get_db
from packages.core.database.models.user import User
from packages.core.database.models.notification import Notification

router = APIRouter()
logger = logging.getLogger("lexio.api.notifications")


@router.get("")
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List notifications for the current user (user-specific + org-wide)."""
    from sqlalchemy import or_

    stmt = (
        select(Notification)
        .where(
            Notification.organization_id == user.organization_id,
            or_(
                Notification.user_id == user.id,
                Notification.user_id.is_(None),
            ),
        )
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )

    if unread_only:
        stmt = stmt.where(Notification.is_read == False)  # noqa: E712

    result = await db.execute(stmt)
    notifications = result.scalars().all()

    # Count total unread
    count_stmt = select(func.count(Notification.id)).where(
        Notification.organization_id == user.organization_id,
        Notification.is_read == False,  # noqa: E712
        or_(
            Notification.user_id == user.id,
            Notification.user_id.is_(None),
        ),
    )
    unread_count = (await db.execute(count_stmt)).scalar() or 0

    return {
        "items": [
            {
                "id": str(n.id),
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "document_id": str(n.document_id) if n.document_id else None,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
            }
            for n in notifications
        ],
        "unread_count": unread_count,
    }


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a single notification as read."""
    from sqlalchemy import or_

    stmt = select(Notification).where(
        Notification.id == uuid.UUID(notification_id),
        Notification.organization_id == user.organization_id,
        or_(Notification.user_id == user.id, Notification.user_id.is_(None)),
    )
    result = await db.execute(stmt)
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(404, "Notificação não encontrada")

    notif.is_read = True
    await db.commit()
    return {"id": notification_id, "is_read": True}


@router.patch("/read-all")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read for the current user."""
    from sqlalchemy import or_

    await db.execute(
        update(Notification)
        .where(
            Notification.organization_id == user.organization_id,
            Notification.is_read == False,  # noqa: E712
            or_(Notification.user_id == user.id, Notification.user_id.is_(None)),
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"marked_read": True}
