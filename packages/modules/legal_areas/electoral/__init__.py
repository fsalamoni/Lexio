"""Lexio Module — Direito Eleitoral."""

from packages.modules.legal_areas.electoral.area import ElectoralArea

MODULE_CLASS = ElectoralArea


def create_module():
    return ElectoralArea()
