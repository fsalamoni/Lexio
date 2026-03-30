"""Lexio API — Lightweight Prometheus-compatible metrics collector.

Tracks in-memory HTTP counters and latency histograms with zero external deps.
Exposed at GET /api/v1/metrics in Prometheus text format.
"""

import time
from collections import defaultdict
from typing import Any

# ── In-memory metric stores ────────────────────────────────────────────────────

# http_requests_total{method, path, status}
_request_counts: dict[tuple, int] = defaultdict(int)

# http_request_duration_seconds cumulative sum and count per (method, path)
_duration_sum: dict[tuple, float] = defaultdict(float)
_duration_count: dict[tuple, int] = defaultdict(int)

# http_request_duration histogram buckets (seconds)
_BUCKETS = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, float("inf"))
_duration_buckets: dict[tuple, list[int]] = {}


def _normalize_path(path: str) -> str:
    """Collapse dynamic path segments to avoid unbounded cardinality."""
    import re
    # UUIDs
    path = re.sub(
        r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
        '{id}', path, flags=re.I
    )
    # Pure numeric IDs
    path = re.sub(r'/\d+', '/{id}', path)
    return path


def record_request(method: str, path: str, status_code: int, duration_s: float):
    """Called by the metrics middleware after each request completes."""
    path = _normalize_path(path)
    key = (method.upper(), path, str(status_code))
    _request_counts[key] += 1

    dur_key = (method.upper(), path)
    _duration_sum[dur_key] += duration_s
    _duration_count[dur_key] += 1

    if dur_key not in _duration_buckets:
        _duration_buckets[dur_key] = [0] * len(_BUCKETS)
    for i, b in enumerate(_BUCKETS):
        if duration_s <= b:
            _duration_buckets[dur_key][i] += 1


def render_prometheus(extra_metrics: list[str] | None = None) -> str:
    """Render all collected metrics in Prometheus text exposition format."""
    lines: list[str] = []

    # ── http_requests_total ────────────────────────────────────────────────────
    lines.append("# HELP http_requests_total Total HTTP requests by method, path and status.")
    lines.append("# TYPE http_requests_total counter")
    for (method, path, status), count in sorted(_request_counts.items()):
        lines.append(
            f'http_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}'
        )

    # ── http_request_duration_seconds ──────────────────────────────────────────
    lines.append(
        "# HELP http_request_duration_seconds HTTP request duration in seconds."
    )
    lines.append("# TYPE http_request_duration_seconds histogram")
    for dur_key, bucket_counts in sorted(_duration_buckets.items()):
        method, path = dur_key
        total_count = _duration_count[dur_key]
        total_sum = _duration_sum[dur_key]
        for i, b in enumerate(_BUCKETS):
            le = "+Inf" if b == float("inf") else str(b)
            lines.append(
                f'http_request_duration_seconds_bucket{{method="{method}",path="{path}",le="{le}"}} {bucket_counts[i]}'
            )
        lines.append(
            f'http_request_duration_seconds_count{{method="{method}",path="{path}"}} {total_count}'
        )
        lines.append(
            f'http_request_duration_seconds_sum{{method="{method}",path="{path}"}} {total_sum:.6f}'
        )

    # ── Extra (business) metrics passed from the route ─────────────────────────
    if extra_metrics:
        lines.extend(extra_metrics)

    lines.append("")  # trailing newline required by Prometheus
    return "\n".join(lines)
