# Web Release Cache

Last update: 2026-04-23

## Execution Snapshot
- Branch: main
- Sync status: up-to-date with origin/main after fast-forward
- Local release hardening: completed
- Wave 27 deploy verification: completed
- Wave 28 one-shot revalidation: completed
- Wave 29 execution-state hardening: completed (local validation)
- Wave 29 release closeout: completed (run 24853129457 success)

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
- Wave 29 commit + push: completed (`5bf59c4`)
- Release workflow dispatch (wave29): completed (release-web.yml run 24853129457 success)

## Current Wave Cache (2026-04-23)
- Wave tag: wave29-execution-state-latency2a
- Scope: hardening do contrato de execução/progresso com `executionState` explícito em pipelines documentais e task wrappers (Classic + V2), além de otimização de latência 2A no `generation-service` via paralelização segura de etapas independentes.
- Files touched (governance/docs):
	- docs/PLANO.md
	- NOTEBOOK_IMPLEMENTATION_STATUS.md
	- docs/MANIFEST.json
	- docs/release/WEB_RELEASE_INDEX.md
	- docs/release/WEB_RELEASE_CACHE.md

## Current Validation Cache (2026-04-23)
- frontend typecheck: completed (quality gates / frontend quality)
- frontend test: completed (quality gates / frontend quality)
- frontend build: completed (quality gates / frontend quality)
- frontend tests result: 37 files, 286 tests passed
- release-web dispatch (wave29): completed (run 24853129457)
- Deploy Firebase production (wave29): completed (job 72758972612)
- Deploy GitHub Pages / build (wave29): completed (job 72758972753)
- Deploy GitHub Pages / deploy (wave29): completed (job 72759201251)
- Release summary (wave29): completed (job 72759426235)
- Deploy redesign V2 (wave29): skipped by input (job 72758972846)
- Known non-blocking output: React Router future-flag warnings in notebook V2 tests
- Resolved baseline preserved: timeout intermitente em `pages-build-deployment` segue não reproduzido após migração para deploy oficial por artifact + `deploy-pages`.

## Pending Operational Cache
- None. Wave 29 closeout completed (git flow + release lane fully executed).

## Wave 29 Release Outcome
- release-web dispatch (run 24853129457): success.
- Quality gates: success.
- Deploy Firebase production (job 72758972612): success.
- Deploy GitHub Pages / build (job 72758972753): success.
- Deploy GitHub Pages / deploy (job 72759201251): success.
- Deploy redesign V2 (job 72758972846): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 72759426235): success.
- Key verification: trilho de release manteve estabilidade com o novo contrato explícito de executionState e com a otimização de latência 2A no gerador documental.

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
