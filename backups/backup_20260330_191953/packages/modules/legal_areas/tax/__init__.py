"""Lexio Module — Direito Tributário (Tax Law)."""

from packages.modules.legal_areas.tax.area import TaxArea

MODULE_CLASS = TaxArea


def create_module():
    return TaxArea()
