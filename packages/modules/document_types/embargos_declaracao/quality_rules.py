"""Lexio Module — Embargos de Declaração: Quality rules."""

QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "Embargos devem ter pelo menos 1500 caracteres",
        "check": lambda text, ctx: len(text) >= 1500,
        "weight": 10,
    },
    {
        "id": "has_decisao_embargada",
        "description": "Deve indicar decisão embargada",
        "check": lambda text, ctx: 'DECISÃO EMBARGADA' in text.upper() or 'ACÓRDÃO' in text.upper() or 'SENTENÇA EMBARGADA' in text.upper(),
        "weight": 12,
    },
    {
        "id": "has_vicio",
        "description": "Deve apontar omissão, contradição ou obscuridade",
        "check": lambda text, ctx: 'OMISSÃO' in text.upper() or 'CONTRADIÇÃO' in text.upper() or 'OBSCURIDADE' in text.upper(),
        "weight": 15,
    },
    {
        "id": "has_fundamentacao",
        "description": "Deve conter fundamentação",
        "check": lambda text, ctx: 'FUNDAMENTAÇÃO' in text.upper() or 'ART. 1.022' in text or '1.022' in text,
        "weight": 10,
    },
    {
        "id": "has_pedido",
        "description": "Deve conter pedido de sanação",
        "check": lambda text, ctx: 'SANAR' in text.upper() or 'ESCLARECER' in text.upper() or 'SUPRIR' in text.upper() or 'PEDIDO' in text.upper(),
        "weight": 10,
    },
    {
        "id": "has_prequestionamento",
        "description": "Deve conter prequestionamento (se aplicável)",
        "check": lambda text, ctx: 'PREQUESTIONAMENTO' in text.upper() or 'PREQUESTIONAR' in text.upper() or '1.025' in text or True,
        "weight": 5,
    },
]


def evaluate(text: str, context: dict | None = None) -> dict:
    """Evaluate document quality. Returns {"score": int, "passed": list, "failed": list}."""
    ctx = context or {}
    passed = []
    failed = []
    total_weight = 0
    earned = 0

    for rule in QUALITY_RULES:
        total_weight += rule["weight"]
        try:
            if rule["check"](text, ctx):
                passed.append(rule["id"])
                earned += rule["weight"]
            else:
                failed.append(rule["id"])
        except Exception:
            failed.append(rule["id"])

    score = int((earned / total_weight) * 100) if total_weight > 0 else 0
    return {"score": score, "passed": passed, "failed": failed}
