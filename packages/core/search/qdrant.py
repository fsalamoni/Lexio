"""Lexio Core — Qdrant vector search with multi-tenant collection support."""

import logging

import httpx

from packages.core.config import settings

logger = logging.getLogger("lexio.search.qdrant")


async def search_qdrant(
    vector: list[float],
    collection: str | None = None,
    top_k: int = 10,
    score_threshold: float = 0.35,
) -> str:
    """Search Qdrant for similar fragments. Collection defaults to settings.qdrant_collection."""
    collection = collection or settings.qdrant_collection

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{settings.qdrant_url}/collections/{collection}/points/search",
                headers={"api-key": settings.qdrant_api_key},
                json={
                    "vector": vector,
                    "top": top_k,
                    "score_threshold": score_threshold,
                    "with_payload": True,
                },
            )
            if resp.status_code == 404:
                logger.warning(f"Collection '{collection}' not found in Qdrant")
                return ""
            resp.raise_for_status()
            data = resp.json()

        results = data.get("result", [])
        if not results:
            return ""

        parts = []
        for r in results:
            payload = r.get("payload", {})
            score = r.get("score", 0)
            text = payload.get("text", "")
            source = payload.get("source", "desconhecido")
            parts.append(f"[Fonte: {source}] (score: {score:.2f})\n{text}\n")

        logger.info(f"Qdrant: {len(results)} fragments from '{collection}'")
        return "\n---\n".join(parts)

    except Exception as e:
        logger.error(f"Qdrant search error: {e}")
        return ""
