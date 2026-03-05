"""Lexio Module — Contestacao (Defense/Answer)."""

from packages.modules.document_types.contestacao.document_type import ContestacaoDocumentType

MODULE_CLASS = ContestacaoDocumentType


def create_module():
    return ContestacaoDocumentType()
