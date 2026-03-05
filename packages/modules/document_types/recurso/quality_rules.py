"""Lexio Module — Recurso: Quality rules specific to judicial appeals."""

import re

QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "Recurso deve ter pelo menos 2500 caracteres",
        "check": lambda text, ctx: len(text) >= 2500,
        "weight": 10,
    },
    {
        "id": "identifies_recurso_type",
        "description": "Deve identificar o tipo de recurso (apelação, agravo ou embargos)",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in ["APELAÇÃO", "APELACAO", "AGRAVO", "EMBARGOS"]
        ),
        "weight": 12,
    },
    {
        "id": "has_tempestividade",
        "description": "Deve abordar tempestividade do recurso",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in [
                "tempestiv", "prazo", "intempestiv",
                "dentro do prazo", "no prazo legal",
                "dias úteis", "dias uteis",
            ]
        ),
        "weight": 10,
    },
    {
        "id": "has_preparo",
        "description": "Deve fazer referência ao preparo recursal ou dispensa",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in [
                "preparo", "custas recursais", "custas recursa",
                "guia de recolhimento", "isento de preparo",
                "dispensado o preparo", "gratuidade",
                "justiça gratuita", "assistência judiciária",
            ]
        ),
        "weight": 8,
    },
    {
        "id": "demonstrates_error",
        "description": "Deve demonstrar erro na decisão recorrida",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in [
                "erro", "equívoco", "equivoco",
                "decisão recorrida", "sentença recorrida",
                "merece reforma", "deve ser reformad",
                "mal apreciou", "não observou",
                "violação", "violacao", "afronta",
                "contrari", "ilegalidade",
            ]
        ),
        "weight": 12,
    },
    {
        "id": "has_prequestionamento",
        "description": "Deve conter prequestionamento para tribunais superiores quando aplicável",
        "check": lambda text, ctx: _check_prequestionamento(text, ctx),
        "weight": 8,
    },
    {
        "id": "has_legal_citations",
        "description": "Deve citar dispositivos legais que fundamentam a reforma/anulação",
        "check": lambda text, ctx: _check_legal_citations(text),
        "weight": 12,
    },
    {
        "id": "has_dos_fatos",
        "description": "Deve conter seção DOS FATOS ou equivalente",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in [
                "DOS FATOS", "DA SÍNTESE FÁTICA", "DA SINTESE FATICA",
                "BREVE RELATO", "DO RELATÓRIO", "DO RELATORIO",
            ]
        ),
        "weight": 10,
    },
    {
        "id": "has_cabimento",
        "description": "Deve conter seção DO CABIMENTO ou DO DIREITO",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in [
                "DO CABIMENTO", "DA ADMISSIBILIDADE",
                "DO DIREITO", "DAS RAZÕES", "DAS RAZOES",
            ]
        ),
        "weight": 10,
    },
    {
        "id": "has_pedidos",
        "description": "Deve conter seção DOS PEDIDOS com requerimento de provimento",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in [
                "DOS PEDIDOS", "DO PEDIDO", "REQUER",
                "PROVIMENTO", "PREQUESTIONA",
            ]
        ),
        "weight": 10,
    },
    {
        "id": "has_provimento_request",
        "description": "Deve conter pedido de provimento ou reforma explícito",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in [
                "dar provimento", "seja dado provimento",
                "reforma da", "reformar a",
                "anular a", "anulação da",
                "cassar a", "cassação da",
                "seja reformada", "seja anulada",
                "seja cassada",
            ]
        ),
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
        "description": "Deve ter pelo menos 6 parágrafos separados",
        "check": lambda text, ctx: text.count("\n\n") >= 6,
        "weight": 5,
    },
    {
        "id": "no_lei_8666",
        "description": "Lei 8.666/93 está REVOGADA — não deve ser citada",
        "check": lambda text, ctx: "8.666" not in text,
        "weight": 10,
    },
    {
        "id": "cpc_reference",
        "description": "Deve referenciar CPC/2015 (artigos recursais)",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in [
                "cpc", "código de processo civil",
                "codigo de processo civil",
                "lei 13.105", "lei n. 13.105",
                "lei nº 13.105",
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


def _check_prequestionamento(text: str, ctx: dict) -> bool:
    """Check prequestionamento when recurso targets superior courts."""
    text_upper = text.upper()
    # If the appeal is directed to STF/STJ, prequestionamento is mandatory
    targets_superior = any(
        term in text_upper
        for term in ["STF", "STJ", "RECURSO ESPECIAL", "RECURSO EXTRAORDINÁRIO",
                      "RECURSO EXTRAORDINARIO"]
    )
    if not targets_superior:
        return True  # Not required for regular appeals
    return any(
        term in text.lower()
        for term in ["prequestion", "prequestiona", "prequestionamento"]
    )


def _check_legal_citations(text: str) -> bool:
    """Check that the appeal cites legal provisions supporting reform/annulment."""
    text_lower = text.lower()
    citation_patterns = [
        r"art\.\s*\d+",
        r"artigo\s+\d+",
        r"lei\s+(?:n[.ºo°]\s*)?\d+",
        r"súmula\s+(?:n[.ºo°]\s*)?\d+",
        r"sumula\s+(?:n[.ºo°]\s*)?\d+",
        r"constituição\s+federal",
        r"constituicao\s+federal",
        r"decreto",
    ]
    matches = sum(1 for p in citation_patterns if re.search(p, text_lower))
    return matches >= 2


def _check_connectives(text: str) -> bool:
    """Check that no connective appears more than 2 times."""
    conectivos = [
        "nesse sentido", "outrossim", "com efeito", "nessa esteira",
        "dessa sorte", "ademais", "importa destacar", "cumpre observar",
        "de outro lado", "por sua vez", "nessa perspectiva", "destarte",
        "vale dizer", "em suma", "assim sendo", "convém ressaltar",
        "sob essa ótica", "de igual modo", "data venia", "s.m.j.",
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
