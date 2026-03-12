"""Lexio Module — Agravo de Instrumento: Quality rules."""

QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "Agravo deve ter pelo menos 2500 caracteres",
        "check": lambda text, ctx: len(text) >= 2500,
        "weight": 10,
    },
    {
        "id": "has_decisao_agravada",
        "description": "Deve indicar decisão agravada",
        "check": lambda text, ctx: 'DECISÃO AGRAVADA' in text.upper() or 'DECISÃO RECORRIDA' in text.upper() or 'DECISÃO INTERLOCUTÓRIA' in text.upper(),
        "weight": 12,
    },
    {
        "id": "has_cabimento",
        "description": "Deve demonstrar cabimento (art. 1.015 CPC)",
        "check": lambda text, ctx: '1.015' in text or 'CABIMENTO' in text.upper() or 'HIPÓTESE' in text.upper(),
        "weight": 12,
    },
    {
        "id": "has_fundamentacao",
        "description": "Deve conter fundamentação",
        "check": lambda text, ctx: 'FUNDAMENTAÇÃO' in text.upper() or 'RAZÕES' in text.upper() or 'DO DIREITO' in text.upper(),
        "weight": 10,
    },
    {
        "id": "has_pedido_efeito",
        "description": "Deve pedir efeito suspensivo ou antecipação de tutela recursal",
        "check": lambda text, ctx: 'EFEITO SUSPENSIVO' in text.upper() or 'TUTELA RECURSAL' in text.upper() or 'ANTECIPAÇÃO' in text.upper(),
        "weight": 10,
    },
    {
        "id": "has_pedido_provimento",
        "description": "Deve pedir provimento do recurso",
        "check": lambda text, ctx: 'PROVIMENTO' in text.upper() or 'REFORMA' in text.upper() or 'CASSAÇÃO' in text.upper(),
        "weight": 8,
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
