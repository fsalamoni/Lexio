"""Lexio Core — Module loader and registry."""

from packages.core.module_loader.registry import module_registry
from packages.core.module_loader.loader import discover_and_load_modules
from packages.core.module_loader.health import check_module_health, check_all_modules_health

__all__ = [
    "module_registry", "discover_and_load_modules",
    "check_module_health", "check_all_modules_health",
]
