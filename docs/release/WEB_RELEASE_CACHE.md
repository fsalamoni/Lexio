# Web Release Cache

Last update: 2026-04-22

## Execution Snapshot
- Branch: main
- Sync status: up-to-date with origin/main after fast-forward
- Local release hardening: completed

## Cached Diagnostics
- Detected risk: firebase-preview accepted FIREBASE_SERVICE_ACCOUNT in checks but did not authenticate with it for deploy/teardown.
- Detected risk: workflows lacked strict validation for malformed FIREBASE_SERVICE_ACCOUNT payloads.
- Mitigation applied: add service-account validation and explicit auth-path checks.

## Local Validation Cache
- frontend npm ci: completed
- frontend typecheck: completed
- frontend test: completed (35 files, 273 tests passed)
- frontend build: completed (vite build succeeded)
- functions npm ci: completed
- functions build: completed (tsc)
- python tests (pytest): completed (2203 passed)
- python lint (ruff): completed (all checks passed)

## Deployment Cache
- Commit: completed (a8d7ff6, 12b3963)
- Push to origin/main: completed
- Release workflow dispatch: completed (release-web.yml run 24692171412 success)

## Current Wave Cache (2026-04-22)
- Wave tag: wave21-mobile-progress-monotonic
- Scope: hardening do fallback do Redator para progresso monotônico + ajustes responsivos mobile em superfícies críticas + sincronização de governança.
- Files touched (core runtime):
	- frontend/src/lib/generation-service.ts
	- frontend/src/components/TaskBar.tsx
	- frontend/src/pages/NewDocument.tsx
	- frontend/src/pages/ResearchNotebook.tsx
- Files touched (governance/docs):
	- docs/PLANO.md
	- docs/release/WEB_RELEASE_CACHE.md
	- NOTEBOOK_IMPLEMENTATION_STATUS.md
	- docs/release/WEB_RELEASE_INDEX.md
	- docs/MANIFEST.json
	- README.md

## Current Validation Cache (2026-04-22)
- frontend typecheck: completed (TYPECHECK_OK)
- frontend test: completed (35 files, 273 tests passed)
- Known non-blocking output: React Router future-flag warnings in notebook V2 tests

## Pending Operational Cache
- Next operational block pending in this wave: finalize git flow (status, commit, pull/merge, push) and execute deploy lane.

## Release Workflow Outcomes
- First release-web dispatch (run 24692119664): startup_failure due caller permissions mismatch for reusable deploy workflows.
- Mitigation: updated `.github/workflows/release-web.yml` permissions to include `contents: write` and `id-token: write`.
- Final release-web dispatch (run 24692171412): success.
- Quality gates: success.
- Deploy Firebase production: success.
- Deploy GitHub Pages: success.
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`).
