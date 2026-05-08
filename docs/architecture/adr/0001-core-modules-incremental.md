# ADR 0001 — Incremental Core And Modules Architecture

Date: 2026-05-07

## Status

Accepted

## Context

Lexio has grown into a browser-only React/TypeScript SaaS with many domains sharing a few central files. The largest risk is not missing functionality, but accidental coupling: changes to document generation, notebook, model config or Firestore persistence can affect unrelated flows.

## Decision

Lexio will evolve incrementally toward:

```text
frontend/src/lib/core/      shared neutral contracts/adapters
frontend/src/lib/shared/    pure utilities and stable constants
frontend/src/lib/modules/   product domain modules
frontend/src/lib/pipelines/ optional pipeline-specific modules
```

The migration will not be a big-bang rewrite. Existing public imports may remain temporarily through facades while internals move behind module APIs.

## Consequences

- Future features must identify a module owner before implementation.
- `core` remains small and domain-neutral.
- Product prompts, pipeline rules and repositories move to modules.
- Guardrails are required so future agents cannot silently reintroduce forbidden dependencies.
- Legacy files such as `firestore-service.ts`, `generation-service.ts` and `model-config.ts` become compatibility facades over time.
