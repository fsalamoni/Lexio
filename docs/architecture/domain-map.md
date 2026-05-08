# Lexio Domain Map

Last update: 2026-05-07

This document maps current product domains to their owning code areas and future module homes. Use it before changing any feature.

## Domain Ownership

| Domain | Current Key Files | Future Module | Notes |
|--------|-------------------|---------------|-------|
| Documents | `frontend/src/lib/modules/documents/`, `frontend/src/lib/generation-service.ts`, `document-pipeline.ts`, `document-v3-*`, `document-structures.ts`, `v3-agents/`, `pages/NewDocument*.tsx`, `pages/Document*.tsx` | `frontend/src/lib/modules/documents/` | Owns legal document generation, templates, V2/V3 agents, persistence metadata, quality and export integration. Prompt metadata/profile helpers, acervo prompt/search helpers and the first Documents Firestore repository now live in the Documents module; `generation-service.ts` and `firestore-service.ts` keep compatibility exports. |
| Notebook | `frontend/src/lib/modules/notebook/`, `notebook-studio-pipeline.ts`, `notebook-audio-pipeline.ts`, `notebook-acervo-analyzer.ts`, `notebook-artifact-tasks.ts`, `notebook-media-storage.ts`, `research-notebook-*`, `pages/ResearchNotebook.tsx`, `pages/labs/ResearchNotebookV2.tsx` | `frontend/src/lib/modules/notebook/` | Owns sources, studio, artifacts, notebook memory, acervo analysis, notebook media and notebook progress contracts. `notebook-pipeline-progress.ts` and `notebook-constants.ts` are compatibility facades after Wave 42. |
| Theses | `frontend/src/lib/modules/theses/`, `thesis-analyzer.ts`, `thesis-extractor.ts`, `thesis-pipeline.ts`, `pages/ThesisBank.tsx` | `frontend/src/lib/modules/theses/` | Owns thesis CRUD, extraction, batch analysis and suggestions. Thesis Bank repository operations now live in the Theses module; `firestore-service.ts` keeps compatibility exports. |
| Chat | `frontend/src/lib/chat-orchestrator/`, `pages/Chat.tsx` | `frontend/src/lib/modules/chat/` or keep `chat-orchestrator/` as public module | Already has a strong module boundary and should be used as the template for other domains. |
| Dashboard | `frontend/src/lib/modules/dashboard/`, `frontend/src/lib/dashboard-data.ts`, `frontend/src/lib/dashboard-v2.ts`, `pages/Dashboard.tsx`, `pages/labs/DashboardV2.tsx` | `frontend/src/lib/modules/dashboard/` | First extracted product module in Wave 42. Legacy `dashboard-data.ts` and `dashboard-v2.ts` are compatibility facades only. |
| Search/Jurisprudence | `datajud-service.ts`, `web-search-service.ts`, `search-client.ts`, `jurisprudence-prompts.ts`, `components/JurisprudenceConfigModal.tsx`, `components/SourceContentViewer.tsx` | `frontend/src/lib/modules/jurisprudence/` and `frontend/src/lib/modules/search/` | DataJud/STF/JusBrasil/Jina logic belongs here; UI stays in components/pages. |
| Media | `video-generation-pipeline.ts`, `audio-generation-pipeline.ts`, `presentation-generation-pipeline.ts`, `image-generation-client.ts`, `tts-client.ts`, `external-video-provider.ts`, `literal-video-production.ts`, `media-rate-limiter.ts` | `frontend/src/lib/modules/media/` or `frontend/src/lib/pipelines/*` | Owns media providers, long-running media pipelines, rate limiting, checkpoints and render contracts. |
| Admin/Settings | `AdminPanel.tsx`, `PlatformAdminPanel.tsx`, `CostTokensPage.tsx`, `PlatformCostsPage.tsx`, `settings-store.ts`, `model-catalog.ts`, `model-config.ts`, `frontend/src/lib/pipelines/agent-definitions/`, `frontend/src/lib/platform-analytics.ts`, `provider-credentials.ts`, `runtime feature flags` | `frontend/src/lib/modules/admin/` and `frontend/src/lib/modules/settings/` | Settings/model catalog stay user-scoped; `model-config.ts` remains the compatibility facade for scoped model persistence/validation while per-pipeline agent definitions live under `pipelines/agent-definitions`; platform analytics now lives in `platform-analytics.ts` behind `firestore-service.ts` compatibility exports and must not expose private preferences. |
| Auth/Profile | `auth-service.ts`, `AuthContext.tsx`, `Profile*.tsx`, `Onboarding.tsx`, `profile-progress.ts`, `profile-preferences.ts`, auth retry/error helpers, `frontend/src/lib/core/firestore/` | `frontend/src/lib/core/auth/` plus `frontend/src/lib/modules/profile/` | Session recovery is core; profile business behavior is a module. Firestore path/reference helpers live in core because they are domain-neutral and reused by repositories plus platform analytics. |
| Uploads/Acervo | `frontend/src/lib/modules/acervo/`, `Upload.tsx`, `file-text-extractor.ts`, `Acervo*ConfigCard.tsx` | `frontend/src/lib/modules/acervo/` | Owns reference material classification, ementa generation, source metadata and upload extraction integration. Acervo Firestore repository operations now live in the Acervo module; `firestore-service.ts` keeps compatibility exports. |

## Rule Of Ownership

When changing a feature, first identify its domain owner. Prefer changing the domain module and its public API. Only change `core` when the behavior is domain-neutral and reused by at least two domains.

## Current Hotspots To Reduce

- `frontend/src/lib/firestore-service.ts` — split into repositories/stores by domain; platform analytics has already moved to `platform-analytics.ts`, shared Firestore path/reference helpers have moved to `frontend/src/lib/core/firestore/`, Documents CRUD now lives in `frontend/src/lib/modules/documents/repository.ts`, Thesis Bank CRUD/listing/stats now lives in `frontend/src/lib/modules/theses/repository.ts`, and Acervo repository operations now live in `frontend/src/lib/modules/acervo/repository.ts` behind compatibility facades.
- `frontend/src/lib/generation-service.ts` — move document-specific orchestration into Documents.
- `frontend/src/lib/model-config.ts` — remaining scoped model persistence, validation and fallback logic after agent definitions moved behind `pipelines/agent-definitions`.
- `frontend/src/pages/ResearchNotebook.tsx` — move workflow logic into Notebook module/hooks while keeping UI in pages/components.
