"""Lexio Core — Platform settings model (admin-managed key-value store)."""

from datetime import datetime

from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from packages.core.database.base import Base


class PlatformSetting(Base):
    """Global key-value store for admin-managed platform settings (API keys, etc.).

    These settings are loaded at startup and override environment variables.
    They are global (not org-scoped) since they configure platform-level integrations.
    """

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )
