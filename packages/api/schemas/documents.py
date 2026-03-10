"""Lexio API — Document schemas."""

from datetime import datetime
from pydantic import BaseModel


class DocumentCreate(BaseModel):
    document_type_id: str  # e.g. "parecer"
    original_request: str
    legal_area_ids: list[str] | None = None  # e.g. ["administrative"]
    template_variant: str | None = None  # e.g. "mprs_caopp" or "generic"
    origem: str | None = "web"
    request_context: dict | None = None  # Anamnesis Layer 2 (structured fields per doc type)


class DocumentResponse(BaseModel):
    id: str
    document_type_id: str
    legal_area_ids: list[str]
    template_variant: str | None
    original_request: str
    tema: str | None
    status: str
    quality_score: int | None
    docx_path: str | None
    created_at: datetime
    origem: str

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj):
        return cls(
            id=str(obj.id),
            document_type_id=obj.document_type_id,
            legal_area_ids=obj.legal_area_ids or [],
            template_variant=obj.template_variant,
            original_request=obj.original_request[:500],
            tema=obj.tema,
            status=obj.status,
            quality_score=obj.quality_score,
            docx_path=obj.docx_path,
            created_at=obj.created_at,
            origem=obj.origem,
        )


class DocumentDetailResponse(DocumentResponse):
    """Full document response including body text (single-document endpoints only)."""
    texto_completo: str | None = None
    metadata_: dict | None = None

    @classmethod
    def from_orm(cls, obj):
        base = super().from_orm(obj)
        return cls(**base.model_dump(), texto_completo=obj.texto_completo, metadata_=obj.metadata_)


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
