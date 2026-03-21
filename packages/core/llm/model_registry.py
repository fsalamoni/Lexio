"""Lexio Core — Supported models and their costs per 1M tokens."""

MODEL_REGISTRY = {
    # ── Anthropic ────────────────────────────────────────────────────────────
    "anthropic/claude-3.5-haiku": {
        "name": "Claude 3.5 Haiku",
        "input_cost": 0.80,
        "output_cost": 4.00,
        "context_window": 200_000,
    },
    "anthropic/claude-3.5-sonnet": {
        "name": "Claude 3.5 Sonnet",
        "input_cost": 3.00,
        "output_cost": 15.00,
        "context_window": 200_000,
    },
    "anthropic/claude-sonnet-4": {
        "name": "Claude Sonnet 4",
        "input_cost": 3.00,
        "output_cost": 15.00,
        "context_window": 200_000,
    },
    "anthropic/claude-3.7-sonnet": {
        "name": "Claude 3.7 Sonnet",
        "input_cost": 3.00,
        "output_cost": 15.00,
        "context_window": 200_000,
    },
    "anthropic/claude-opus-4": {
        "name": "Claude Opus 4",
        "input_cost": 15.00,
        "output_cost": 75.00,
        "context_window": 200_000,
    },
    # ── Google ───────────────────────────────────────────────────────────────
    "google/gemini-2.0-flash-001": {
        "name": "Gemini 2.0 Flash",
        "input_cost": 0.10,
        "output_cost": 0.40,
        "context_window": 1_000_000,
    },
    "google/gemini-2.0-flash-lite-001": {
        "name": "Gemini 2.0 Flash Lite",
        "input_cost": 0.075,
        "output_cost": 0.30,
        "context_window": 1_000_000,
    },
    "google/gemini-2.5-flash-preview": {
        "name": "Gemini 2.5 Flash",
        "input_cost": 0.15,
        "output_cost": 0.60,
        "context_window": 1_000_000,
    },
    "google/gemini-2.5-pro-preview": {
        "name": "Gemini 2.5 Pro",
        "input_cost": 1.25,
        "output_cost": 10.00,
        "context_window": 1_000_000,
    },
    # ── OpenAI ───────────────────────────────────────────────────────────────
    "openai/gpt-4o-mini": {
        "name": "GPT-4o Mini",
        "input_cost": 0.15,
        "output_cost": 0.60,
        "context_window": 128_000,
    },
    "openai/gpt-4.1-nano": {
        "name": "GPT-4.1 Nano",
        "input_cost": 0.10,
        "output_cost": 0.40,
        "context_window": 1_000_000,
    },
    "openai/gpt-4.1-mini": {
        "name": "GPT-4.1 Mini",
        "input_cost": 0.40,
        "output_cost": 1.60,
        "context_window": 1_000_000,
    },
    "openai/gpt-4o": {
        "name": "GPT-4o",
        "input_cost": 2.50,
        "output_cost": 10.00,
        "context_window": 128_000,
    },
    "openai/gpt-4.1": {
        "name": "GPT-4.1",
        "input_cost": 2.00,
        "output_cost": 8.00,
        "context_window": 1_000_000,
    },
    "openai/o3-mini": {
        "name": "o3-mini",
        "input_cost": 1.10,
        "output_cost": 4.40,
        "context_window": 200_000,
    },
    "openai/o4-mini": {
        "name": "o4-mini",
        "input_cost": 1.10,
        "output_cost": 4.40,
        "context_window": 200_000,
    },
    "openai/o3": {
        "name": "o3",
        "input_cost": 10.00,
        "output_cost": 40.00,
        "context_window": 200_000,
    },
    # ── DeepSeek ─────────────────────────────────────────────────────────────
    "deepseek/deepseek-chat-v3-0324": {
        "name": "DeepSeek V3",
        "input_cost": 0.27,
        "output_cost": 1.10,
        "context_window": 64_000,
    },
    "deepseek/deepseek-r1": {
        "name": "DeepSeek R1",
        "input_cost": 0.55,
        "output_cost": 2.19,
        "context_window": 64_000,
    },
    # ── Meta ─────────────────────────────────────────────────────────────────
    "meta-llama/llama-4-scout": {
        "name": "Llama 4 Scout",
        "input_cost": 0.17,
        "output_cost": 0.17,
        "context_window": 512_000,
    },
    "meta-llama/llama-4-maverick": {
        "name": "Llama 4 Maverick",
        "input_cost": 0.19,
        "output_cost": 0.65,
        "context_window": 1_000_000,
    },
    "meta-llama/llama-3.3-70b-instruct": {
        "name": "Llama 3.3 70B",
        "input_cost": 0.12,
        "output_cost": 0.30,
        "context_window": 128_000,
    },
    # ── Mistral ──────────────────────────────────────────────────────────────
    "mistralai/mistral-small-3.1-24b-instruct": {
        "name": "Mistral Small 3.1",
        "input_cost": 0.10,
        "output_cost": 0.30,
        "context_window": 128_000,
    },
    "mistralai/mistral-large-2411": {
        "name": "Mistral Large",
        "input_cost": 2.00,
        "output_cost": 6.00,
        "context_window": 128_000,
    },
    # ── Qwen ─────────────────────────────────────────────────────────────────
    "qwen/qwen-2.5-72b-instruct": {
        "name": "Qwen 2.5 72B",
        "input_cost": 0.13,
        "output_cost": 0.40,
        "context_window": 128_000,
    },
    "qwen/qwen3-235b-a22b": {
        "name": "Qwen3 235B",
        "input_cost": 0.13,
        "output_cost": 0.60,
        "context_window": 128_000,
    },
    "qwen/qwen3-30b-a3b": {
        "name": "Qwen3 30B",
        "input_cost": 0.29,
        "output_cost": 1.15,
        "context_window": 128_000,
    },
    # ── xAI ──────────────────────────────────────────────────────────────────
    "x-ai/grok-3-mini": {
        "name": "Grok-3 Mini",
        "input_cost": 0.30,
        "output_cost": 0.50,
        "context_window": 131_000,
    },
    "x-ai/grok-3": {
        "name": "Grok-3",
        "input_cost": 3.00,
        "output_cost": 15.00,
        "context_window": 131_000,
    },
    # ── Cohere ───────────────────────────────────────────────────────────────
    "cohere/command-r-plus-08-2024": {
        "name": "Command R+",
        "input_cost": 2.50,
        "output_cost": 10.00,
        "context_window": 128_000,
    },
    # ── Free tier models (cost = 0) ──────────────────────────────────────────
    "google/gemini-2.0-flash-exp:free": {
        "name": "Gemini 2.0 Flash Exp (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 1_000_000,
    },
    "google/gemma-3-27b-it:free": {
        "name": "Gemma 3 27B (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 128_000,
    },
    "meta-llama/llama-4-scout:free": {
        "name": "Llama 4 Scout (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 512_000,
    },
    "meta-llama/llama-3.3-70b-instruct:free": {
        "name": "Llama 3.3 70B (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 128_000,
    },
    "deepseek/deepseek-chat-v3-0324:free": {
        "name": "DeepSeek V3 (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 64_000,
    },
    "deepseek/deepseek-r1:free": {
        "name": "DeepSeek R1 (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 64_000,
    },
    "qwen/qwen3-8b:free": {
        "name": "Qwen3 8B (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 128_000,
    },
    "qwen/qwen3-30b-a3b:free": {
        "name": "Qwen3 30B (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 128_000,
    },
    "mistralai/mistral-small-3.1-24b-instruct:free": {
        "name": "Mistral Small 3.1 (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 128_000,
    },
    "microsoft/phi-4-multimodal-instruct:free": {
        "name": "Phi-4 Multimodal (Free)",
        "input_cost": 0.0,
        "output_cost": 0.0,
        "context_window": 128_000,
    },
}


def get_model_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    info = MODEL_REGISTRY.get(model)
    if not info:
        return 0.0
    cost_in = (tokens_in / 1_000_000) * info["input_cost"]
    cost_out = (tokens_out / 1_000_000) * info["output_cost"]
    return round(cost_in + cost_out, 6)
