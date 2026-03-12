"""Lexio Module — Direito Ambiental."""

from packages.modules.legal_areas.environmental.area import EnvironmentalArea

MODULE_CLASS = EnvironmentalArea


def create_module():
    return EnvironmentalArea()
