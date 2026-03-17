"""Tests for quality rules of all document types."""

import pytest
from tests.conftest import make_parecer_text, make_peticao_text

from packages.modules.document_types.parecer.quality_rules import QUALITY_RULES as PARECER_RULES
from packages.modules.document_types.peticao_inicial.quality_rules import QUALITY_RULES as PETICAO_RULES
from packages.modules.document_types.contestacao.quality_rules import QUALITY_RULES as CONTESTACAO_RULES
from packages.modules.document_types.recurso.quality_rules import QUALITY_RULES as RECURSO_RULES
from packages.modules.document_types.sentenca.quality_rules import QUALITY_RULES as SENTENCA_RULES
from packages.modules.document_types.acao_civil_publica.quality_rules import QUALITY_RULES as ACP_RULES
from packages.modules.document_types.embargos_declaracao.quality_rules import QUALITY_RULES as EMBARGOS_RULES
from packages.modules.document_types.habeas_corpus.quality_rules import QUALITY_RULES as HC_RULES
from packages.modules.document_types.mandado_seguranca.quality_rules import QUALITY_RULES as MS_RULES
from packages.modules.document_types.agravo.quality_rules import QUALITY_RULES as AGRAVO_RULES


# ── Helper ─────────────────────────────────────────────────────────────────────

def run_rule(rules, rule_id: str, text: str, ctx: dict | None = None) -> bool:
    ctx = ctx or {}
    for rule in rules:
        if rule["id"] == rule_id:
            return rule["check"](text, ctx)
    raise KeyError(f"Rule '{rule_id}' not found")


def compute_score(rules, text: str, ctx: dict | None = None) -> float:
    ctx = ctx or {}
    total_weight = sum(r["weight"] for r in rules)
    earned = sum(r["weight"] for r in rules if r["check"](text, ctx))
    return round(earned / total_weight * 100, 1) if total_weight else 0.0


# ── Structural tests (rules list integrity) ────────────────────────────────────

class TestQualityRulesStructure:
    @pytest.mark.parametrize("rules,name", [
        (PARECER_RULES, "parecer"),
        (PETICAO_RULES, "peticao"),
        (CONTESTACAO_RULES, "contestacao"),
        (RECURSO_RULES, "recurso"),
        (SENTENCA_RULES, "sentenca"),
        (ACP_RULES, "acp"),
    ])
    def test_rules_is_non_empty_list(self, rules, name):
        assert isinstance(rules, list)
        assert len(rules) >= 8, f"{name} has fewer than 8 quality rules"

    @pytest.mark.parametrize("rules,name", [
        (PARECER_RULES, "parecer"),
        (PETICAO_RULES, "peticao"),
        (CONTESTACAO_RULES, "contestacao"),
        (RECURSO_RULES, "recurso"),
        (SENTENCA_RULES, "sentenca"),
        (ACP_RULES, "acp"),
    ])
    def test_each_rule_has_required_keys(self, rules, name):
        for rule in rules:
            assert "id" in rule, f"{name}: rule missing 'id'"
            assert "description" in rule, f"{name}: rule '{rule.get('id')}' missing description"
            assert "check" in rule, f"{name}: rule '{rule.get('id')}' missing check"
            assert "weight" in rule, f"{name}: rule '{rule.get('id')}' missing weight"
            assert callable(rule["check"]), f"{name}: rule '{rule.get('id')}' check not callable"
            assert rule["weight"] > 0, f"{name}: rule '{rule.get('id')}' weight must be > 0"

    @pytest.mark.parametrize("rules,name", [
        (PARECER_RULES, "parecer"),
        (PETICAO_RULES, "peticao"),
        (CONTESTACAO_RULES, "contestacao"),
        (RECURSO_RULES, "recurso"),
        (SENTENCA_RULES, "sentenca"),
        (ACP_RULES, "acp"),
    ])
    def test_no_duplicate_rule_ids(self, rules, name):
        ids = [r["id"] for r in rules]
        assert len(ids) == len(set(ids)), f"{name}: duplicate rule IDs found"

    @pytest.mark.parametrize("rules,name", [
        (PARECER_RULES, "parecer"),
        (PETICAO_RULES, "peticao"),
        (CONTESTACAO_RULES, "contestacao"),
        (RECURSO_RULES, "recurso"),
        (SENTENCA_RULES, "sentenca"),
        (ACP_RULES, "acp"),
    ])
    def test_all_rules_have_no_lei_8666(self, rules, name):
        ids = [r["id"] for r in rules]
        assert "no_lei_8666" in ids, f"{name}: missing 'no_lei_8666' rule"


