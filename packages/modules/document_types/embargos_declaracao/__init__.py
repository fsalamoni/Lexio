"""Lexio Module — Embargos de Declaração."""

from packages.modules.document_types.embargos_declaracao.document_type import EmbargosDeclaracaoDocumentType

MODULE_CLASS = EmbargosDeclaracaoDocumentType


def create_module():
    return EmbargosDeclaracaoDocumentType()
