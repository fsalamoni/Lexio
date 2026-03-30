"""Lexio WhatsApp Bot Module — Integração com WhatsApp via Evolution API."""

import asyncio
import logging

from packages.core.events import event_bus, EventType
from packages.modules.whatsapp_bot.pipeline_trigger import trigger_pipeline

logger = logging.getLogger("lexio.whatsapp_bot")

MODULE_CLASS = "WhatsAppBotModule"


class WhatsAppBotModule:
    """Module that wires up the WhatsApp bot event listener."""

    def __init__(self):
        self._registered = False

    def get_id(self) -> str:
        return "whatsapp_bot"

    def get_name(self) -> str:
        return "WhatsApp Bot"

    async def initialize(self) -> None:
        """Register event listeners on startup."""
        if self._registered:
            return

        # Fix: use subscribe() (not on()), and handler accepts (event_type, data)
        event_bus.subscribe(EventType.WHATSAPP_DOCUMENT_REQUESTED, self._on_document_requested)
        self._registered = True
        logger.info("WhatsApp Bot module initialized — listening for document requests")

    async def _on_document_requested(self, event_type: str, data: dict) -> None:
        """Handle WHATSAPP_DOCUMENT_REQUESTED event by launching pipeline in background."""
        phone = data.get("phone", "")
        org_id = data.get("org_id", "")
        session_id = data.get("session_id", "")
        doc_type = data.get("doc_type", "")
        content = data.get("content", "")

        if not all([phone, org_id, session_id, doc_type, content]):
            logger.error(f"WHATSAPP_DOCUMENT_REQUESTED missing fields: {data}")
            return

        asyncio.create_task(
            trigger_pipeline(phone, org_id, session_id, doc_type, content)
        )

    async def health_check(self) -> dict:
        from packages.core.config import settings
        return {
            "status": "healthy",
            "whatsapp_enabled": settings.whatsapp_enabled,
            "evolution_instance": settings.evolution_instance,
            "listening": self._registered,
        }


def create_module() -> WhatsAppBotModule:
    return WhatsAppBotModule()
