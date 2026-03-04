"""Lexio API — Document CRUD routes."""

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth.dependencies import get_current_user, get_db
from packages.core.database.models.document import Document
from packages.core.database.models.user import User
from packages.core.module_loader import module_registry
from packages.pipeline.orchestrator import PipelineOrchestrator
from packages.api.schemas.documents import (
    DocumentCreate, DocumentResponse, DocumentListResponse,
)

router = APIRouter()


@router.post("/", response_model=DocumentResponse)
async def create_document(
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

    # Run pipeline in background
    orchestrator = PipelineOrchestrator(str(doc.id), pipeline_config)
    asyncio.create_task(orchestrator.run())

    return DocumentResponse.from_orm(doc)


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: str | None = None,
    document_type_id: str | None = None,
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

    stmt = stmt.order_by(Document.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(stmt)
    docs = result.scalars().all()
    total = (await db.execute(count_stmt)).scalar()

    return DocumentListResponse(items=[DocumentResponse.from_orm(d) for d in docs], total=total)


@router.get("/{document_id}", response_model=DocumentResponse)
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
    return DocumentResponse.from_orm(doc)
