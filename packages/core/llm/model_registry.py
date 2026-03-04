"""Lexio Core — Supported models and their costs per 1M tokens."""

MODEL_REGISTRY = {
    "anthropic/claude-sonnet-4": {
        "name": "Claude Sonnet 4",
        "input_cost": 3.00,
        "output_cost": 15.00,
        "max_tokens": 8192,
    },
    "anthropic/claude-3.5-haiku": {
        "name": "Claude 3.5 Haiku",
        "input_cost": 0.80,
        "output_cost": 4.00,
        "max_tokens": 8192,
    },
    "anthropic/claude-opus-4": {
        "name": "Claude Opus 4",
        "input_cost": 15.00,
        "output_cost": 75.00,
        "max_tokens": 4096,
    },
    "google/gemini-2.5-pro": {
        "name": "Gemini 2.5 Pro",
        "input_cost": 1.25,
        "output_cost": 10.00,
        "max_tokens": 8192,
    },
}


def get_model_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    info = MODEL_REGISTRY.get(model)
    if not info:
        return 0.0
    cost_in = (tokens_in / 1_000_000) * info["input_cost"]
    cost_out = (tokens_out / 1_000_000) * info["output_cost"]
    return round(cost_in + cost_out, 6)
