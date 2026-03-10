"""Lexio API — Document CRUD routes."""

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth.dependencies import get_current_user, get_current_admin, get_db
from packages.core.database.models.document import Document
from packages.core.database.models.user import User
from packages.core.module_loader import module_registry
from packages.pipeline.orchestrator import PipelineOrchestrator
from packages.api.schemas.documents import (
    DocumentDetailResponse,
    DocumentCreate, DocumentResponse, DocumentListResponse,
)
from packages.modules.anamnesis.wizard import build_pipeline_context
from packages.api.middleware.rate_limit import limiter

logger = logging.getLogger("lexio.api.documents")

router = APIRouter()


@router.post("/", response_model=DocumentResponse)
@limiter.limit("20/minute")
async def create_document(
    request: Request,
    req: DocumentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate document type
    doc_type_info = module_registry.get(req.document_type_id)
    if not doc_type_info or not doc_type_info.instance:
        raise HTTPException(400, f"Tipo de documento '{req.document_type_id}' não disponível")

    # Create document
    doc = Document(
        document_type_id=req.document_type_id,
        legal_area_ids=req.legal_area_ids or [],
        template_variant=req.template_variant,
        original_request=req.original_request,
        organization_id=user.organization_id,
        author_id=user.id,
        status="processando",
        origem=req.origem or "web",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Get pipeline config from document type module
    pipeline_config = doc_type_info.instance.get_pipeline_config(req.template_variant)

    # Build anamnesis context (profile prefs + per-request structured fields)
    try:
        anamnesis_ctx = await build_pipeline_context(
            db=db,
            user_id=str(user.id),
            document_type_id=req.document_type_id,
            original_request=req.original_request,
            request_context=req.request_context,
            auto_extract=bool(not req.request_context),
        )
    except Exception as exc:
        logger.warning(f"Anamnesis context build failed (non-fatal): {exc}")
        anamnesis_ctx = {}

    # Run pipeline in background
    orchestrator = PipelineOrchestrator(str(doc.id), pipeline_config, anamnesis_context=anamnesis_ctx)
    asyncio.create_task(orchestrator.run())

    return DocumentResponse.from_orm(doc)


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = None,
    document_type_id: str | None = None,
    q: str | None = Query(None, max_length=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Document).where(Document.organization_id == user.organization_id)
    count_stmt = select(func.count(Document.id)).where(Document.organization_id == user.organization_id)

    if status:
        stmt = stmt.where(Document.status == status)
        count_stmt = count_stmt.where(Document.status == status)
    if document_type_id:
        stmt = stmt.where(Document.document_type_id == document_type_id)
        count_stmt = count_stmt.where(Document.document_type_id == document_type_id)
    if q:
        q_like = f"%{q}%"
        search_filter = or_(
            Document.tema.ilike(q_like),
            Document.original_request.ilike(q_like),
        )
        stmt = stmt.where(search_filter)
        count_stmt = count_stmt.where(search_filter)

    stmt = stmt.order_by(Document.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(stmt)
    docs = result.scalars().all()
    total = (await db.execute(count_stmt)).scalar()

    return DocumentListResponse(items=[DocumentResponse.from_orm(d) for d in docs], total=total)


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Document).where(
        Document.id == uuid.UUID(document_id),
        Document.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    return DocumentDetailResponse.from_orm(doc)


class ContentUpdate(BaseModel):
    content: str


@router.put("/{document_id}/content")
async def update_document_content(
    document_id: str,
    req: ContentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update document text content (from TipTap editor)."""
    stmt = select(Document).where(
        Document.id == uuid.UUID(document_id),
        Document.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Documento não encontrado")

    doc.texto_completo = req.content
    await db.commit()
    return {"updated": True, "document_id": document_id}


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get raw document text content for editor."""
    stmt = select(Document).where(
        Document.id == uuid.UUID(document_id),
        Document.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Documento não encontrado")

    return {
        "document_id": document_id,
        "content": doc.texto_completo or "",
        "document_type_id": doc.document_type_id,
        "tema": doc.tema,
    }


@router.get("/{document_id}/executions")
async def get_document_executions(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List LLM agent executions for a document (cost, duration, tokens)."""
    from packages.core.database.models.execution import Execution

    # Verify document belongs to org
    stmt = select(Document).where(
        Document.id == uuid.UUID(document_id),
        Document.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Documento não encontrado")

    exec_stmt = (
        select(Execution)
        .where(Execution.document_id == uuid.UUID(document_id))
        .order_by(Execution.created_at.asc())
    )
    exec_result = await db.execute(exec_stmt)
    executions = exec_result.scalars().all()

    return [
        {
            "id": str(e.id),
            "agent_name": e.agent_name,
            "phase": e.phase,
            "model": e.model,
            "tokens_in": e.tokens_in,
            "tokens_out": e.tokens_out,
            "cost_usd": e.cost_usd,
            "duration_ms": e.duration_ms,
            "created_at": e.created_at.isoformat() if e.created_at else "",
        }
        for e in executions
    ]


# ── Workflow: Review / Approve / Reject ─────────────────────────────────────

class ReviewAction(BaseModel):
    reason: str | None = None  # Used for rejection reason


async def _get_doc_for_user(document_id: str, user: User, db: AsyncSession) -> Document:
    """Helper: load document scoped to user's org, raise 404 if missing."""
    stmt = select(Document).where(
        Document.id == uuid.UUID(document_id),
        Document.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Documento não encontrado")
    return doc


@router.post("/{document_id}/submit-review")
async def submit_for_review(
    document_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a completed document for review (concluido → em_revisao)."""
    doc = await _get_doc_for_user(document_id, user, db)
    if doc.status not in ("concluido", "rejeitado"):
        raise HTTPException(400, f"Documento com status '{doc.status}' não pode ser enviado para revisão")
    doc.status = "em_revisao"
    metadata = dict(doc.metadata_ or {})
    metadata["review_submitted_by"] = str(user.id)
    metadata["review_submitted_at"] = __import__("datetime").datetime.utcnow().isoformat()
    doc.metadata_ = metadata
    await db.commit()
    return {"status": "em_revisao", "document_id": document_id}


@router.post("/{document_id}/approve")
async def approve_document(
    document_id: str,
    user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Approve a document under review (em_revisao → aprovado). Admin only."""
    doc = await _get_doc_for_user(document_id, user, db)
    if doc.status != "em_revisao":
        raise HTTPException(400, f"Documento com status '{doc.status}' não pode ser aprovado")
    doc.status = "aprovado"
    metadata = dict(doc.metadata_ or {})
    metadata["approved_by"] = str(user.id)
    metadata["approved_by_name"] = user.full_name
    metadata["approved_at"] = __import__("datetime").datetime.utcnow().isoformat()
    metadata.pop("rejection_reason", None)
    doc.metadata_ = metadata
    await db.commit()
    return {"status": "aprovado", "document_id": document_id}


@router.post("/{document_id}/reject")
async def reject_document(
    document_id: str,
    req: ReviewAction,
    user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reject a document under review (em_revisao → rejeitado). Admin only."""
    doc = await _get_doc_for_user(document_id, user, db)
    if doc.status != "em_revisao":
        raise HTTPException(400, f"Documento com status '{doc.status}' não pode ser rejeitado")
    doc.status = "rejeitado"
    metadata = dict(doc.metadata_ or {})
    metadata["rejected_by"] = str(user.id)
    metadata["rejected_by_name"] = user.full_name
    metadata["rejected_at"] = __import__("datetime").datetime.utcnow().isoformat()
    metadata["rejection_reason"] = req.reason or ""
    doc.metadata_ = metadata
    await db.commit()
    return {"status": "rejeitado", "document_id": document_id, "reason": req.reason}
