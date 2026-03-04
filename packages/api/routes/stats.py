"""Lexio API — Statistics routes."""

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth.dependencies import get_current_user, get_db
from packages.core.database.models.document import Document
from packages.core.database.models.execution import Execution
from packages.core.database.models.user import User

router = APIRouter()


@router.get("/")
async def get_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = user.organization_id

    total_docs = (await db.execute(
        select(func.count(Document.id)).where(Document.organization_id == org_id)
    )).scalar() or 0

    completed_docs = (await db.execute(
        select(func.count(Document.id)).where(
            Document.organization_id == org_id,
            Document.status == "concluido",
        )
    )).scalar() or 0

    avg_score = (await db.execute(
        select(func.avg(Document.quality_score)).where(
            Document.organization_id == org_id,
            Document.quality_score.isnot(None),
        )
    )).scalar()

    total_cost = (await db.execute(
        select(func.sum(Execution.cost_usd)).where(Execution.organization_id == org_id)
    )).scalar() or 0.0

    return {
        "total_documents": total_docs,
        "completed_documents": completed_docs,
        "processing_documents": total_docs - completed_docs,
        "average_quality_score": round(avg_score, 1) if avg_score else None,
        "total_cost_usd": round(total_cost, 4),
    }
