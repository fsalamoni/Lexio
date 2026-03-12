"""Tests for pipeline configuration of all 10 document types."""

import pytest

from packages.modules.document_types.parecer.document_type import ParecerDocumentType
from packages.modules.document_types.peticao_inicial.document_type import PeticaoInicialDocumentType
from packages.modules.document_types.contestacao.document_type import ContestacaoDocumentType
from packages.modules.document_types.recurso.document_type import RecursoDocumentType
from packages.modules.document_types.sentenca.document_type import SentencaDocumentType
from packages.modules.document_types.acao_civil_publica.document_type import AcaoCivilPublicaDocumentType
from packages.modules.document_types.mandado_seguranca.document_type import MandadoSegurancaDocumentType
from packages.modules.document_types.habeas_corpus.document_type import HabeasCorpusDocumentType
from packages.modules.document_types.agravo.document_type import AgravoDocumentType
from packages.modules.document_types.embargos_declaracao.document_type import EmbargosDeclaracaoDocumentType
from packages.pipeline.pipeline_config import PipelineConfig, AgentConfig

ALL_TYPES = [
    ParecerDocumentType,
    PeticaoInicialDocumentType,
    ContestacaoDocumentType,
    RecursoDocumentType,
    SentencaDocumentType,
    AcaoCivilPublicaDocumentType,
    MandadoSegurancaDocumentType,
    HabeasCorpusDocumentType,
    AgravoDocumentType,
    EmbargosDeclaracaoDocumentType,
]

EXPECTED_IDS = {
    ParecerDocumentType: "parecer",
    PeticaoInicialDocumentType: "peticao_inicial",
    ContestacaoDocumentType: "contestacao",
    RecursoDocumentType: "recurso",
    SentencaDocumentType: "sentenca",
    AcaoCivilPublicaDocumentType: "acao_civil_publica",
    MandadoSegurancaDocumentType: "mandado_seguranca",
    HabeasCorpusDocumentType: "habeas_corpus",
    AgravoDocumentType: "agravo",
    EmbargosDeclaracaoDocumentType: "embargos_declaracao",
}


@pytest.mark.parametrize("DocType", ALL_TYPES)
class TestDocumentTypeInterface:
    def test_get_id_returns_string(self, DocType):
        dt = DocType()
        assert isinstance(dt.get_id(), str)
        assert len(dt.get_id()) > 0

    def test_get_id_correct_value(self, DocType):
        dt = DocType()
        assert dt.get_id() == EXPECTED_IDS[DocType]

    def test_get_name_returns_string(self, DocType):
        dt = DocType()
        assert isinstance(dt.get_name(), str)
        assert len(dt.get_name()) > 0

    def test_pipeline_config_is_correct_type(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        assert isinstance(cfg, PipelineConfig)

    def test_pipeline_config_has_agents(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        assert len(cfg.agents) >= 6

    def test_all_agents_have_required_fields(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        for agent in cfg.agents:
            assert isinstance(agent, AgentConfig)
            assert agent.name, f"Agent missing name in {DocType.__name__}"
            assert agent.phase, f"Agent {agent.name} missing phase"
            assert agent.prompt_module, f"Agent {agent.name} missing prompt_module"
            assert agent.output_key, f"Agent {agent.name} missing output_key"
            assert agent.max_tokens > 0
            assert 0.0 <= agent.temperature <= 1.0

    def test_pipeline_config_document_type_id_matches(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        assert cfg.document_type_id == dt.get_id()

    def test_pipeline_has_triage_agent(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        names = [a.name for a in cfg.agents]
        assert "triagem" in names

    def test_pipeline_has_writer_agent(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        names = [a.name for a in cfg.agents]
        assert "redator" in names

    def test_pipeline_has_reviewer_agent(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        names = [a.name for a in cfg.agents]
        assert "revisor" in names

    def test_quality_module_set(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        assert cfg.quality_module is not None
        assert isinstance(cfg.quality_module, str)

    def test_integrator_module_set(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        assert cfg.integrator_module is not None
        assert isinstance(cfg.integrator_module, str)

    def test_triage_uses_haiku_model(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        triage = cfg.get_agent("triagem")
        assert triage is not None
        # Triage should use Haiku (fast/cheap) not Sonnet
        if triage.model:
            assert "haiku" in triage.model.lower()

    def test_writer_has_large_token_budget(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        redator = cfg.get_agent("redator")
        assert redator is not None
        assert redator.max_tokens >= 6000  # Full document needs lots of tokens

    def test_no_duplicate_output_keys(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        keys = [a.output_key for a in cfg.agents if a.output_key]
        assert len(keys) == len(set(keys)), "Duplicate output_key found"

    def test_template_variant_generic_works(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config("generic")
        assert cfg is not None
        assert len(cfg.agents) >= 6

    def test_min_score_reasonable(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        assert 0 <= cfg.min_score <= 100

    def test_search_collections_configured(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        assert isinstance(cfg.search_collections, list)
        assert len(cfg.search_collections) >= 1, "search_collections must be set"
        assert "acervo_mprs" in cfg.search_collections, "Must search acervo_mprs"

    def test_search_collections_includes_memoria_pessoal(self, DocType):
        dt = DocType()
        cfg = dt.get_pipeline_config()
        assert "memoria_pessoal" in cfg.search_collections, "Must search memoria_pessoal"


class TestSentencaSpecific:
    """Sentença has a 6-agent pipeline (no advogado_diabo, no moderadores)."""

    def test_no_advogado_diabo(self):
        dt = SentencaDocumentType()
        cfg = dt.get_pipeline_config()
        names = [a.name for a in cfg.agents]
        assert "advogado_diabo" not in names

    def test_has_pesquisador(self):
        dt = SentencaDocumentType()
        cfg = dt.get_pipeline_config()
        names = [a.name for a in cfg.agents]
        assert "pesquisador" in names

    def test_has_fact_checker(self):
        dt = SentencaDocumentType()
        cfg = dt.get_pipeline_config()
        names = [a.name for a in cfg.agents]
        assert "fact_checker" in names


class TestParecerSpecific:
    """Parecer has a 9-agent pipeline including moderadores."""

    def test_has_nine_agents(self):
        dt = ParecerDocumentType()
        cfg = dt.get_pipeline_config()
        assert len(cfg.agents) == 9

    def test_has_moderador_agenda(self):
        dt = ParecerDocumentType()
        cfg = dt.get_pipeline_config()
        names = [a.name for a in cfg.agents]
        assert "moderador_agenda" in names

    def test_has_moderador_plano(self):
        dt = ParecerDocumentType()
        cfg = dt.get_pipeline_config()
        names = [a.name for a in cfg.agents]
        assert "moderador_plano" in names
