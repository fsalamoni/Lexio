"""Lexio API — Webhook routes (WhatsApp, etc.)."""

import logging

from fastapi import APIRouter, Request

router = APIRouter()
logger = logging.getLogger("lexio.webhooks")


@router.post("/evolution")
async def evolution_webhook(request: Request):
    """Handle Evolution API (WhatsApp) webhooks."""
    try:
        body = await request.json()
        event = body.get("event", "unknown")
        logger.info(f"Webhook received: {event}")

        # TODO: Process incoming WhatsApp messages (Phase 4)
        return {"status": "received", "event": event}

    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "detail": str(e)}
