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
- Wave 30 aux execution-state hardening: completed (local validation)
- Wave 30 release closeout: completed (run 24854808367 success)
- Wave 31 execution-state analytics hardening: completed (local validation)
- Wave 31 release closeout: completed (run 24857074922 success)
- Wave 32 agent demonstration + latency tuning: completed (local validation)
- Wave 32 release closeout: completed (run 24859770023 success)
- Cross-platform handoff package: completed

## Cached Diagnostics
- Detected risk: firebase-preview accepted FIREBASE_SERVICE_ACCOUNT in checks but did not authenticate with it for deploy/teardown.
- Detected risk: workflows lacked strict validation for malformed FIREBASE_SERVICE_ACCOUNT payloads.
- Mitigation applied: add service-account validation and explicit auth-path checks.

## Local Validation Cache
- frontend npm ci: completed
- frontend typecheck: completed
- frontend test: completed (38 files, 290 tests passed)
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
- Wave 30 commit + push: completed (`681c767`)
- Release workflow dispatch (wave30): completed (release-web.yml run 24854808367 success)
- Wave 31 commit + push: completed (`9c02d57`)
- Release workflow dispatch (wave31): completed (release-web.yml run 24857074922 success)
- Wave 32 commit + push: completed (`7b2d321`)
- Release workflow dispatch (wave32): completed (release-web.yml run 24859770023 success)
- Wave 32 docs closeout commit + push: completed (`519835a`)

## Current Wave Cache (2026-04-23)
- Wave tag: wave32-agent-demo-latency-tuning
- Scope: demonstração explícita dos agentes trabalhando no `PlatformAdminPanel` com telemetria real recente, hotspot de latência/custo por `execution_state` (inclusive função+estado) e exposição de `Duração média` nas tabelas de custos pessoal/agregada.
- Files touched (wave32/code+docs):
	- frontend/src/lib/firestore-service.ts
	- frontend/src/pages/PlatformAdminPanel.tsx
	- frontend/src/pages/CostTokensPage.tsx
	- frontend/src/pages/PlatformCostsPage.tsx
	- docs/PLANO.md
	- NOTEBOOK_IMPLEMENTATION_STATUS.md
	- docs/release/WEB_RELEASE_INDEX.md
	- docs/MANIFEST.json
	- docs/release/WEB_RELEASE_CACHE.md
	- docs/release/CROSS_PLATFORM_HANDOFF.md

## Current Validation Cache (2026-04-23)
- frontend typecheck: completed
- frontend test: completed
- frontend build: completed
- frontend tests result: 38 files, 290 tests passed
- release-web dispatch (wave32): completed (run 24859770023)
- Deploy Firebase production (wave32): completed (job 72782268742)
- Deploy GitHub Pages / build (wave32): completed (job 72782268873)
- Deploy GitHub Pages / deploy (wave32): completed (job 72782441213)
- Release summary (wave32): completed (job 72782695792)
- Deploy redesign V2 (wave32): skipped by input (job 72782269072)
- Known non-blocking output: React Router future-flag warnings in notebook V2 tests
- Resolved baseline preserved: timeout intermitente em `pages-build-deployment` segue não reproduzido após migração para deploy oficial por artifact + `deploy-pages`.

## Pending Operational Cache
- None. Wave 32 closeout completed (git flow + release lane fully executed).

## Wave 32 Release Outcome
- release-web dispatch (run 24859770023): success.
- Quality gates: success.
- Deploy Firebase production (job 72782268742): success.
- Deploy GitHub Pages / build (job 72782268873): success.
- Deploy GitHub Pages / deploy (job 72782441213): success.
- Deploy redesign V2 (job 72782269072): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 72782695792): success.
- Key verification: trilha one-shot confirmou a nova demonstração operacional de agentes e a leitura de latência média por estado/função sem regressão nos quality gates nem nos deploys.

## Wave 31 Release Outcome
- release-web dispatch (run 24857074922): success.
- Quality gates: success.
- Deploy Firebase production (job 72772882122): success.
- Deploy GitHub Pages / build (job 72772882211): success.
- Deploy GitHub Pages / deploy (job 72773090237): success.
- Deploy redesign V2 (job 72772882473): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 72773344525): success.
- Key verification: trilho one-shot manteve estabilidade com a nova dimensão de analytics por `execution_state`, sem regressão nos quality gates e nos deploys de produção.

## Wave 30 Release Outcome
- release-web dispatch (run 24854808367): success.
- Quality gates: success.
- Deploy Firebase production (job 72764941682): success.
- Deploy GitHub Pages / build (job 72764941896): success.
- Deploy GitHub Pages / deploy (job 72765128773): success.
- Deploy redesign V2 (job 72764942409): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 72765376017): success.
- Key verification: trilho one-shot manteve estabilidade após a expansão do contrato explícito de `executionState` para pipelines auxiliares e wrappers V1/V2.

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
