"""Lexio API — Legal areas listing."""

from fastapi import APIRouter

from packages.core.module_loader import module_registry

router = APIRouter()


@router.get("/")
async def list_legal_areas():
    modules = module_registry.get_by_type("legal_area")
    return [
        {
            "id": m.manifest.get("id", m.name),
            "name": m.name,
            "description": m.description,
            "specializations": m.manifest.get("specializations", []),
            "guides": m.manifest.get("guides", []),
            "is_enabled": m.is_enabled,
        }
        for m in modules
    ]
