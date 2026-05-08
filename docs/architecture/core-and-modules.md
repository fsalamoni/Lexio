# Core And Modules Architecture

Last update: 2026-05-07

## Goal

Lexio should evolve toward a stable core with independent domain modules. The core owns shared contracts and adapters. Modules own product behavior.

This keeps new features from changing central code paths unnecessarily and reduces the chance that one feature breaks another.

## Current State

The current frontend already has useful modular patterns:

- `frontend/src/lib/chat-orchestrator/` is a domain submodule.
- `frontend/src/lib/modules/dashboard/` is the first extracted product module with compatibility facades.
- `frontend/src/lib/modules/notebook/` now owns notebook progress contracts and pure notebook constants behind compatibility facades.
- `frontend/src/lib/modules/documents/` now owns document prompt metadata, profile prompt helpers, acervo prompt builders, acervo search helpers, the extracted Pesquisador user prompt and the first Documents Firestore repository behind compatibility exports from `generation-service.ts` and `firestore-service.ts`.
- `frontend/src/lib/modules/theses/` now owns the Thesis Bank Firestore repository behind compatibility exports from `firestore-service.ts`.
- `frontend/src/lib/modules/acervo/` now owns Acervo Firestore repository operations behind compatibility exports from `firestore-service.ts`.
- `frontend/src/lib/pipelines/agent-definitions/` now owns per-pipeline agent definition arrays behind compatibility exports from `model-config.ts`.
- `frontend/src/lib/platform-analytics.ts` now owns platform-wide Firestore aggregation, operational cost analytics and rollout policy calculations behind compatibility exports from `firestore-service.ts`.
- `frontend/src/lib/core/firestore/` now owns pure Firestore path/reference helpers shared by Firestore repositories and platform analytics.
- `frontend/src/lib/v3-agents/` extracts document V3 agents into isolated files.
- `frontend/src/pages/notebook/` contains page-local notebook helpers.

The main hotspots to reduce over time are:

- `frontend/src/lib/generation-service.ts`
- `frontend/src/lib/firestore-service.ts`
- `frontend/src/lib/model-config.ts`

Foundation work started after the Firestore cutover added the first automated architecture guardrail:

- `scripts/lexio-architecture-guardrails.mjs`
- `cd frontend && npm run architecture:check`
- CI hook in `.github/workflows/test.yml` under `Source guardrails`

The guardrail currently blocks `lib -> components`, `lib -> pages`, `core -> modules`, private cross-module imports, and direct OpenRouter API endpoints outside approved adapters.

## Target Shape

```text
frontend/src/lib/
  core/
    firebase/
    firestore/
    llm/
    errors/
    feature-flags/
    telemetry/
  modules/
    documents/
    notebook/
    thesis/
    dashboard/
    chat/
    admin/
    media/
    jurisprudence/
  pipelines/
    document-v2/
    document-v3/
    audio/
    video/
    presentation/
```

This is a target architecture, not a single large rewrite. Move behavior incrementally.

## Core Responsibilities

The core may contain:

- Firebase app initialization and database routing.
- Firestore reference/path helpers.
- Auth-aware retry and session recovery contracts.
- LLM client adapters and provider abstractions.
- Error normalization and humanization.
- Feature flag resolution.
- Cross-module telemetry and cost execution records.
- Shared domain primitives that are stable and UI-independent.

The core must not contain:

- UI components.
- Page-local state.
- Agent prompts for one domain.
- Workflow-specific business rules that belong to a module.

## Module Responsibilities

A module owns one domain and should expose a small API.

Recommended module contents:

```text
modules/<domain>/
  index.ts
  types.ts
  service.ts
  repository.ts
  prompts.ts
  pipeline.ts
  *.test.ts
```

Use only the files that make sense. Do not create empty structure for its own sake.

## Dependency Rules

Allowed:

```text
pages -> components -> lib modules -> lib core
pages -> lib modules
modules -> core
modules -> integrations
```

Forbidden:

```text
lib -> components
core -> modules
core -> pages
module A -> module B internals
```

If a module needs another module, expose a narrow public API from that module's `index.ts`.

## Incremental Extraction Order

Completed foundation extraction:

1. Extract dashboard data and V2 helpers into `frontend/src/lib/modules/dashboard/`, preserving `dashboard-data.ts` and `dashboard-v2.ts` as facades.
2. Extract notebook progress contracts and pure constants into `frontend/src/lib/modules/notebook/`, preserving `notebook-pipeline-progress.ts` and `notebook-constants.ts` as facades.
3. Extract document prompt metadata/profile helpers into `frontend/src/lib/modules/documents/`, preserving public exports from `generation-service.ts` while migrating `document-v3-orchestrator.ts` to the module API.
4. Extract document acervo prompt builders, JSON helper and keyword/prefilter helpers into `frontend/src/lib/modules/documents/`, preserving public `selectAcervoDocsForBuscador` compatibility from `generation-service.ts`.
5. Split model agent definitions by pipeline into `frontend/src/lib/pipelines/agent-definitions/`, preserving existing exports and scoped config registration from `model-config.ts`.
6. Extract platform analytics into `frontend/src/lib/platform-analytics.ts`, preserving platform admin/cost imports through `firestore-service.ts` compatibility exports.
7. Introduce pure Firestore path/reference helpers under `frontend/src/lib/core/firestore/`, migrating shared ID normalization, owner extraction, notebook memory path parsing and notebook path builders without changing public Firestore service imports.
8. Extract Documents CRUD and notebook-document persistence into `frontend/src/lib/modules/documents/repository.ts`, preserving public imports through `firestore-service.ts` compatibility exports.
9. Extract Thesis Bank CRUD/listing/stats into `frontend/src/lib/modules/theses/repository.ts`, preserving public imports through `firestore-service.ts` compatibility exports.
10. Extract Acervo CRUD, indexing reads, ementa/tag updates, text JSON conversion helpers and thesis-analysis markers into `frontend/src/lib/modules/acervo/repository.ts`, preserving public imports through `firestore-service.ts` compatibility exports.

Next safe extraction order:

1. Continue splitting high-risk Firestore repository operations only after tests are in place.
2. Move the next bounded domain repository, such as Research Notebook or user settings/profile, out of `firestore-service.ts`, preserving public imports until callers migrate.

## Compatibility Rule

Any extraction must preserve public imports until all callers migrate. Prefer barrel exports and adapter functions over large call-site rewrites.

## Testing Rule

Every module extraction needs at least one of:

- Existing tests still covering the old public API.
- New tests for the extracted module.
- A source-level guardrail when the risk is architectural, such as preventing `lib -> components` imports.

## Foundation Guardrails

Run before every modular refactor:

```bash
cd frontend
npm run architecture:check
```

If this fails, fix the boundary violation before continuing. Do not bypass the guardrail by moving UI, page state, or provider-specific behavior into `core`.

Detailed rules live in `docs/architecture/dependency-rules.md`.

## Firestore Migration Interaction

Do not combine broad modular refactors with data cutover. During Firestore isolation, core changes should be limited to database routing, backup/audit/migration tools, and documentation. Domain refactors come after backup and parity validation are stable.
