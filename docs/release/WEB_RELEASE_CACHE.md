# Web Release Cache

Last update: 2026-04-23

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
- Commit: completed (480631e)
- Push to origin/main: completed
- Release workflow dispatch: completed (release-web.yml run 24846026963 success)

## Current Wave Cache (2026-04-23)
- Wave tag: wave25-runtime-telemetry-safe-area-mobile-hardening
- Scope: diagnóstico adaptativo por runtime em acervo/vídeo com persistência de telemetria por execução (`llm_executions`), hardening final de safe-area para painéis mobile e sincronização governada de documentação.
- Files touched (core runtime):
	- frontend/src/lib/runtime-concurrency.ts
	- frontend/src/lib/runtime-concurrency.test.ts
	- frontend/src/lib/cost-analytics.ts
	- frontend/src/lib/notebook-acervo-analyzer.ts
	- frontend/src/lib/notebook-acervo-analyzer.test.ts
	- frontend/src/lib/video-generation-pipeline.ts
	- frontend/src/lib/video-generation-pipeline.test.ts
	- frontend/src/components/DraggablePanel.tsx
	- frontend/src/components/DraggablePanel.test.tsx
	- frontend/src/pages/ResearchNotebook.tsx
	- frontend/src/pages/labs/ResearchNotebookV2.tsx
- Files touched (governance/docs):
	- docs/PLANO.md
	- NOTEBOOK_IMPLEMENTATION_STATUS.md
	- docs/MANIFEST.json
	- docs/release/WEB_RELEASE_INDEX.md
	- README.md
	- docs/release/WEB_RELEASE_CACHE.md

## Current Validation Cache (2026-04-23)
- frontend typecheck: completed (TYPECHECK_OK)
- frontend test: completed (37 files, 283 tests passed)
- frontend build: completed (vite build succeeded)
- Known non-blocking output: React Router future-flag warnings in notebook V2 tests
- Resolved in this wave: telemetria de runtime passou a ser preservada no ciclo completo (pipeline -> persistência -> extração) sem regressão de typecheck/test/build.

## Pending Operational Cache
- None. Wave 25 closeout completed (git flow + release lane fully executed).

## Wave 25 Release Outcome
- release-web dispatch (run 24846026963): success.
- Quality gates: success.
- Deploy Firebase production: success.
- Deploy GitHub Pages: success.
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`).
- Release summary: success.

## Wave 24 Release Outcome
- release-web dispatch (run 24844567171): success.
- Deploy Firebase production: success.
- Deploy GitHub Pages: success.
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`).
- Release summary: success.

## Wave 23 Release Outcome
- release-web dispatch (run 24841471763): success.
- Quality gates: success.
- Deploy Firebase production: success.
- Deploy GitHub Pages: success.
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`).
- Release summary: success.

## Release Workflow Outcomes
- First release-web dispatch (run 24692119664): startup_failure due caller permissions mismatch for reusable deploy workflows.
- Mitigation: updated `.github/workflows/release-web.yml` permissions to include `contents: write` and `id-token: write`.
- Final release-web dispatch (run 24692171412): success.
- Quality gates: success.
- Deploy Firebase production: success.
- Deploy GitHub Pages: success.
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`).

## Wave 22 Release Outcome
- release-web dispatch (run 24815485030): success.
- Quality gates: success.
- Deploy Firebase production: success.
- Deploy GitHub Pages: success.
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`).
- Release summary: success.
