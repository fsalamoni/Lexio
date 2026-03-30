"""Lexio API — Document types listing."""

from fastapi import APIRouter

from packages.core.module_loader import module_registry

router = APIRouter()


@router.get("/")
async def list_document_types():
    modules = module_registry.get_by_type("document_type")
    return [
        {
            "id": m.manifest.get("id", m.name),
            "name": m.name,
            "description": m.description,
            "category": m.manifest.get("category", "general"),
            "templates": m.manifest.get("templates", []),
            "is_enabled": m.is_enabled,
        }
        for m in modules
    ]
