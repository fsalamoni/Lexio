"""Lexio Module — Direito Internacional."""

from packages.modules.legal_areas.international.area import InternationalArea

MODULE_CLASS = InternationalArea


def create_module():
    return InternationalArea()