# ── Parecer quality rules ──────────────────────────────────────────────────────

class TestParecerQualityRules:
    TEXT = make_parecer_text()
    CTX = {"tema": "licitação pública administrativo"}

    def test_min_length_pass(self):
        assert run_rule(PARECER_RULES, "min_length", self.TEXT) is True

    def test_min_length_fail(self):
        assert run_rule(PARECER_RULES, "min_length", "x" * 10) is False

    def test_has_relatorio_pass(self):
        assert run_rule(PARECER_RULES, "has_relatorio", self.TEXT) is True

    def test_has_relatorio_fail(self):
        # Must not contain the word "RELATÓRIO" in any form
        assert run_rule(PARECER_RULES, "has_relatorio", "Sem secao de descricao aqui.") is False

    def test_has_fundamentacao_pass(self):
        assert run_rule(PARECER_RULES, "has_fundamentacao", self.TEXT) is True

    def test_has_conclusao_pass(self):
        assert run_rule(PARECER_RULES, "has_conclusao", self.TEXT) is True

    def test_has_closing_pass(self):
        assert run_rule(PARECER_RULES, "has_closing", self.TEXT) is True

    def test_has_closing_fail(self):
        text = self.TEXT.replace("salvo melhor juízo", "encerro assim")
        assert run_rule(PARECER_RULES, "has_closing", text) is False

    def test_no_lei_8666_pass(self):
        assert run_rule(PARECER_RULES, "no_lei_8666", self.TEXT) is True

    def test_no_lei_8666_fail(self):
        text = self.TEXT + " conforme Lei 8.666/93 que regulava licitações."
        assert run_rule(PARECER_RULES, "no_lei_8666", text) is False

    def test_no_truncation_pass(self):
        assert run_rule(PARECER_RULES, "no_truncation", self.TEXT) is True

    def test_no_truncation_fail(self):
        assert run_rule(PARECER_RULES, "no_truncation", "Texto com truncamento...") is False

    def test_has_sources_pass(self):
        text = self.TEXT + " [Fonte: STJ] [Fonte: STF]"
        assert run_rule(PARECER_RULES, "has_sources", text) is True

    def test_has_sources_fail(self):
        text = "Texto sem fontes."
        assert run_rule(PARECER_RULES, "has_sources", text) is False

    def test_connective_variety_fail_when_repeated(self):
        text = "nesse sentido\nnesse sentido\nnesse sentido\n" * 5
        assert run_rule(PARECER_RULES, "connective_variety", text) is False

    def test_connective_variety_pass(self):
        text = "portanto, logo, assim, consequentemente, destarte, outrossim, ademais"
        assert run_rule(PARECER_RULES, "connective_variety", text) is True

    def test_proper_paragraphs_pass(self):
        text = "\n\n".join(["Parágrafo " + str(i) for i in range(10)])
        assert run_rule(PARECER_RULES, "proper_paragraphs", text) is True

    def test_proper_paragraphs_fail(self):
        text = "Somente um parágrafo sem quebras."
        assert run_rule(PARECER_RULES, "proper_paragraphs", text) is False

    def test_valid_parecer_scores_above_60(self):
        text = self.TEXT + " [Fonte: STJ] [Fonte: STF]\n\n" + "\n\n".join(["p"] * 5)
        score = compute_score(PARECER_RULES, text, self.CTX)
        assert score >= 60, f"Valid parecer scored only {score}%"

    def test_empty_text_scores_low(self):
        score = compute_score(PARECER_RULES, "", {})
        # Vacuously-passing rules (no_lei_8666, no_truncation, connective_variety,
        # tema_relevance, no_invented_jurisprudence) yield ~31.8% for empty text.
        assert score < 35


