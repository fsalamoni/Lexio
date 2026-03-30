"""Lexio Thesis Bank — Auto-populate theses from completed documents.

After each document is generated, this module analyzes the content and
extracts reusable legal theses into the bank.

**Dedup rule**: If a thesis with a similar title already exists for the
organisation, the two are merged into a single, more complete thesis
instead of creating a duplicate.
"""

import json
import logging
import unicodedata
import re
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.llm.client import call_llm
from packages.modules.thesis_bank.service import create_thesis, list_theses, update_thesis

logger = logging.getLogger("lexio.thesis_bank.auto_populate")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _normalise_title(title: str) -> str:
    """Lowercase, strip diacritics and punctuation for comparison."""
    text = unicodedata.normalize("NFD", title.lower())
    text = re.sub(r"[\u0300-\u036f]", "", text)   # strip accents
    text = re.sub(r"[^a-z0-9\s]", "", text)        # strip punctuation
    return re.sub(r"\s+", " ", text).strip()


def _titles_are_similar(a: str, b: str) -> bool:
    """Check whether two normalised titles are similar enough to be duplicates."""
    if a == b:
        return True
    if a in b or b in a:
        return True
    # Jaccard similarity on word sets >= 0.6
    set_a = set(a.split())
    set_b = set(b.split())
    if not set_a or not set_b:
        return False
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return union > 0 and intersection / union >= 0.6


def _merge_tags(a: list | None, b: list | None) -> list[str]:
    """Union two tag lists, deduplicating (case-insensitive)."""
    seen: set[str] = set()
    result: list[str] = []
    for tag in (a or []) + (b or []):
        key = str(tag).lower()
        if key not in seen:
            seen.add(key)
            result.append(str(tag))
    return result


def _parse_json_from_llm(content: str) -> list:
    content = content.strip()
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        content = content.split("```")[1].split("```")[0].strip()
    parsed = json.loads(content)
    return parsed if isinstance(parsed, list) else [parsed]


# ── Merge via LLM ────────────────────────────────────────────────────────────

async def _merge_theses_via_llm(
    existing_title: str,
    existing_content: str,
    existing_summary: str | None,
    new_title: str,
    new_content: str,
    new_summary: str | None,
    model: str | None = None,
) -> dict[str, str]:
    """Merge two thesis versions into one via LLM."""
    result = await call_llm(
        system=(
            "Você é um analista jurídico. Recebe duas versões de uma mesma tese jurídica.\n"
            "Compile as duas versões em uma ÚNICA tese mais completa e robusta.\n\n"
            "Regras:\n"
            "- Mantenha TODOS os argumentos, fundamentações legais e jurisprudência de ambas versões\n"
            "- Elimine redundâncias (não repita o mesmo argumento duas vezes)\n"
            "- O resultado deve ser um texto coeso e bem estruturado\n"
            "- Mantenha o estilo formal jurídico\n\n"
            "Retorne APENAS um JSON com:\n"
            '- title: Título mais descritivo (máx 100 caracteres)\n'
            '- content: O argumento jurídico compilado e completo\n'
            '- summary: Resumo em 1-2 frases da tese compilada'
        ),
        user=(
            f"VERSÃO EXISTENTE:\nTítulo: {existing_title}\nConteúdo: {existing_content}\n"
            f"{f'Resumo: {existing_summary}' if existing_summary else ''}\n\n"
            f"NOVA VERSÃO:\nTítulo: {new_title}\nConteúdo: {new_content}\n"
            f"{f'Resumo: {new_summary}' if new_summary else ''}\n\n"
            "Compile as duas versões em uma ÚNICA tese. Retorne JSON com title, content e summary."
        ),
        model=model or "anthropic/claude-3.5-haiku",
        max_tokens=2000,
        temperature=0.1,
    )

    content_str = result["content"].strip()
    if "```json" in content_str:
        content_str = content_str.split("```json")[1].split("```")[0].strip()
    elif "```" in content_str:
        content_str = content_str.split("```")[1].split("```")[0].strip()

    parsed = json.loads(content_str)
    return {
        "title": parsed.get("title", existing_title),
        "content": parsed.get("content", existing_content),
        "summary": parsed.get("summary", existing_summary or ""),
    }


