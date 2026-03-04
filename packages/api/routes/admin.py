"""Lexio API — Admin routes (module management, health, metrics)."""

from fastapi import APIRouter, Depends, HTTPException

from packages.core.auth.dependencies import get_current_admin
from packages.core.database.models.user import User
from packages.core.module_loader import module_registry, check_all_modules_health

router = APIRouter()


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
