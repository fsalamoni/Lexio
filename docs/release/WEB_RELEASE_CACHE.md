# Web Release Cache

Last update: 2026-05-05

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
- Wave 33 operational tuning by function: completed (local validation)
- Wave 33 release closeout: completed (run 24917396554 success)
- Wave 34 daily execution-state comparison: completed (local validation)
- Wave 34 release closeout: completed (run 24917777336 success)
- Wave 35 daily function-window comparison: completed (local validation)
- Wave 35 release closeout: completed (run 24919036006 success)
- Wave 36 calibração adaptativa por função: completed (local validation)
- Wave 36 release closeout: completed (run 24919950308 success)
- Wave 37 aderência diária live vs alvo por função: completed (local validation)
- Wave 37 release closeout: completed (run 24930689755 success)
- Wave 38 política progressiva por criticidade + guardrails preditivos: completed (local validation)
- Wave 38 release closeout: completed (run 24933092299 success)
- Wave 39 confiança adaptativa no rollout progressivo + mitigação de falsos positivos: completed (local validation)
- Wave 39 release closeout: completed (run 24939740593 success)
- Wave 40 subonda 1 latência documental + progresso confiável + handoff lúdico: completed (local validation em branch)

## Cached Diagnostics
- Detected risk: firebase-preview accepted FIREBASE_SERVICE_ACCOUNT in checks but did not authenticate with it for deploy/teardown.
- Detected risk: workflows lacked strict validation for malformed FIREBASE_SERVICE_ACCOUNT payloads.
- Mitigation applied: add service-account validation and explicit auth-path checks.

## Local Validation Cache
- frontend npm ci: completed
- frontend typecheck: completed
- frontend test: completed (38 files, 299 tests passed)
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
- Wave 32 docs closeout commit + push: completed (recorded in `main` history)
- Wave 33 commit + push: completed (`80dc5c6`)
- Release workflow dispatch (wave33): completed (release-web.yml run 24917396554 success)
- Wave 34 commit + push: completed (`4cc2432`)
- Release workflow dispatch (wave34): completed (release-web.yml run 24917777336 success)
- Wave 35 commit + push: completed (`cf5b673`)
- Release workflow dispatch (wave35): completed (release-web.yml run 24919036006 success)
- Wave 36 commit + push: completed (`cfdb2ac`)
- Release workflow dispatch (wave36): completed (release-web.yml run 24919950308 success)
- Wave 37 commit + push: completed (`db87300`)
- Release workflow dispatch (wave37): completed (release-web.yml run 24930689755 success)
- Wave 38 commit + push: completed (`f5cbf57`)
- Release workflow dispatch (wave38): completed (release-web.yml run 24933092299 success)
- Wave 39 commit + push: completed (`a2ed246`)
- Release workflow dispatch (wave39): completed (release-web.yml run 24939740593 success)

## Current Wave Cache (2026-05-05)

- Wave tag: wave40-latency-progress-contract-subwave2
- Scope: segunda subonda da Wave 40 consolidando caches user-scoped, canários runtime, progresso explícito ponta a ponta, retomada real do pipeline de vídeo por checkpoint, fechamento da validação longitudinal do admin por perfil operacional de thresholds e a trilha jurisprudencial completa desta rodada: reranking semântico browser-side + reranking jurídico com fallback funcional compartilhado + memória semântica persistente por caderno.
- Files touched (wave40/code+docs):
	- frontend/src/lib/document-pipeline.ts
	- frontend/src/pages/NewDocument.tsx
	- frontend/src/pages/DocumentDetail.tsx
	- frontend/src/lib/notebook-audio-pipeline.ts
	- frontend/src/lib/generation-service.ts
	- frontend/src/lib/generation-service.orchestration.test.ts
	- frontend/src/lib/datajud-service.ts
	- frontend/src/lib/datajud-service.test.ts
	- frontend/src/lib/firestore-service.ts
	- frontend/src/lib/firestore-types.ts
	- frontend/src/lib/v3-agents/jurisprudence-researcher.ts
	- frontend/src/components/AgentTrailProgressModal.tsx
	- frontend/src/components/VideoGenerationCostModal.tsx
	- frontend/src/lib/video-generation-pipeline.ts
	- frontend/src/lib/video-generation-pipeline.test.ts
	- frontend/src/pages/ResearchNotebook.tsx
	- frontend/src/pages/labs/ResearchNotebookV2.tsx
	- frontend/src/pages/PlatformAdminPanel.tsx
	- docs/PLANO.md
	- NOTEBOOK_IMPLEMENTATION_STATUS.md
	- docs/release/WEB_RELEASE_INDEX.md
	- docs/MANIFEST.json
	- docs/release/WEB_RELEASE_CACHE.md
	- docs/release/SUBONDA2_CLOSEOUT.md
	- docs/release/CROSS_PLATFORM_HANDOFF.md

