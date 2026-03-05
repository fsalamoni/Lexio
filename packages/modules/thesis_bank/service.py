"""Lexio Thesis Bank — CRUD service for legal theses."""

import logging
import uuid
from typing import Any

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.database.models.thesis import Thesis

logger = logging.getLogger("lexio.thesis_bank.service")


async def create_thesis(
    db: AsyncSession,
    organization_id: uuid.UUID,
    data: dict[str, Any],
    author_id: uuid.UUID | None = None,
) -> Thesis:
    """Create a new thesis entry."""
    thesis = Thesis(
        organization_id=organization_id,
        author_id=author_id,
        title=data["title"],
        content=data["content"],
        summary=data.get("summary"),
        legal_area_id=data["legal_area_id"],
        document_type_id=data.get("document_type_id"),
        tags=data.get("tags", []),
        category=data.get("category"),
        legal_basis=data.get("legal_basis", []),
        precedents=data.get("precedents", []),
        quality_score=data.get("quality_score"),
        source_document_id=data.get("source_document_id"),
        source_type=data.get("source_type", "manual"),
        status=data.get("status", "active"),
    )
    db.add(thesis)
    await db.flush()
    return thesis


async def get_thesis(
    db: AsyncSession,
    thesis_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> Thesis | None:
    """Get a single thesis by ID."""
    stmt = select(Thesis).where(
        Thesis.id == thesis_id,
        Thesis.organization_id == organization_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_theses(
    db: AsyncSession,
    organization_id: uuid.UUID,
    legal_area_id: str | None = None,
    document_type_id: str | None = None,
    search_query: str | None = None,
    status: str = "active",
    skip: int = 0,
    limit: int = 20,
) -> tuple[list[Thesis], int]:
    """List theses with filters and search."""
    base = select(Thesis).where(
        Thesis.organization_id == organization_id,
        Thesis.status == status,
    )
    count_base = select(func.count(Thesis.id)).where(
        Thesis.organization_id == organization_id,
        Thesis.status == status,
    )

    if legal_area_id:
        base = base.where(Thesis.legal_area_id == legal_area_id)
        count_base = count_base.where(Thesis.legal_area_id == legal_area_id)

    if document_type_id:
        base = base.where(Thesis.document_type_id == document_type_id)
        count_base = count_base.where(Thesis.document_type_id == document_type_id)

    if search_query:
        search_filter = or_(
            Thesis.title.ilike(f"%{search_query}%"),
            Thesis.content.ilike(f"%{search_query}%"),
            Thesis.summary.ilike(f"%{search_query}%"),
        )
        base = base.where(search_filter)
        count_base = count_base.where(search_filter)

    # Order by usage and quality
    stmt = base.order_by(
        Thesis.usage_count.desc(),
        Thesis.quality_score.desc().nullslast(),
        Thesis.created_at.desc(),
    ).offset(skip).limit(limit)

    result = await db.execute(stmt)
    theses = list(result.scalars().all())
    total = (await db.execute(count_base)).scalar() or 0

    return theses, total


async def update_thesis(
    db: AsyncSession,
    thesis_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: dict[str, Any],
) -> Thesis | None:
    """Update thesis fields."""
    thesis = await get_thesis(db, thesis_id, organization_id)
    if not thesis:
        return None

    updatable_fields = [
        "title", "content", "summary", "legal_area_id", "document_type_id",
        "tags", "category", "legal_basis", "precedents", "quality_score",
        "status",
    ]
    for field in updatable_fields:
        if field in data:
            setattr(thesis, field, data[field])

    await db.flush()
    return thesis


async def increment_usage(
    db: AsyncSession,
    thesis_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    """Increment the usage count for a thesis."""
    thesis = await get_thesis(db, thesis_id, organization_id)
    if thesis:
        thesis.usage_count += 1
        await db.flush()


async def delete_thesis(
    db: AsyncSession,
    thesis_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Soft delete (archive) a thesis."""
    thesis = await get_thesis(db, thesis_id, organization_id)
    if not thesis:
        return False
    thesis.status = "archived"
    await db.flush()
    return True


async def get_stats(
    db: AsyncSession,
    organization_id: uuid.UUID,
) -> dict[str, Any]:
    """Get thesis bank statistics."""
    total = (await db.execute(
        select(func.count(Thesis.id)).where(
            Thesis.organization_id == organization_id,
            Thesis.status == "active",
        )
    )).scalar() or 0

    by_area = (await db.execute(
        select(Thesis.legal_area_id, func.count(Thesis.id))
        .where(
            Thesis.organization_id == organization_id,
            Thesis.status == "active",
        )
        .group_by(Thesis.legal_area_id)
    )).all()

    avg_score = (await db.execute(
        select(func.avg(Thesis.quality_score)).where(
            Thesis.organization_id == organization_id,
            Thesis.status == "active",
            Thesis.quality_score.isnot(None),
        )
    )).scalar()

    most_used = (await db.execute(
        select(Thesis)
        .where(
            Thesis.organization_id == organization_id,
            Thesis.status == "active",
        )
        .order_by(Thesis.usage_count.desc())
        .limit(5)
    )).scalars().all()

    return {
        "total_theses": total,
        "by_area": {area: count for area, count in by_area},
        "average_quality_score": round(avg_score, 1) if avg_score else None,
        "most_used": [
            {"id": str(t.id), "title": t.title, "usage_count": t.usage_count}
            for t in most_used
        ],
    }
