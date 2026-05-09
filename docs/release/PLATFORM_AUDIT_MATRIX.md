# Platform Audit Matrix

Generated: 2026-05-09T15:01:54.794Z
Git branch: main
Git head: a6128f7dd496694fe3692a1adf70300357c2afa6

Use this file as the execution matrix for the whole-platform sweep. Replace placeholders with evidence, risks, and pass/fail status as the audit progresses.

## Prioritization Snapshot
- Route gaps open: 0
- UI gaps open: 0
- Pipeline gaps open: 0
- Pipeline fault-injection gaps open: 0
- Backend package slices pending: 0
- Cloud function slices pending: 0
- Route gap risk: none
- UI gap risk: none
- Pipeline gap risk: none
- Pipeline fault risk: none
- Backend slice risk: none
- Cloud function slice risk: none
- Unexpected Firestore collections: 0
- Missing runtime collectionGroup rules: 0
- Missing collectionGroup indexes: 0
- Missing Firestore deploy databases: 0
- Unexpected frontend OpenRouter occurrences: 0
- Unexpected non-frontend OpenRouter occurrences: 0
- Unexpected auth observer files: 0
- Unexpected admin email consumers: 0
- Unexpected direct admin role checks: 0
- Unexpected Firestore operation files: 0
- Unexpected unguarded Firestore operation files: 0
- Unexpected auth recovery opt-outs: 0
- Unexpected Firestore bootstrap files: 0
- Unexpected Firestore database env consumers: 0
- Unexpected session storage files: 0
- Unexpected session storage writers: 0
- Sensitive config defaults: 0

## Route Coverage Matrix
| Surface | Access | Component | Direct Test Signal | Manual Smoke | Risk | Notes | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| / | protected | DashboardV2 | App.test.tsx, Breadcrumb.test.tsx, AuthContext.test.tsx, datajud-service.test.ts, firestore-service.test.ts, workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| /chat | protected | Chat | App.test.tsx, workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| /documents | protected | DocumentList | DocumentList.test.ts | [ ] | covered | — | covered-by-test |
| /documents/new | protected | DefaultNewDocumentPage | NewDocumentV3.test.tsx | [ ] | covered | indirect runtime selector between legacy and V3 rails | covered-by-test |
| /documents/new-v3 | protected | Navigate | App.test.tsx, Sidebar.test.tsx, V2WorkspaceLayout.test.tsx, workspace-routes.test.ts | [ ] | covered | technical alias or redirect surface | covered-by-test |
| /documents/:id | protected | DocumentDetail | DocumentDetail.test.tsx | [ ] | covered | — | covered-by-test |
| /documents/:id/edit | protected | DocumentEditor | App.test.tsx, workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| /upload | protected | Upload | workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| /theses | protected | ThesisBank | workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| /notebook | protected | ResearchNotebookV2 | ResearchNotebookV2.test.tsx | [ ] | covered | — | covered-by-test |
| /settings | protected | SettingsPanel | App.test.tsx, AgentTrailProgressModal.test.tsx, Sidebar.test.tsx, V2WorkspaceLayout.test.tsx, workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| /settings/costs | protected | PersonalCostTokensPage | workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| /admin | admin | PlatformAdminPanel | App.test.tsx, Sidebar.test.tsx, V2WorkspaceLayout.test.tsx, workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| /admin/costs | admin | PlatformCostsPage | workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| /onboarding | protected | Onboarding | App.test.tsx | [ ] | covered | — | covered-by-test |
| /profile | protected | ProfileV2 | workspace-routes.test.ts | [ ] | covered | — | covered-by-test |
| * | protected | NotFound | App.test.tsx | [ ] | covered | — | covered-by-test |
| /login | public | Login | App.test.tsx | [ ] | covered | — | covered-by-test |
| /register | public | Register | App.test.tsx | [ ] | covered | — | covered-by-test |
| /forgot-password | public | ForgotPassword | App.test.tsx | [ ] | covered | — | covered-by-test |
| /reset-password | public | ResetPassword | App.test.tsx | [ ] | covered | — | covered-by-test |

