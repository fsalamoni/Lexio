"""Lexio API — File upload and indexing routes."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth.dependencies import get_current_user, get_db
from packages.core.database.models.user import User
from packages.core.database.models.uploaded_document import UploadedDocument
from packages.core.embedding import generate_embedding

router = APIRouter()

UPLOAD_DIR = Path("/app/uploads") if Path("/app").exists() else Path("uploads")


@router.post("/")
async def upload_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    file_path = UPLOAD_DIR / f"{uuid.uuid4().hex}_{file.filename}"
    file_path.write_bytes(content)

    doc = UploadedDocument(
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=len(content),
        organization_id=user.organization_id,
        uploaded_by=user.id,
        status="uploaded",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {
        "id": str(doc.id),
        "filename": doc.filename,
        "size_bytes": doc.size_bytes,
        "status": doc.status,
    }