# ── Petição Inicial quality rules ──────────────────────────────────────────────

class TestPeticaoQualityRules:
    TEXT = make_peticao_text()
    CTX = {"tema": "indenização danos morais consumidor"}

    def test_min_length_pass(self):
        assert run_rule(PETICAO_RULES, "min_length", self.TEXT) is True

    def test_min_length_fail(self):
        assert run_rule(PETICAO_RULES, "min_length", "curto") is False

    def test_has_qualificacao_pass(self):
        assert run_rule(PETICAO_RULES, "has_qualificacao_partes", self.TEXT) is True

    def test_has_qualificacao_fail(self):
        assert run_rule(PETICAO_RULES, "has_qualificacao_partes", "sem qualificação") is False

    def test_has_valor_causa_pass(self):
        text = "Dá-se à causa o valor de R$ 10.000,00"
        assert run_rule(PETICAO_RULES, "has_valor_causa", text) is True

    def test_has_valor_causa_fail(self):
        assert run_rule(PETICAO_RULES, "has_valor_causa", "sem valor") is False

    def test_has_fatos_pass(self):
        assert run_rule(PETICAO_RULES, "has_fatos", self.TEXT) is True

    def test_has_direito_pass(self):
        assert run_rule(PETICAO_RULES, "has_direito", self.TEXT) is True

    def test_has_pedidos_pass(self):
        assert run_rule(PETICAO_RULES, "has_pedidos", self.TEXT) is True

    def test_has_closing_pass(self):
        assert run_rule(PETICAO_RULES, "has_closing", self.TEXT) is True

    def test_no_lei_8666_pass(self):
        assert run_rule(PETICAO_RULES, "no_lei_8666", self.TEXT) is True

    def test_no_lei_8666_fail(self):
        text = self.TEXT + " conforme Lei 8.666/93"
        assert run_rule(PETICAO_RULES, "no_lei_8666", text) is False

    def test_cpc_reference_pass(self):
        assert run_rule(PETICAO_RULES, "has_cpc_reference", self.TEXT) is True

    def test_cpc_reference_fail(self):
        assert run_rule(PETICAO_RULES, "has_cpc_reference", "sem referência processual") is False


# ── Contestação quality rules ──────────────────────────────────────────────────

class TestContestacaoQualityRules:
    TEXT = (
        "DA SÍNTESE DA INICIAL\n\nO autor alega que o réu causou dano material. "
        "O réu impugna especificamente todos os fatos alegados, pois não correspondem à verdade. "
        "Refuta e nega os fundamentos da inicial, que carecem de veracidade.\n\n"
        "DAS PRELIMINARES\n\nA peça inicial padece de inépcia (art. 337 CPC). "
        "Preliminarmente, a parte autora não demonstrou legitimidade ativa.\n\n"
        "DO MÉRITO\n\nA pretensão autoral é improcedente. Não existe nexo causal. "
        "O art. 341 CPC impõe ao réu o ônus de impugnar especificamente cada alegação. "
        "O réu contesta o pedido de forma específica e refuta cada ponto.\n\n"
        "DOS PEDIDOS\n\nRequer a total improcedência dos pedidos do autor, "
        "com condenação em honorários advocatícios (art. 85 CPC).\n\n"
        "As provas documentais acostadas demonstram a inocorrência dos fatos. "
        "[Fonte: contrato] [Fonte: nota fiscal]\n\n"
        "Pede deferimento.\n\n" + "\n\n".join(["p"] * 6)
    )

    def test_has_sintese_inicial(self):
        assert run_rule(CONTESTACAO_RULES, "has_sintese_inicial", self.TEXT) is True

    def test_has_preliminares(self):
        assert run_rule(CONTESTACAO_RULES, "has_preliminares", self.TEXT) is True

    def test_has_merito(self):
        assert run_rule(CONTESTACAO_RULES, "has_merito", self.TEXT) is True

    def test_has_pedidos(self):
        assert run_rule(CONTESTACAO_RULES, "has_pedidos", self.TEXT) is True

    def test_impugnacao_especifica(self):
        assert run_rule(CONTESTACAO_RULES, "impugnacao_especifica", self.TEXT) is True

    def test_impugnacao_fail_without_markers(self):
        text = "Texto sem impugnação específica dos fatos alegados."
        assert run_rule(CONTESTACAO_RULES, "impugnacao_especifica", text) is False

    def test_has_closing_request(self):
        assert run_rule(CONTESTACAO_RULES, "has_closing_request", self.TEXT) is True

    def test_no_lei_8666(self):
        assert run_rule(CONTESTACAO_RULES, "no_lei_8666", self.TEXT) is True

    def test_no_lei_8666_fail(self):
        text = self.TEXT + " conforme Lei 8.666/93"
        assert run_rule(CONTESTACAO_RULES, "no_lei_8666", text) is False


