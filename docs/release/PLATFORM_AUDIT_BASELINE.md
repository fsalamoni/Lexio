# Platform Audit Baseline

Generated: 2026-05-09T15:01:54.794Z
Git branch: main
Git head: a6128f7dd496694fe3692a1adf70300357c2afa6
Dirty worktree: yes

## Counts
- Routes: 21
- Pages: 30
- Components: 71
- Modals/Dialog surfaces: 9
- Progress/Trail surfaces: 4
- Artifact viewers: 15
- Contexts: 3
- Domain modules: 9
- Agent definition files: 13
- Pipeline runtime entries: 10
- Frontend tests: 139
- Python tests: 12
- Backend package roots: 4
- Backend Python source files: 295
- Workflows: 6
- Scripts: 18

## Route Inventory
- / | protected | DashboardV2 | ./pages/labs/DashboardV2
- /chat | protected | Chat | ./pages/Chat
- /documents | protected | DocumentList | ./pages/DocumentList
- /documents/new | protected | DefaultNewDocumentPage
- /documents/new-v3 | protected | Navigate
- /documents/:id | protected | DocumentDetail | ./pages/DocumentDetail
- /documents/:id/edit | protected | DocumentEditor | ./pages/DocumentEditor
- /upload | protected | Upload | ./pages/Upload
- /theses | protected | ThesisBank | ./pages/ThesisBank
- /notebook | protected | ResearchNotebookV2 | ./pages/labs/ResearchNotebookV2
- /settings | protected | SettingsPanel | ./pages/AdminPanel
- /settings/costs | protected | PersonalCostTokensPage | ./pages/CostTokensPage
- /admin | admin | PlatformAdminPanel | ./pages/PlatformAdminPanel
- /admin/costs | admin | PlatformCostsPage | ./pages/PlatformCostsPage
- /onboarding | protected | Onboarding | ./pages/Onboarding
- /profile | protected | ProfileV2 | ./pages/labs/ProfileV2
- * | protected | NotFound | ./pages/NotFound
- /login | public | Login | ./pages/auth/Login
- /register | public | Register | ./pages/auth/Register
- /forgot-password | public | ForgotPassword | ./pages/auth/ForgotPassword
- /reset-password | public | ResetPassword | ./pages/auth/ResetPassword

## Page Buckets
- auth: 4
- labs: 3
- main: 17
- notebook-shared: 6

## Component Buckets
- artifact-viewer: 15
- component: 43
- modal: 9
- progress: 4

## Domain Modules
- frontend/src/lib/modules/acervo
- frontend/src/lib/modules/admin-taxonomy
- frontend/src/lib/modules/chat
- frontend/src/lib/modules/dashboard
- frontend/src/lib/modules/documents
- frontend/src/lib/modules/notebook
- frontend/src/lib/modules/profile
- frontend/src/lib/modules/settings
- frontend/src/lib/modules/theses

## Agent Definition Files
- frontend/src/lib/pipelines/agent-definitions/acervo-classificador.ts
- frontend/src/lib/pipelines/agent-definitions/acervo-ementa.ts
- frontend/src/lib/pipelines/agent-definitions/audio.ts
- frontend/src/lib/pipelines/agent-definitions/chat-orchestrator.ts
- frontend/src/lib/pipelines/agent-definitions/context-detail.ts
- frontend/src/lib/pipelines/agent-definitions/document-v2.ts
- frontend/src/lib/pipelines/agent-definitions/document-v3.ts
- frontend/src/lib/pipelines/agent-definitions/index.ts
- frontend/src/lib/pipelines/agent-definitions/notebook-acervo.ts
- frontend/src/lib/pipelines/agent-definitions/presentation.ts
- frontend/src/lib/pipelines/agent-definitions/research-notebook.ts
- frontend/src/lib/pipelines/agent-definitions/thesis-analyst.ts
- frontend/src/lib/pipelines/agent-definitions/video.ts

