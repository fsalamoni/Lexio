"""Lexio Core — Cost tracking for LLM usage."""

import logging
from dataclasses import dataclass, field

logger = logging.getLogger("lexio.cost_tracker")


@dataclass
class CostTracker:
    """Tracks cumulative LLM costs for a pipeline run."""

    total_cost: float = 0.0
    total_tokens_in: int = 0
    total_tokens_out: int = 0
    calls: list = field(default_factory=list)

    def add(self, model: str, tokens_in: int, tokens_out: int, cost: float, agent: str = ""):
        self.total_cost += cost
        self.total_tokens_in += tokens_in
        self.total_tokens_out += tokens_out
        self.calls.append({
            "agent": agent,
            "model": model,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost": cost,
        })
        logger.debug(f"[{agent}] +${cost:.4f} (total: ${self.total_cost:.4f})")

    def summary(self) -> dict:
        return {
            "total_cost_usd": round(self.total_cost, 6),
            "total_tokens_in": self.total_tokens_in,
            "total_tokens_out": self.total_tokens_out,
            "num_calls": len(self.calls),
            "calls": self.calls,
        }