# ── Recurso quality rules ──────────────────────────────────────────────────────

class TestRecursoQualityRules:
    TEXT = (
        "APELAÇÃO CÍVEL\n\n"
        "DA TEMPESTIVIDADE\n\nO presente recurso é tempestivo, tendo sido interposto dentro do prazo legal "
        "de 15 dias úteis previsto no art. 1.003 do CPC. [Fonte: certidão]\n\n"
        "DO CABIMENTO\n\nCabe apelação da sentença que julgou o feito (art. 1.009 CPC). "
        "A decisão recorrida merece reforma, pois o juízo equivocou-se na apreciação da prova. "
        "A sentença recorrida contrariou a jurisprudência pacífica do STJ.\n\n"
        "DAS RAZÕES DO RECURSO\n\nA sentença contém erro in judicando ao desconsiderar prova documental "
        "que demonstrava o direito do recorrente. A violação ao art. 371 CPC é manifesta. "
        "[Fonte: STJ resp 1234]\n\n"
        "DO PREPARO\n\nO recorrente comprova o recolhimento das custas recursais conforme guia acostada. "
        "O preparo foi efetuado tempestivamente.\n\n"
        "DOS PEDIDOS\n\nRequer o conhecimento e provimento do presente recurso "
        "para reforma da sentença recorrida.\n\n" + "\n\n".join(["p"] * 5)
    )

    def test_identifies_recurso_type(self):
        assert run_rule(RECURSO_RULES, "identifies_recurso_type", self.TEXT) is True

    def test_identifies_recurso_type_fail(self):
        assert run_rule(RECURSO_RULES, "identifies_recurso_type", "texto sem tipo recursal") is False

    def test_has_tempestividade(self):
        assert run_rule(RECURSO_RULES, "has_tempestividade", self.TEXT) is True

    def test_has_preparo(self):
        assert run_rule(RECURSO_RULES, "has_preparo", self.TEXT) is True

    def test_demonstrates_error(self):
        assert run_rule(RECURSO_RULES, "demonstrates_error", self.TEXT) is True

    def test_no_lei_8666(self):
        assert run_rule(RECURSO_RULES, "no_lei_8666", self.TEXT) is True


# ── Sentença quality rules ─────────────────────────────────────────────────────

