"""Lexio API — Thesis Bank routes."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth.dependencies import get_current_user, get_db
from packages.core.database.models.user import User
from packages.modules.thesis_bank import service

router = APIRouter()


# ---------- Schemas ----------

class ThesisCreate(BaseModel):
    title: str
    content: str
    summary: str | None = None
    legal_area_id: str
    document_type_id: str | None = None
    tags: list[str] | None = None
    category: str | None = None
    legal_basis: list[dict[str, Any]] | None = None
    precedents: list[dict[str, Any]] | None = None
    quality_score: float | None = None


class ThesisUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    summary: str | None = None
    legal_area_id: str | None = None
    document_type_id: str | None = None
    tags: list[str] | None = None
    category: str | None = None
    legal_basis: list[dict[str, Any]] | None = None
    precedents: list[dict[str, Any]] | None = None
    quality_score: float | None = None
    status: str | None = None


class ThesisResponse(BaseModel):
    id: str
    title: str
    content: str
    summary: str | None
    legal_area_id: str
    document_type_id: str | None
    tags: list[str] | None
    category: str | None
    legal_basis: list[dict[str, Any]] | None
    precedents: list[dict[str, Any]] | None
    quality_score: float | None
    usage_count: int
    source_type: str
    status: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ---------- Endpoints ----------

@router.post("/", response_model=ThesisResponse)
async def create_thesis(
    req: ThesisCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = req.model_dump(exclude_none=True)
    thesis = await service.create_thesis(
        db=db,
        organization_id=user.organization_id,
        data=data,
        author_id=user.id,
    )
    await db.commit()
    return _to_response(thesis)


@router.get("/")
async def list_theses(
    legal_area_id: str | None = None,
    document_type_id: str | None = None,
    search: str | None = Query(None, alias="q"),
    status: str = "active",
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    theses, total = await service.list_theses(
        db=db,
        organization_id=user.organization_id,
        legal_area_id=legal_area_id,
        document_type_id=document_type_id,
        search_query=search,
        status=status,
        skip=skip,
        limit=limit,
    )
    return {
        "items": [_to_response(t) for t in theses],
        "total": total,
    }


@router.get("/stats")
async def thesis_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_stats(db, user.organization_id)


@router.get("/{thesis_id}", response_model=ThesisResponse)
async def get_thesis(
    thesis_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    thesis = await service.get_thesis(
        db, uuid.UUID(thesis_id), user.organization_id,
    )
    if not thesis:
        raise HTTPException(404, "Tese não encontrada")
    return _to_response(thesis)


@router.patch("/{thesis_id}", response_model=ThesisResponse)
async def update_thesis(
    thesis_id: str,
    req: ThesisUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = req.model_dump(exclude_none=True)
    thesis = await service.update_thesis(
        db, uuid.UUID(thesis_id), user.organization_id, data,
    )
    if not thesis:
        raise HTTPException(404, "Tese não encontrada")
    await db.commit()
    return _to_response(thesis)


@router.delete("/{thesis_id}")
async def delete_thesis(
    thesis_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await service.delete_thesis(
        db, uuid.UUID(thesis_id), user.organization_id,
    )
    if not ok:
        raise HTTPException(404, "Tese não encontrada")
    await db.commit()
    return {"deleted": True}


def _to_response(thesis) -> dict:
    return {
        "id": str(thesis.id),
        "title": thesis.title,
        "content": thesis.content,
        "summary": thesis.summary,
        "legal_area_id": thesis.legal_area_id,
        "document_type_id": thesis.document_type_id,
        "tags": thesis.tags,
        "category": thesis.category,
        "legal_basis": thesis.legal_basis,
        "precedents": thesis.precedents,
        "quality_score": thesis.quality_score,
        "usage_count": thesis.usage_count,
        "source_type": thesis.source_type,
        "status": thesis.status,
        "created_at": thesis.created_at.isoformat() if thesis.created_at else "",
        "updated_at": thesis.updated_at.isoformat() if thesis.updated_at else "",
    }