## Current Validation Cache (2026-05-05)
- frontend typecheck: completed (`npm run typecheck` com `TYPECHECK_EXIT:0`)
- frontend focused test: completed
- frontend focused tests result: `src/lib/video-generation-pipeline.test.ts` passou (4/4) e `src/lib/datajud-service.test.ts` passou (73/73)
- frontend build: completed (`vite build` em 14.02s)
- frontend diagnostics: completed (`get_errors` limpo em `frontend/` após a integração da memória semântica)
- frontend public smoke: completed (`npm run preview -- --host 127.0.0.1 --port 4173`; `/login` carregou com sucesso no browser local)
- frontend authenticated smoke: completed in local smoke mode (`npm run build:smoke` + `npm run preview:smoke`; fluxo validado com rejeição de senha incorreta, login fixo, dashboard/admin/notebook)
- release-web dispatch (wave40): not started (subonda em branch)
- Quality gates (wave40): validação local forte do lote atual (typecheck + build + testes focados + diagnostics limpos nos arquivos alterados)
- Deploy Firebase production (wave40): pending closeout da wave
- Deploy GitHub Pages (wave40): pending closeout da wave
- Release summary (wave40): pending closeout da wave
- Known non-blocking output: React Router future-flag warnings in notebook V2 tests
- Resolved baseline preserved: timeout intermitente em `pages-build-deployment` segue não reproduzido após migração para deploy oficial por artifact + `deploy-pages`.

## Pending Operational Cache
- Wave 40 closeout pendente: commit/push do `main`, dispatch one-shot de release e atualização final dos IDs de validação/deploy. A Faixa C de jurisprudência não tem mais gap funcional aberto nesta subonda; o que resta é trilha operacional de fechamento.
- Observação operacional: o smoke autenticado local foi destravado com build explícito em smoke/demo; uma revalidação com Firebase Auth real pode ser feita depois, sem bloquear este closeout.

## Wave 39 Release Outcome
- release-web dispatch (run 24939740593): success.
- Quality gates: success.
- Deploy Firebase production (job 73031401264): success.
- Deploy GitHub Pages / build (job 73031401290): success.
- Deploy GitHub Pages / deploy (job 73031468718): success.
- Deploy redesign V2 (job 73031401347): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 73031560811): success.
- Key verification: a política progressiva com confiança adaptativa por função (bandas `high_confidence`/`medium_confidence`/`low_confidence`, thresholds preditivos dinâmicos e mitigação de falsos positivos) foi promovida no painel admin sem regressões de qualidade/deploy e mantendo a demonstração multiagente explicitamente alinhada.

## Wave 38 Release Outcome
- release-web dispatch (run 24933092299): success.
- Quality gates: success.
- Deploy Firebase production (job 73014056225): success.
- Deploy GitHub Pages / build (job 73014056272): success.
- Deploy GitHub Pages / deploy (job 73014131480): success.
- Deploy redesign V2 (job 73014056331): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 73014216569): success.
- Key verification: a política progressiva por criticidade com guardrails preditivos (drift combinado retry + waiting I/O, streaks de aderência e recomendações `tighten_now`/`tighten_guarded`/`hold`/`relax_guarded`) foi promovida no painel admin sem regressões de qualidade/deploy e mantendo a demonstração multiagente.

## Wave 37 Release Outcome
- release-web dispatch (run 24930689755): success.
- Quality gates: success.
- Deploy Firebase production (job 73007901714): success.
- Deploy GitHub Pages / build (job 73007901743): success.
- Deploy GitHub Pages / deploy (job 73007952932): success.
- Deploy redesign V2 (job 73007901740): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 73008038665): success.
- Key verification: a aderência diária live versus alvo por função (cobertura, estabilidade, tendência 7d e recomendações de rollout assistido) foi promovida no painel admin sem regressões de qualidade/deploy e mantendo a demonstração multiagente.

## Wave 36 Release Outcome
- release-web dispatch (run 24919950308): success.
- Quality gates: success.
- Deploy Firebase production (job 72979501786): success.
- Deploy GitHub Pages / build (job 72979501863): success.
- Deploy GitHub Pages / deploy (job 72979567744): success.
- Deploy redesign V2 (job 72979501818): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 72979652973): success.
- Key verification: plano adaptativo por função (alvos + prioridade + ação) e leitura live da demonstração de agentes versus alvo foram promovidos com sucesso no painel admin, sem regressões de qualidade e deploy.

## Wave 35 Release Outcome
- release-web dispatch (run 24919036006): success.
- Quality gates: success.
- Deploy Firebase production (job 72976938644): success.
- Deploy GitHub Pages / build (job 72976938671): success.
- Deploy GitHub Pages / deploy (job 72977011670): success.
- Deploy redesign V2 (job 72976938808): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 72977113533): success.
- Key verification: comparativo diário por função (janela atual/anterior, deltas de custo/latência/retry/fallback/waiting I/O e recomendações por hotspot) foi promovido com sucesso no painel admin, mantendo a demonstração operacional dos agentes sem regressões de qualidade/deploy.

## Wave 34 Release Outcome
- release-web dispatch (run 24917777336): success.
- Quality gates: success.
- Deploy Firebase production (job 72973266685): success.
- Deploy GitHub Pages / build (job 72973266761): success.
- Deploy GitHub Pages / deploy (job 72973349766): success.
- Deploy redesign V2 (job 72973266829): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 72973480926): success.
- Key verification: comparativo diário por `execution_state` (trend + janela atual/anterior) foi promovido em produção com demonstração operacional no painel admin, sem regressão nos quality gates e deploys.

## Wave 33 Release Outcome
- release-web dispatch (run 24917396554): success.
- Quality gates: success.
- Deploy Firebase production (job 72972122974): success.
- Deploy GitHub Pages / build (job 72972123057): success.
- Deploy GitHub Pages / deploy (job 72972206796): success.
- Deploy redesign V2 (job 72972123010): skipped by input (`deploy_redesign_v2=false`).
- Release summary (job 72972336724): success.
- Key verification: a calibração automática por função no painel admin e a persistência enriquecida de retry/fallback no pipeline documental foram validadas em trilha one-shot sem regressão nos quality gates nem nos deploys de produção.

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
