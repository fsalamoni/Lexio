# Web Release Cache

Last update: 2026-04-23

## Execution Snapshot
- Branch: main
- Sync status: up-to-date with origin/main after fast-forward
- Local release hardening: completed
- Wave 27 deploy verification: completed

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

## Current Wave Cache (2026-04-23)
- Wave tag: wave27-pages-workflow-deploy-hardening
- Scope: migração do deploy de GitHub Pages para o caminho oficial artifact-based (`configure-pages` + `upload-pages-artifact` + `deploy-pages`), reforço de permissões no orquestrador one-shot e validação em execução real de release.
- Files touched (workflows):
	- .github/workflows/deploy-pages.yml
	- .github/workflows/release-web.yml
- Files touched (governance/docs):
	- docs/PLANO.md
	- NOTEBOOK_IMPLEMENTATION_STATUS.md
	- docs/MANIFEST.json
	- docs/release/WEB_RELEASE_INDEX.md
	- docs/release/WEB_RELEASE_CACHE.md
	- README.md

## Current Validation Cache (2026-04-23)
- frontend typecheck: completed (TYPECHECK_OK)
- frontend test: completed (37 files, 286 tests passed)
- frontend build: completed (vite build succeeded)
- release-web run 24849029535: completed (success)
- Deploy Firebase production: completed (success)
- Deploy GitHub Pages / build: completed (success)
- Deploy GitHub Pages / deploy: completed (success)
- Release summary: completed (success)
- Known non-blocking output: React Router future-flag warnings in notebook V2 tests
- Resolved in this wave: timeout intermitente em `pages-build-deployment` não reproduzido após migração para deploy oficial por artifact + `deploy-pages`.

## Pending Operational Cache
- None. Wave 27 closeout completed (git flow + release lane fully executed).

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
