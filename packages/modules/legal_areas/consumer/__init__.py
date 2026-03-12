"""Lexio Module — Direito do Consumidor."""

from packages.modules.legal_areas.consumer.area import ConsumerArea

MODULE_CLASS = ConsumerArea


def create_module():
    return ConsumerArea()
