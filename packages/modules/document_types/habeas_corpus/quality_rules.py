"""Lexio Module — Habeas Corpus: Quality rules."""

QUALITY_RULES = [
    {
        "id": "min_length",
        "description": "HC deve ter pelo menos 2000 caracteres",
        "check": lambda text, ctx: len(text) >= 2000,
        "weight": 10,
    },
    {
        "id": "has_paciente",
        "description": "Deve identificar o paciente",
        "check": lambda text, ctx: 'PACIENTE' in text.upper(),
        "weight": 15,
    },
    {
        "id": "has_autoridade_coatora",
        "description": "Deve indicar autoridade coatora",
        "check": lambda text, ctx: 'AUTORIDADE COATORA' in text.upper() or 'IMPETRADO' in text.upper(),
        "weight": 12,
    },
    {
        "id": "has_constrangimento",
        "description": "Deve demonstrar constrangimento ilegal",
        "check": lambda text, ctx: 'CONSTRANGIMENTO ILEGAL' in text.upper() or 'ILEGALIDADE' in text.upper() or 'COAÇÃO ILEGAL' in text.upper(),
        "weight": 15,
    },
    {
        "id": "has_fundamento_legal",
        "description": "Deve citar fundamento legal",
        "check": lambda text, ctx: 'ART.' in text.upper() or 'CPP' in text.upper() or 'CF' in text.upper() or '5º' in text,
        "weight": 10,
    },
    {
        "id": "has_pedido_liminar",
        "description": "Deve conter pedido (liminar)",
        "check": lambda text, ctx: 'LIMINAR' in text.upper() or 'ORDEM' in text.upper() or 'SALVO-CONDUTO' in text.upper(),
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
