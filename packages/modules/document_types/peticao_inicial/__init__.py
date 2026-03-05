"""Lexio Module — Petição Inicial (Initial Petition)."""

from packages.modules.document_types.peticao_inicial.document_type import PeticaoInicialDocumentType

MODULE_CLASS = PeticaoInicialDocumentType


def create_module():
    return PeticaoInicialDocumentType()
