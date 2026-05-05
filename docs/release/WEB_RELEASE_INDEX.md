# Web Release Index

Last update: 2026-05-05

## Current Validation Baseline (Wave 40 — 2026-05-05, branch main)
- Scope: subonda 2 da Wave 40 com caches user-scoped, canários runtime, retomada real do pipeline de vídeo por checkpoint, validação longitudinal do admin fechada por perfil operacional e fechamento da trilha jurisprudencial com rerank semântico browser-side, fallback jurídico local/LLM compartilhado e memória semântica persistente por caderno
- Frontend typecheck: success (`npm run typecheck`, exit code `0`)
- Frontend focused tests: success (`src/lib/video-generation-pipeline.test.ts`, 4/4; `src/lib/datajud-service.test.ts`, 73/73)
- Frontend build: success
- Frontend diagnostics: success (`get_errors` limpo em `frontend/` após a integração da memória semântica)
- Frontend public smoke: success (`vite preview` local + `/login` carregado no browser)
- Frontend authenticated smoke: success in local smoke mode (`npm run build:smoke` + `npm run preview:smoke`; credenciais fixas rejeitam senha incorreta e autenticam no fallback local até dashboard/admin/notebook)
- Branch status: Wave 40 closeout concluído em `main`; payload funcional validado neste ciclo: `162224f`
- Firebase deploy on push: success (`firebase-deploy.yml` run `25405834740`)
- release-web one-shot for Pages: success (`release-web.yml` run `25405834580`)
- Key deltas:
	- `generation-service.ts` manteve a subonda 2 tipada/validável ao remover wrappers de mock incompatíveis com o `tsc` em `generation-service.orchestration.test.ts`
	- `video-generation-pipeline.ts`, `VideoGenerationCostModal.tsx`, `ResearchNotebook.tsx` e `ResearchNotebookV2.tsx` agora retomam o vídeo a partir de `VideoCheckpoint` com opção explícita de reinício
	- `PlatformAdminPanel.tsx` agora fecha a leitura longitudinal também por perfil operacional de thresholds e consegue readotar o melhor combo histórico completo
	- `datajud-service.ts` agora combina ranking lexical com reranking semântico por embeddings, memória semântica persistente por caderno e fusão histórica de fontes jurisprudenciais, além de centralizar o fallback jurídico local/LLM usado pelo notebook clássico, notebook V2 e agente v3

## Previous One-shot Validation (Wave 39 — 2026-04-25)
- release-web run `24939740593`: success
- Head commit: `a2ed246`
- Quality gates: success (functions quality `73031338133`, lint `73031338134`, source guardrails `73031338135`, frontend quality `73031338137`, unit tests `73031338143`)
- Deploy Firebase production: success (`job 73031401264`)
- Deploy GitHub Pages / build: success (`job 73031401290`)
- Deploy GitHub Pages / deploy: success (`job 73031468718`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 73031401347`)
- Release summary: success (`job 73031560811`)

## Latest One-shot Validation (Wave 38 — 2026-04-25)
- release-web run `24933092299`: success
- Head commit: `f5cbf57`
- Quality gates: success (source guardrails `73013994216`, frontend quality `73013994220`, lint `73013994224`, unit tests `73013994226`, functions quality `73013994229`)
- Deploy Firebase production: success (`job 73014056225`)
- Deploy GitHub Pages / build: success (`job 73014056272`)
- Deploy GitHub Pages / deploy: success (`job 73014131480`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 73014056331`)
- Release summary: success (`job 73014216569`)

## Latest One-shot Validation (Wave 37 — 2026-04-25)
- release-web run `24930689755`: success
- Head commit: `db87300`
- Quality gates: success (lint `73007836380`, unit tests `73007836384`, source guardrails `73007836385`, frontend quality `73007836396`, functions quality `73007836430`)
- Deploy Firebase production: success (`job 73007901714`)
- Deploy GitHub Pages / build: success (`job 73007901743`)
- Deploy GitHub Pages / deploy: success (`job 73007952932`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 73007901740`)
- Release summary: success (`job 73008038665`)

## Latest One-shot Validation (Wave 36 — 2026-04-25)
- release-web run `24919950308`: success
- Head commit: `cfdb2ac`
- Quality gates: success (unit tests `72979425700`, functions quality `72979425703`, source guardrails `72979425705`, frontend quality `72979425706`, lint `72979425707`)
- Deploy Firebase production: success (`job 72979501786`)
- Deploy GitHub Pages / build: success (`job 72979501863`)
- Deploy GitHub Pages / deploy: success (`job 72979567744`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 72979501818`)
- Release summary: success (`job 72979652973`)

## Release Entry Points
- .github/workflows/release-web.yml
- .github/workflows/firebase-deploy.yml
- .github/workflows/deploy-pages.yml
- .github/workflows/firebase-redesign-v2.yml
- .github/workflows/test.yml

