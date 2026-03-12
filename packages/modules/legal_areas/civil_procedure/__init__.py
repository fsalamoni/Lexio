"""Lexio Module — Direito Processual Civil."""

from packages.modules.legal_areas.civil_procedure.area import CivilProcedureArea

MODULE_CLASS = CivilProcedureArea


def create_module():
    return CivilProcedureArea()
