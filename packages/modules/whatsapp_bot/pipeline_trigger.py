"""Lexio WhatsApp Bot — Pipeline trigger.

Listens to WHATSAPP_DOCUMENT_REQUESTED events and starts the document
generation pipeline. When complete, delivers the DOCX via WhatsApp.
"""

import asyncio
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.database.engine import async_session
from packages.core.database.models.document import Document
from packages.core.database.models.whatsapp_session import WhatsAppSession
from packages.core.database.models.organization import Organization
from packages.core.module_loader import module_registry
from packages.core.whatsapp import whatsapp_client
from packages.core.events import event_bus, EventType
from packages.pipeline.orchestrator import PipelineOrchestrator

logger = logging.getLogger("lexio.whatsapp_bot.trigger")


async def trigger_pipeline(
    phone: str,
    org_id: str,
    session_id: str,
    doc_type: str,
    content: str,
    legal_area_ids: list[str] | None = None,
) -> None:
    """Create a document and run the pipeline, then deliver via WhatsApp."""
    legal_areas = legal_area_ids or []

    async with async_session() as db:
        # Validate doc type
        doc_type_info = module_registry.get(doc_type)
        if not doc_type_info or not doc_type_info.instance:
            await whatsapp_client.send_text(
                phone,
                "❌ Tipo de documento não disponível no momento. Tente novamente mais tarde.\n\n"
                "Envie *menu* para recomeçar.",
            )
            await _set_session_state(db, session_id, "error")
            return

        org_uuid = uuid.UUID(org_id)

        # Create document record with origem=whatsapp
        doc = Document(
            document_type_id=doc_type,
            legal_area_ids=legal_areas,
            original_request=content,
            organization_id=org_uuid,
            status="processando",
            origem="whatsapp",
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

        # Link session to document
        await _link_session_document(db, session_id, doc.id)

        # Get pipeline config
        pipeline_config = doc_type_info.instance.get_pipeline_config(None)

    # Run pipeline outside the session context
    orchestrator = PipelineOrchestrator(str(doc.id), pipeline_config)

    try:
        await orchestrator.run()
    except Exception as e:
        logger.error(f"Pipeline failed for WhatsApp doc {doc.id}: {e}")
        await whatsapp_client.send_text(
            phone,
            "❌ Houve um erro ao gerar o documento. Por favor, tente novamente.\n\n"
            "Envie *menu* para recomeçar.",
        )
        async with async_session() as db:
            await _set_session_state(db, session_id, "error")
        return

    # Reload doc to get final status and docx_path
    async with async_session() as db:
        result = await db.execute(select(Document).where(Document.id == doc.id))
        final_doc = result.scalar_one_or_none()

        if not final_doc or final_doc.status != "concluido":
            await whatsapp_client.send_text(
                phone,
                "⚠️ O documento foi gerado mas houve um problema na finalização. "
                "Acesse o Lexio pelo navegador para visualizá-lo.\n\n"
                "Envie *menu* para recomeçar.",
            )
            await _set_session_state(db, session_id, "error")
            return

        # Send DOCX if available
        if final_doc.docx_path:
            score = final_doc.quality_score or 0
            caption = (
                f"✅ Documento gerado com sucesso!\n"
                f"📊 Score de qualidade: {score}/100\n"
                f"📁 Tipo: {doc_type.replace('_', ' ').title()}"
            )
            sent = await whatsapp_client.send_file(phone, final_doc.docx_path, caption)
            if sent:
                await whatsapp_client.send_text(
                    phone,
                    "Seu documento foi entregue! 🎉\n\n"
                    "Envie *menu* para gerar outro documento.",
                )
                await event_bus.emit(EventType.WHATSAPP_DOCUMENT_DELIVERED, {
                    "phone": phone,
                    "doc_id": str(doc.id),
                    "score": score,
                })
            else:
                await whatsapp_client.send_text(
                    phone,
                    "✅ Documento gerado! Não foi possível enviar o arquivo por aqui, "
                    "mas ele está disponível no Lexio (acesse pelo navegador).\n\n"
                    "Envie *menu* para recomeçar.",
                )
        else:
            # No DOCX — send text content if available
            if final_doc.texto_completo:
                preview = final_doc.texto_completo[:1000] + "..."
                await whatsapp_client.send_text(
                    phone,
                    f"✅ Documento gerado! Aqui está o início:\n\n{preview}\n\n"
                    "_O documento completo está disponível no Lexio._",
                )
            else:
                await whatsapp_client.send_text(
                    phone,
                    "✅ Documento gerado! Acesse o Lexio pelo navegador para visualizá-lo.\n\n"
                    "Envie *menu* para gerar outro documento.",
                )

        await _set_session_state(db, session_id, "complete")


async def _set_session_state(db: AsyncSession, session_id: str, state: str) -> None:
    result = await db.execute(
        select(WhatsAppSession).where(WhatsAppSession.id == uuid.UUID(session_id))
    )
    session = result.scalar_one_or_none()
    if session:
        session.state = state
        await db.commit()


async def _link_session_document(db: AsyncSession, session_id: str, doc_id: uuid.UUID) -> None:
    result = await db.execute(
        select(WhatsAppSession).where(WhatsAppSession.id == uuid.UUID(session_id))
    )
    session = result.scalar_one_or_none()
    if session:
        session.document_id = doc_id
        await db.commit()
