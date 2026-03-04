"""Lexio Modules — Base class for document type modules."""

from abc import ABC, abstractmethod

from packages.pipeline.pipeline_config import PipelineConfig


class BaseDocumentType(ABC):
    """Abstract base class that every document_type module must implement."""

    @abstractmethod
    def get_id(self) -> str:
        """Return unique identifier, e.g. 'parecer'."""
        ...

    @abstractmethod
    def get_name(self) -> str:
        """Return display name, e.g. 'Parecer Jurídico'."""
        ...

    @abstractmethod
    def get_pipeline_config(self, template_variant: str | None = None) -> PipelineConfig:
        """Return the pipeline configuration for this document type."""
        ...

    def get_category(self) -> str:
        """Return category: 'mp', 'judiciary', 'advocacy', 'general'."""
        return "general"

    def get_description(self) -> str:
        return ""

    async def health_check(self) -> dict:
        return {"healthy": True}
