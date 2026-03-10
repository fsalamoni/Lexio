"""Lexio API — Statistics routes (summary + daily + agent breakdown)."""

from fastapi import APIRouter, Depends, Query
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

    processing_docs = (await db.execute(
        select(func.count(Document.id)).where(
            Document.organization_id == org_id,
            Document.status == "processando",
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

    avg_duration_ms = (await db.execute(
        select(func.avg(Execution.duration_ms)).where(
            Execution.organization_id == org_id,
            Execution.duration_ms.isnot(None),
        )
    )).scalar()

    pending_review_docs = (await db.execute(
        select(func.count(Document.id)).where(
            Document.organization_id == org_id,
            Document.status == "em_revisao",
        )
    )).scalar() or 0

    return {
        "total_documents": total_docs,
        "completed_documents": completed_docs,
        "processing_documents": processing_docs,
        "pending_review_documents": pending_review_docs,
        "average_quality_score": round(avg_score, 1) if avg_score else None,
        "total_cost_usd": round(total_cost, 4),
        "average_duration_ms": int(avg_duration_ms) if avg_duration_ms else None,
    }


@router.get("/daily")
async def get_daily_stats(
    days: int = Query(30, ge=1, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Documents created per day (last N days) + daily cost."""
    from datetime import datetime, timedelta
    from sqlalchemy import cast, Date as SQLDate, case

    org_id = user.organization_id
    cutoff = datetime.utcnow() - timedelta(days=days)

    # Group documents by date
    doc_rows = (await db.execute(
        select(
            cast(Document.created_at, SQLDate).label("dia"),
            func.count(Document.id).label("total"),
            func.count(
                case((Document.status == "concluido", Document.id), else_=None)
            ).label("concluidos"),
        )
        .where(
            Document.organization_id == org_id,
            Document.created_at >= cutoff,
        )
        .group_by(cast(Document.created_at, SQLDate))
        .order_by(cast(Document.created_at, SQLDate).asc())
    )).all()

    # Get cost per day from executions
    cost_rows = (await db.execute(
        select(
            cast(Execution.created_at, SQLDate).label("dia"),
            func.coalesce(func.sum(Execution.cost_usd), 0).label("custo"),
        )
        .where(
            Execution.organization_id == org_id,
            Execution.created_at >= cutoff,
        )
        .group_by(cast(Execution.created_at, SQLDate))
    )).all()

    cost_by_day = {str(row.dia): float(row.custo or 0) for row in cost_rows}

    return [
        {
            "dia": str(row.dia),
            "total": row.total,
            "concluidos": row.concluidos,
            "custo": round(cost_by_day.get(str(row.dia), 0), 4),
        }
        for row in doc_rows
    ]


@router.get("/agents")
async def get_agent_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """LLM call stats aggregated by agent."""
    org_id = user.organization_id

    rows = (await db.execute(
        select(
            Execution.agent_name,
            func.count(Execution.id).label("chamadas"),
            func.avg(Execution.tokens_in).label("tokens_in_medio"),
            func.avg(Execution.tokens_out).label("tokens_out_medio"),
            func.sum(Execution.cost_usd).label("custo_total"),
            func.avg(Execution.duration_ms).label("tempo_medio_ms"),
        )
        .where(Execution.organization_id == org_id)
        .group_by(Execution.agent_name)
        .order_by(func.sum(Execution.cost_usd).desc())
    )).all()

    return [
        {
            "agent_name": row.agent_name,
            "chamadas": row.chamadas,
            "tokens_in_medio": int(row.tokens_in_medio or 0),
            "tokens_out_medio": int(row.tokens_out_medio or 0),
            "custo_total": round(float(row.custo_total or 0), 4),
            "tempo_medio_ms": int(row.tempo_medio_ms or 0),
        }
        for row in rows
    ]


@router.get("/by-type")
async def get_stats_by_type(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Documents count and avg quality score per document_type_id."""
    rows = (await db.execute(
        select(
            Document.document_type_id,
            func.count(Document.id).label("total"),
            func.avg(Document.quality_score).label("avg_score"),
        )
        .where(Document.organization_id == user.organization_id)
        .group_by(Document.document_type_id)
        .order_by(func.count(Document.id).desc())
    )).all()
    return [
        {
            "document_type_id": r.document_type_id,
            "total": r.total,
            "avg_score": round(float(r.avg_score), 1) if r.avg_score else None,
        }
        for r in rows
    ]


@router.get("/recent")
async def get_recent_documents(
    limit: int = Query(5, ge=1, le=20),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Most recent documents for dashboard."""
    org_id = user.organization_id
    result = await db.execute(
        select(Document)
        .where(Document.organization_id == org_id)
        .order_by(Document.created_at.desc())
        .limit(limit)
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "document_type_id": d.document_type_id,
            "tema": d.tema,
            "status": d.status,
            "quality_score": d.quality_score,
            "created_at": d.created_at.isoformat() if d.created_at else "",
        }
        for d in docs
    ]
