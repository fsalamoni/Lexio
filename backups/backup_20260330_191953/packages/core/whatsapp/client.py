"""Lexio Core — Evolution API client for WhatsApp messaging."""

import logging
import aiohttp
from pathlib import Path

from packages.core.config import settings

logger = logging.getLogger("lexio.whatsapp")


class WhatsAppClient:
    """Thin async wrapper over the Evolution API REST interface."""

    def __init__(self):
        self.base_url = settings.evolution_api_url.rstrip("/")
        self.api_key = settings.evolution_api_key
        self.instance = settings.evolution_instance

    @property
    def _headers(self) -> dict:
        return {
            "apikey": self.api_key,
            "Content-Type": "application/json",
        }

    async def send_text(self, phone: str, text: str) -> bool:
        """Send a plain text message to a WhatsApp number."""
        if not settings.whatsapp_enabled:
            logger.debug(f"WhatsApp disabled — skipping send_text to {phone}")
            return False

        url = f"{self.base_url}/message/sendText/{self.instance}"
        payload = {
            "number": self._normalize_phone(phone),
            "text": text,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=self._headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status in (200, 201):
                        return True
                    body = await resp.text()
                    logger.error(f"Evolution API error {resp.status}: {body}")
                    return False
        except Exception as e:
            logger.error(f"WhatsApp send_text failed: {e}")
            return False

    async def send_file(self, phone: str, file_path: str, caption: str = "") -> bool:
        """Send a file (DOCX/PDF) to a WhatsApp number."""
        if not settings.whatsapp_enabled:
            logger.debug(f"WhatsApp disabled — skipping send_file to {phone}")
            return False

        path = Path(file_path)
        if not path.exists():
            logger.error(f"File not found: {file_path}")
            return False

        url = f"{self.base_url}/message/sendMedia/{self.instance}"
        media_type = "document"

        payload = {
            "number": self._normalize_phone(phone),
            "mediatype": media_type,
            "media": str(path.absolute()),
            "caption": caption,
            "fileName": path.name,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=self._headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status in (200, 201):
                        return True
                    body = await resp.text()
                    logger.error(f"Evolution API send_file error {resp.status}: {body}")
                    return False
        except Exception as e:
            logger.error(f"WhatsApp send_file failed: {e}")
            return False

    async def send_buttons(self, phone: str, text: str, buttons: list[dict]) -> bool:
        """Send a message with quick-reply buttons."""
        if not settings.whatsapp_enabled:
            logger.debug(f"WhatsApp disabled — skipping send_buttons to {phone}")
            return False

        url = f"{self.base_url}/message/sendButtons/{self.instance}"
        payload = {
            "number": self._normalize_phone(phone),
            "title": "Lexio",
            "description": text,
            "footer": "Lexio — Produção Jurídica com IA",
            "buttons": buttons,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=self._headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status in (200, 201):
                        return True
                    # Fallback to plain text if buttons not supported
                    btn_text = "\n".join(f"{i+1}. {b.get('displayText', b)}" for i, b in enumerate(buttons))
                    return await self.send_text(phone, f"{text}\n\n{btn_text}")
        except Exception as e:
            logger.error(f"WhatsApp send_buttons failed: {e}")
            return False

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        """Normalize phone number to E.164 format (digits only + @s.whatsapp.net)."""
        digits = "".join(c for c in phone if c.isdigit())
        if "@" in phone:
            return phone
        if not digits.startswith("55"):
            digits = "55" + digits
        return f"{digits}@s.whatsapp.net"


# Singleton instance
whatsapp_client = WhatsAppClient()
