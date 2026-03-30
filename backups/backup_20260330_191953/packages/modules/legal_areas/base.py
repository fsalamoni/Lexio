"""Lexio Modules — Base class for legal area modules."""

from abc import ABC, abstractmethod


class BaseLegalArea(ABC):
    """Abstract base class that every legal_area module must implement."""

    @abstractmethod
    def get_id(self) -> str:
        """Return unique identifier, e.g. 'administrative'."""
        ...

    @abstractmethod
    def get_name(self) -> str:
        """Return display name, e.g. 'Direito Administrativo'."""
        ...

    @abstractmethod
    def get_specializations(self) -> list[str]:
        """Return list of sub-specializations."""
        ...

    def get_description(self) -> str:
        return ""

    def get_guides(self) -> list[dict]:
        """Return list of guide metadata {id, name, path}."""
        return []

    async def generate_theses(self, context: dict, model: str | None = None) -> str:
        """Generate specialized theses for multi-area deliberation."""
        raise NotImplementedError

    async def health_check(self) -> dict:
        return {"healthy": True}
