"""Lexio Module — Direito Civil (Civil Law)."""

from packages.modules.legal_areas.civil.area import CivilArea

MODULE_CLASS = CivilArea


def create_module():
    return CivilArea()
