"""Tests for all 10 document type implementations."""

import pytest

from packages.modules.document_types.parecer.document_type import ParecerDocumentType
from packages.modules.document_types.peticao_inicial.document_type import PeticaoInicialDocumentType
from packages.modules.document_types.contestacao.document_type import ContestacaoDocumentType
from packages.modules.document_types.recurso.document_type import RecursoDocumentType
from packages.modules.document_types.acao_civil_publica.document_type import AcaoCivilPublicaDocumentType
from packages.modules.document_types.sentenca.document_type import SentencaDocumentType
from packages.modules.document_types.mandado_seguranca.document_type import MandadoSegurancaDocumentType
from packages.modules.document_types.habeas_corpus.document_type import HabeasCorpusDocumentType
from packages.modules.document_types.agravo.document_type import AgravoDocumentType
from packages.modules.document_types.embargos_declaracao.document_type import EmbargosDeclaracaoDocumentType

ALL_DOCTYPES = [
    ("parecer", ParecerDocumentType),
    ("peticao_inicial", PeticaoInicialDocumentType),
    ("contestacao", ContestacaoDocumentType),
    ("recurso", RecursoDocumentType),
    ("acao_civil_publica", AcaoCivilPublicaDocumentType),
    ("sentenca", SentencaDocumentType),
    ("mandado_seguranca", MandadoSegurancaDocumentType),
    ("habeas_corpus", HabeasCorpusDocumentType),
    ("agravo", AgravoDocumentType),
    ("embargos_declaracao", EmbargosDeclaracaoDocumentType),
]

EXPECTED_IDS = {cls: name for name, cls in ALL_DOCTYPES}


@pytest.mark.parametrize("name,DocClass", ALL_DOCTYPES)
class TestDocumentTypeInterface:
    def test_instantiable(self, name, DocClass):
        doc = DocClass()
        assert doc is not None

    def test_get_id_returns_correct_value(self, name, DocClass):
        doc = DocClass()
        assert doc.get_id() == EXPECTED_IDS[DocClass]

    def test_get_name_returns_non_empty_string(self, name, DocClass):
        doc = DocClass()
        assert isinstance(doc.get_name(), str)
        assert len(doc.get_name()) > 0

    def test_get_description_returns_non_empty_string(self, name, DocClass):
        doc = DocClass()
        assert isinstance(doc.get_description(), str)
        assert len(doc.get_description()) > 5

    def test_get_category_returns_valid(self, name, DocClass):
        doc = DocClass()
        cat = doc.get_category()
        assert cat in ("mp", "judiciary", "advocacy", "general")

    def test_get_pipeline_config_returns_config(self, name, DocClass):
        doc = DocClass()
        cfg = doc.get_pipeline_config()
        assert cfg.document_type_id == name
        assert len(cfg.agents) >= 4

    def test_pipeline_has_required_fields(self, name, DocClass):
        doc = DocClass()
        cfg = doc.get_pipeline_config()
        assert cfg.name
        assert cfg.model_triage
        assert cfg.model_main

    def test_each_agent_has_required_fields(self, name, DocClass):
        doc = DocClass()
        cfg = doc.get_pipeline_config()
        for agent in cfg.agents:
            assert agent.name
            assert agent.phase
            assert agent.output_key

    def test_get_id_is_snake_case(self, name, DocClass):
        doc = DocClass()
        doc_id = doc.get_id()
        assert " " not in doc_id
        assert doc_id == doc_id.lower()

    def test_has_health_check_method(self, name, DocClass):
        doc = DocClass()
        assert callable(getattr(doc, "health_check", None))
