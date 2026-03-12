"""Lexio Module — Direito Penal."""

from packages.modules.legal_areas.criminal.area import CriminalArea

MODULE_CLASS = CriminalArea


def create_module():
    return CriminalArea()
