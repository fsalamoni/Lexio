"""Lexio Core — Event bus for decoupled module communication."""

from packages.core.events.bus import event_bus
from packages.core.events.types import EventType

__all__ = ["event_bus", "EventType"]
