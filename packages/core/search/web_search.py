"""Lexio Core — Web search via SearXNG for legislation."""

import logging

import httpx

from packages.core.config import settings

logger = logging.getLogger("lexio.search.web")


async def search_legislacao(tema: str, num_results: int = 5) -> str:
    """Search for relevant legislation via SearXNG."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                settings.searxng_url,
                params={
                    "q": f"{tema} legislação brasil site:planalto.gov.br OR site:stf.jus.br OR site:stj.jus.br",
                    "format": "json",
                    "engines": "google",
                    "pageno": 1,
                },
            )
            if resp.status_code != 200:
                logger.warning(f"SearXNG returned {resp.status_code}")
                return ""
            data = resp.json()

        results = data.get("results", [])[:num_results]
        if not results:
            return ""

        parts = []
        for r in results:
            title = r.get("title", "")
            url = r.get("url", "")
            snippet = r.get("content", "")
            parts.append(f"[{title}]({url})\n{snippet}")

        logger.info(f"Web search: {len(results)} results")
        return "\n\n".join(parts)

    except Exception as e:
        logger.error(f"Web search error: {e}")
        return ""
