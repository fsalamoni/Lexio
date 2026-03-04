"""Lexio Pipeline — Quality gate (pluggable rules from document_type module)."""

import importlib
import logging

from packages.pipeline.pipeline_config import PipelineConfig

logger = logging.getLogger("lexio.pipeline.quality")

# Default quality rules (used when document_type doesn't provide custom ones)
DEFAULT_RULES = [
    {
        "id": "min_length",
        "description": "Documento deve ter pelo menos 1500 caracteres",
        "check": lambda text, ctx: len(text) >= 1500,
        "weight": 15,
    },
    {
        "id": "has_structure",
        "description": "Documento deve ter seções estruturadas",
        "check": lambda text, ctx: any(
            word in text.upper() for word in ["RELATÓRIO", "FUNDAMENTAÇÃO", "CONCLUSÃO", "DISPOSITIVO"]
        ),
        "weight": 15,
    },
    {
        "id": "has_legal_basis",
        "description": "Documento deve citar base legal",
        "check": lambda text, ctx: any(
            term in text.lower() for term in ["art.", "lei ", "decreto", "constituição", "súmula"]
        ),
        "weight": 20,
    },
    {
        "id": "no_hallucination_markers",
        "description": "Sem marcadores de alucinação",
        "check": lambda text, ctx: "lei 8.666" not in text.lower(),
        "weight": 20,
    },
    {
        "id": "no_truncation",
        "description": "Sem frases truncadas",
        "check": lambda text, ctx: not text.rstrip().endswith(("...", "…")),
        "weight": 10,
    },
    {
        "id": "has_sources",
        "description": "Deve conter referências a fontes",
        "check": lambda text, ctx: "[Fonte:" in text or "jurisprudência" in text.lower(),
        "weight": 10,
    },
    {
        "id": "proper_paragraphs",
        "description": "Deve ter parágrafos separados",
        "check": lambda text, ctx: text.count("\n\n") >= 3,
        "weight": 10,
    },
]


async def evaluate_quality(
    text: str,
    context: dict,
    config: PipelineConfig,
) -> dict:
    """Evaluate document quality using rules from the document_type or defaults."""

    rules = DEFAULT_RULES

    # Try to load custom rules from document_type module
    if config.quality_module:
        try:
            mod = importlib.import_module(config.quality_module)
            if hasattr(mod, "QUALITY_RULES"):
                rules = mod.QUALITY_RULES
                logger.info(f"Using custom quality rules from {config.quality_module}")
        except Exception as e:
            logger.warning(f"Failed to load quality module {config.quality_module}: {e}")

    # Evaluate
    total_weight = sum(r["weight"] for r in rules)
    score = 0
    issues = []

    for rule in rules:
        try:
            passed = rule["check"](text, context)
        except Exception:
            passed = False

        if passed:
            score += rule["weight"]
        else:
            issues.append({
                "id": rule["id"],
                "description": rule["description"],
                "weight": rule["weight"],
            })

    final_score = int((score / total_weight) * 100) if total_weight > 0 else 0

    logger.info(f"Quality score: {final_score}/100 ({len(issues)} issues)")

    return {
        "score": final_score,
        "issues": issues,
        "passed": final_score >= config.min_score,
    }
