"""Lexio API — Webhook routes (WhatsApp via Evolution API)."""

import logging
import uuid

from fastapi import APIRouter, Request, HTTPException
from sqlalchemy import select

from packages.core.database.engine import async_session
from packages.core.database.models.organization import Organization
from packages.core.config import settings
from packages.modules.whatsapp_bot.conversation import ConversationHandler

router = APIRouter()
logger = logging.getLogger("lexio.webhooks")


def _extract_message(body: dict) -> tuple[str, str, str]:
    """Extract (phone, text, contact_name) from an Evolution API webhook payload.

    Returns empty strings on failure — caller should skip silently.
    """
    try:
        data = body.get("data", {})
        key = data.get("key", {})

        # Skip messages sent by the bot itself
        if key.get("fromMe", False):
            return "", "", ""

        phone = key.get("remoteJid", "")
        # Ignore group chats
        if "@g.us" in phone:
            return "", "", ""

        push_name = data.get("pushName", "")

        msg = data.get("message", {})
        text = (
            msg.get("conversation", "")
            or msg.get("extendedTextMessage", {}).get("text", "")
            or msg.get("buttonsResponseMessage", {}).get("selectedButtonId", "")
            or msg.get("buttonsResponseMessage", {}).get("selectedDisplayText", "")
            or msg.get("listResponseMessage", {}).get("singleSelectReply", {}).get("selectedRowId", "")
        )

        return phone, text.strip(), push_name
    except Exception as e:
        logger.warning(f"Failed to parse Evolution payload: {e}")
        return "", "", ""


async def _get_default_org_id() -> uuid.UUID | None:
    """Return the default organization id."""
    async with async_session() as db:
        result = await db.execute(
            select(Organization).where(Organization.slug == settings.default_org_slug)
        )
        org = result.scalar_one_or_none()
        return org.id if org else None


@router.post("/evolution")
async def evolution_webhook(request: Request):
    """Handle Evolution API (WhatsApp) webhooks."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    event = body.get("event", "unknown")
    logger.info(f"Webhook received: {event}")

    # Only process incoming message events
    if event not in ("messages.upsert", "message"):
        return {"status": "ignored", "event": event}

    if not settings.whatsapp_enabled:
        logger.debug("WhatsApp disabled — webhook ignored")
        return {"status": "disabled"}

    phone, text, contact_name = _extract_message(body)
    if not phone or not text:
        return {"status": "skipped", "reason": "no_text_or_self"}

    org_id = await _get_default_org_id()
    if not org_id:
        logger.error("Default organization not found — cannot process WhatsApp message")
        return {"status": "error", "reason": "org_not_found"}

    try:
        async with async_session() as db:
            handler = ConversationHandler(db, org_id)
            await handler.handle(phone, text, contact_name)
    except Exception as e:
        logger.error(f"Conversation handler error: {e}")
        return {"status": "error", "detail": str(e)}

    return {"status": "processed", "phone": phone[:6] + "***"}