class TestSentencaQualityRules:
    TEXT = (
        "RELATÓRIO\n\nTrata-se de ação proposta por João contra Maria. "
        "O autor alega que a ré causou dano material. "
        "A ré contestou os fatos e apresentou provas documentais. "
        "As partes são João da Silva (autor) e Maria Santos (ré). "
        "Vieram os autos conclusos para sentença.\n\n"
        "FUNDAMENTAÇÃO\n\nNo caso concreto, a pretensão autoral merece acolhimento. "
        "O Código Civil, art. 186, estabelece que causa dano ilícito quem viola direito. "
        "Verifica-se que o nexo causal está comprovado pelos documentos juntados. "
        "Na hipótese, foram enfrentados todos os argumentos relevantes das partes. "
        "Aplica-se a responsabilidade civil subjetiva do art. 927 CC. "
        "[Fonte: STJ] [Fonte: CC]\n\n"
        "Quanto à defesa, os argumentos da ré não procedem, pois contrariados pela prova "
        "documental. A contestação não trouxe elementos novos capazes de infirmar a pretensão.\n\n"
        "DISPOSITIVO\n\nDiante do exposto, JULGO PROCEDENTE o pedido formulado na inicial "
        "e condeno a ré ao pagamento de indenização. Condeno a ré nas custas e honorários. "
        "P.R.I.\n\n" + "\n\n".join(["p"] * 5)
    )

    def test_has_relatorio_completo(self):
        assert run_rule(SENTENCA_RULES, "has_relatorio_completo", self.TEXT) is True

    def test_has_relatorio_fail(self):
        assert run_rule(SENTENCA_RULES, "has_relatorio_completo", "sem relatório aqui") is False

    def test_has_fundamentacao_adequada(self):
        assert run_rule(SENTENCA_RULES, "has_fundamentacao_adequada", self.TEXT) is True

    def test_has_dispositivo_claro(self):
        assert run_rule(SENTENCA_RULES, "has_dispositivo_claro", self.TEXT) is True

    def test_has_dispositivo_fail(self):
        assert run_rule(SENTENCA_RULES, "has_dispositivo_claro", "sem dispositivo") is False

    def test_no_lei_8666(self):
        assert run_rule(SENTENCA_RULES, "no_lei_8666", self.TEXT) is True


# ── ACP quality rules ──────────────────────────────────────────────────────────

class TestAcaoCivilPublicaQualityRules:
    TEXT = (
        "EXCELENTÍSSIMO(A) SENHOR(A) JUIZ(A) DE DIREITO\n\n"
        "DA LEGITIMIDADE ATIVA DO MINISTÉRIO PÚBLICO\n\n"
        "O Ministério Público, na qualidade de legitimado ativo (art. 5º, I, Lei 7.347/85 "
        "e art. 129, III, CF), tem legitimidade para propor a presente ação. "
        "O MP instaurou inquérito civil para apurar os fatos. "
        "[Fonte: Lei 7.347/85]\n\n"
        "DA COMPETÊNCIA\n\nA competência para julgamento da ACP é do foro do local "
        "onde ocorreu o dano (art. 2º Lei 7.347/85). O interesse difuso tutelado "
        "justifica a competência deste juízo.\n\n"
        "DOS FATOS\n\nA empresa ré lançou efluentes no rio, causando dano ambiental "
        "de interesse difuso e coletivo. O inquérito civil apurou os fatos com rigor. "
        "[Fonte: laudo técnico]\n\n"
        "DO DIREITO\n\nA Lei 7.347/85, em seu art. 3º, autoriza a condenação em obrigação "
        "de fazer para cessação do dano ambiental. O CDC (Lei 8.078/90) complementa "
        "a proteção dos interesses difusos.\n\n"
        "DA TUTELA DE URGÊNCIA\n\nPresentes os requisitos do art. 300 CPC, "
        "requer-se tutela de urgência para cessação imediata do dano.\n\n"
        "DOS PEDIDOS\n\nRequer a condenação da ré em obrigação de fazer (cessar poluição) "
        "e em dano moral coletivo. Valor da causa: R$ 500.000,00.\n\n"
        + "\n\n".join(["p"] * 5)
    )

    def test_legitimidade_ativa(self):
        assert run_rule(ACP_RULES, "legitimidade_ativa", self.TEXT) is True

    def test_competencia(self):
        assert run_rule(ACP_RULES, "competencia", self.TEXT) is True

    def test_interesse_identificado(self):
        assert run_rule(ACP_RULES, "interesse_identificado", self.TEXT) is True

    def test_tutela_adequada(self):
        assert run_rule(ACP_RULES, "tutela_adequada", self.TEXT) is True

    def test_no_lei_8666(self):
        assert run_rule(ACP_RULES, "no_lei_8666", self.TEXT) is True

    def test_no_lei_8666_fail(self):
        text = self.TEXT + " conforme Lei 8.666/93"
        assert run_rule(ACP_RULES, "no_lei_8666", text) is False


