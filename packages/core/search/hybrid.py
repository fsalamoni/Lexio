"""Lexio Core — Hybrid search: semantic (Qdrant) + lexical (DataJud) with RRF fusion."""

import logging
from typing import Any

from packages.core.config import settings
from packages.core.embedding.client import generate_embedding
from packages.core.search.qdrant import search_qdrant
from packages.core.search.datajud import search_datajud

logger = logging.getLogger("lexio.search.hybrid")

# ── Public API ──────────────────────────────────────────────────────────────────


async def hybrid_search(
    query: str,
    top_k: int = 10,
    semantic_weight: float = 0.5,
    lexical_weight: float = 0.5,
    collection: str | None = None,
) -> dict[str, Any]:
    """Execute hybrid search combining Qdrant semantic results with DataJud lexical results.

    Uses Reciprocal Rank Fusion (RRF) to merge ranked lists from both sources,
    producing a unified result set with composite scores.

    Args:
        query: Natural language search query
        top_k: Number of results to return after fusion
        semantic_weight: Weight for semantic (vector) results (0-1)
        lexical_weight: Weight for lexical (Elasticsearch) results (0-1)
        collection: Qdrant collection name (defaults to settings.qdrant_collection)

    Returns:
        dict with keys: results (list of HybridResult), stats (timing/counts)
    """
    import time
    start = time.perf_counter()

    # ── 1. Generate embedding for semantic search ────────────────────────────
    semantic_results_raw: list[dict[str, Any]] = []
    semantic_time_ms = 0.0
    try:
        vector = await generate_embedding(query)
        t0 = time.perf_counter()
        semantic_text = await search_qdrant(
            vector, collection=collection, top_k=min(top_k * 2, 30)
        )
        semantic_time_ms = (time.perf_counter() - t0) * 1000
        if semantic_text:
            semantic_results_raw = _parse_qdrant_text(semantic_text)
    except Exception as e:
        logger.warning(f"Semantic search failed, continuing with lexical only: {e}")

    # ── 2. Execute lexical search via DataJud ─────────────────────────────────
    lexical_results_raw: list[dict[str, Any]] = []
    lexical_time_ms = 0.0
    try:
        t0 = time.perf_counter()
        lexical_text = await search_datajud(query, size=min(top_k * 2, 20))
        lexical_time_ms = (time.perf_counter() - t0) * 1000
        if lexical_text:
            lexical_results_raw = _parse_datajud_text(lexical_text)
    except Exception as e:
        logger.warning(f"Lexical search failed, continuing with semantic only: {e}")

    # ── 3. Reciprocal Rank Fusion ────────────────────────────────────────────
    fused = _reciprocal_rank_fusion(
        semantic_results_raw,
        lexical_results_raw,
        k=60,  # RRF constant
        semantic_weight=semantic_weight,
        lexical_weight=lexical_weight,
    )

    # ── 4. Sort and trim ─────────────────────────────────────────────────────
    fused.sort(key=lambda r: r.get("score", 0), reverse=True)
    results = fused[:top_k]

    elapsed = (time.perf_counter() - start) * 1000

    logger.info(
        f"Hybrid search: semantic={len(semantic_results_raw)} "
        f"({semantic_time_ms:.0f}ms), lexical={len(lexical_results_raw)} "
        f"({lexical_time_ms:.0f}ms), fused={len(results)}, "
        f"total={elapsed:.0f}ms"
    )

    return {
        "results": results,
        "stats": {
            "query": query,
            "semantic_count": len(semantic_results_raw),
            "semantic_time_ms": round(semantic_time_ms, 1),
            "lexical_count": len(lexical_results_raw),
            "lexical_time_ms": round(lexical_time_ms, 1),
            "fused_count": len(results),
            "total_time_ms": round(elapsed, 1),
            "semantic_weight": semantic_weight,
            "lexical_weight": lexical_weight,
        },
    }


# ── Internal helpers ────────────────────────────────────────────────────────────


