"""Lexio Module — Mandado de Segurança: Quality rules."""

QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "Mandado deve ter pelo menos 2500 caracteres",
        "check": lambda text, ctx: len(text) >= 2500,
        "weight": 10,
    },
    {
        "id": "has_direito_liquido_certo",
        "description": "Deve demonstrar direito líquido e certo",
        "check": lambda text, ctx: 'DIREITO LÍQUIDO E CERTO' in text.upper() or 'LÍQUIDO E CERTO' in text.upper() or 'LIQUIDEZ E CERTEZA' in text.upper(),
        "weight": 15,
    },
    {
        "id": "has_autoridade_coatora",
        "description": "Deve identificar autoridade coatora",
        "check": lambda text, ctx: 'AUTORIDADE COATORA' in text.upper() or 'IMPETRADO' in text.upper() or 'AUTORIDADE IMPETRADA' in text.upper(),
        "weight": 12,
    },
    {
        "id": "has_fundamentacao",
        "description": "Deve conter fundamentação jurídica",
        "check": lambda text, ctx: 'FUNDAMENTAÇÃO' in text.upper() or 'FUNDAMENTOS' in text.upper() or 'DO DIREITO' in text.upper(),
        "weight": 12,
    },
    {
        "id": "has_pedido_liminar",
        "description": "Deve conter pedido (liminar e mérito)",
        "check": lambda text, ctx: 'LIMINAR' in text.upper() or 'MEDIDA LIMINAR' in text.upper() or 'PEDIDO' in text.upper(),
        "weight": 10,
    },
    {
        "id": "cites_lei_12016",
        "description": "Deve citar Lei 12.016/09 ou art. 5º LXIX CF",
        "check": lambda text, ctx: '12.016' in text or 'LXIX' in text.upper() or 'MANDADO DE SEGURANÇA' in text.upper(),
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