# ── Embargos de Declaração quality rules ───────────────────────────────────────

class TestEmbargosDeclaracaoQualityRules:
    TEXT = (
        "EMBARGOS DE DECLARAÇÃO\n\n"
        "DECISÃO EMBARGADA: Acórdão proferido pela 1ª Câmara Cível.\n\n"
        "O embargante aponta OMISSÃO no julgado, uma vez que o acórdão não enfrentou "
        "questão relevante suscitada nas razões de apelação.\n\n"
        "FUNDAMENTAÇÃO: O art. 1.022 do CPC prevê o cabimento dos embargos quando "
        "houver omissão, contradição ou obscuridade no julgado.\n\n"
        "PEDIDO: Requer o acolhimento dos presentes embargos para SANAR a omissão apontada.\n\n"
        "Serve, ainda, para fins de PREQUESTIONAMENTO da matéria constitucional, nos termos "
        "do art. 1.025 do CPC.\n\n" + "x " * 500
    )

    def test_has_decisao_embargada(self):
        assert run_rule(EMBARGOS_RULES, "has_decisao_embargada", self.TEXT) is True

    def test_has_vicio(self):
        assert run_rule(EMBARGOS_RULES, "has_vicio", self.TEXT) is True

    def test_has_fundamentacao(self):
        assert run_rule(EMBARGOS_RULES, "has_fundamentacao", self.TEXT) is True

    def test_has_pedido(self):
        assert run_rule(EMBARGOS_RULES, "has_pedido", self.TEXT) is True

    def test_has_prequestionamento_pass(self):
        assert run_rule(EMBARGOS_RULES, "has_prequestionamento", self.TEXT) is True

    def test_has_prequestionamento_fail(self):
        """After fixing 'or True' bug, text without prequestionamento terms should fail."""
        text = "Texto simples sem termos relevantes para esta verificação."
        assert run_rule(EMBARGOS_RULES, "has_prequestionamento", text) is False

    def test_empty_text_scores_low(self):
        """Empty text should not score high — validates no vacuous passes."""
        score = compute_score(EMBARGOS_RULES, "", {})
        assert score < 30


# ── Agravo quality rules ──────────────────────────────────────────────────────

class TestAgravoQualityRules:
    TEXT = (
        "AGRAVO DE INSTRUMENTO\n\n"
        "DECISÃO AGRAVADA: Decisão interlocutória que indeferiu tutela de urgência.\n\n"
        "DO CABIMENTO: O presente recurso é cabível com fundamento no art. 1.015 CPC.\n\n"
        "FUNDAMENTAÇÃO: O agravante demonstra que a decisão merece reforma.\n\n"
        "PEDIDO DE EFEITO SUSPENSIVO: Requer a concessão de efeito suspensivo.\n\n"
        "PEDIDO DE PROVIMENTO: Requer o provimento do agravo para reforma da decisão.\n\n"
        + "x " * 900
    )

    def test_has_decisao_agravada(self):
        assert run_rule(AGRAVO_RULES, "has_decisao_agravada", self.TEXT) is True

    def test_has_cabimento(self):
        assert run_rule(AGRAVO_RULES, "has_cabimento", self.TEXT) is True

    def test_has_fundamentacao(self):
        assert run_rule(AGRAVO_RULES, "has_fundamentacao", self.TEXT) is True

    def test_has_pedido_efeito(self):
        assert run_rule(AGRAVO_RULES, "has_pedido_efeito", self.TEXT) is True

    def test_has_pedido_provimento(self):
        assert run_rule(AGRAVO_RULES, "has_pedido_provimento", self.TEXT) is True


# ── Habeas Corpus quality rules ───────────────────────────────────────────────

