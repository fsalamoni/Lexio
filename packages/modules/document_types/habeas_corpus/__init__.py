"""Lexio Module — Habeas Corpus."""

from packages.modules.document_types.habeas_corpus.document_type import HabeasCorpusDocumentType

MODULE_CLASS = HabeasCorpusDocumentType


def create_module():
    return HabeasCorpusDocumentType()
