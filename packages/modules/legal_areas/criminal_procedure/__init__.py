"""Lexio Module — Direito Processual Penal."""

from packages.modules.legal_areas.criminal_procedure.area import CriminalProcedureArea

MODULE_CLASS = CriminalProcedureArea


def create_module():
    return CriminalProcedureArea()