class TestHabeasCorpusQualityRules:
    TEXT = (
        "HABEAS CORPUS\n\n"
        "PACIENTE: João da Silva, preso preventivamente.\n\n"
        "AUTORIDADE COATORA: Juiz da 1ª Vara Criminal.\n\n"
        "Demonstra-se CONSTRANGIMENTO ILEGAL na prisão decretada sem fundamentação.\n\n"
        "Art. 5º, LXVIII, CF e arts. 647-648 CPP.\n\n"
        "Requer a concessão de LIMINAR para expedição de alvará de soltura.\n\n"
        + "x " * 600
    )

    def test_has_paciente(self):
        assert run_rule(HC_RULES, "has_paciente", self.TEXT) is True

    def test_has_autoridade_coatora(self):
        assert run_rule(HC_RULES, "has_autoridade_coatora", self.TEXT) is True

    def test_has_constrangimento(self):
        assert run_rule(HC_RULES, "has_constrangimento", self.TEXT) is True

    def test_has_pedido_liminar(self):
        assert run_rule(HC_RULES, "has_pedido_liminar", self.TEXT) is True


# ── Mandado de Segurança quality rules ────────────────────────────────────────

class TestMandadoSegurancaQualityRules:
    TEXT = (
        "MANDADO DE SEGURANÇA\n\n"
        "Visa a proteção de DIREITO LÍQUIDO E CERTO violado pela AUTORIDADE COATORA.\n\n"
        "FUNDAMENTAÇÃO jurídica: A Lei 12.016/09 disciplina o mandado de segurança.\n\n"
        "PEDIDO de concessão de LIMINAR e segurança definitiva.\n\n"
        + "x " * 900
    )

    def test_has_direito_liquido_certo(self):
        assert run_rule(MS_RULES, "has_direito_liquido_certo", self.TEXT) is True

    def test_has_autoridade_coatora(self):
        assert run_rule(MS_RULES, "has_autoridade_coatora", self.TEXT) is True

    def test_has_fundamentacao(self):
        assert run_rule(MS_RULES, "has_fundamentacao", self.TEXT) is True

    def test_has_pedido_liminar(self):
        assert run_rule(MS_RULES, "has_pedido_liminar", self.TEXT) is True

    def test_cites_lei_12016(self):
        assert run_rule(MS_RULES, "cites_lei_12016", self.TEXT) is True


# ── Structural tests for all document types (expanded) ─────────────────────────

class TestAllDocTypeStructure:
    """Ensure all 10 document type rule sets have valid structure."""

    @pytest.mark.parametrize("rules,name", [
        (EMBARGOS_RULES, "embargos"),
        (HC_RULES, "habeas_corpus"),
        (MS_RULES, "mandado_seguranca"),
        (AGRAVO_RULES, "agravo"),
    ])
    def test_simplified_rules_non_empty(self, rules, name):
        assert isinstance(rules, list)
        assert len(rules) >= 5, f"{name} has fewer than 5 quality rules"

    @pytest.mark.parametrize("rules,name", [
        (EMBARGOS_RULES, "embargos"),
        (HC_RULES, "habeas_corpus"),
        (MS_RULES, "mandado_seguranca"),
        (AGRAVO_RULES, "agravo"),
    ])
    def test_simplified_rules_have_required_keys(self, rules, name):
        for rule in rules:
            assert "id" in rule, f"{name}: rule missing 'id'"
            assert "description" in rule, f"{name}: rule '{rule.get('id')}' missing description"
            assert "check" in rule, f"{name}: rule '{rule.get('id')}' missing check"
            assert "weight" in rule, f"{name}: rule '{rule.get('id')}' missing weight"
            assert callable(rule["check"]), f"{name}: rule '{rule.get('id')}' check not callable"
            assert rule["weight"] > 0, f"{name}: rule '{rule.get('id')}' weight must be > 0"

    @pytest.mark.parametrize("rules,name", [
        (EMBARGOS_RULES, "embargos"),
        (HC_RULES, "habeas_corpus"),
        (MS_RULES, "mandado_seguranca"),
        (AGRAVO_RULES, "agravo"),
    ])
    def test_simplified_no_duplicate_ids(self, rules, name):
        ids = [r["id"] for r in rules]
        assert len(ids) == len(set(ids)), f"{name}: duplicate rule IDs found"
