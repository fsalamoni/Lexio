"""Lexio Module — Acao Civil Publica: Quality rules specific to public civil actions."""


QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "ACP deve ter pelo menos 4000 caracteres",
        "check": lambda text, ctx: len(text) >= 4000,
        "weight": 10,
    },
    {
        "id": "legitimidade_ativa",
        "description": "Deve demonstrar legitimidade ativa do autor (art. 5º Lei 7.347/85)",
        "check": lambda text, ctx: _check_legitimidade_ativa(text),
        "weight": 15,
    },
    {
        "id": "competencia",
        "description": "Deve indicar a competência do juízo (art. 2º Lei 7.347/85)",
        "check": lambda text, ctx: _check_competencia(text),
        "weight": 10,
    },
    {
        "id": "interesse_identificado",
        "description": "Deve identificar interesse difuso, coletivo ou individual homogêneo",
        "check": lambda text, ctx: _check_interesse_transindividual(text),
        "weight": 15,
    },
    {
        "id": "inquerito_civil_reference",
        "description": "Deve fazer referência ao inquérito civil ou procedimento preparatório",
        "check": lambda text, ctx: _check_inquerito_civil(text),
        "weight": 10,
    },
    {
        "id": "tutela_adequada",
        "description": "Deve conter pedido de tutela adequada (obrigação de fazer/não fazer, condenação em dinheiro)",
        "check": lambda text, ctx: _check_tutela_adequada(text),
        "weight": 12,
    },
    {
        "id": "dano_moral_coletivo",
        "description": "Deve avaliar pedido de dano moral coletivo quando aplicável",
        "check": lambda text, ctx: _check_dano_moral_coletivo(text, ctx),
        "weight": 8,
    },
    {
        "id": "has_fatos",
        "description": "Deve conter seção DOS FATOS com narrativa circunstanciada",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in ["DOS FATOS", "DA SITUAÇÃO FÁTICA", "DO CONTEXTO FÁTICO"]
        ),
        "weight": 10,
    },
    {
        "id": "has_direito",
        "description": "Deve conter seção DO DIREITO com fundamentação legal",
        "check": lambda text, ctx: any(
            term in text.upper()
            for term in ["DO DIREITO", "DA FUNDAMENTAÇÃO JURÍDICA", "DO FUNDAMENTO JURÍDICO"]
        ),
        "weight": 10,
    },
    {
        "id": "has_pedidos",
        "description": "Deve conter seção DOS PEDIDOS com requerimentos específicos",
        "check": lambda text, ctx: "PEDIDO" in text.upper(),
        "weight": 12,
    },
    {
        "id": "has_legal_basis_acp",
        "description": "Deve citar Lei 7.347/85 (LACP)",
        "check": lambda text, ctx: "7.347" in text,
        "weight": 12,
    },
    {
        "id": "has_cf_art129",
        "description": "Deve citar CF art. 129 (funções institucionais do MP)",
        "check": lambda text, ctx: (
            "129" in text and ("constituição" in text.lower() or "cf" in text.lower())
        ),
        "weight": 8,
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
        "description": "Deve ter pelo menos 10 parágrafos separados",
        "check": lambda text, ctx: text.count("\n\n") >= 10,
        "weight": 5,
    },
    {
        "id": "tema_relevance",
        "description": "Tema deve aparecer no texto (relevância)",
        "check": lambda text, ctx: _check_tema_relevance(text, ctx),
        "weight": 5,
    },
]


def _check_legitimidade_ativa(text: str) -> bool:
    """Check that legitimidade ativa is demonstrated per art. 5 LACP."""
    text_lower = text.lower()
    # Must reference the legal basis for standing
    has_legitimidade_section = any(
        term in text_lower
        for term in [
            "legitimidade", "legitimado", "art. 5", "artigo 5",
            "lei 7.347", "ministério público",
        ]
    )
    # Must identify the specific legitimated entity
    has_entity = any(
        term in text_lower
        for term in [
            "ministério público", "mp", "promotor", "procurador",
            "defensoria", "união", "estado", "município",
            "autarquia", "empresa pública", "fundação",
            "associação", "sociedade de economia mista",
        ]
    )
    return has_legitimidade_section and has_entity


def _check_competencia(text: str) -> bool:
    """Check that jurisdictional competence is addressed."""
    text_lower = text.lower()
    return any(
        term in text_lower
        for term in [
            "competência", "competente", "foro", "comarca",
            "art. 2", "local do dano", "juízo",
        ]
    )


def _check_interesse_transindividual(text: str) -> bool:
    """Check that transindividual interest type is identified."""
    text_lower = text.lower()
    return any(
        term in text_lower
        for term in [
            "interesse difuso", "interesses difusos",
            "interesse coletivo", "interesses coletivos",
            "individual homogêneo", "individuais homogêneos",
            "direito difuso", "direitos difusos",
            "direito coletivo", "direitos coletivos",
            "transindividual", "transindividuais",
            "metaindividual", "metaindividuais",
        ]
    )


def _check_inquerito_civil(text: str) -> bool:
    """Check for reference to inquérito civil or preparatory procedure."""
    text_lower = text.lower()
    return any(
        term in text_lower
        for term in [
            "inquérito civil", "inquerito civil",
            "ic n", "ic nº",
            "procedimento preparatório", "procedimento administrativo",
            "procedimento investigatório",
            "notícia de fato",
        ]
    )


def _check_tutela_adequada(text: str) -> bool:
    """Check for adequate tutela request."""
    text_lower = text.lower()
    return any(
        term in text_lower
        for term in [
            "obrigação de fazer", "obrigação de não fazer",
            "condenação em dinheiro", "condenação pecuniária",
            "tutela específica", "tutela inibitória",
            "tutela de remoção do ilícito",
            "tutela de urgência", "tutela antecipada",
            "liminar", "medida cautelar",
        ]
    )


def _check_dano_moral_coletivo(text: str, ctx: dict) -> bool:
    """Check for dano moral coletivo assessment when applicable.

    This rule is more lenient — it passes if:
    1. Dano moral coletivo is mentioned, OR
    2. The context doesn't suggest it's applicable (no clear harm to community)
    """
    text_lower = text.lower()
    # If mentioned, it's addressed
    if any(
        term in text_lower
        for term in [
            "dano moral coletivo", "danos morais coletivos",
            "dano extrapatrimonial coletivo",
            "indenização por dano moral",
        ]
    ):
        return True
    # If tema suggests environmental or consumer harm, it should be mentioned
    tema = ctx.get("tema", "").lower()
    requires_dano_moral = any(
        term in tema
        for term in [
            "ambiental", "meio ambiente", "poluição", "contaminação",
            "consumidor", "propaganda enganosa", "produto defeituoso",
            "saúde pública", "patrimônio",
        ]
    )
    # If the tema strongly suggests it, require mention
    return not requires_dano_moral


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
