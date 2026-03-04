"""Lexio Core — DataJud (CNJ) judicial process search."""

import logging

import httpx

from packages.core.config import settings

logger = logging.getLogger("lexio.search.datajud")


async def search_datajud(tema: str, size: int = 5) -> str:
    """Search DataJud for judicial processes related to the topic."""
    if not settings.datajud_api_key:
        return ""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                settings.datajud_url,
                headers={
                    "Authorization": f"APIKey {settings.datajud_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "query": {"match": {"assunto.nome": tema}},
                    "size": size,
                    "sort": [{"dataAjuizamento": {"order": "desc"}}],
                },
            )
            if resp.status_code != 200:
                logger.warning(f"DataJud returned {resp.status_code}")
                return ""
            data = resp.json()

        hits = data.get("hits", {}).get("hits", [])
        if not hits:
            return ""

        parts = []
        for h in hits:
            src = h.get("_source", {})
            numero = src.get("numeroProcesso", "?")
            classe = src.get("classe", {}).get("nome", "?")
            orgao = src.get("orgaoJulgador", {}).get("nome", "?")
            parts.append(f"Processo {numero} — {classe} — {orgao}")

        logger.info(f"DataJud: {len(hits)} processes found")
        return "\n".join(parts)

    except Exception as e:
        logger.error(f"DataJud search error: {e}")
        return ""