## UI Surface Matrix
| Surface | Kind | Direct Test Signal | Manual Smoke | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| frontend/src/components/AcervoClassificadorConfigCard.tsx | component | AcervoClassificadorConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/AcervoEmentaConfigCard.tsx | component | AcervoEmentaConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/admin/DocumentV3PipelineConfigSection.tsx | component | DocumentV3PipelineConfigSection.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/admin/FallbackPriorityConfigCard.tsx | component | FallbackPriorityConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/admin/RuntimeFeatureFlagsCard.tsx | component | RuntimeFeatureFlagsCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/AgentModelConfigCard.tsx | component | AgentModelConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/AgentTrailProgressModal.tsx | modal | AgentTrailProgressModal.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/AgentTrailProgressModalV3.tsx | modal | AgentTrailProgressModalV3.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/AgentTrailStateMachine.ts | progress | AgentTrailStateMachine.test.ts | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/artifact-exporters.ts | artifact-viewer | artifact-exporters.test.ts | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/artifact-parsers.ts | artifact-viewer | artifact-parsers.test.ts | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/ArtifactViewerModal.tsx | artifact-viewer | ArtifactViewerModal.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/AudioOverviewPlayer.tsx | artifact-viewer | AudioOverviewPlayer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/AudioScriptViewer.tsx | artifact-viewer | AudioScriptViewer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/DataTableViewer.tsx | artifact-viewer | DataTableViewer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/FlashcardViewer.tsx | artifact-viewer | FlashcardViewer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/index.ts | artifact-viewer | index.test.ts | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/InfographicRenderer.tsx | artifact-viewer | InfographicRenderer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/MindMapViewer.tsx | artifact-viewer | MindMapViewer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/PresentationViewer.tsx | artifact-viewer | PresentationViewer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/QuizPlayer.tsx | artifact-viewer | QuizPlayer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/ReportViewer.tsx | artifact-viewer | ReportViewer.test.ts | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/VideoScriptViewer.tsx | artifact-viewer | VideoScriptViewer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/artifacts/VideoStudioEditor.tsx | artifact-viewer | VideoStudioEditor.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/AudioPipelineConfigCard.tsx | component | AudioPipelineConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/Breadcrumb.tsx | component | Breadcrumb.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/chat/ChatHeader.tsx | component | ChatHeader.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/chat/Composer.tsx | component | Composer.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/chat/ConversationList.tsx | component | ConversationList.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/chat/EffortPicker.tsx | component | EffortPicker.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/chat/EmptyState.tsx | component | EmptyState.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/chat/MessageStream.tsx | component | MessageStream.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/chat/SearchPanel.tsx | component | SearchPanel.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/chat/use-chat-controller.ts | component | use-chat-controller.test.ts | [ ] | covered | covered-by-test |
| frontend/src/components/ChatOrchestratorConfigCard.tsx | component | ChatOrchestratorConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ConfirmDialog.tsx | modal | ConfirmDialog.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ContextDetailConfigCard.tsx | component | ContextDetailConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/CostBreakdownModal.tsx | modal | CostBreakdownModal.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/DeepResearchModal.tsx | modal | DeepResearchModal.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/DraggablePanel.tsx | component | DraggablePanel.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ErrorBoundary.tsx | component | ErrorBoundary.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/JurisprudenceConfigModal.tsx | modal | JurisprudenceConfigModal.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/Layout.tsx | component | Layout.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ModelCatalogCard.tsx | component | ModelCatalogCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ModelConfigCard.tsx | component | ModelConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ModelSelectorModal.tsx | modal | ModelSelectorModal.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/NotebookAcervoConfigCard.tsx | component | NotebookAcervoConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/NotificationBell.tsx | component | NotificationBell.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/PipelineProgressPanel.tsx | progress | PipelineProgressPanel.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/PipelineProgressPanelV3.tsx | progress | PipelineProgressPanelV3.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/PresentationPipelineConfigCard.tsx | component | PresentationPipelineConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ProgressTracker.tsx | progress | ProgressTracker.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ProviderApiKeysCard.tsx | component | ProviderApiKeysCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ProviderCatalogCard.tsx | component | ProviderCatalogCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ProviderCatalogsSection.tsx | component | ProviderCatalogsSection.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ResearchNotebookConfigCard.tsx | component | ResearchNotebookConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/RichTextEditor.tsx | component | RichTextEditor.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/SearchResultsModal.tsx | modal | SearchResultsModal.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/Sidebar.tsx | component | Sidebar.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/Skeleton.tsx | component | Skeleton.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/SourceContentViewer.tsx | component | SourceContentViewer.test.ts | [ ] | covered | covered-by-test |
| frontend/src/components/StatusBadge.tsx | component | StatusBadge.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/TaskBar.tsx | component | TaskBar.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ThemeSkinSelector.tsx | component | ThemeSkinSelector.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ThesisAnalysisCard.tsx | component | ThesisAnalysisCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/ThesisAnalystConfigCard.tsx | component | ThesisAnalystConfigCard.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/Toast.tsx | component | Toast.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/v2/V2PagePrimitives.tsx | component | V2PagePrimitives.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/v2/V2WorkspaceLayout.tsx | component | V2WorkspaceLayout.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/VideoGenerationCostModal.tsx | modal | VideoGenerationCostModal.test.tsx | [ ] | covered | covered-by-test |
| frontend/src/components/VideoPipelineConfigCard.tsx | component | VideoPipelineConfigCard.test.tsx | [ ] | covered | covered-by-test |

