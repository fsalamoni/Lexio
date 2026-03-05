"""Lexio Module — Direito do Trabalho (Labor Law)."""

from packages.modules.legal_areas.labor.area import LaborArea

MODULE_CLASS = LaborArea


def create_module():
    return LaborArea()
