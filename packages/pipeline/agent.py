"""Lexio Pipeline — Base Agent class with parameterized prompts."""

import importlib
import logging
import time

from packages.core.llm.client import call_llm
from packages.pipeline.pipeline_config import AgentConfig

logger = logging.getLogger("lexio.pipeline.agent")


class BaseAgent:
    """Base class for all pipeline agents.

    Each agent loads its prompts from a configurable module and
    calls the LLM with the shared pipeline context.
    """

    def __init__(self, config: AgentConfig):
        self.config = config
        self._prompt_module = None

    def _load_prompt_module(self):
        if not self._prompt_module:
            self._prompt_module = importlib.import_module(self.config.prompt_module)
        return self._prompt_module

    def get_system_prompt(self, context: dict) -> str:
        mod = self._load_prompt_module()
        return mod.system_prompt(context)

    def get_user_prompt(self, context: dict) -> str:
        mod = self._load_prompt_module()
        return mod.user_prompt(context)

    async def execute(self, context: dict, model_override: str | None = None) -> dict:
        """Execute this agent: build prompts, call LLM, return result."""
        t0 = time.time()
        agent_name = self.config.name

        logger.info(f"Agent [{agent_name}] starting (phase: {self.config.phase})")

        system = self.get_system_prompt(context)
        user = self.get_user_prompt(context)

        model = model_override or self.config.model
        result = await call_llm(
            system=system,
            user=user,
            model=model,
            max_tokens=self.config.max_tokens,
            temperature=self.config.temperature,
        )

        duration_ms = int((time.time() - t0) * 1000)
        result["agent_name"] = agent_name
        result["phase"] = self.config.phase
        result["total_duration_ms"] = duration_ms

        logger.info(
            f"Agent [{agent_name}] completed: "
            f"{result['tokens_in']}+{result['tokens_out']} tokens, "
            f"${result['cost_usd']:.4f}, {duration_ms}ms"
        )

        return result
