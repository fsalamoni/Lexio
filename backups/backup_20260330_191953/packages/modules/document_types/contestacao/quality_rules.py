"""Lexio Module — Contestacao: Quality rules specific to defense/answer pleadings."""

import re

QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "Contestação deve ter pelo menos 3000 caracteres",
        "check": lambda text, ctx: len(text) >= 3000,
        "weight": 10,
    },
    {
        "id": "has_sintese_inicial",
        "description": "Deve conter seção DA SÍNTESE DA INICIAL ou DOS FATOS",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in ["SÍNTESE DA INICIAL", "SINTESE DA INICIAL", "DOS FATOS"]
        ),
        "weight": 10,
    },
    {
        "id": "has_preliminares",
        "description": "Deve conter seção DAS PRELIMINARES (art. 337 CPC)",
        "check": lambda text, ctx: "PRELIMINAR" in text.upper(),
        "weight": 8,
    },
    {
        "id": "has_merito",
        "description": "Deve conter seção DO MÉRITO",
        "check": lambda text, ctx: "MÉRITO" in text.upper() or "MERITO" in text.upper(),
        "weight": 12,
    },
    {
        "id": "has_pedidos",
        "description": "Deve conter seção DOS PEDIDOS ou DO PEDIDO",
        "check": lambda text, ctx: "PEDIDO" in text.upper(),
        "weight": 10,
    },
    {
        "id": "impugnacao_especifica",
        "description": "Deve conter impugnação específica dos fatos (art. 341 CPC)",
        "check": lambda text, ctx: _check_impugnacao_especifica(text),
        "weight": 12,
    },
    {
        "id": "has_legal_basis",
        "description": "Deve citar base legal (art., lei, CPC, CF, CC, CDC)",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in ["art.", "lei ", "código de processo civil", "cpc", "constituição", "súmula"]
        ),
        "weight": 12,
    },
    {
        "id": "cpc_reference",
        "description": "Deve fazer referência ao CPC/2015 (arts. 335-342)",
        "check": lambda text, ctx: _check_cpc_defense_articles(text),
        "weight": 8,
    },
    {
        "id": "has_closing_request",
        "description": "Deve conter pedido de improcedência dos pedidos do autor",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in [
                "improcedência", "improcedencia",
                "julgar improcedente", "total improcedência",
                "improcedentes os pedidos",
            ]
        ),
        "weight": 10,
    },
    {
        "id": "no_lei_8666",
        "description": "Lei 8.666/93 está REVOGADA — não deve ser citada",
        "check": lambda text, ctx: "8.666" not in text,
        "weight": 10,
    },
    {
        "id": "no_truncation",
        "description": "Sem frases truncadas no final",
        "check": lambda text, ctx: not text.rstrip().endswith(("...", "…")),
        "weight": 5,
    },
    {
        "id": "has_sources",
        "description": "Deve conter pelo menos 2 referências [Fonte:]",
        "check": lambda text, ctx: text.count("[Fonte:") >= 2,
        "weight": 8,
    },
    {
        "id": "connective_variety",
        "description": "Conectivos variados (nenhum repetido 3+ vezes)",
        "check": lambda text, ctx: _check_connectives(text),
        "weight": 5,
    },
    {
        "id": "proper_paragraphs",
        "description": "Deve ter pelo menos 8 parágrafos separados",
        "check": lambda text, ctx: text.count("\n\n") >= 8,
        "weight": 5,
    },
    {
        "id": "reconvencao_check",
        "description": "Se cabível, deve mencionar reconvenção (art. 343 CPC)",
        "check": lambda text, ctx: _check_reconvencao(text, ctx),
        "weight": 5,
    },
    {
        "id": "counter_evidence",
        "description": "Deve conter referências a provas ou evidências de defesa",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in [
                "prova", "documento", "testemunha", "perícia",
                "evidência", "evidencia", "comprovação", "comprovacao",
            ]
        ),
        "weight": 8,
    },
    {
        "id": "tema_relevance",
        "description": "Tema deve aparecer no texto (relevância)",
        "check": lambda text, ctx: _check_tema_relevance(text, ctx),
        "weight": 5,
    },
]


def _check_impugnacao_especifica(text: str) -> bool:
    """Check that the defense specifically addresses claims (art. 341 CPC).

    Verifies the presence of language indicating point-by-point rebuttal
    of the plaintiff's allegations, as required by art. 341 CPC which
    establishes the burden of specific challenge.
    """
    markers = [
        "impugna", "nega", "refuta", "rebate", "contesta",
        "não procede", "nao procede", "sem fundamento",
        "carece de veracidade", "inverídico", "inveridico",
        "não corresponde", "nao corresponde", "alegação improcedente",
        "alegacao improcedente", "ponto a ponto", "especificamente",
        "impugnação específica", "impugnacao especifica",
    ]
    text_lower = text.lower()
    matches = sum(1 for m in markers if m in text_lower)
    return matches >= 3


def _check_cpc_defense_articles(text: str) -> bool:
    """Check for references to CPC/2015 defense articles (335-342)."""
    defense_patterns = [
        r"art\.?\s*335", r"art\.?\s*336", r"art\.?\s*337",
        r"art\.?\s*338", r"art\.?\s*339", r"art\.?\s*340",
        r"art\.?\s*341", r"art\.?\s*342",
    ]
    text_lower = text.lower()
    for pattern in defense_patterns:
        if re.search(pattern, text_lower):
            return True
    return False


def _check_reconvencao(text: str, ctx: dict) -> bool:
    """Check for reconvencao mention when applicable.

    If the context indicates reconvencao is needed (via flag or keywords),
    checks that it is addressed. Otherwise passes automatically.
    """
    needs_reconvencao = ctx.get("reconvencao_necessaria", False)
    if not needs_reconvencao:
        return True
    reconvencao_terms = [
        "reconvenção", "reconvencao", "art. 343",
        "pedido contraposto", "demanda reconvencional",
    ]
    text_lower = text.lower()
    return any(term in text_lower for term in reconvencao_terms)


def _check_connectives(text: str) -> bool:
    """Check that no connective appears more than 2 times."""
    conectivos = [
        "nesse sentido", "outrossim", "com efeito", "nessa esteira",
        "dessa sorte", "ademais", "importa destacar", "cumpre observar",
        "de outro lado", "por sua vez", "nessa perspectiva", "destarte",
        "vale dizer", "em suma", "assim sendo", "convém ressaltar",
        "sob essa ótica", "de igual modo", "data venia", "salvo melhor juízo",
        "com a devida vênia", "não obstante", "malgrado", "conquanto",
    ]
    text_lower = text.lower()
    for c in conectivos:
        if text_lower.count(c) > 2:
            return False
    return True


def _check_tema_relevance(text: str, ctx: dict) -> bool:
    """Check that the theme keywords appear in the text."""
    tema = ctx.get("tema", "")
    if not tema:
        return True
    words = [w.lower() for w in tema.split() if len(w) > 3]
    if not words:
        return True
    matches = sum(1 for w in words if w in text.lower())
    return matches >= len(words) * 0.5