## Pipeline Runtime Entries
- frontend/src/lib/generation-service.ts | present
- frontend/src/lib/document-v3-orchestrator.ts | present
- frontend/src/lib/thesis-analyzer.ts | present
- frontend/src/lib/thesis-extractor.ts | present
- frontend/src/lib/notebook-studio-pipeline.ts | present
- frontend/src/lib/notebook-audio-pipeline.ts | present
- frontend/src/lib/notebook-acervo-analyzer.ts | present
- frontend/src/lib/video-generation-pipeline.ts | present
- frontend/src/lib/literal-video-production.ts | present
- frontend/src/lib/chat-orchestrator | present

## Workflows
- .github/workflows/deploy-pages.yml
- .github/workflows/firebase-deploy.yml
- .github/workflows/firebase-preview.yml
- .github/workflows/firebase-redesign-v2.yml
- .github/workflows/release-web.yml
- .github/workflows/test.yml

## Scripts
- scripts/backup.sh
- scripts/firebase-authorized-domains.mjs
- scripts/firebase-cloud-sync.mjs
- scripts/lexio-architecture-guardrails.mjs
- scripts/lexio-firestore-audit.mjs
- scripts/lexio-firestore-migrate-shadow.mjs
- scripts/lexio-firestore-paths.mjs
- scripts/lexio-firestore-validate-shadow.mjs
- scripts/lexio-platform-audit-baseline.mjs
- scripts/lexio-platform-audit-deep-sweep.mjs
- scripts/lexio-platform-audit-fault-matrix.mjs
- scripts/lexio-platform-audit-final-closeout.mjs
- scripts/lexio-platform-audit-release-closeout.mjs
- scripts/lexio-platform-audit-residual-summary.mjs
- scripts/lexio-platform-audit-risk-scan.mjs
- scripts/restore.sh
- scripts/validate-firebase-service-account.mjs
- scripts/validate-firebase-web-config.mjs

## Backend Package Roots
- packages/api
- packages/core
- packages/modules
- packages/pipeline

## Canonical Docs
- docs/PLANO.md | present
- docs/MANIFEST.json | present
- NOTEBOOK_IMPLEMENTATION_STATUS.md | present
- docs/release/WEB_RELEASE_CACHE.md | present
- docs/release/WEB_RELEASE_INDEX.md | present
- docs/release/CROSS_PLATFORM_HANDOFF.md | present
- docs/architecture/firestore-data-boundaries.md | present
- docs/migration/firestore-database-isolation.md | present

## Validation Commands
- frontend:dev => vite
- frontend:build => vite build
- frontend:build:smoke => vite build --mode smoke
- frontend:audit:baseline => node ../scripts/lexio-platform-audit-baseline.mjs
- frontend:audit:deep => node ../scripts/lexio-platform-audit-deep-sweep.mjs
- frontend:audit:final => node ../scripts/lexio-platform-audit-final-closeout.mjs
- frontend:audit:faults => node ../scripts/lexio-platform-audit-fault-matrix.mjs
- frontend:audit:release => node ../scripts/lexio-platform-audit-release-closeout.mjs
- frontend:audit:residuals => node ../scripts/lexio-platform-audit-residual-summary.mjs
- frontend:audit:riskscan => node ../scripts/lexio-platform-audit-risk-scan.mjs
- frontend:architecture:check => node ../scripts/lexio-architecture-guardrails.mjs
- frontend:typecheck => tsc --noEmit
- frontend:preview => vite preview
- frontend:preview:smoke => vite preview --host 127.0.0.1 --port 4173
- frontend:smoke => vite build --mode smoke && vite preview --host 127.0.0.1 --port 4173
- frontend:test => vitest run
- frontend:test:watch => vitest
- functions:build => tsc
- functions:test => npm run build && node --test test/*.test.cjs
- functions:serve => npm run build && firebase emulators:start --only functions
- functions:deploy => npm run build && firebase deploy --only functions
- make:backup
- make:backup-list
- make:backup-restore
- make:down
- make:format
- make:health
- make:lint
- make:logs
- make:ps
- make:test
- make:test-api
- make:test-build
- make:test-live
- make:test-unit
- make:up
