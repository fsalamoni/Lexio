"""Lexio Module — Direito Empresarial."""

from packages.modules.legal_areas.business.area import BusinessArea

MODULE_CLASS = BusinessArea


def create_module():
    return BusinessArea()
