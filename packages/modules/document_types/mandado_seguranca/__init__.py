"""Lexio Module — Mandado de Segurança."""

from packages.modules.document_types.mandado_seguranca.document_type import MandadoSegurancaDocumentType

MODULE_CLASS = MandadoSegurancaDocumentType


def create_module():
    return MandadoSegurancaDocumentType()
