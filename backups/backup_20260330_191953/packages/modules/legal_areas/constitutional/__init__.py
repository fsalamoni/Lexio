"""Lexio Module — Direito Constitucional (Constitutional Law)."""

from packages.modules.legal_areas.constitutional.area import ConstitutionalArea

MODULE_CLASS = ConstitutionalArea


def create_module():
    return ConstitutionalArea()
