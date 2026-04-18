"""Lexio Core — Module health checking."""

import logging

from packages.core.module_loader.registry import module_registry

logger = logging.getLogger("lexio.modules.health")


async def check_module_health(module_id: str) -> dict:
    """Check health of a specific module."""
    info = module_registry.get(module_id)
    if not info:
        return {"module_id": module_id, "status": "not_found"}

    result = {
        "module_id": module_id,
        "name": info.name,
        "type": info.type,
        "version": info.version,
        "is_enabled": info.is_enabled,
        "is_healthy": info.is_healthy,
        "error": info.error,
    }

    # If module has a health_check method, call it
    if info.instance and hasattr(info.instance, "health_check"):
        try:
            health = await info.instance.health_check()
            result["details"] = health
            result["is_healthy"] = health.get("healthy", True)
            module_registry.set_health(module_id, result["is_healthy"])
        except Exception as e:
            result["is_healthy"] = False
            result["error"] = str(e)
            module_registry.set_health(module_id, False, str(e))

    return result


async def check_all_modules_health() -> dict:
    """Check health of all registered modules."""
    modules = module_registry.list_all()
    results = []
    for mod in modules:
        result = await check_module_health(mod.name)
        results.append(result)

    healthy = sum(1 for r in results if r.get("is_healthy"))
    return {
        "total": len(results),
        "healthy": healthy,
        "unhealthy": len(results) - healthy,
        "modules": results,
    }
