"""Lexio Core — User Profile model for anamnesis (Layer 1).

Stores professional profile and document generation preferences.
This is the persistent layer of the anamnesis system — set once during
onboarding, refined over time.
"""

import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from packages.core.database.base import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # ── Layer 1: Professional Profile ──
    institution: Mapped[str | None] = mapped_column(String(300))
    position: Mapped[str | None] = mapped_column(String(200))  # e.g. "Promotor de Justiça"
    jurisdiction: Mapped[str | None] = mapped_column(String(200))  # e.g. "Comarca de Porto Alegre"
    experience_years: Mapped[int | None] = mapped_column()
    primary_areas: Mapped[list | None] = mapped_column(JSON)  # ["administrative", "constitutional"]
    specializations: Mapped[list | None] = mapped_column(JSON)  # ["licitacoes", "improbidade"]

    # ── Writing Preferences ──
    formality_level: Mapped[str | None] = mapped_column(String(50))  # formal, semiformal
    connective_style: Mapped[str | None] = mapped_column(String(50))  # classico, moderno
    citation_style: Mapped[str | None] = mapped_column(String(50))  # abnt, inline, footnote
    preferred_expressions: Mapped[list | None] = mapped_column(JSON)  # fav expressions
    avoided_expressions: Mapped[list | None] = mapped_column(JSON)  # expressions to avoid
    paragraph_length: Mapped[str | None] = mapped_column(String(50))  # curto, medio, longo

    # ── Document Preferences ──
    default_document_type: Mapped[str | None] = mapped_column(String(100))
    default_template: Mapped[str | None] = mapped_column(String(100))
    signature_block: Mapped[str | None] = mapped_column(Text)  # custom signature text
    header_text: Mapped[str | None] = mapped_column(Text)

    # ── AI Preferences ──
    preferred_model: Mapped[str | None] = mapped_column(String(200))
    detail_level: Mapped[str | None] = mapped_column(String(50))  # conciso, detalhado, exaustivo
    argument_depth: Mapped[str | None] = mapped_column(String(50))  # superficial, moderado, profundo
    include_opposing_view: Mapped[bool | None] = mapped_column(default=True)

    # ── Metadata ──
    onboarding_completed: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )

    # Relationships
    user = relationship("User", backref="profile", uselist=False)
