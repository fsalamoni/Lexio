"""Lexio Core — Async in-process event bus."""

import asyncio
import logging
from collections import defaultdict
from typing import Any, Callable, Coroutine

logger = logging.getLogger("lexio.events")

Handler = Callable[[str, dict[str, Any]], Coroutine[Any, Any, None]]


class EventBus:
    """Simple async event bus for decoupled module communication."""

    def __init__(self):
        self._handlers: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: Handler):
        self._handlers[event_type].append(handler)
        logger.debug(f"Subscribed to '{event_type}': {handler.__qualname__}")

    def unsubscribe(self, event_type: str, handler: Handler):
        if event_type in self._handlers:
            self._handlers[event_type] = [
                h for h in self._handlers[event_type] if h != handler
            ]

    async def emit(self, event_type: str, data: dict[str, Any] | None = None):
        data = data or {}
        handlers = self._handlers.get(event_type, [])
        if not handlers:
            return

        logger.debug(f"Emitting '{event_type}' to {len(handlers)} handlers")
        tasks = [asyncio.create_task(self._safe_call(h, event_type, data)) for h in handlers]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _safe_call(self, handler: Handler, event_type: str, data: dict):
        try:
            await handler(event_type, data)
        except Exception as e:
            logger.error(f"Event handler error [{event_type}] {handler.__qualname__}: {e}")

    @property
    def registered_events(self) -> list[str]:
        return list(self._handlers.keys())


event_bus = EventBus()
