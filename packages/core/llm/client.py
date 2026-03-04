"""Lexio Core — LLM client via OpenRouter (evolved from OpenClaw llm_client.py)."""

import time
import logging

import httpx

from packages.core.config import settings
from packages.core.llm.model_registry import get_model_cost

logger = logging.getLogger("lexio.llm")


async def call_llm(
    system: str,
    user: str,
    model: str | None = None,
    max_tokens: int = 4000,
    temperature: float = 0.3,
) -> dict:
    """Call an LLM via OpenRouter and return structured result."""
    model = model or settings.model_main
    t0 = time.time()

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            settings.openrouter_base_url,
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://lexio.app",
                "X-Title": "Lexio",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    choice = data["choices"][0]
    content = choice["message"]["content"]
    usage = data.get("usage", {})
    tokens_in = usage.get("prompt_tokens", 0)
    tokens_out = usage.get("completion_tokens", 0)
    cost = get_model_cost(model, tokens_in, tokens_out)
    duration_ms = int((time.time() - t0) * 1000)

    logger.info(f"LLM [{model}] tokens={tokens_in}+{tokens_out} cost=${cost:.4f} time={duration_ms}ms")

    return {
        "content": content,
        "model": model,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cost_usd": cost,
        "duration_ms": duration_ms,
        "input_preview": user[:500],
    }
