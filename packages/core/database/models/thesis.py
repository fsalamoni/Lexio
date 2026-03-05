"""Lexio Core — Thesis model for the Thesis Bank."""

import uuid
from datetime import datetime

from sqlalchemy import String, Text, Integer, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

from packages.core.database.base import Base, OrgScopedMixin


class Thesis(Base, OrgScopedMixin):
    """A legal thesis extracted from generated documents or manually created."""

    __tablename__ = "theses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )

    # Content
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)

    # Classification
    legal_area_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    document_type_id: Mapped[str | None] = mapped_column(String(100), index=True)
    tags: Mapped[list | None] = mapped_column(ARRAY(String))
    category: Mapped[str | None] = mapped_column(String(100))

    # Legal basis
    legal_basis: Mapped[list | None] = mapped_column(JSONB)  # [{law, article, description}]
    precedents: Mapped[list | None] = mapped_column(JSONB)  # [{court, case_number, summary}]

    # Metrics
    quality_score: Mapped[float | None] = mapped_column(Float)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    success_rate: Mapped[float | None] = mapped_column(Float)

    # Source
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id"),
    )
    source_type: Mapped[str] = mapped_column(
        String(50), default="auto_extracted",
    )  # auto_extracted, manual, imported

    # Author
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"),
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50), default="active", index=True,
    )  # active, archived, draft

    # Metadata
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )
