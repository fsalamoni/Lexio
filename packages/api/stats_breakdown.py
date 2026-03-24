"""Helpers for building dashboard cost/token breakdowns."""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable

DEFAULT_BRL_PER_USD = 5.7

PHASE_LABELS = {
    "triagem": "Triagem",
    "pesquisador": "Pesquisador",
    "jurista_teses": "Jurista de Teses",
    "jurista": "Jurista",
    "advogado_diabo": "Advogado do Diabo",
    "jurista_v2": "Jurista v2",
    "fact_checker": "Fact-checker",
    "moderador": "Moderador",
    "moderador_agenda": "Moderador de Agenda",
    "moderador_plano": "Moderador de Plano",
    "redator": "Redator",
    "redacao": "Redação",
    "revisor": "Revisor",
    "thesis_catalogador": "Catalogador",
    "thesis_analista": "Analista de Redundâncias",
    "thesis_compilador": "Compilador",
    "thesis_curador": "Curador de Lacunas",
    "thesis_revisor": "Revisor Final",
}

FUNCTION_LABELS = {
    "document_generation": "Geração de documentos",
    "thesis_analysis": "Análise de teses",
    "thesis_extraction": "Extração automática de teses",
    "context_detail": "Detalhamento de contexto",
    "acervo_classificador": "Classificador de acervo",
    "acervo_ementa": "Gerador de ementas",
}

DOCUMENT_TYPE_LABELS = {
    "parecer": "Parecer",
    "peticao_inicial": "Petição Inicial",
    "contestacao": "Contestação",
    "recurso": "Recurso",
    "sentenca": "Sentença",
    "acao_civil_publica": "Ação Civil Pública",
    "mandado_seguranca": "Mandado de Segurança",
    "habeas_corpus": "Habeas Corpus",
    "agravo": "Agravo de Instrumento",
    "embargos_declaracao": "Embargos de Declaração",
}


def _round6(value: float) -> float:
    return round(float(value or 0), 6)


def _round2(value: float) -> float:
    return round(float(value or 0), 2)


def get_model_label(model: str | None) -> str:
    if not model:
        return "Não identificado"

    normalized = model.lower()
    if "haiku" in normalized:
        return "Claude Haiku"
    if "sonnet" in normalized:
        return "Claude Sonnet"
    if "opus" in normalized:
        return "Claude Opus"
    if "gpt" in normalized:
        return "GPT"
    if "gemini" in normalized:
        return "Gemini"
    if "llama" in normalized:
        return "Llama"
    normalized_model = model.rstrip("/")
    return normalized_model.split("/")[-1] or normalized_model


def get_provider_key(model: str | None) -> str:
    if not model:
        return "unknown_provider"
    provider = model.split("/", maxsplit=1)[0].strip().lower()
    return provider or "unknown_provider"


def get_provider_label(model: str | None) -> str:
    provider_key = get_provider_key(model)
    if provider_key == "anthropic":
        return "Anthropic"
    if provider_key == "openai":
        return "OpenAI"
    if provider_key == "google":
        return "Google"
    if provider_key == "meta":
        return "Meta"
    if provider_key == "unknown_provider":
        return "Não identificado"
    return provider_key.capitalize()


def get_phase_label(phase: str | None) -> str:
    if not phase:
        return "Não informado"
    return PHASE_LABELS.get(phase, phase.replace("_", " "))


def get_function_key(phase: str | None, agent_name: str | None = None) -> str:
    phase_value = (phase or "").lower()
    agent_value = (agent_name or "").lower()

    if phase_value.startswith("thesis_") or ("thesis" in agent_value):
        return "thesis_analysis"
    if ("extrator" in agent_value) or phase_value.startswith("auto_populate"):
        return "thesis_extraction"
    if phase_value == "context_detail" or ("detalhamento de contexto" in agent_value):
        return "context_detail"
    if phase_value == "acervo_classificador" or ("classificador de acervo" in agent_value):
        return "acervo_classificador"
    if phase_value == "acervo_ementa" or ("gerador de ementa" in agent_value):
        return "acervo_ementa"
    return "document_generation"


def get_document_type_label(document_type_id: str | None) -> str:
    if not document_type_id:
        return "Não informado"
    return DOCUMENT_TYPE_LABELS.get(document_type_id, document_type_id)


def _empty_bucket(key: str, label: str) -> dict:
    return {
        "key": key,
        "label": label,
        "calls": 0,
        "tokens_in": 0,
        "tokens_out": 0,
        "total_tokens": 0,
        "cost_usd": 0.0,
        "cost_brl": 0.0,
        "avg_duration_ms": None,
        "_duration_total": 0,
    }


def _aggregate(
    rows: Iterable[dict],
    *,
    key_field: str,
    label_field: str,
    brl_rate: float,
) -> list[dict]:
    grouped: dict[str, dict] = {}

    for row in rows:
        key = str(row.get(key_field) or "unknown")
        label = str(row.get(label_field) or "Não informado")
        bucket = grouped.setdefault(key, _empty_bucket(key, label))
        bucket["calls"] += 1
        bucket["tokens_in"] += int(row.get("tokens_in") or 0)
        bucket["tokens_out"] += int(row.get("tokens_out") or 0)
        bucket["total_tokens"] += int(row.get("total_tokens") or 0)
        bucket["cost_usd"] = _round6(bucket["cost_usd"] + float(row.get("cost_usd") or 0))
        bucket["cost_brl"] = _round2(bucket["cost_usd"] * brl_rate)
        bucket["_duration_total"] += int(row.get("duration_ms") or 0)
        if bucket["calls"] > 0:
            bucket["avg_duration_ms"] = round(bucket["_duration_total"] / bucket["calls"])

    items = []
    for bucket in grouped.values():
        bucket.pop("_duration_total", None)
        items.append(bucket)
    return sorted(
        items,
        key=lambda item: (-item["cost_usd"], -item["total_tokens"], item["label"]),
    )


def build_cost_breakdown(rows: Iterable[dict], brl_rate: float = DEFAULT_BRL_PER_USD) -> dict:
    normalized_rows = []
    totals = defaultdict(float)
    total_calls = 0

    for row in rows:
        tokens_in = int(row.get("tokens_in") or 0)
        tokens_out = int(row.get("tokens_out") or 0)
        total_tokens = tokens_in + tokens_out
        cost_usd = _round6(float(row.get("cost_usd") or 0))
        phase = row.get("phase")
        agent_name = row.get("agent_name")
        function_key = get_function_key(phase, agent_name)
        normalized = {
            "provider_key": get_provider_key(row.get("model")),
            "provider_label": get_provider_label(row.get("model")),
            "model_key": row.get("model") or "unknown_model",
            "model_label": get_model_label(row.get("model")),
            "function_key": function_key,
            "function_label": FUNCTION_LABELS[function_key],
            "phase_key": phase or "unknown_phase",
            "phase_label": get_phase_label(phase),
            "agent_key": agent_name or "unknown_agent",
            "agent_label": agent_name or "Não informado",
            "agent_function_key": f"{function_key}::{agent_name or 'unknown_agent'}",
            "agent_function_label": f"{FUNCTION_LABELS[function_key]} · {agent_name or 'Não informado'}",
            "document_type_key": row.get("document_type_id") or "unknown_document_type",
            "document_type_label": row.get("document_type_label") or get_document_type_label(row.get("document_type_id")),
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "total_tokens": total_tokens,
            "cost_usd": cost_usd,
            "duration_ms": int(row.get("duration_ms") or 0),
        }
        normalized_rows.append(normalized)
        totals["total_cost_usd"] += cost_usd
        totals["total_tokens_in"] += tokens_in
        totals["total_tokens_out"] += tokens_out
        totals["total_tokens"] += total_tokens
        total_calls += 1

    return {
        "total_cost_usd": _round6(totals["total_cost_usd"]),
        "total_cost_brl": _round2(totals["total_cost_usd"] * brl_rate),
        "total_tokens_in": int(totals["total_tokens_in"]),
        "total_tokens_out": int(totals["total_tokens_out"]),
        "total_tokens": int(totals["total_tokens"]),
        "total_calls": total_calls,
        "exchange_rate_brl": brl_rate,
        "by_provider": _aggregate(normalized_rows, key_field="provider_key", label_field="provider_label", brl_rate=brl_rate),
        "by_model": _aggregate(normalized_rows, key_field="model_key", label_field="model_label", brl_rate=brl_rate),
        "by_function": _aggregate(normalized_rows, key_field="function_key", label_field="function_label", brl_rate=brl_rate),
        "by_phase": _aggregate(normalized_rows, key_field="phase_key", label_field="phase_label", brl_rate=brl_rate),
        "by_agent": _aggregate(normalized_rows, key_field="agent_key", label_field="agent_label", brl_rate=brl_rate),
        "by_agent_function": _aggregate(normalized_rows, key_field="agent_function_key", label_field="agent_function_label", brl_rate=brl_rate),
        "by_document_type": _aggregate(normalized_rows, key_field="document_type_key", label_field="document_type_label", brl_rate=brl_rate),
        # Per-function breakdowns so each section in the dashboard only shows
        # its own model/phase/provider data (free models included).
        "by_model_per_function": {
            func_key: _aggregate(
                [r for r in normalized_rows if r["function_key"] == func_key],
                key_field="model_key",
                label_field="model_label",
                brl_rate=brl_rate,
            )
            for func_key in {r["function_key"] for r in normalized_rows}
        },
        "by_phase_per_function": {
            func_key: _aggregate(
                [r for r in normalized_rows if r["function_key"] == func_key],
                key_field="phase_key",
                label_field="phase_label",
                brl_rate=brl_rate,
            )
            for func_key in {r["function_key"] for r in normalized_rows}
        },
        "by_provider_per_function": {
            func_key: _aggregate(
                [r for r in normalized_rows if r["function_key"] == func_key],
                key_field="provider_key",
                label_field="provider_label",
                brl_rate=brl_rate,
            )
            for func_key in {r["function_key"] for r in normalized_rows}
        },
    }
