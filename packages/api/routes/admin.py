"""Lexio API — Admin routes (module management, health, metrics, platform settings)."""

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from packages.core.auth.dependencies import get_current_admin, get_db
from packages.core.database.models.user import User
from packages.core.database.models.platform_setting import PlatformSetting
from packages.core.module_loader import module_registry, check_all_modules_health
from packages.core.config import settings

router = APIRouter()

# ── API key definitions visible to the admin UI ──────────────────────
API_KEY_DEFS = [
    {
        "key": "openrouter_api_key",
        "label": "OpenRouter API Key",
        "description": "Chave para acesso aos modelos LLM (Claude, GPT-4, etc.) via OpenRouter.ai",
        "placeholder": "sk-or-v1-...",
        "link": "https://openrouter.ai/keys",
    },
    {
        "key": "evolution_api_key",
        "label": "Evolution API Key",
        "description": "Chave para integração WhatsApp via Evolution API",
        "placeholder": "Sua chave de API da Evolution",
        "link": "https://doc.evolution-api.com",
    },
    {
        "key": "datajud_api_key",
        "label": "DataJud API Key (CNJ)",
        "description": "Chave para consulta de jurisprudência via DataJud (CNJ)",
        "placeholder": "APIKey cnjKey=...",
        "link": "https://datajud-wiki.cnj.jus.br",
    },
]


def _mask(value: str | None) -> str | None:
    """Return a masked version of a secret value for display."""
    if not value or len(value) < 8:
        return None
    return value[:6] + "•" * (len(value) - 10) + value[-4:] if len(value) > 10 else value[:4] + "••••"


# ── Module management ────────────────────────────────────────────────

@router.get("/modules")
async def list_modules(admin: User = Depends(get_current_admin)):
    modules = module_registry.list_all()
    return [
        {
            "id": m.manifest.get("id", m.name),
            "name": m.name,
            "type": m.type,
            "version": m.version,
            "is_enabled": m.is_enabled,
            "is_healthy": m.is_healthy,
            "error": m.error,
            "description": m.description,
        }
        for m in modules
    ]


@router.get("/modules/health")
async def modules_health(admin: User = Depends(get_current_admin)):
    return await check_all_modules_health()


@router.post("/modules/{module_id}/toggle")
async def toggle_module(module_id: str, admin: User = Depends(get_current_admin)):
    mod = module_registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Módulo '{module_id}' não encontrado")
    new_state = not mod.is_enabled
    module_registry.set_enabled(module_id, new_state)
    return {"module_id": module_id, "is_enabled": new_state}


@router.post("/test-module/{module_id}")
async def test_module(module_id: str, admin: User = Depends(get_current_admin)):
    """Test a module without consuming LLM tokens."""
    mod = module_registry.get(module_id)
    if not mod:
        raise HTTPException(404, f"Módulo '{module_id}' não encontrado")

    result = {
        "module_id": module_id,
        "name": mod.name,
        "type": mod.type,
        "manifest_valid": bool(mod.manifest),
        "instance_loaded": mod.instance is not None,
        "has_health_check": hasattr(mod.instance, "health_check") if mod.instance else False,
    }

    if mod.instance and hasattr(mod.instance, "health_check"):
        try:
            health = await mod.instance.health_check()
            result["health_check"] = health
        except Exception as e:
            result["health_check"] = {"error": str(e)}

    return result


# ── Platform settings (API keys) ─────────────────────────────────────

@router.get("/settings")
async def get_settings(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return platform settings with masked values."""
    # Load stored values
    result = await db.execute(select(PlatformSetting))
    stored: dict[str, str | None] = {row.key: row.value for row in result.scalars().all()}

    # Merge definitions with stored + env fallback
    items = []
    for defn in API_KEY_DEFS:
        key = defn["key"]
        db_value = stored.get(key)
        env_value = getattr(settings, key, None) or None

        # Priority: DB value > env value
        active_value = db_value or env_value
        source = "banco" if db_value else ("env" if env_value else "não configurado")

        items.append({
            **defn,
            "is_set": bool(active_value),
            "masked_value": _mask(active_value),
            "source": source,
        })

    return {"settings": items}


class SettingsPatch(BaseModel):
    updates: dict[str, str]  # key -> plain value (empty string = clear)


@router.patch("/settings")
async def update_settings(
    body: SettingsPatch,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update one or more platform settings and apply them immediately."""
    allowed_keys = {d["key"] for d in API_KEY_DEFS}
    invalid = set(body.updates.keys()) - allowed_keys
    if invalid:
        raise HTTPException(400, f"Chaves inválidas: {', '.join(invalid)}")

    updated = []
    for key, value in body.updates.items():
        clean = value.strip()

        # Upsert
        result = await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))
        row = result.scalar_one_or_none()

        if row:
            row.value = clean or None
        else:
            row = PlatformSetting(key=key, value=clean or None)
            db.add(row)

        # Apply immediately to in-memory settings (avoids restart requirement)
        if hasattr(settings, key):
            object.__setattr__(settings, key, clean or getattr(settings, key))

        updated.append(key)

    await db.commit()
    return {"updated": updated, "message": "Configurações salvas e aplicadas."}


async def load_settings_from_db(db: AsyncSession) -> None:
    """Called at startup to override env settings with DB-stored values."""
    try:
        result = await db.execute(select(PlatformSetting))
        for row in result.scalars().all():
            if row.value and hasattr(settings, row.key):
                object.__setattr__(settings, row.key, row.value)
    except Exception:
        pass  # DB may not be ready yet; env values will be used
