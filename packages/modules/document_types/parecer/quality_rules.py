"""Lexio Module — Parecer: Quality rules specific to legal opinions."""

import re

QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "Parecer deve ter pelo menos 2000 caracteres",
        "check": lambda text, ctx: len(text) >= 2000,
        "weight": 10,
    },
    {
        "id": "has_relatorio",
        "description": "Deve conter seção RELATÓRIO",
        "check": lambda text, ctx: "RELATÓRIO" in text.upper() or "RELATORIO" in text.upper(),
        "weight": 10,
    },
    {
        "id": "has_fundamentacao",
        "description": "Deve conter seção FUNDAMENTAÇÃO JURÍDICA",
        "check": lambda text, ctx: "FUNDAMENTAÇÃO" in text.upper() or "FUNDAMENTACAO" in text.upper(),
        "weight": 10,
    },
    {
        "id": "has_conclusao",
        "description": "Deve conter seção CONCLUSÃO",
        "check": lambda text, ctx: "CONCLUSÃO" in text.upper() or "CONCLUSAO" in text.upper(),
        "weight": 10,
    },
    {
        "id": "has_closing",
        "description": "Deve terminar com 'É o parecer, salvo melhor juízo.'",
        "check": lambda text, ctx: "salvo melhor juízo" in text.lower(),
        "weight": 8,
    },
    {
        "id": "has_legal_basis",
        "description": "Deve citar base legal (art., lei, decreto, CF)",
        "check": lambda text, ctx: any(
            term in text.lower() for term in ["art.", "lei ", "decreto", "constituição", "súmula"]
        ),
        "weight": 12,
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
        "weight": 10,
    },
    {
        "id": "connective_variety",
        "description": "Conectivos variados (nenhum repetido 3+ vezes)",
        "check": lambda text, ctx: _check_connectives(text),
        "weight": 5,
    },
    {
        "id": "proper_paragraphs",
        "description": "Deve ter pelo menos 5 parágrafos separados",
        "check": lambda text, ctx: text.count("\n\n") >= 5,
        "weight": 5,
    },
    {
        "id": "tema_relevance",
        "description": "Tema deve aparecer no texto (relevância)",
        "check": lambda text, ctx: _check_tema_relevance(text, ctx),
        "weight": 5,
    },
]


def _check_connectives(text: str) -> bool:
    """Check that no connective appears more than 2 times."""
    conectivos = [
        "nesse sentido", "outrossim", "com efeito", "nessa esteira",
        "dessa sorte", "ademais", "importa destacar", "cumpre observar",
        "de outro lado", "por sua vez", "nessa perspectiva", "destarte",
        "vale dizer", "em suma", "assim sendo", "convém ressaltar",
        "sob essa ótica", "de igual modo",
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
