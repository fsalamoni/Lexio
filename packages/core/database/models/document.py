"""Lexio Core — Document model (generalized from OpenClaw Parecer)."""

import uuid
from datetime import datetime

from sqlalchemy import String, Text, Integer, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

from packages.core.database.base import Base, OrgScopedMixin


class Document(Base, OrgScopedMixin):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    # Type and area
    document_type_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    legal_area_ids: Mapped[list] = mapped_column(ARRAY(String), default=list)
    template_variant: Mapped[str | None] = mapped_column(String(100))

    # Content
    original_request: Mapped[str] = mapped_column(Text, nullable=False)
    tema: Mapped[str | None] = mapped_column(String(500))
    palavras_chave: Mapped[list | None] = mapped_column(JSONB)
    area_direito: Mapped[str | None] = mapped_column(String(200))
    texto_completo: Mapped[str | None] = mapped_column(Text)

    # Output
    docx_path: Mapped[str | None] = mapped_column(String(500))
    quality_score: Mapped[int | None] = mapped_column(Integer)
    quality_issues: Mapped[list | None] = mapped_column(JSONB)

    # Status
    status: Mapped[str] = mapped_column(String(50), default="processando", index=True)
    origem: Mapped[str] = mapped_column(String(50), default="web")

    # Metadata
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )

    # Author
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"),
    )

    # Relationships
    organization = relationship("Organization", back_populates="documents")
    author = relationship("User", back_populates="documents")
    executions = relationship("Execution", back_populates="document", lazy="selectin")
