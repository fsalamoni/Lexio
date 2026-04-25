# Web Release Index

Last update: 2026-04-25

## Latest One-shot Validation (Wave 34 — 2026-04-25)
- release-web run `24917777336`: success
- Head commit: `4cc2432`
- Quality gates: success (lint `72973180460`, functions quality `72973180461`, frontend quality `72973180463`, unit tests `72973180467`, source guardrails `72973180468`)
- Deploy Firebase production: success (`job 72973266685`)
- Deploy GitHub Pages / build: success (`job 72973266761`)
- Deploy GitHub Pages / deploy: success (`job 72973349766`)
- Deploy redesign V2: skipped by input (`deploy_redesign_v2=false`, `job 72973266829`)
- Release summary: success (`job 72973480926`)

## Release Entry Points
- .github/workflows/release-web.yml
- .github/workflows/firebase-deploy.yml
- .github/workflows/deploy-pages.yml
- .github/workflows/firebase-redesign-v2.yml
- .github/workflows/test.yml

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

## Current Local Validation (Wave 34 — 2026-04-25)
- Scope: analytics comparativa diária por `execution_state`, com novas agregações de serviço para trend diária + janela atual vs anterior e painel executivo no `PlatformAdminPanel` com deltas/recomendações acionáveis
- Frontend typecheck: success
- Frontend tests: success (38 files, 299 tests)
- Frontend build: success
- Functions build: success (`npm run build`)
- Release dispatch: completed (`release-web.yml`, run `24917777336`)
- Docs closeout sync: completed (`main`, planning/index/cache/handoff aligned)

## Firebase Auth and Secret Validation
- scripts/validate-firebase-service-account.mjs
- scripts/firebase-authorized-domains.mjs

## Related Config
- firebase.json
- .firebaserc
- functions/src/index.ts
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
