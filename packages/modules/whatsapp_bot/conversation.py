"""Lexio WhatsApp Bot — Conversation state machine."""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.database.models.whatsapp_session import WhatsAppSession
from packages.core.database.models.organization import Organization
from packages.core.whatsapp import whatsapp_client
from packages.core.events import event_bus, EventType
from packages.core.config import settings

logger = logging.getLogger("lexio.whatsapp_bot")

# Mapping from user input (number or keyword) to doc_type id
DOC_TYPE_MAP = {
    "1": "parecer",
    "2": "peticao_inicial",
    "3": "contestacao",
    "4": "recurso",
    "5": "sentenca",
    "6": "acao_civil_publica",
    "parecer": "parecer",
    "petição": "peticao_inicial",
    "peticao": "peticao_inicial",
    "contestação": "contestacao",
    "contestacao": "contestacao",
    "recurso": "recurso",
    "sentença": "sentenca",
    "sentenca": "sentenca",
    "ação civil": "acao_civil_publica",
    "acao civil": "acao_civil_publica",
    "acp": "acao_civil_publica",
}

DOC_TYPE_LABELS = {
    "parecer": "Parecer Jurídico",
    "peticao_inicial": "Petição Inicial",
    "contestacao": "Contestação",
    "recurso": "Recurso",
    "sentenca": "Sentença",
    "acao_civil_publica": "Ação Civil Pública",
}

RESET_KEYWORDS = {"menu", "início", "inicio", "recomeçar", "recomecar", "reiniciar", "cancelar", "cancel"}


