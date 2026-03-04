"""Lexio Core — DocumentType model (registry of available document types)."""

import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB

from packages.core.database.base import Base


class DocumentType(Base):
    __tablename__ = "document_types"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)  # e.g. "parecer"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(100), default="general")  # mp, judiciary, advocacy
    module_path: Mapped[str] = mapped_column(String(300), nullable=False)
    pipeline_config: Mapped[dict | None] = mapped_column(JSONB)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
