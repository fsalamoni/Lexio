"""Lexio Module — Agravo de Instrumento."""

from packages.modules.document_types.agravo.document_type import AgravoDocumentType

MODULE_CLASS = AgravoDocumentType


def create_module():
    return AgravoDocumentType()
