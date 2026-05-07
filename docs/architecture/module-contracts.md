# Module Contracts

Last update: 2026-05-07

This document defines what every Lexio module must expose and what it must avoid.

## Public API

Every domain module should expose a small public API through `index.ts`.

Recommended shape:

```text
frontend/src/lib/modules/<domain>/
  index.ts
  types.ts
  repository.ts
  service.ts
  pipeline.ts
  prompts.ts
  constants.ts
  *.test.ts
```

Only create files that have real content. Empty scaffolding is noise.

## Required Contract Per Module

Each module must document:

- Owned Firestore paths and collection groups, if any.
- Owned agent keys and model config keys, if any.
- Public functions/types exported from `index.ts`.
- External providers used by the module.
- Persistence guarantees and rollback behavior.
- Focused tests that protect the public API.

## Allowed Dependencies

- Module -> `frontend/src/lib/core/**`
- Module -> `frontend/src/lib/shared/**`
- Module -> its own files
- Module -> another module public `index.ts` only when there is no better core/shared contract

## Forbidden Dependencies

- Module -> `frontend/src/components/**`
- Module -> `frontend/src/pages/**`
- Module -> another module internal file
- `core` -> any domain module

## Compatibility During Extraction

Existing imports may be preserved through facades while callers migrate. A facade must stay thin and should not receive new business logic.

Examples of temporary facades:

- `frontend/src/lib/firestore-service.ts`
- `frontend/src/lib/generation-service.ts`
- `frontend/src/lib/model-config.ts`

## Done Criteria

A module extraction is not complete until:

1. Existing behavior is covered by tests or preserved by existing tests.
2. The old public import path still works or all call sites were migrated deliberately.
3. `npm run architecture:check`, `npm run typecheck`, `npm run test` and `npm run build` pass.
4. Docs and `docs/MANIFEST.json` reflect the new ownership.
