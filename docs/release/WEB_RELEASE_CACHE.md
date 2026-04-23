# Web Release Cache

Last update: 2026-04-23

## Execution Snapshot
- Branch: main
- Sync status: up-to-date with origin/main after fast-forward
- Local release hardening: completed
- Wave 27 deploy verification: completed
- Wave 28 one-shot revalidation: completed

## Cached Diagnostics
- Detected risk: firebase-preview accepted FIREBASE_SERVICE_ACCOUNT in checks but did not authenticate with it for deploy/teardown.
- Detected risk: workflows lacked strict validation for malformed FIREBASE_SERVICE_ACCOUNT payloads.
- Mitigation applied: add service-account validation and explicit auth-path checks.

## Local Validation Cache
- frontend npm ci: completed
- frontend typecheck: completed
- frontend test: completed (37 files, 286 tests passed)
- frontend build: completed (vite build succeeded)
- functions npm ci: completed
- functions build: completed (tsc)
- python tests (pytest): completed (2203 passed)
- python lint (ruff): completed (all checks passed)

## Deployment Cache
- Hardening commit: completed (0e2cc72)
- Push to origin/main: completed
- Release workflow dispatch: completed (release-web.yml run 24849029535 success)
- Release workflow revalidation dispatch: completed (release-web.yml run 24849789759 success)

## Current Wave Cache (2026-04-23)
- Wave tag: wave28-release-one-shot-revalidation
- Scope: revalidação operacional one-shot do trilho de release em HEAD pós-hardening, confirmando estabilidade ponta a ponta de quality gates, deploy Firebase production e deploy GitHub Pages no modo oficial por artifact.
- Files touched (governance/docs):
	- docs/PLANO.md
	- NOTEBOOK_IMPLEMENTATION_STATUS.md
	- docs/MANIFEST.json
	- docs/release/WEB_RELEASE_INDEX.md
	- docs/release/WEB_RELEASE_CACHE.md
	- README.md

## Current Validation Cache (2026-04-23)
- frontend typecheck: completed (quality gates / frontend quality)
- frontend test: completed (quality gates / frontend quality)
- frontend build: completed (quality gates / frontend quality)
- release-web run 24849789759: completed (success)
- Deploy Firebase production: completed (success)
- Deploy GitHub Pages / build: completed (success)
- Deploy GitHub Pages / deploy: completed (success)
- Release summary: completed (success)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`)
- Known non-blocking output: React Router future-flag warnings in notebook V2 tests
- Resolved baseline preserved: timeout intermitente em `pages-build-deployment` segue não reproduzido após migração para deploy oficial por artifact + `deploy-pages`.

## Pending Operational Cache
- None. Wave 28 closeout completed (git flow + release lane fully executed).

## Wave 28 Release Outcome
- release-web dispatch (run 24849789759): success.
- Quality gates: success.
- Deploy Firebase production: success.
- Deploy GitHub Pages / build: success.
- Deploy GitHub Pages / deploy: success.
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`).
- Release summary: success.
- Key verification: rerun one-shot em HEAD pós-hardening confirmou estabilidade recorrente do trilho de release sem regressão.

## Wave 27 Release Outcome
- release-web dispatch (run 24849029535): success.
- Quality gates: success.
- Deploy Firebase production: success.
- Deploy GitHub Pages / build: success.
- Deploy GitHub Pages / deploy: success.
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`).
- Release summary: success.
- Key verification: workflow de Pages em modo `build_type=workflow` validado sem timeout no deploy.

## Wave 26 Release Outcome
- release-web dispatch (run 24846848597): success.
- Quality gates: success.
- Deploy Firebase production: success.
- Deploy GitHub Pages: success.
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`).
- Release summary: success.

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
