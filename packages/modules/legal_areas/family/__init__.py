"""Lexio Module — Direito de Família."""

from packages.modules.legal_areas.family.area import FamilyArea

MODULE_CLASS = FamilyArea


def create_module():
    return FamilyArea()
