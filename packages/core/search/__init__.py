"""Lexio Core — Search services."""

from packages.core.search.qdrant import search_qdrant
from packages.core.search.datajud import search_datajud
from packages.core.search.web_search import search_legislacao

__all__ = ["search_qdrant", "search_datajud", "search_legislacao"]