## Pipeline Runtime Matrix
| Surface | Kind | Direct Test Signal | Fault Injection | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| frontend/src/lib/generation-service.ts | file | generation-service.orchestration.test.ts, generation-service.parallel.test.ts | generation-service.orchestration.test.ts, generation-service.parallel.test.ts | covered | covered-by-test |
| frontend/src/lib/document-v3-orchestrator.ts | file | document-v3-orchestrator.test.ts | document-v3-orchestrator.test.ts | covered | covered-by-test |
| frontend/src/lib/thesis-analyzer.ts | file | thesis-analyzer.test.ts | thesis-analyzer.test.ts | covered | covered-by-test |
| frontend/src/lib/thesis-extractor.ts | file | thesis-extractor.test.ts | thesis-extractor.test.ts | covered | covered-by-test |
| frontend/src/lib/notebook-studio-pipeline.ts | file | notebook-studio-pipeline.test.ts | notebook-studio-pipeline.test.ts | covered | covered-by-test |
| frontend/src/lib/notebook-audio-pipeline.ts | file | notebook-audio-pipeline.test.ts | notebook-audio-pipeline.test.ts | covered | covered-by-test |
| frontend/src/lib/notebook-acervo-analyzer.ts | file | notebook-acervo-analyzer.test.ts | notebook-acervo-analyzer.test.ts | covered | covered-by-test |
| frontend/src/lib/video-generation-pipeline.ts | file | video-generation-pipeline.test.ts | video-generation-pipeline.test.ts | covered | covered-by-test |
| frontend/src/lib/literal-video-production.ts | file | literal-video-production.test.ts | literal-video-production.test.ts | covered | covered-by-test |
| frontend/src/lib/chat-orchestrator | directory | super-skills.test.ts, budget.test.ts, effort-presets.test.ts, orchestrator.test.ts, super-skills.test.ts, tools-adapter.test.ts | super-skills.test.ts, budget.test.ts, orchestrator.test.ts, super-skills.test.ts | covered | covered-by-test |

## Agent Registry Matrix
| Surface | Registry/Test Signal | Config Validation | Risk | Status |
| --- | --- | --- | --- | --- |
| frontend/src/lib/pipelines/agent-definitions/acervo-classificador.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/acervo-ementa.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/audio.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/chat-orchestrator.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/context-detail.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/document-v2.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/document-v3.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/notebook-acervo.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/presentation.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/research-notebook.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/thesis-analyst.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |
| frontend/src/lib/pipelines/agent-definitions/video.ts | agent-config-coverage.test.ts | [ ] | shared-coverage | registry-covered |

