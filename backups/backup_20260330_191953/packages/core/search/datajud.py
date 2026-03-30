"""Lexio Core — DataJud (CNJ) judicial process search."""

import logging

import httpx

from packages.core.config import settings

logger = logging.getLogger("lexio.search.datajud")

# Public CNJ API key — updated periodically at https://datajud-wiki.cnj.jus.br/api-publica/
_FALLBACK_PUBLIC_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="


async def _try_search(api_key: str, url: str, tema: str, size: int) -> httpx.Response | None:
    """Attempt a single DataJud search request."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"APIKey {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "query": {"match": {"assunto.nome": tema}},
                    "size": size,
                    "sort": [{"dataAjuizamento": {"order": "desc"}}],
                },
            )
            return resp
    except Exception as e:
        logger.error(f"DataJud request error: {e}")
        return None


async def search_datajud(tema: str, size: int = 5) -> str:
    """Search DataJud for judicial processes related to the topic.

    Features:
    - Auto-fallback to public key if configured key returns 401/403
    - Searches primary tribunal endpoint (configurable via datajud_url)
    """
    api_key = settings.datajud_api_key
    if not api_key:
        api_key = _FALLBACK_PUBLIC_KEY
        logger.info("DataJud: using fallback public key")

    url = settings.datajud_url

    # Try with configured key
    resp = await _try_search(api_key, url, tema, size)

    # Auto-fallback: if auth fails and configured key differs from fallback, try fallback
    if resp and resp.status_code in (401, 403) and api_key != _FALLBACK_PUBLIC_KEY:
        logger.warning(
            f"DataJud: configured key returned {resp.status_code}, trying fallback public key"
        )
        api_key = _FALLBACK_PUBLIC_KEY
        resp = await _try_search(api_key, url, tema, size)

    if not resp or resp.status_code != 200:
        status = resp.status_code if resp else "no response"
        logger.warning(f"DataJud returned {status} for tema='{tema[:50]}'")
        return ""

    data = resp.json()
    hits = data.get("hits", {}).get("hits", [])
    if not hits:
        logger.info(f"DataJud: no results for tema='{tema[:50]}'")
        return ""

    parts = []
    for h in hits:
        src = h.get("_source", {})
        numero = src.get("numeroProcesso", "?")
        classe = src.get("classe", {}).get("nome", "?")
        orgao = src.get("orgaoJulgador", {}).get("nome", "?")
        data_aj = src.get("dataAjuizamento", "")
        assuntos = [a.get("nome", "") for a in src.get("assunto", []) if a.get("nome")]
        assunto_str = ", ".join(assuntos[:3]) if assuntos else ""

        entry = f"Processo {numero} — {classe} — {orgao}"
        if data_aj:
            entry += f" — Data: {data_aj[:10]}"
        if assunto_str:
            entry += f" — Assuntos: {assunto_str}"
        parts.append(entry)

    logger.info(f"DataJud: {len(hits)} processes found for tema='{tema[:50]}'")
    return "\n".join(parts)
