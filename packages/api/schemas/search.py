"""Lexio API — Search schemas (request/response models)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class HybridSearchRequest(BaseModel):
    """Request body for hybrid search endpoint."""

    query: str = Field(..., min_length=1, max_length=2000, description="Natural language search query")
    top_k: int = Field(default=10, ge=1, le=50, description="Number of results to return after fusion")
    semantic_weight: float = Field(default=0.5, ge=0, le=1, description="Weight for semantic (vector) results")
    lexical_weight: float = Field(default=0.5, ge=0, le=1, description="Weight for lexical (DataJud) results")
    collection: Optional[str] = Field(default=None, max_length=100, description="Qdrant collection name (defaults to settings)")


class HybridResultItem(BaseModel):
    """A single fused search result."""

    source: str = Field(..., description="Source identifier (document name or process number)")
    content: str = Field(..., description="Result content/snippet")
    score: float = Field(..., description="Composite relevance score (0-1)")
    origin: str = Field(default="semantic", description="Source origin: semantic, lexical, or both")
    origins: Optional[list[str]] = Field(default=None, description="List of origins if fused from multiple sources")
    process_number: Optional[str] = Field(default=None, description="Process number (lexical results only)")


class HybridSearchStats(BaseModel):
    """Timing and count statistics for the hybrid search execution."""

    query: str = Field(..., description="Original query string")
    semantic_count: int = Field(..., description="Number of results from semantic search")
    semantic_time_ms: float = Field(..., description="Semantic search duration (ms)")
    lexical_count: int = Field(..., description="Number of results from lexical search")
    lexical_time_ms: float = Field(..., description="Lexical search duration (ms)")
    fused_count: int = Field(..., description="Number of results after fusion")
    total_time_ms: float = Field(..., description="Total search duration (ms)")
    semantic_weight: float = Field(..., description="Semantic weight used")
    lexical_weight: float = Field(..., description="Lexical weight used")


class HybridSearchResponse(BaseModel):
    """Response body for hybrid search endpoint."""

    results: list[HybridResultItem] = Field(default_factory=list, description="Fused search results")
    stats: Optional[HybridSearchStats] = Field(default=None, description="Search execution statistics")