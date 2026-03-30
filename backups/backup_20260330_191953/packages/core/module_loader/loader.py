"""Lexio Core — Module discovery and loading."""

import importlib
import json
import logging
from pathlib import Path

from packages.core.module_loader.registry import module_registry, ModuleInfo
from packages.core.events import event_bus, EventType

logger = logging.getLogger("lexio.modules.loader")

MODULES_BASE = Path(__file__).parent.parent.parent / "modules"


def _find_manifests(base_path: Path) -> list[Path]:
    """Find all manifest.json files under the modules directory."""
    manifests = []
    for manifest_path in base_path.rglob("manifest.json"):
        manifests.append(manifest_path)
    return sorted(manifests)


async def discover_and_load_modules():
    """Discover and load all modules from packages/modules/."""
    if not MODULES_BASE.exists():
        logger.warning(f"Modules directory not found: {MODULES_BASE}")
        return

    manifests = _find_manifests(MODULES_BASE)
    logger.info(f"Found {len(manifests)} module manifests")

    for manifest_path in manifests:
        module_dir = manifest_path.parent
        try:
            with open(manifest_path) as f:
                manifest = json.load(f)

            module_id = manifest.get("id")
            module_type = manifest.get("type")
            entry_point = manifest.get("entry_point")

            if not all([module_id, module_type, entry_point]):
                logger.warning(f"Invalid manifest: {manifest_path}")
                continue

            # Build the Python import path from file path
            rel_path = module_dir.relative_to(MODULES_BASE.parent.parent)
            import_path = str(rel_path / entry_point).replace("/", ".").replace("\\", ".")
            if import_path.endswith(".py"):
                import_path = import_path[:-3]

            # Import the module
            mod = importlib.import_module(import_path)
            instance = None
            if hasattr(mod, "create_module"):
                instance = mod.create_module()
            elif hasattr(mod, "MODULE_CLASS"):
                instance = mod.MODULE_CLASS()

            info = ModuleInfo(
                name=manifest.get("name", module_id),
                type=module_type,
                module_path=str(module_dir),
                version=manifest.get("version", "1.0.0"),
                description=manifest.get("description", ""),
                is_enabled=manifest.get("enabled", True),
                instance=instance,
                manifest=manifest,
            )

            module_registry.register(module_id, info)
            await event_bus.emit(EventType.MODULE_LOADED, {"module_id": module_id})

        except Exception as e:
            logger.error(f"Failed to load module from {manifest_path}: {e}")
            module_id = manifest_path.parent.name
            module_registry.register(module_id, ModuleInfo(
                name=module_id,
                type="unknown",
                module_path=str(module_dir),
                is_healthy=False,
                error=str(e),
            ))
            await event_bus.emit(EventType.MODULE_FAILED, {
                "module_id": module_id, "error": str(e),
            })

    logger.info(
        f"Modules loaded: {module_registry.healthy_count}/{module_registry.total_count} healthy"
    )
