"""Lexio Module — Parecer Jurídico (Legal Opinion)."""

from packages.modules.document_types.parecer.document_type import ParecerDocumentType

MODULE_CLASS = ParecerDocumentType


def create_module():
    return ParecerDocumentType()
