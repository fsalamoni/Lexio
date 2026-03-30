"""Lexio Module — Direito Digital."""

from packages.modules.legal_areas.digital.area import DigitalArea

MODULE_CLASS = DigitalArea


def create_module():
    return DigitalArea()
