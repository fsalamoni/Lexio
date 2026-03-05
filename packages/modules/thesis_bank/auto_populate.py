"""Lexio Thesis Bank — Auto-populate theses from completed documents.

After each document is generated, this module analyzes the content and
extracts reusable legal theses into the bank.
"""

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.llm.client import call_llm
from packages.modules.thesis_bank.service import create_thesis

logger = logging.getLogger("lexio.thesis_bank.auto_populate")


async def extract_theses_from_document(
    db: AsyncSession,
    organization_id: uuid.UUID,
    document_id: uuid.UUID,
    document_text: str,
    document_type_id: str,
    legal_area_ids: list[str],
    author_id: uuid.UUID | None = None,
    model: str | None = None,
) -> list[dict[str, Any]]:
    """Extract legal theses from a completed document.

    Uses LLM to identify reusable legal theses, arguments, and
    positions that can be stored in the thesis bank for future use.

    Returns list of created thesis dicts.
    """
    if not document_text or len(document_text) < 500:
        logger.info(f"Document {document_id} too short for thesis extraction")
        return []

    # Truncate very long documents
    text_for_analysis = document_text[:8000]
    primary_area = legal_area_ids[0] if legal_area_ids else "geral"

    try:
        result = await call_llm(
            system=(
                "Você é um analista jurídico especializado em identificar teses reaproveitáveis.\n"
                "Analise o documento jurídico e extraia TESES JURÍDICAS independentes e reutilizáveis.\n\n"
                "Para cada tese, forneça:\n"
                "- title: Título curto e descritivo (máx 100 caracteres)\n"
                "- content: O argumento jurídico completo e autossuficiente\n"
                "- summary: Resumo em 1-2 frases\n"
                "- category: Categoria (ex: 'constitucional', 'processual', 'material', 'probatório')\n"
                "- legal_basis: Lista de fundamentos legais [{\"law\": \"...\", \"article\": \"...\"}]\n"
                "- precedents: Lista de precedentes citados [{\"court\": \"...\", \"case_number\": \"...\"}]\n"
                "- tags: Lista de palavras-chave\n"
                "- quality_score: Nota de 0 a 100 para qualidade da tese\n\n"
                "Retorne APENAS um JSON array com as teses encontradas.\n"
                "Extraia entre 2 e 5 teses mais relevantes e reutilizáveis.\n"
                "Ignore argumentos muito específicos ao caso concreto."
            ),
            user=f"Documento ({document_type_id}):\n\n{text_for_analysis}",
            model=model or "anthropic/claude-3.5-haiku",
            max_tokens=3000,
            temperature=0.2,
        )

        # Parse JSON response
        import json
        content = result["content"].strip()

        # Extract JSON from markdown blocks if needed
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        extracted = json.loads(content)
        if not isinstance(extracted, list):
            extracted = [extracted]

        created_theses = []
        for thesis_data in extracted:
            if not thesis_data.get("title") or not thesis_data.get("content"):
                continue

            thesis_data["legal_area_id"] = primary_area
            thesis_data["document_type_id"] = document_type_id
            thesis_data["source_document_id"] = document_id
            thesis_data["source_type"] = "auto_extracted"

            thesis = await create_thesis(
                db=db,
                organization_id=organization_id,
                data=thesis_data,
                author_id=author_id,
            )
            created_theses.append({
                "id": str(thesis.id),
                "title": thesis.title,
            })

        await db.commit()
        logger.info(
            f"Extracted {len(created_theses)} theses from document {document_id}"
        )
        return created_theses

    except Exception as e:
        logger.warning(f"Failed to extract theses from document {document_id}: {e}")
        return []
