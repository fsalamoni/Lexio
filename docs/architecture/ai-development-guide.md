# AI Development Guide

Last update: 2026-05-07

## Purpose

This guide tells future AI agents how to modify Lexio without breaking data boundaries, architecture, or release safety.

## Before Editing

1. Read `docs/PLANO.md` and `docs/MANIFEST.json`.
2. Read the domain architecture document related to the change.
3. Check `git status --short --branch`.
4. Do not overwrite user changes.
5. If touching Firestore paths, read `docs/architecture/firestore-data-boundaries.md`.
6. If touching modules or pipelines, read `docs/architecture/core-and-modules.md` and `docs/architecture/module-system.md`.
7. Run `cd frontend && npm run architecture:check` after any import move or module extraction.

## Data Safety Rules

- Never delete Firestore or Storage data unless the user explicitly approves a cleanup plan.
- Migration scripts must default to dry-run.
- Any Firestore cutover must have backup, audit, shadow migration, parity validation, and rollback.
- Use `VITE_FIRESTORE_DATABASE_ID` for database routing; do not hardcode a production database ID in feature code.
- Keep `(default)` backward compatible until the migration is approved and stable.

## Architecture Rules

- UI consumes `lib`; `lib` never imports UI components.
- Core modules must stay domain-neutral.
- Domain modules own prompts, workflow rules, repositories, and tests for that domain.
- Avoid growing monoliths such as `generation-service.ts`, `firestore-service.ts`, and `model-config.ts` when a focused module can hold the change.
- Preserve existing exports while extracting internals.
- Fix architecture guardrail failures before continuing; do not suppress the guardrail unless the exception is documented in `docs/architecture/dependency-rules.md`.

## Module Refactoring Checklist

When extracting legacy code into a module:

1. Identify the owning domain in `docs/architecture/domain-map.md`.
2. Define or update the module public API in `index.ts`.
3. Keep old imports working through a thin facade until call sites migrate.
4. Keep UI in pages/components and return UI-neutral state from lib.
5. Run `npm run architecture:check`, `npm run typecheck`, `npm run test` and `npm run build`.
6. Update module docs and `docs/MANIFEST.json`.

## Guardrail Troubleshooting

- `lib code must not import UI components`: move notification/rendering to pages/components and pass callbacks or structured state into lib hooks.
- `lib code must not import pages`: move shared constants/types into `lib/shared` or the owning domain module.
- `core must not import domain modules`: introduce a core interface and let modules implement it.
- `modules may import another module only through its public index`: add the needed export to the target module `index.ts`.
- `direct OpenRouter API URL detected`: route through an approved provider adapter or document a narrow adapter exception.

## Firestore Development Checklist

When adding or changing persistent data:

1. Document the path.
2. Add or update TypeScript types in `frontend/src/lib/firestore-types.ts` or the relevant module types.
3. Update Firestore rules if access changes.
4. Update indexes if queries require them.
5. Add tests or guardrails for auth-sensitive access.
6. Update `docs/architecture/firestore-data-boundaries.md` if the path is new.
7. Ensure admin collection-group reads still degrade safely.

## Pipeline Development Checklist

When adding or changing a pipeline or agent:

1. Keep all LLM calls behind `callLLM()` or `callLLMWithMessages()`.
2. Register agent model definitions through the established model config path.
3. Keep user-scoped model settings in `/users/{uid}/settings/preferences`.
4. Preserve progress truth: running tasks must stay below 100 until durable persistence completes.
5. Keep fallback behavior deterministic when an LLM or provider fails.
6. Add focused tests for prompt routing, fallback, and persistence metadata.

## Release Checklist

Before closing a branch:

1. Run targeted tests for touched modules.
2. Run `npm run typecheck` in `frontend` when frontend code changed.
3. Run `npm run build` before deploy or PR closeout.
4. Run `npm run architecture:check` when frontend imports or modules changed.
5. Update docs and manifest when behavior or architecture changed.
6. Push branch and open PR; do not merge migration work to `main` without explicit approval.
7. After merge to `main`, Firebase deploy runs on push; GitHub Pages requires the release one-shot workflow.

## Migration-Specific Commands

Backup source:

```bash
node scripts/firebase-cloud-sync.mjs --project hocapp-44760 --database-id "(default)" --include-storage-download --verify-manifest
```

Audit snapshot:

```bash
node scripts/lexio-firestore-audit.mjs --snapshot backups/firebase-cloud/<timestamp>/firestore.snapshot.json
```

Dry-run migration:

```bash
node scripts/lexio-firestore-migrate-shadow.mjs --snapshot backups/firebase-cloud/<timestamp>/firestore.snapshot.json --project hocapp-44760 --target-database-id lexio-prod
```

Validate parity:

```bash
node scripts/lexio-firestore-validate-shadow.mjs --source-snapshot backups/firebase-cloud/<source>/firestore.snapshot.json --target-snapshot backups/firebase-cloud/<target>/firestore.snapshot.json --fail-on-mismatch
```
