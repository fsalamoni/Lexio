"""Lexio API — File upload and indexing routes."""

import asyncio
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth.dependencies import get_current_user, get_db
from packages.core.database.models.user import User
from packages.core.database.models.uploaded_document import UploadedDocument
from packages.core.database.engine import async_session
from packages.core.search.indexer import index_document, COLLECTION
from packages.api.middleware.rate_limit import limiter

router = APIRouter()
logger = logging.getLogger("lexio.uploads")

UPLOAD_DIR = Path("/app/uploads") if Path("/app").exists() else Path("uploads")

# 50 MB max upload size
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Allowed MIME types
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/html",
    "application/rtf",
}


async def _index_in_background(
    content: bytes,
    content_type: str,
    filename: str,
    organization_id: str,
    document_id: str,
    db_doc_id: uuid.UUID,
) -> None:
    """Index document in Qdrant and update DB status."""
    try:
        chunks = await index_document(
            content=content,
            content_type=content_type,
            filename=filename,
            organization_id=organization_id,
            document_id=document_id,
            collection=COLLECTION,
        )
        status = "indexed" if chunks > 0 else "index_empty"
        async with async_session() as db:
            from sqlalchemy import select
            result = await db.execute(
                select(UploadedDocument).where(UploadedDocument.id == db_doc_id)
            )
            doc = result.scalar_one_or_none()
            if doc:
                doc.chunks_indexed = chunks
                doc.collection_name = COLLECTION
                doc.status = status
                await db.commit()
    except Exception as e:
        logger.error(f"Background indexing failed for {filename}: {e}")
        try:
            async with async_session() as db:
                from sqlalchemy import select
                result = await db.execute(
                    select(UploadedDocument).where(UploadedDocument.id == db_doc_id)
                )
                doc = result.scalar_one_or_none()
                if doc:
                    doc.status = "index_error"
                    doc.index_error = str(e)[:500]
                    await db.commit()
        except Exception:
            pass


@router.post("/")
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate content type
    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Tipo de arquivo não suportado: {file.content_type}. "
                   f"Use PDF, DOCX, DOC, TXT, HTML ou RTF.",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    content = await file.read()

    # Validate file size
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande: {len(content) / 1024 / 1024:.1f}MB. "
                   f"Máximo permitido: {MAX_UPLOAD_BYTES // 1024 // 1024}MB.",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    file_path = UPLOAD_DIR / f"{uuid.uuid4().hex}_{file.filename}"
    file_path.write_bytes(content)

    doc = UploadedDocument(
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=len(content),
        organization_id=user.organization_id,
        uploaded_by=user.id,
        status="indexing",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Index in background (non-blocking)
    asyncio.create_task(
        _index_in_background(
            content=content,
            content_type=file.content_type or "",
            filename=file.filename or "unknown",
            organization_id=str(user.organization_id),
            document_id=str(doc.id),
            db_doc_id=doc.id,
        )
    )

    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "size_bytes": doc.size_bytes,
        "status": doc.status,
    }


@router.get("/")
async def list_uploads(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    result = await db.execute(
        select(UploadedDocument)
        .where(UploadedDocument.organization_id == user.organization_id)
        .order_by(UploadedDocument.created_at.desc())
        .limit(50)
    )
    docs = result.scalars().all()
    return {
        "items": [
            {
                "id": str(d.id),
                "filename": d.filename,
                "size_bytes": d.size_bytes,
                "chunks_indexed": d.chunks_indexed,
                "collection_name": d.collection_name,
                "status": d.status,
                "created_at": d.created_at.isoformat() if d.created_at else "",
            }
            for d in docs
        ],
        "total": len(docs),
    }
