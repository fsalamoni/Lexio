"""Lexio Module — Sentenca: Quality rules specific to judicial sentences."""

import re

QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "Sentença deve ter pelo menos 3000 caracteres",
        "check": lambda text, ctx: len(text) >= 3000,
        "weight": 10,
    },
    {
        "id": "has_relatorio_completo",
        "description": "Deve conter seção RELATÓRIO com identificação das partes e resumo dos fatos",
        "check": lambda text, ctx: (
            ("RELATÓRIO" in text.upper() or "RELATORIO" in text.upper())
            and _check_relatorio_completo(text)
        ),
        "weight": 12,
    },
    {
        "id": "has_fundamentacao_adequada",
        "description": "Deve conter FUNDAMENTAÇÃO com enfrentamento de todos os argumentos (art. 489 §1º CPC)",
        "check": lambda text, ctx: (
            ("FUNDAMENTAÇÃO" in text.upper() or "FUNDAMENTACAO" in text.upper())
            and _check_fundamentacao_adequada(text)
        ),
        "weight": 15,
    },
    {
        "id": "has_dispositivo_claro",
        "description": "Deve conter DISPOSITIVO com comando decisório claro (procedente/improcedente/extinto)",
        "check": lambda text, ctx: (
            ("DISPOSITIVO" in text.upper() or "DISPOSIÇÃO" in text.upper())
            and _check_dispositivo_claro(text)
        ),
        "weight": 15,
    },
    {
        "id": "coerencia_fundamentacao_dispositivo",
        "description": "Fundamentação e dispositivo devem ser coerentes entre si",
        "check": lambda text, ctx: _check_coerencia(text),
        "weight": 12,
    },
    {
        "id": "referencia_provas",
        "description": "Deve fazer referência às provas dos autos",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in [
                "prova", "provas", "documento", "testemunha", "perícia",
                "laudo", "certidão", "atestado", "depoimento", "fls.",
                "folhas", "autos", "instrução processual",
            ]
        ),
        "weight": 10,
    },
    {
        "id": "custas_honorarios",
        "description": "Deve conter condenação em custas processuais e honorários advocatícios",
        "check": lambda text, ctx: (
            _check_custas(text) and _check_honorarios(text)
        ),
        "weight": 10,
    },
    {
        "id": "has_legal_basis",
        "description": "Deve citar base legal (art., lei, CPC, CF)",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in ["art.", "lei ", "código de processo civil", "cpc", "constituição", "súmula"]
        ),
        "weight": 10,
    },
    {
        "id": "no_lei_8666",
        "description": "Lei 8.666/93 está REVOGADA — não deve ser citada",
        "check": lambda text, ctx: "8.666" not in text,
        "weight": 8,
    },
    {
        "id": "no_truncation",
        "description": "Sem frases truncadas no final",
        "check": lambda text, ctx: not text.rstrip().endswith(("...", "…")),
        "weight": 5,
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
        "id": "tema_relevance",
        "description": "Tema deve aparecer no texto (relevância)",
        "check": lambda text, ctx: _check_tema_relevance(text, ctx),
        "weight": 5,
    },
]


def _check_relatorio_completo(text: str) -> bool:
    """Check that RELATÓRIO section has party identification and case summary."""
    text_lower = text.lower()
    # Must have at least party references
    has_parties = any(
        term in text_lower
        for term in ["autor", "autora", "requerente", "réu", "ré", "requerido", "requerida"]
    )
    # Must have some procedural context
    has_context = any(
        term in text_lower
        for term in ["ação", "inicial", "contestação", "pretensão", "autos", "processo"]
    )
    return has_parties and has_context


def _check_fundamentacao_adequada(text: str) -> bool:
    """Check fundamentação meets art. 489 §1º CPC requirements."""
    text_lower = text.lower()
    # Must not merely cite law without explaining
    has_application = any(
        term in text_lower
        for term in [
            "no caso concreto", "no caso em tela", "na hipótese",
            "in casu", "aplica-se", "verifica-se que", "constata-se",
            "na espécie", "no presente caso",
        ]
    )
    # Must reference specific legal norms
    has_norms = bool(re.search(r'art\.\s*\d+', text_lower))
    return has_application and has_norms


def _check_dispositivo_claro(text: str) -> bool:
    """Check that DISPOSITIVO has a clear decisory command."""
    text_lower = text.lower()
    return any(
        term in text_lower
        for term in [
            "julgo procedente", "julgo improcedente",
            "julgo parcialmente procedente", "julgo extinto",
            "acolho o pedido", "rejeito o pedido",
            "condeno", "declaro", "determino",
            "julgo procedentes", "julgo improcedentes",
        ]
    )


def _check_coerencia(text: str) -> bool:
    """Check coherence between fundamentação and dispositivo."""
    text_lower = text.lower()
    # If fundamentação discusses right being proven, dispositivo should be procedente
    fund_positive = any(
        term in text_lower
        for term in ["restou comprovado", "logrou êxito", "demonstrou", "ficou provado"]
    )
    disp_positive = any(
        term in text_lower
        for term in ["julgo procedente", "acolho", "condeno"]
    )
    fund_negative = any(
        term in text_lower
        for term in ["não comprovou", "não demonstrou", "não logrou", "não restou"]
    )
    disp_negative = any(
        term in text_lower
        for term in ["julgo improcedente", "rejeito", "julgo extinto"]
    )
    # Coherent if both positive, both negative, or partial
    if fund_positive and disp_negative and not fund_negative:
        return False
    if fund_negative and disp_positive and not fund_positive:
        return False
    return True


def _check_custas(text: str) -> bool:
    """Check that custas processuais are addressed."""
    text_lower = text.lower()
    return any(
        term in text_lower
        for term in ["custas processuais", "custas", "despesas processuais"]
    )


def _check_honorarios(text: str) -> bool:
    """Check that honorários advocatícios are addressed."""
    text_lower = text.lower()
    return any(
        term in text_lower
        for term in ["honorários advocatícios", "honorários", "verba honorária"]
    )


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