class ConversationHandler:
    """Handles the WhatsApp conversation state machine for document requests."""

    def __init__(self, db: AsyncSession, org_id: uuid.UUID):
        self.db = db
        self.org_id = org_id

    async def handle(self, phone: str, message: str, contact_name: str = "") -> None:
        """Process an incoming WhatsApp message and advance the conversation.

        Prefix logic:
        - If the user has NO active session (state == 'welcome'), the message MUST
          start with settings.whatsapp_prefix (default '/lexio') to be processed.
          This allows coexistence with other bots (e.g. a bot that uses '!').
        - Once a session is active, all messages are processed normally — the user
          is already in a guided conversation and should not need to re-type the prefix.
        """
        text = message.strip()
        prefix = settings.whatsapp_prefix.strip().lower()

        # Load or create session to check current state
        session = await self._get_or_create_session(phone, contact_name)

        # If no active session, require prefix to start
        if session.state == "welcome":
            text_lower = text.lower()
            if prefix and not text_lower.startswith(prefix):
                # Message is for another bot — silently ignore
                logger.debug(f"Ignored message without prefix '{prefix}' from {phone[:6]}***")
                return
            # Strip prefix from text before processing (e.g. "/lexio parecer" → "parecer")
            if prefix and text_lower.startswith(prefix):
                text = text[len(prefix):].strip()

        await event_bus.emit(EventType.WHATSAPP_MESSAGE_RECEIVED, {
            "phone": phone,
            "org_id": str(self.org_id),
            "message_preview": text[:100],
        })

        # Reset command — always works regardless of state
        if text.lower() in RESET_KEYWORDS:
            await self._reset_session(session)
            await self._send_welcome(phone, contact_name or session.contact_name or "")
            return

        # Route by current state
        state = session.state
        if state == "welcome":
            # If text remains after stripping prefix, treat it as the doc type choice
            await self._send_welcome(phone, contact_name or session.contact_name or "")
            await self._set_state(session, "awaiting_doc_type")
            if text:
                await self._handle_doc_type(session, phone, text)

        elif state == "awaiting_doc_type":
            await self._handle_doc_type(session, phone, text)

        elif state == "awaiting_content":
            await self._handle_content(session, phone, text)

        elif state == "processing":
            await whatsapp_client.send_text(
                phone,
                "⏳ Seu documento ainda está sendo gerado. Aguarde mais um momento...\n\n"
                "Envie *menu* para cancelar e voltar ao início.",
            )

        elif state == "complete":
            await whatsapp_client.send_text(
                phone,
                "✅ Seu documento anterior já foi entregue!\n\n"
                "Envie *menu* para gerar um novo documento.",
            )

        elif state == "error":
            await self._reset_session(session)
            await self._send_welcome(phone, contact_name or session.contact_name or "")

    # ── State handlers ──

    async def _send_welcome(self, phone: str, name: str) -> None:
        greeting = f"Olá, {name}! 👋" if name else "Olá! 👋"
        menu = (
            f"{greeting}\n\n"
            "Bem-vindo ao *Lexio* — produção jurídica com IA.\n\n"
            "Que tipo de documento você precisa?\n\n"
            "1️⃣ Parecer Jurídico\n"
            "2️⃣ Petição Inicial\n"
            "3️⃣ Contestação\n"
            "4️⃣ Recurso\n"
            "5️⃣ Sentença\n"
            "6️⃣ Ação Civil Pública\n\n"
            "Responda com o número ou o nome do documento."
        )
        await whatsapp_client.send_text(phone, menu)
        await event_bus.emit(EventType.WHATSAPP_SESSION_STARTED, {"phone": phone})

    async def _handle_doc_type(self, session: WhatsAppSession, phone: str, text: str) -> None:
        key = text.lower().strip()
        doc_type = DOC_TYPE_MAP.get(key)

        if not doc_type:
            await whatsapp_client.send_text(
                phone,
                "Não reconheci esse documento. Responda com um número de 1 a 6:\n\n"
                "1 - Parecer\n2 - Petição Inicial\n3 - Contestação\n"
                "4 - Recurso\n5 - Sentença\n6 - Ação Civil Pública",
            )
            return

        session.selected_doc_type = doc_type
        label = DOC_TYPE_LABELS[doc_type]

        await self._set_state(session, "awaiting_content")
        await whatsapp_client.send_text(
            phone,
            f"Ótimo! Vou gerar um *{label}* para você. 📄\n\n"
            "Agora me descreva o caso com detalhes:\n"
            "• Fatos relevantes\n"
            "• Fundamentos jurídicos desejados\n"
            "• Pedidos ou teses principais\n"
            "• Quaisquer referências normativas ou de jurisprudência\n\n"
            "_Quanto mais detalhes, melhor será o documento._",
        )

    async def _handle_content(self, session: WhatsAppSession, phone: str, text: str) -> None:
        if len(text) < 30:
            await whatsapp_client.send_text(
                phone,
                "Por favor, descreva o caso com mais detalhes para que eu possa gerar um documento de qualidade. "
                "Inclua fatos, fundamentos e pedidos.",
            )
            return

        session.collected_content = text
        await self._set_state(session, "processing")

        await whatsapp_client.send_text(
            phone,
            "✅ Recebi! Estou iniciando a geração do documento agora.\n\n"
            "⏳ Isso pode levar alguns minutos. Você receberá o arquivo assim que estiver pronto.\n\n"
            "_Envie *menu* a qualquer momento para cancelar._",
        )

        await event_bus.emit(EventType.WHATSAPP_DOCUMENT_REQUESTED, {
            "phone": phone,
            "org_id": str(self.org_id),
            "session_id": str(session.id),
            "doc_type": session.selected_doc_type,
            "content": text,
        })

    # ── Helpers ──

    async def _get_or_create_session(self, phone: str, contact_name: str) -> WhatsAppSession:
        result = await self.db.execute(
            select(WhatsAppSession).where(
                WhatsAppSession.phone == phone,
                WhatsAppSession.organization_id == self.org_id,
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            session = WhatsAppSession(
                phone=phone,
                contact_name=contact_name or None,
                organization_id=self.org_id,
                state="welcome",
            )
            self.db.add(session)
            await self.db.commit()
            await self.db.refresh(session)
        elif contact_name and not session.contact_name:
            session.contact_name = contact_name
            await self.db.commit()

        return session

    async def _set_state(self, session: WhatsAppSession, state: str) -> None:
        session.state = state
        session.updated_at = datetime.now(timezone.utc)
        await self.db.commit()

    async def _reset_session(self, session: WhatsAppSession) -> None:
        session.state = "welcome"
        session.selected_doc_type = None
        session.selected_legal_area = None
        session.collected_content = None
        session.document_id = None
        session.context = None
        session.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