def _parse_qdrant_text(text: str) -> list[dict[str, Any]]:
    """Parse Qdrant results from the text format returned by search_qdrant."""
    results: list[dict[str, Any]] = []
    if not text:
        return results
    fragments = text.split("\n---\n")
    for fragment in fragments:
        lines = fragment.strip().split("\n")
        source = "desconhecido"
        score = 0.0
        content_lines: list[str] = []
        for line in lines:
            if line.startswith("[Fonte:"):
                # Extract source name
                source = line.split("]")[0].replace("[Fonte:", "").strip()
                # Extract score if present
                if "(score:" in line:
                    try:
                        score_str = line.split("(score:")[1].split(")")[0].strip()
                        score = float(score_str)
                    except (ValueError, IndexError):
                        score = 0.0
            else:
                content_lines.append(line)
        content = "\n".join(content_lines).strip()
        if content:
            results.append({
                "source": source,
                "content": content,
                "score": score,
                "origin": "semantic",
            })
    return results


def _parse_datajud_text(text: str) -> list[dict[str, Any]]:
    """Parse DataJud results from the text format returned by search_datajud."""
    results: list[dict[str, Any]] = []
    if not text:
        return results
    lines = text.strip().split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Extract process number
        process_number = "?"
        if line.startswith("Processo "):
            parts = line.split(" — ")
            process_number = parts[0].replace("Processo ", "").strip() if parts else "?"
        results.append({
            "source": f"DataJud — TJRS",
            "content": line,
            "process_number": process_number,
            "raw_line": line,
            "score": 1.0,  # DataJud results are already relevance-sorted by Elasticsearch
            "origin": "lexical",
        })
    return results


def _reciprocal_rank_fusion(
    semantic: list[dict[str, Any]],
    lexical: list[dict[str, Any]],
    k: int = 60,
    semantic_weight: float = 0.5,
    lexical_weight: float = 0.5,
) -> list[dict[str, Any]]:
    """Merge two ranked lists using Reciprocal Rank Fusion.

    RRF formula: score(d) = Σ w_i / (k + rank_i(d))
    where w_i is the weight for list i, and rank_i(d) is the rank of document d in list i.

    Documents are matched by content substring overlap for deduplication.
    """
    if not semantic and not lexical:
        return []

    # Normalize weights
    total_w = semantic_weight + lexical_weight
    if total_w == 0:
        semantic_weight = 0.5
        lexical_weight = 0.5
        total_w = 1.0
    semantic_w = semantic_weight / total_w
    lexical_w = lexical_weight / total_w

    # Build fused map keyed by normalized content fingerprint
    fused_map: dict[str, dict[str, Any]] = {}

    # Process semantic results (rank 1 = best)
    for rank, item in enumerate(semantic, start=1):
        key = _content_key(item.get("content", ""))
        if key not in fused_map:
            fused_map[key] = dict(item)
            fused_map[key]["score"] = 0.0
            fused_map[key]["origins"] = []
        fused_map[key]["score"] += semantic_w / (k + rank)
        fused_map[key]["origins"].append("semantic")

    # Process lexical results
    for rank, item in enumerate(lexical, start=1):
        key = _content_key(item.get("content", ""))
        if key not in fused_map:
            fused_map[key] = dict(item)
            fused_map[key]["score"] = 0.0
            fused_map[key]["origins"] = []
        fused_map[key]["score"] += lexical_w / (k + rank)
        fused_map[key]["origins"].append("lexical")

    # Convert to list and normalize scores to 0-1 range
    results = list(fused_map.values())
    if results:
        max_score = max(r["score"] for r in results)
        if max_score > 0:
            for r in results:
                r["score"] = round(r["score"] / max_score, 4)
                r["origins"] = sorted(set(r["origins"]))

    return results


def _content_key(content: str, max_len: int = 200) -> str:
    """Create a normalized key from content for deduplication."""
    # Normalize: lowercase, collapse whitespace, trim
    key = " ".join(content.lower().split())[:max_len]
    return key