## Latest One-shot Validation (Wave 35 — 2026-04-25)
- release-web run `24919036006`: success
- Head commit: `cf5b673`
- Quality gates: success (frontend quality `72976871261`, functions quality `72976871264`, unit tests `72976871272`, lint `72976871275`, source guardrails `72976871279`)
- Deploy Firebase production: success (`job 72976938644`)
- Deploy GitHub Pages / build: success (`job 72976938671`)
- Deploy GitHub Pages / deploy: success (`job 72977011670`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 72976938808`)
- Release summary: success (`job 72977113533`)

## Latest One-shot Validation (Wave 34 — 2026-04-25)
- release-web run `24917777336`: success
- Head commit: `4cc2432`
- Quality gates: success (lint `72973180460`, functions quality `72973180461`, frontend quality `72973180463`, unit tests `72973180467`, source guardrails `72973180468`)
- Deploy Firebase production: success (`job 72973266685`)
- Deploy GitHub Pages / build: success (`job 72973266761`)
- Deploy GitHub Pages / deploy: success (`job 72973349766`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 72973266829`)
- Release summary: success (`job 72973480926`)

## Latest One-shot Validation (Wave 33 — 2026-04-24)
- release-web run `24917396554`: success
- Head commit: `80dc5c6`
- Quality gates: success (functions quality `72972033397`, source guardrails `72972033399`, lint `72972033400`, unit tests `72972033411`, frontend quality `72972033424`)
- Deploy Firebase production: success (`job 72972122974`)
- Deploy GitHub Pages / build: success (`job 72972123057`)
- Deploy GitHub Pages / deploy: success (`job 72972206796`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 72972123010`)
- Release summary: success (`job 72972336724`)

## Latest One-shot Validation (Wave 32 — 2026-04-23)
- release-web run `24859770023`: success
- Head commit: `7b2d321`
- Quality gates: success (lint `72782091769`, source guardrails `72782091795`, unit tests `72782091782`, functions quality `72782091775`, frontend quality `72782091797`)
- Deploy Firebase production: success (`job 72782268742`)
- Deploy GitHub Pages / build: success (`job 72782268873`)
- Deploy GitHub Pages / deploy: success (`job 72782441213`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 72782269072`)
- Release summary: success (`job 72782695792`)

## Latest One-shot Validation (Wave 31 — 2026-04-23)
- release-web run `24857074922`: success
- Head commit: `9c02d57`
- Quality gates: success (lint `72772645851`, source guardrails `72772645844`, unit tests `72772645862`, functions quality `72772645831`, frontend quality `72772645893`)
- Deploy Firebase production: success (`job 72772882122`)
- Deploy GitHub Pages / build: success (`job 72772882211`)
- Deploy GitHub Pages / deploy: success (`job 72773090237`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 72772882473`)
- Release summary: success (`job 72773344525`)

## Previous Local Validation (Wave 39 — 2026-04-25)
- Scope: confiança adaptativa no rollout progressivo por função, com thresholds preditivos dinâmicos, distribuição de confiança, watchlist de baixa confiança e alinhamento explícito com a demonstração dos agentes no `PlatformAdminPanel`
- Frontend typecheck: success
- Frontend tests: success (38 files, 299 tests)
- Frontend build: success
- Functions build: success (`npm run build`)
- Python tests: success (2203 passed)
- Release dispatch: completed (`release-web.yml` run `24939740593`)
- Docs closeout sync: completed (planning/status/index/manifest/cache/handoff synchronized with final IDs)

## Firebase Auth and Secret Validation
- scripts/validate-firebase-service-account.mjs
- scripts/firebase-authorized-domains.mjs

## Related Config
- firebase.json
- .firebaserc
- functions/src/index.ts
- frontend/src/lib/firestore-types.ts
- frontend/src/lib/firestore-service.ts
- frontend/src/pages/PlatformAdminPanel.tsx
- frontend/src/lib/generation-service.ts
- frontend/src/lib/document-pipeline.ts
- frontend/src/lib/pipeline-execution-contract.ts
- frontend/src/lib/runtime-concurrency.ts
- frontend/src/lib/cost-analytics.ts
- frontend/src/lib/notebook-acervo-analyzer.ts
- frontend/src/lib/notebook-studio-pipeline.ts
- frontend/src/lib/audio-generation-pipeline.ts
- frontend/src/lib/presentation-generation-pipeline.ts
- frontend/src/lib/video-generation-pipeline.ts
- frontend/src/lib/literal-video-production.ts
- frontend/src/lib/video-pipeline-progress.ts
- frontend/src/components/DraggablePanel.tsx
- frontend/src/components/TaskBar.tsx
- frontend/src/components/AgentTrailProgressModal.tsx
- frontend/src/components/PipelineProgressPanel.tsx
- frontend/src/pages/NewDocument.tsx
- frontend/src/pages/ResearchNotebook.tsx
- frontend/src/pages/labs/ResearchNotebookV2.tsx
- frontend/src/pages/CostTokensPage.tsx
- frontend/src/pages/PlatformCostsPage.tsx
- frontend/src/contexts/TaskManagerContext.tsx

## Runtime Hardening (2026-04-22)
- Document pipeline now supports Redator rollout via `VITE_DOC_REDATOR_10K_ENABLED` with optional quality rollback controls (`VITE_DOC_REDATOR_QUALITY_ROLLBACK_MIN`, `VITE_DOC_REDATOR_QUALITY_ROLLBACK_DISABLED`).
- Running progress across notebook task wrappers is normalized to remain `<=99%` until persistence is complete.
- `TaskManagerContext` remains the source of truth for task completion (`100%` only after promise resolve).
- Redator rollback execution no longer pushes runtime back to a prior stage in UI; fallback and recheck now stay in `qualidade`, preserving monotonic stage semantics.
- Mobile hardening applied to `TaskBar`, `NewDocument` and `ResearchNotebook` interaction rows to avoid overflow/compression on narrow screens.
- Wave 22 adds safe parallelization in independent steps: thesis/acervo lightweight context loading in document generation, controlled batch concurrency in notebook acervo analysis, and controlled parallel TTS batches in video generation.
- Progress surfaces received residual mobile hardening (`AgentTrailProgressModal` and `PipelineProgressPanel`) to preserve readability under constrained widths.
- Wave 23 introduces adaptive concurrency controls for acervo/video media steps (`VITE_NB_ACERVO_ANALISTA_CONCURRENCY`, `VITE_VIDEO_IMAGE_BATCH_CONCURRENCY`, `VITE_VIDEO_TTS_BATCH_CONCURRENCY`) with hardware-aware caps.
- `DraggablePanel` now enforces a compact mobile geometry mode globally (clamped position/size, drag-resize guardrails in narrow viewports) to improve modal stability on small screens.
- Wave 24 centralizes adaptive concurrency policy in `runtime-concurrency.ts`, including runtime hints for CPU/memory/network to calibrate batch workers safely on constrained devices.
- `DraggablePanel` now reads `visualViewport` and keeps compact geometry bounded to the real visible area (including mobile keyboard/browser chrome shifts).
- `ResearchNotebookV2` removed a redundant dynamic import of `artifact-parsers`, eliminating mixed static/dynamic chunk advisory in frontend builds.
- Wave 25 adds adaptive-concurrency diagnostics (`runtimeCap`, `limiters`, `runtime profile key`) and propagates this telemetry through acervo/video execution records (`runtime_profile`, `runtime_hints`, `runtime_concurrency`, `runtime_cap`).
- `DraggablePanel` now also accounts for safe-area insets (`env(safe-area-inset-*)`), enlarges touch targets in compact mode, and recomputes compact geometry on orientation changes.
- Runtime/mobile regressions are now covered by dedicated tests in `runtime-concurrency.test.ts`, `notebook-acervo-analyzer.test.ts`, `video-generation-pipeline.test.ts`, and `DraggablePanel.test.tsx`.
- Wave 26 calibrates automatic concurrency targets by runtime profile (`unknown`, `constrained`, `balanced`, `performant`, `high_end`) while keeping explicit env overrides authoritative.
- Adaptive diagnostics now include target source (`auto|env`) and profile metadata in formatted stage traces and runtime profile keys for downstream telemetry analysis.
- `DraggablePanel` now force-prioritizes compact geometry on narrow viewports even when initialized with `startMaximized`, preventing maximized-state drift on mobile.
- Regression coverage was extended in `runtime-concurrency.test.ts` (profile up/downscale and source tagging) and `DraggablePanel.test.tsx` (compact mode de-maximization).
- Wave 27 migrates GitHub Pages publication from legacy `gh-pages` branch pushes to the official artifact lane (`configure-pages` + `upload-pages-artifact` + `deploy-pages`) with explicit deploy timeout to reduce timeout aborts.
- `deploy-pages.yml` and `release-web.yml` now include Pages-native permissions (`pages: write`, `id-token: write`) required by reusable workflow execution in the official lane.
- Repository Pages was promoted to `build_type=workflow`, aligning runtime behavior with the new deploy mechanism and reducing dependency on the legacy branch-mode orchestrator.
- Wave 29 hardens explicit execution semantics across document/notebook task wrappers (`queued`, `running`, `retrying`, `persisting`, `completed`) and keeps video literal external-render fallback at `99%` until persistence completes.
- Document generation startup now parallelizes independent config fetches and starts thesis prefetch before acervo subpipeline, reducing idle latency without weakening quality/fallback guards.

## Required Secrets (GitHub Actions)
- FIREBASE_API_KEY
- FIREBASE_TOKEN (recommended) OR FIREBASE_SERVICE_ACCOUNT
- VITE_ADMIN_EMAIL
- DATAJUD_API_KEY (recommended for automatic sync)

## Main Deploy Targets
- Firebase Hosting production: lexio.web.app
- Firebase Functions: datajudProxy
- Firestore rules and indexes
- Storage rules
- GitHub Pages: /Lexio via GitHub Actions artifact deploy lane

## Operational Runbook (high level)
1. Trigger release-web workflow (manual dispatch)
2. Validate quality gates (tests workflow)
3. Deploy Firebase production lane
4. Deploy GitHub Pages lane
5. Optionally deploy redesign V2 lane
