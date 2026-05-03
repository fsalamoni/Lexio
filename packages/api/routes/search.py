"""Lexio API — Hybrid search endpoint (semantic + lexical)."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from packages.core.search.hybrid import hybrid_search
from packages.core.auth.dependencies import get_current_user_id
from packages.api.schemas.search import HybridSearchRequest, HybridSearchResponse

logger = logging.getLogger("lexio.api.search")

router = APIRouter(prefix="/search", tags=["search"])


@router.post("/hybrid", response_model=HybridSearchResponse)
async def hybrid_search_endpoint(
    body: HybridSearchRequest,
    user_id: str = Depends(get_current_user_id),
) -> HybridSearchResponse:
    """Execute hybrid search combining semantic (Qdrant) and lexical (DataJud) results.

    Uses Reciprocal Rank Fusion to merge ranked lists from both sources,
    producing a unified result set with composite relevance scores.

    Falls back gracefully: if one source fails, the other still returns results.
    """
    if not body.query or not body.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if body.top_k < 1 or body.top_k > 50:
        raise HTTPException(status_code=400, detail="top_k must be between 1 and 50")

    if body.semantic_weight < 0 or body.semantic_weight > 1:
        raise HTTPException(status_code=422, detail="semantic_weight must be between 0 and 1")

    if body.lexical_weight < 0 or body.lexical_weight > 1:
        raise HTTPException(status_code=422, detail="lexical_weight must be between 0 and 1")

    if body.semantic_weight + body.lexical_weight == 0:
        raise HTTPException(
            status_code=422,
            detail="At least one weight (semantic or lexical) must be > 0",
        )

    logger.info(
        f"Hybrid search request: query='{body.query[:100]}', "
        f"top_k={body.top_k}, sw={body.semantic_weight}, lw={body.lexical_weight}"
    )

    try:
        result = await hybrid_search(
            query=body.query.strip(),
            top_k=body.top_k,
            semantic_weight=body.semantic_weight,
            lexical_weight=body.lexical_weight,
            collection=body.collection,
        )
    except Exception as e:
        logger.error(f"Hybrid search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    return HybridSearchResponse(
        results=result["results"],
        stats=result["stats"],
    )


@router.get("/health", response_model=dict)
async def search_health():
    """Health check for search services."""
    return {
        "status": "ok",
        "service": "hybrid-search",
        "version": "1.0.0",
    }