"""Lexio Module — Petição Inicial: Quality rules specific to initial petitions."""

import re


QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "Petição deve ter pelo menos 3000 caracteres",
        "check": lambda text, ctx: len(text) >= 3000,
        "weight": 10,
    },
    {
        "id": "has_qualificacao_partes",
        "description": "Deve conter qualificação das partes (autor/réu)",
        "check": lambda text, ctx: _check_qualificacao(text),
        "weight": 12,
    },
    {
        "id": "has_competencia",
        "description": "Deve fundamentar a competência do juízo",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in ["COMPETÊNCIA", "COMPETENCIA", "COMPETENTE"]
        ),
        "weight": 8,
    },
    {
        "id": "has_valor_causa",
        "description": "Deve indicar valor da causa (CPC art. 292)",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in ["VALOR DA CAUSA", "DÁ-SE À CAUSA O VALOR", "DA-SE A CAUSA O VALOR",
                         "ATRIBUI-SE À CAUSA", "ATRIBUI-SE A CAUSA"]
        ),
        "weight": 10,
    },
    {
        "id": "has_fatos",
        "description": "Deve conter seção DOS FATOS ou DA NARRATIVA FÁTICA",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in ["DOS FATOS", "DA NARRATIVA FÁTICA", "DA NARRATIVA FATICA",
                         "DOS FATOS E FUNDAMENTOS", "DA SÍNTESE FÁTICA", "DA SINTESE FATICA"]
        ),
        "weight": 10,
    },
    {
        "id": "has_direito",
        "description": "Deve conter seção DO DIREITO ou DA FUNDAMENTAÇÃO JURÍDICA",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in ["DO DIREITO", "DA FUNDAMENTAÇÃO JURÍDICA", "DA FUNDAMENTACAO JURIDICA",
                         "DOS FUNDAMENTOS JURÍDICOS", "DOS FUNDAMENTOS JURIDICOS"]
        ),
        "weight": 10,
    },
    {
        "id": "has_pedidos",
        "description": "Deve conter seção DOS PEDIDOS com pedidos claros",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in ["DOS PEDIDOS", "DO PEDIDO", "REQUER", "REQUERER"]
        ),
        "weight": 12,
    },
    {
        "id": "has_legal_basis",
        "description": "Deve citar base legal (art., lei, CPC, CF)",
        "check": lambda text, ctx: any(
            term in text.lower() for term in ["art.", "lei ", "decreto", "constituição", "súmula", "cpc"]
        ),
        "weight": 10,
    },
    {
        "id": "has_cpc_reference",
        "description": "Deve referenciar o CPC/2015 (arts. 319-320)",
        "check": lambda text, ctx: "cpc" in text.lower() or "código de processo civil" in text.lower()
            or "codigo de processo civil" in text.lower(),
        "weight": 5,
    },
    {
        "id": "has_closing",
        "description": "Deve conter fecho (Termos em que pede deferimento / Nestes termos)",
        "check": lambda text, ctx: any(
            term in text.lower()
            for term in ["pede deferimento", "nestes termos", "termos em que"]
        ),
        "weight": 8,
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
        "id": "argumentative_structure",
        "description": "Deve ter estrutura argumentativa lógica (premissa-conclusão)",
        "check": lambda text, ctx: _check_argumentative_structure(text),
        "weight": 8,
    },
    {
        "id": "tema_relevance",
        "description": "Tema deve aparecer no texto (relevância)",
        "check": lambda text, ctx: _check_tema_relevance(text, ctx),
        "weight": 5,
    },
]


def _check_qualificacao(text: str) -> bool:
    """Check that the petition contains proper party qualification."""
    text_lower = text.lower()
    # Must have at least author identification
    has_author = any(
        term in text_lower
        for term in ["autor", "requerente", "demandante", "suplicante", "postulante"]
    )
    # Must have qualification elements
    has_qualification_data = any(
        term in text_lower
        for term in ["cpf", "cnpj", "inscrito", "portador", "residente", "domiciliado",
                      "nacionalidade", "estado civil", "profissão", "profissao"]
    )
    return has_author and has_qualification_data


def _check_connectives(text: str) -> bool:
    """Check that no connective appears more than 2 times."""
    conectivos = [
        "nesse sentido", "outrossim", "com efeito", "nessa esteira",
        "dessa sorte", "ademais", "importa destacar", "cumpre observar",
        "de outro lado", "por sua vez", "nessa perspectiva", "destarte",
        "vale dizer", "em suma", "assim sendo", "convém ressaltar",
        "sob essa ótica", "de igual modo", "data venia", "in casu",
        "ante o exposto", "diante do exposto", "posto isso",
    ]
    text_lower = text.lower()
    for c in conectivos:
        if text_lower.count(c) > 2:
            return False
    return True


def _check_argumentative_structure(text: str) -> bool:
    """Check that the petition has logical argumentative connectors."""
    text_lower = text.lower()
    argumentative_markers = [
        "portanto", "dessa forma", "assim", "logo", "consequentemente",
        "por conseguinte", "ante o exposto", "diante do exposto",
        "posto isso", "nesse contexto", "sendo assim",
    ]
    count = sum(1 for marker in argumentative_markers if marker in text_lower)
    return count >= 2


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
