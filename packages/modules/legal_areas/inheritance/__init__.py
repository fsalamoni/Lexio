"""Lexio Module — Direito das Sucessões."""

from packages.modules.legal_areas.inheritance.area import InheritanceArea

MODULE_CLASS = InheritanceArea


def create_module():
    return InheritanceArea()
