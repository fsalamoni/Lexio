"""Lexio Module — Direito Administrativo (Administrative Law)."""

from packages.modules.legal_areas.administrative.area import AdministrativeArea

MODULE_CLASS = AdministrativeArea


def create_module():
    return AdministrativeArea()
