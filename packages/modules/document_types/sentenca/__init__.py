"""Lexio Module — Sentenca (Judicial Sentence)."""

from packages.modules.document_types.sentenca.document_type import SentencaDocumentType

MODULE_CLASS = SentencaDocumentType


def create_module():
    return SentencaDocumentType()
