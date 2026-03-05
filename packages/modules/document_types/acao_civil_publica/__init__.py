"""Lexio Module — Acao Civil Publica (Public Civil Action)."""

from packages.modules.document_types.acao_civil_publica.document_type import AcaoCivilPublicaDocumentType

MODULE_CLASS = AcaoCivilPublicaDocumentType


def create_module():
    return AcaoCivilPublicaDocumentType()
