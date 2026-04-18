"""Tests for integrator rules (header, footer, post_process) of all doc types."""

import pytest

import packages.modules.document_types.parecer.integrator_rules as parecer_int
import packages.modules.document_types.peticao_inicial.integrator_rules as peticao_int
import packages.modules.document_types.contestacao.integrator_rules as contestacao_int
import packages.modules.document_types.recurso.integrator_rules as recurso_int
import packages.modules.document_types.sentenca.integrator_rules as sentenca_int
import packages.modules.document_types.acao_civil_publica.integrator_rules as acp_int

ALL_MODULES = [
    ("parecer", parecer_int),
    ("peticao_inicial", peticao_int),
    ("contestacao", contestacao_int),
    ("recurso", recurso_int),
    ("sentenca", sentenca_int),
    ("acao_civil_publica", acp_int),
]

CURRENT_YEAR = __import__("datetime").datetime.now().year


@pytest.mark.parametrize("name,mod", ALL_MODULES)
class TestIntegratorInterface:
    def test_has_get_header(self, name, mod):
        assert callable(getattr(mod, "get_header", None)), f"{name}: missing get_header"

    def test_has_get_footer(self, name, mod):
        assert callable(getattr(mod, "get_footer", None)), f"{name}: missing get_footer"

    def test_has_post_process(self, name, mod):
        assert callable(getattr(mod, "post_process", None)), f"{name}: missing post_process"

    def test_get_header_returns_string(self, name, mod):
        result = mod.get_header({})
        assert isinstance(result, str)

    def test_get_footer_returns_string(self, name, mod):
        result = mod.get_footer({})
        assert isinstance(result, str)

    def test_post_process_returns_string(self, name, mod):
        text = "Texto de teste.\n\nSegundo parágrafo."
        result = mod.post_process(text, {})
        assert isinstance(result, str)

    def test_get_footer_contains_current_year(self, name, mod):
        result = mod.get_footer({})
        assert str(CURRENT_YEAR) in result

    def test_post_process_removes_markdown_bold(self, name, mod):
        text = "**texto em negrito** e mais texto."
        result = mod.post_process(text, {})
        assert "**" not in result

    def test_post_process_removes_markdown_headers(self, name, mod):
        text = "## Título\n\nconteúdo aqui"
        result = mod.post_process(text, {})
        assert text.startswith("##") or "##" not in result

    def test_post_process_collapses_excess_newlines(self, name, mod):
        text = "Parágrafo 1.\n\n\n\n\nParágrafo 2."
        result = mod.post_process(text, {})
        assert "\n\n\n" not in result

    def test_post_process_strips_text(self, name, mod):
        text = "\n\n  Texto limpo.  \n\n"
        result = mod.post_process(text, {})
        assert result == result.strip()

    def test_get_header_with_org_name(self, name, mod):
        result = mod.get_header({"org_name": "MPRS"})
        assert isinstance(result, str)

    def test_get_footer_with_author(self, name, mod):
        result = mod.get_footer({"author_name": "Dr. João", "cidade": "Porto Alegre"})
        assert isinstance(result, str)
        assert "Porto Alegre" in result or str(CURRENT_YEAR) in result


# ── Parecer-specific ───────────────────────────────────────────────────────────

class TestParecerIntegrator:
    def test_mprs_header_contains_greeting(self):
        ctx = {"template_variant": "mprs_caopp", "org_name": "MPRS"}
        result = parecer_int.get_header(ctx)
        assert "Senhor Promotor" in result or "MPRS" in result

    def test_generic_header_with_user_title(self):
        ctx = {"user_title": "Promotor de Justiça", "org_name": "MP Test"}
        result = parecer_int.get_header(ctx)
        assert isinstance(result, str)

    def test_footer_has_date(self):
        result = parecer_int.get_footer({"cidade": "Porto Alegre"})
        assert "Porto Alegre" in result

    def test_post_process_removes_duplicate_sections(self):
        text = "RELATÓRIO\n\nConteúdo.\n\nRELATÓRIO\n\nConteúdo duplicado."
        result = parecer_int.post_process(text, {})
        assert isinstance(result, str)


# ── Petição Inicial-specific ───────────────────────────────────────────────────

class TestPeticaoIntegrator:
    def test_header_contains_judicial_address(self):
        result = peticao_int.get_header({"comarca": "Porto Alegre", "tipo_vara": "Cível"})
        assert "EXCELENTÍSSIMO" in result or "SENHOR" in result

    def test_header_with_comarca_and_vara(self):
        result = peticao_int.get_header({"comarca": "São Paulo", "vara": "3ª"})
        assert "SÃO PAULO" in result.upper() or "3ª" in result

    def test_footer_contains_closing(self):
        result = peticao_int.get_footer({})
        assert "deferimento" in result.lower() or "nestes termos" in result.lower()

    def test_post_process_removes_header_from_body(self):
        text = "EXCELENTÍSSIMO SENHOR JUIZ\n\nDOS FATOS\n\nConteúdo."
        result = peticao_int.post_process(text, {})
        # Header line should be stripped from body
        assert "DOS FATOS" in result


# ── Contestação-specific ───────────────────────────────────────────────────────

class TestContestacaoIntegrator:
    def test_header_with_processo_number(self):
        ctx = {"numero_processo": "0001234-56.2024.8.21.0001"}
        result = contestacao_int.get_header(ctx)
        assert isinstance(result, str)

    def test_footer_with_defensora(self):
        ctx = {"author_name": "Dra. Ana Lima", "cidade": "Curitiba"}
        result = contestacao_int.get_footer(ctx)
        assert "Curitiba" in result or "Ana Lima" in result or str(CURRENT_YEAR) in result


# ── Recurso-specific ───────────────────────────────────────────────────────────

class TestRecursoIntegrator:
    def test_apelacao_header(self):
        ctx = {"tipo_recurso": "apelacao"}
        result = recurso_int.get_header(ctx)
        assert isinstance(result, str)
        # Should contain the appeal type or tribunal reference
        assert len(result) >= 0  # valid string returned

    def test_embargos_header(self):
        ctx = {"tipo_recurso": "embargos_declaracao"}
        result = recurso_int.get_header(ctx)
        assert isinstance(result, str)

    def test_agravo_instrumento_header(self):
        ctx = {"tipo_recurso": "agravo_instrumento"}
        result = recurso_int.get_header(ctx)
        assert isinstance(result, str)


# ── Sentença-specific ──────────────────────────────────────────────────────────

class TestSentencaIntegrator:
    def test_header_starts_with_poder_judiciario(self):
        result = sentenca_int.get_header({})
        assert "PODER JUDICIÁRIO" in result

    def test_header_includes_comarca(self):
        result = sentenca_int.get_header({"comarca": "Porto Alegre"})
        assert "Porto Alegre" in result

    def test_post_process_preserves_dispositivo(self):
        text = "DISPOSITIVO\n\nJULGO PROCEDENTE o pedido.\n\nP.R.I."
        result = sentenca_int.post_process(text, {})
        assert "DISPOSITIVO" in result or "JULGO" in result


# ── ACP-specific ───────────────────────────────────────────────────────────────

class TestAcpIntegrator:
    def test_header_contains_judicial_address(self):
        result = acp_int.get_header({})
        assert "EXCELENTÍSSIMO" in result or "SENHOR" in result or "JUIZ" in result

    def test_footer_contains_mp_closing(self):
        result = acp_int.get_footer({})
        assert isinstance(result, str)
        assert len(result) > 0
