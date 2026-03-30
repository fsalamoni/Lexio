"""Lexio Core — Embedding generation via Ollama."""

import logging

import httpx

from packages.core.config import settings

logger = logging.getLogger("lexio.embedding")


async def generate_embedding(text: str) -> list[float]:
    """Generate embedding vector via Ollama API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/embeddings",
            json={"model": settings.embed_model, "prompt": text[:8000]},
        )
        resp.raise_for_status()
        data = resp.json()
    vector = data.get("embedding", [])
    logger.debug(f"Embedding generated: dim={len(vector)} text_len={len(text)}")
    return vector