# ── Main extraction ──────────────────────────────────────────────────────────

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

    **Dedup**: If a similar thesis (by normalised title) already exists
    for the organisation, the two are merged via LLM into a single,
    more complete thesis.

    Returns list of created/updated thesis dicts.
    """
    if not document_text or len(document_text) < 500:
        logger.info(f"Document {document_id} too short for thesis extraction")
        return []

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
                '- legal_basis: Lista de fundamentos legais [{"law": "...", "article": "..."}]\n'
                '- precedents: Lista de precedentes citados [{"court": "...", "case_number": "..."}]\n'
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

        extracted = _parse_json_from_llm(result["content"])

        # Load existing theses for dedup (up to 200)
        existing_theses, _ = await list_theses(
            db, organization_id, status="active", limit=200,
        )
        title_index = [
            {"thesis": t, "normalised": _normalise_title(t.title)}
            for t in existing_theses
        ]

        output_theses: list[dict[str, Any]] = []
        for thesis_data in extracted:
            if not thesis_data.get("title") or not thesis_data.get("content"):
                continue

            new_norm = _normalise_title(thesis_data["title"])

            # Find similar existing thesis
            match = None
            for entry in title_index:
                if _titles_are_similar(entry["normalised"], new_norm):
                    match = entry["thesis"]
                    break

            if match:
                # Merge via LLM
                try:
                    merged = await _merge_theses_via_llm(
                        existing_title=match.title,
                        existing_content=match.content,
                        existing_summary=match.summary,
                        new_title=thesis_data["title"],
                        new_content=thesis_data["content"],
                        new_summary=thesis_data.get("summary"),
                        model=model,
                    )
                    update_data: dict[str, Any] = {
                        "title": merged["title"],
                        "content": merged["content"],
                        "summary": merged["summary"],
                        "tags": _merge_tags(
                            match.tags, thesis_data.get("tags", [])
                        ),
                        "quality_score": max(
                            match.quality_score or 0,
                            thesis_data.get("quality_score", 0) or 0,
                        ),
                    }
                    if thesis_data.get("legal_basis"):
                        update_data["legal_basis"] = list(
                            {json.dumps(b, sort_keys=True): b for b in (match.legal_basis or []) + thesis_data["legal_basis"]}.values()
                        )
                    if thesis_data.get("precedents"):
                        update_data["precedents"] = list(
                            {json.dumps(p, sort_keys=True): p for p in (match.precedents or []) + thesis_data["precedents"]}.values()
                        )

                    await update_thesis(db, match.id, organization_id, update_data)
                    output_theses.append({
                        "id": str(match.id),
                        "title": merged["title"],
                        "action": "merged",
                    })
                    logger.info(f"Merged thesis '{thesis_data['title']}' into existing '{match.title}'")
                except Exception as e:
                    logger.warning(f"Thesis merge failed, skipping duplicate: {e}")
            else:
                # Create new
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
                output_theses.append({
                    "id": str(thesis.id),
                    "title": thesis.title,
                    "action": "created",
                })
                # Add to index so subsequent theses in this batch also dedup
                title_index.append({
                    "thesis": thesis,
                    "normalised": new_norm,
                })

        await db.commit()

        created = sum(1 for t in output_theses if t["action"] == "created")
        merged = sum(1 for t in output_theses if t["action"] == "merged")
        logger.info(
            f"Thesis extraction from document {document_id}: "
            f"{created} created, {merged} merged"
        )
        return output_theses

    except Exception as e:
        logger.warning(f"Failed to extract theses from document {document_id}: {e}")
        return []
