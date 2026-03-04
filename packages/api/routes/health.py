"""Lexio API — Health check routes."""

import httpx
from fastapi import APIRouter
from sqlalchemy import text

from packages.core.config import settings
from packages.core.module_loader import module_registry

router = APIRouter()


@router.get("/health")
async def health_check():
    services = {}

    # PostgreSQL
    try:
        from packages.core.database.engine import async_engine
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        services["postgres"] = "ok"
    except Exception as e:
        services["postgres"] = f"error: {str(e)[:100]}"

    # Qdrant
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.qdrant_url}/healthz")
            services["qdrant"] = "ok" if resp.status_code == 200 else f"status {resp.status_code}"
    except Exception:
        services["qdrant"] = "unreachable"

    # Ollama
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            services["ollama"] = "ok" if resp.status_code == 200 else f"status {resp.status_code}"
    except Exception:
        services["ollama"] = "unreachable"

    # SearXNG
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(settings.searxng_url.replace("/search", "/healthz"))
            services["searxng"] = "ok" if resp.status_code == 200 else f"status {resp.status_code}"
    except Exception:
        services["searxng"] = "unreachable"

    # Module health
    modules_total = module_registry.total_count
    modules_healthy = module_registry.healthy_count

    all_ok = all(v == "ok" for v in services.values())
    status = "healthy" if all_ok else "degraded"

    return {
        "status": status,
        "app": settings.app_name,
        "version": settings.app_version,
        "services": services,
        "modules": {
            "total": modules_total,
            "healthy": modules_healthy,
        },
    }
