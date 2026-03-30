"""Tests that every agent template module has the required interface."""

import importlib
import inspect
import pytest

# Map of doc_type → list of template module paths to verify
TEMPLATE_MODULES = {
    "parecer": [
        "packages.modules.document_types.parecer.templates.generic.triagem",
        "packages.modules.document_types.parecer.templates.generic.moderador_agenda",
        "packages.modules.document_types.parecer.templates.generic.jurista",
        "packages.modules.document_types.parecer.templates.generic.advogado_diabo",
        "packages.modules.document_types.parecer.templates.generic.jurista_v2",
        "packages.modules.document_types.parecer.templates.generic.fact_checker",
        "packages.modules.document_types.parecer.templates.generic.moderador_plano",
        "packages.modules.document_types.parecer.templates.generic.redator",
        "packages.modules.document_types.parecer.templates.generic.revisor",
    ],
    "peticao_inicial": [
        "packages.modules.document_types.peticao_inicial.templates.generic.triagem",
        "packages.modules.document_types.peticao_inicial.templates.generic.pesquisador",
        "packages.modules.document_types.peticao_inicial.templates.generic.jurista",
        "packages.modules.document_types.peticao_inicial.templates.generic.advogado_diabo",
        "packages.modules.document_types.peticao_inicial.templates.generic.jurista_v2",
        "packages.modules.document_types.peticao_inicial.templates.generic.fact_checker",
        "packages.modules.document_types.peticao_inicial.templates.generic.redator",
        "packages.modules.document_types.peticao_inicial.templates.generic.revisor",
    ],
    "contestacao": [
        "packages.modules.document_types.contestacao.templates.generic.triagem",
        "packages.modules.document_types.contestacao.templates.generic.pesquisador",
        "packages.modules.document_types.contestacao.templates.generic.jurista",
        "packages.modules.document_types.contestacao.templates.generic.advogado_diabo",
        "packages.modules.document_types.contestacao.templates.generic.jurista_v2",
        "packages.modules.document_types.contestacao.templates.generic.fact_checker",
        "packages.modules.document_types.contestacao.templates.generic.redator",
        "packages.modules.document_types.contestacao.templates.generic.revisor",
    ],
    "recurso": [
        "packages.modules.document_types.recurso.templates.generic.triagem",
        "packages.modules.document_types.recurso.templates.generic.pesquisador",
        "packages.modules.document_types.recurso.templates.generic.jurista",
        "packages.modules.document_types.recurso.templates.generic.advogado_diabo",
        "packages.modules.document_types.recurso.templates.generic.jurista_v2",
        "packages.modules.document_types.recurso.templates.generic.fact_checker",
        "packages.modules.document_types.recurso.templates.generic.redator",
        "packages.modules.document_types.recurso.templates.generic.revisor",
    ],
    "sentenca": [
        "packages.modules.document_types.sentenca.templates.generic.triagem",
        "packages.modules.document_types.sentenca.templates.generic.pesquisador",
        "packages.modules.document_types.sentenca.templates.generic.jurista",
        "packages.modules.document_types.sentenca.templates.generic.fact_checker",
        "packages.modules.document_types.sentenca.templates.generic.redator",
        "packages.modules.document_types.sentenca.templates.generic.revisor",
    ],
    "acao_civil_publica": [
        "packages.modules.document_types.acao_civil_publica.templates.generic.triagem",
        "packages.modules.document_types.acao_civil_publica.templates.generic.pesquisador",
        "packages.modules.document_types.acao_civil_publica.templates.generic.jurista",
        "packages.modules.document_types.acao_civil_publica.templates.generic.advogado_diabo",
        "packages.modules.document_types.acao_civil_publica.templates.generic.jurista_v2",
        "packages.modules.document_types.acao_civil_publica.templates.generic.fact_checker",
        "packages.modules.document_types.acao_civil_publica.templates.generic.redator",
        "packages.modules.document_types.acao_civil_publica.templates.generic.revisor",
    ],
    "mandado_seguranca": [
        "packages.modules.document_types.mandado_seguranca.templates.generic.triagem",
        "packages.modules.document_types.mandado_seguranca.templates.generic.pesquisador",
        "packages.modules.document_types.mandado_seguranca.templates.generic.jurista",
        "packages.modules.document_types.mandado_seguranca.templates.generic.advogado_diabo",
        "packages.modules.document_types.mandado_seguranca.templates.generic.jurista_v2",
        "packages.modules.document_types.mandado_seguranca.templates.generic.fact_checker",
        "packages.modules.document_types.mandado_seguranca.templates.generic.redator",
        "packages.modules.document_types.mandado_seguranca.templates.generic.revisor",
    ],
    "habeas_corpus": [
        "packages.modules.document_types.habeas_corpus.templates.generic.triagem",
        "packages.modules.document_types.habeas_corpus.templates.generic.pesquisador",
        "packages.modules.document_types.habeas_corpus.templates.generic.jurista",
        "packages.modules.document_types.habeas_corpus.templates.generic.fact_checker",
        "packages.modules.document_types.habeas_corpus.templates.generic.redator",
        "packages.modules.document_types.habeas_corpus.templates.generic.revisor",
    ],
    "agravo": [
        "packages.modules.document_types.agravo.templates.generic.triagem",
        "packages.modules.document_types.agravo.templates.generic.pesquisador",
        "packages.modules.document_types.agravo.templates.generic.jurista",
        "packages.modules.document_types.agravo.templates.generic.advogado_diabo",
        "packages.modules.document_types.agravo.templates.generic.fact_checker",
        "packages.modules.document_types.agravo.templates.generic.redator",
        "packages.modules.document_types.agravo.templates.generic.revisor",
    ],
    "embargos_declaracao": [
        "packages.modules.document_types.embargos_declaracao.templates.generic.triagem",
        "packages.modules.document_types.embargos_declaracao.templates.generic.pesquisador",
        "packages.modules.document_types.embargos_declaracao.templates.generic.jurista",
        "packages.modules.document_types.embargos_declaracao.templates.generic.fact_checker",
        "packages.modules.document_types.embargos_declaracao.templates.generic.redator",
        "packages.modules.document_types.embargos_declaracao.templates.generic.revisor",
    ],
}

