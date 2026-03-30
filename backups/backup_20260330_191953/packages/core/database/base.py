"""Lexio Core — DeclarativeBase + OrgScopedMixin for multi-tenancy."""

import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID


class Base(DeclarativeBase):
    pass


class OrgScopedMixin:
    """Mixin that adds organization_id to any model for multi-tenant scoping."""

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )
