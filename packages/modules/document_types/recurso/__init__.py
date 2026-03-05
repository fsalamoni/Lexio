"""Lexio Module — Recurso Judicial (Appeal)."""

from packages.modules.document_types.recurso.document_type import RecursoDocumentType

MODULE_CLASS = RecursoDocumentType


def create_module():
    return RecursoDocumentType()
