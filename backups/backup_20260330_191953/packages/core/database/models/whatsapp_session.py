"""Lexio Core — WhatsApp conversation session model."""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from packages.core.database.base import Base, OrgScopedMixin


class WhatsAppSession(Base, OrgScopedMixin):
    """Tracks the state of a WhatsApp bot conversation for a given phone number."""

    __tablename__ = "whatsapp_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )

    # WhatsApp identity
    phone: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(200))

    # Conversation state machine
    state: Mapped[str] = mapped_column(String(50), default="welcome", nullable=False)
    # States: welcome | awaiting_doc_type | awaiting_content | processing | complete | error

    # Collected data during conversation
    selected_doc_type: Mapped[str | None] = mapped_column(String(100))
    selected_legal_area: Mapped[str | None] = mapped_column(String(100))
    collected_content: Mapped[str | None] = mapped_column(Text)

    # Link to generated document (if any)
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id"),
        nullable=True,
    )

    # Extra context stored between turns
    context: Mapped[dict | None] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )

    # Relationships
    organization = relationship("Organization")
    document = relationship("Document", foreign_keys=[document_id])
