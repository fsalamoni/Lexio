"""Lexio Core — Central module registry."""

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("lexio.modules")


@dataclass
class ModuleInfo:
    name: str
    type: str  # "document_type", "legal_area", "channel", "service"
    module_path: str
    version: str = "1.0.0"
    description: str = ""
    is_enabled: bool = True
    is_healthy: bool = True
    instance: Any = None
    manifest: dict = field(default_factory=dict)
    error: str | None = None


class ModuleRegistry:
    """Central registry for all Lexio modules."""

    def __init__(self):
        self._modules: dict[str, ModuleInfo] = {}

    def register(self, module_id: str, info: ModuleInfo):
        self._modules[module_id] = info
        logger.info(f"Module registered: {module_id} (type={info.type})")

    def unregister(self, module_id: str):
        if module_id in self._modules:
            del self._modules[module_id]
            logger.info(f"Module unregistered: {module_id}")

    def get(self, module_id: str) -> ModuleInfo | None:
        return self._modules.get(module_id)

    def get_by_type(self, module_type: str) -> list[ModuleInfo]:
        return [m for m in self._modules.values() if m.type == module_type and m.is_enabled]

    def list_all(self) -> list[ModuleInfo]:
        return list(self._modules.values())

    def set_health(self, module_id: str, healthy: bool, error: str | None = None):
        mod = self._modules.get(module_id)
        if mod:
            mod.is_healthy = healthy
            mod.error = error

    def set_enabled(self, module_id: str, enabled: bool):
        mod = self._modules.get(module_id)
        if mod:
            mod.is_enabled = enabled
            logger.info(f"Module {module_id} enabled={enabled}")

    @property
    def healthy_count(self) -> int:
        return sum(1 for m in self._modules.values() if m.is_healthy and m.is_enabled)

    @property
    def total_count(self) -> int:
        return len(self._modules)


module_registry = ModuleRegistry()
