from packages.api.stats_breakdown import build_cost_breakdown, get_function_key, get_model_label


def test_get_model_label_groups_known_model_families():
    assert get_model_label("anthropic/claude-opus-4") == "Claude Opus"
    assert get_model_label("anthropic/claude-sonnet-4") == "Claude Sonnet"
    assert get_model_label("anthropic/claude-3.5-haiku") == "Claude Haiku"
    assert get_model_label("openai/gpt-4o-mini") == "GPT"


def test_get_function_key_identifies_thesis_phases():
    assert get_function_key("thesis_curador", "Curador de Lacunas") == "thesis_analysis"
    assert get_function_key("triagem", "Triagem") == "document_generation"


def test_build_cost_breakdown_aggregates_by_model_function_phase_agent_and_document_type():
    rows = [
        {
            "model": "anthropic/claude-opus-4",
            "phase": "redator",
            "agent_name": "Redator",
            "tokens_in": 1000,
            "tokens_out": 500,
            "cost_usd": 0.25,
            "duration_ms": 10000,
            "document_type_id": "parecer",
            "document_type_label": "parecer",
        },
        {
            "model": "anthropic/claude-3.5-haiku",
            "phase": "triagem",
            "agent_name": "Triagem",
            "tokens_in": 150,
            "tokens_out": 50,
            "cost_usd": 0.01,
            "duration_ms": 500,
            "document_type_id": "parecer",
            "document_type_label": "parecer",
        },
        {
            "model": "anthropic/claude-sonnet-4",
            "phase": "thesis_curador",
            "agent_name": "Curador de Lacunas",
            "tokens_in": 400,
            "tokens_out": 600,
            "cost_usd": 0.08,
            "duration_ms": 4000,
            "document_type_id": None,
            "document_type_label": None,
        },
    ]

    breakdown = build_cost_breakdown(rows, brl_rate=5.0)

    assert breakdown["total_calls"] == 3
    assert breakdown["total_tokens_in"] == 1550
    assert breakdown["total_tokens_out"] == 1150
    assert breakdown["total_tokens"] == 2700
    assert breakdown["total_cost_usd"] == 0.34
    assert breakdown["total_cost_brl"] == 1.7

    by_model = {item["label"]: item for item in breakdown["by_model"]}
    assert by_model["Claude Opus"]["cost_usd"] == 0.25
    assert by_model["Claude Haiku"]["total_tokens"] == 200

    by_function = {item["key"]: item for item in breakdown["by_function"]}
    assert by_function["document_generation"]["calls"] == 2
    assert by_function["thesis_analysis"]["cost_usd"] == 0.08

    by_phase = {item["key"]: item for item in breakdown["by_phase"]}
    assert by_phase["redator"]["label"] == "Redator"
    assert by_phase["thesis_curador"]["label"] == "Curador de Lacunas"

    by_agent = {item["key"]: item for item in breakdown["by_agent"]}
    assert by_agent["Redator"]["avg_duration_ms"] == 10000

    by_document_type = {item["key"]: item for item in breakdown["by_document_type"]}
    assert by_document_type["parecer"]["calls"] == 2