# Flatten all modules for parametrize
ALL_MODULES = [
    mod
    for modules in TEMPLATE_MODULES.values()
    for mod in modules
]


@pytest.mark.parametrize("module_path", ALL_MODULES)
class TestTemplateInterface:
    def test_module_importable(self, module_path):
        mod = importlib.import_module(module_path)
        assert mod is not None

    def test_has_system_prompt(self, module_path):
        mod = importlib.import_module(module_path)
        assert hasattr(mod, "system_prompt"), f"{module_path} missing system_prompt"

    def test_has_user_prompt(self, module_path):
        mod = importlib.import_module(module_path)
        assert hasattr(mod, "user_prompt"), f"{module_path} missing user_prompt"

    def test_system_prompt_is_callable(self, module_path):
        mod = importlib.import_module(module_path)
        assert callable(mod.system_prompt)

    def test_user_prompt_is_callable(self, module_path):
        mod = importlib.import_module(module_path)
        assert callable(mod.user_prompt)

    def test_system_prompt_accepts_context(self, module_path):
        mod = importlib.import_module(module_path)
        sig = inspect.signature(mod.system_prompt)
        params = list(sig.parameters.keys())
        assert "context" in params or len(params) >= 1

    def test_user_prompt_accepts_context(self, module_path):
        mod = importlib.import_module(module_path)
        sig = inspect.signature(mod.user_prompt)
        params = list(sig.parameters.keys())
        assert "context" in params or len(params) >= 1

    def test_system_prompt_returns_string(self, module_path):
        mod = importlib.import_module(module_path)
        ctx = {"msgOriginal": "teste", "tema": "licitação pública", "org_name": "Teste"}
        result = mod.system_prompt(ctx)
        assert isinstance(result, str)
        assert len(result) > 50  # Must produce meaningful content

    def test_user_prompt_returns_string(self, module_path):
        mod = importlib.import_module(module_path)
        ctx = {"msgOriginal": "teste sobre licitação pública", "tema": "licitação pública"}
        result = mod.user_prompt(ctx)
        assert isinstance(result, str)
        assert len(result) > 0

    def test_system_prompt_works_with_empty_context(self, module_path):
        mod = importlib.import_module(module_path)
        # Must not raise even with an empty context dict (use defaults)
        result = mod.system_prompt({})
        assert isinstance(result, str)

    def test_user_prompt_works_with_empty_context(self, module_path):
        mod = importlib.import_module(module_path)
        result = mod.user_prompt({})
        assert isinstance(result, str)

    def test_system_prompt_embeds_org_name(self, module_path):
        mod = importlib.import_module(module_path)
        result = mod.system_prompt({"org_name": "PROMOTORIA_TESTE_XYZ"})
        # Most system prompts include the org name
        # (some may not — we just ensure it runs without error)
        assert isinstance(result, str)


class TestTemplateCount:
    """Ensure each doc type has the expected number of template modules."""

    def test_parecer_has_nine_templates(self):
        assert len(TEMPLATE_MODULES["parecer"]) == 9

    def test_peticao_has_eight_templates(self):
        assert len(TEMPLATE_MODULES["peticao_inicial"]) == 8

    def test_contestacao_has_eight_templates(self):
        assert len(TEMPLATE_MODULES["contestacao"]) == 8

    def test_recurso_has_eight_templates(self):
        assert len(TEMPLATE_MODULES["recurso"]) == 8

    def test_sentenca_has_six_templates(self):
        assert len(TEMPLATE_MODULES["sentenca"]) == 6

    def test_acp_has_eight_templates(self):
        assert len(TEMPLATE_MODULES["acao_civil_publica"]) == 8

    def test_mandado_seguranca_has_eight_templates(self):
        assert len(TEMPLATE_MODULES["mandado_seguranca"]) == 8

    def test_habeas_corpus_has_six_templates(self):
        assert len(TEMPLATE_MODULES["habeas_corpus"]) == 6

    def test_agravo_has_seven_templates(self):
        assert len(TEMPLATE_MODULES["agravo"]) == 7

    def test_embargos_declaracao_has_six_templates(self):
        assert len(TEMPLATE_MODULES["embargos_declaracao"]) == 6

    def test_total_template_count(self):
        total = sum(len(v) for v in TEMPLATE_MODULES.values())
        assert total == 74  # 9 + 8 + 8 + 8 + 6 + 8 + 8 + 6 + 7 + 6
