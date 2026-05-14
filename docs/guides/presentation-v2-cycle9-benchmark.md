# Presentation v2 Cycle 9 Benchmark

Cycle 9 keeps Presentation v2 releasable after the premium pipeline work. The deterministic guard is split in two layers:

1. `src/lib/presentation-v2-regression-harness.ts` validates a single Presentation v2 manifest. It checks parser normalization, deck quality, multimodal coherence, export readiness, rejected visual assets, source priority, accessibility coverage, speaker notes, design-system coverage, and Presentation v2 telemetry.
2. `src/lib/presentation-v2-benchmark.ts` runs golden cases, aggregates pass/review/fail status, compares a v2 manifest with an optional legacy `apresentacao` baseline, and formats an operational report.

The local smoke golden set lives in `src/demo/presentation-v2-golden-benchmark.ts`. It uses the demo notebook fixture from `src/demo/notebook-data.ts`, compares `apresentacao_v2` against the legacy `apresentacao` artifact in the same notebook, and requires deterministic telemetry from `presentation_pipeline_v2`.

Smoke mode API calls are preempted by `src/api/demo-interceptor.ts`. That adapter must answer locally before the request reaches Vite's proxy, so preview smoke stays independent from a backend process and does not emit proxy errors for dashboard/stat endpoints.

Useful commands:

```bash
cd frontend
npm run test:presentation-v2
npm run test:presentation-v2:benchmark
npm run build:smoke
```

A Cycle 9 golden case should fail instead of silently passing when:

- the v2 manifest is not parseable;
- export readiness is critical;
- visual assets remain rejected in the final manifest;
- required alt text, speaker notes, source priority, design-system coverage, or telemetry are missing;
- failed Presentation v2 executions exceed the configured threshold.

Add new golden cases by creating additional `PresentationV2GoldenBenchmarkCase` entries with raw v2 content, optional v1 baseline content, relevant `llm_executions`, and case-specific thresholds when the default gate is too permissive or too strict for the scenario.