## Operations and Documentation Matrix
| Surface | Type | Verified at Baseline | Notes | Status |
| --- | --- | --- | --- | --- |
| .github/workflows/deploy-pages.yml | workflow | [ ] | inventory captured at baseline | inventory-ready |
| .github/workflows/firebase-deploy.yml | workflow | [ ] | inventory captured at baseline | inventory-ready |
| .github/workflows/firebase-preview.yml | workflow | [ ] | inventory captured at baseline | inventory-ready |
| .github/workflows/firebase-redesign-v2.yml | workflow | [ ] | inventory captured at baseline | inventory-ready |
| .github/workflows/release-web.yml | workflow | [ ] | inventory captured at baseline | inventory-ready |
| .github/workflows/test.yml | workflow | [ ] | inventory captured at baseline | inventory-ready |
| scripts/backup.sh | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/firebase-authorized-domains.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/firebase-cloud-sync.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-architecture-guardrails.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-firestore-audit.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-firestore-migrate-shadow.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-firestore-paths.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-firestore-validate-shadow.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-platform-audit-baseline.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-platform-audit-deep-sweep.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-platform-audit-fault-matrix.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-platform-audit-final-closeout.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-platform-audit-release-closeout.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-platform-audit-residual-summary.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/lexio-platform-audit-risk-scan.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/restore.sh | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/validate-firebase-service-account.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| scripts/validate-firebase-web-config.mjs | script | [ ] | inventory captured at baseline | inventory-ready |
| docs/PLANO.md | canonical-doc | [x] | present at baseline | baseline-ready |
| docs/MANIFEST.json | canonical-doc | [x] | present at baseline | baseline-ready |
| NOTEBOOK_IMPLEMENTATION_STATUS.md | canonical-doc | [x] | present at baseline | baseline-ready |
| docs/release/WEB_RELEASE_CACHE.md | canonical-doc | [x] | present at baseline | baseline-ready |
| docs/release/WEB_RELEASE_INDEX.md | canonical-doc | [x] | present at baseline | baseline-ready |
| docs/release/CROSS_PLATFORM_HANDOFF.md | canonical-doc | [x] | present at baseline | baseline-ready |
| docs/architecture/firestore-data-boundaries.md | canonical-doc | [x] | present at baseline | baseline-ready |
| docs/migration/firestore-database-isolation.md | canonical-doc | [x] | present at baseline | baseline-ready |

## Secondary Backend Matrix
| Surface | Python Source Files | Mapped Test Signal | Validation Command | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| packages/api | 25 | test_upload_validation.py | pytest tests/api/ or make:test-api | covered | covered-by-tests-or-build |
| packages/core | 47 | test_document_json_converter.py, test_indexer_text_extraction.py | pytest tests/core/ | covered | covered-by-tests-or-build |
| packages/modules | 215 | test_auth_logic.py, test_document_types.py, test_integrator_rules.py, test_legal_areas.py, test_pipeline_configs.py, test_quality_rules.py, test_stats_breakdown.py, test_templates_structure.py, test_thesis_bank.py | pytest tests/unit/ or make:test-unit | covered | covered-by-tests-or-build |
| packages/pipeline | 8 | test_auth_logic.py, test_document_types.py, test_integrator_rules.py, test_legal_areas.py, test_pipeline_configs.py, test_quality_rules.py, test_stats_breakdown.py, test_templates_structure.py, test_thesis_bank.py | pytest tests/unit/ or make:test-unit | covered | covered-by-tests-or-build |

## Cloud Function Matrix
| Surface | Build Signal | Manual Smoke | Risk | Status |
| --- | --- | --- | --- | --- |
| functions/src/index.ts | functions:build | [ ] | covered | covered-by-tests-or-build |
