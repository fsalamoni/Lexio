# Platform Audit Deep Sweep

Generated: 2026-05-09T13:47:22.413Z
Git branch: unknown
Git head: unknown

## Snapshot
- Total surfaces: 17
- Covered by direct evidence: 17
- Implemented without direct evidence: 0
- Pending surfaces: 0
- Pending high-risk surfaces: 0
- Pending medium-risk surfaces: 0

## Deep Sweep Matrix
| Surface | Rail | Evidence | Recommended Validation | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| Notebook: source viewer utilities | notebook | research-notebook-v2.test.ts (source preview and viewer affordances are exercised for notebook sources) | npx vitest run src/lib/research-notebook-v2.test.ts | high | covered-by-direct-evidence |
| Notebook: saved searches and semantic tags | notebook | research-notebook-v2.test.ts (saved-search titles, semantic tags and pin-first ordering are covered) | npx vitest run src/lib/research-notebook-v2.test.ts | high | covered-by-direct-evidence |
| Notebook: artifacts empty state | notebook | ResearchNotebookV2.test.tsx (artifacts section is validated when reached directly with no generated outputs) | npx vitest run src/pages/labs/ResearchNotebookV2.test.tsx | medium | covered-by-direct-evidence |
| Notebook: studio quick-action handoff | notebook | ResearchNotebookV2.test.tsx (workbench quick actions reach the studio section through the intended flow) | npx vitest run src/pages/labs/ResearchNotebookV2.test.tsx | medium | covered-by-direct-evidence |
| Notebook: artifact operational summary | notebook | notebook-artifact-tasks.test.ts (artifact-task operational degradation is aggregated without duplicating reasons) | npx vitest run src/lib/notebook-artifact-tasks.test.ts | high | covered-by-direct-evidence |
| Chat: orchestrator loop control | chat | orchestrator.test.ts (orchestrator finalization, iteration caps and clarification pauses are exercised directly) | npx vitest run src/lib/chat-orchestrator/orchestrator.test.ts | high | covered-by-direct-evidence |
| Chat: tool decision parser | chat | tools-adapter.test.ts (tool-call parsing rejects malformed or unapproved orchestrator decisions) | npx vitest run src/lib/chat-orchestrator/tools-adapter.test.ts | high | covered-by-direct-evidence |
| Chat: workspace roots and bindings | chat | firestore-service.test.ts (workspace roots and conversation bindings are persisted and retried through the facade) | npx vitest run src/lib/firestore-service.test.ts | high | covered-by-direct-evidence |
| Chat: approvals and sidecar audit trail | chat | firestore-service.test.ts (approval requests and sidecar audit entries have direct persistence and retry coverage) | npx vitest run src/lib/firestore-service.test.ts | high | covered-by-direct-evidence |
| Media: video checkpoint resume | media | video-generation-pipeline.test.ts (video generation resumes from planning and media checkpoints without redoing completed work) | npx vitest run src/lib/video-generation-pipeline.test.ts | high | covered-by-direct-evidence |
| Media: progress execution states | media | video-pipeline-progress.test.ts (media progress state maps waiting IO, retrying and persisting phases explicitly) | npx vitest run src/lib/video-pipeline-progress.test.ts | medium | covered-by-direct-evidence |
| Media: cost analytics breakdown | media | cost-analytics-coverage.test.ts (cross-pipeline media and v3 operational costs are aggregated into the intended breakdowns) | npx vitest run src/lib/cost-analytics-coverage.test.ts | medium | covered-by-direct-evidence |
| Documento V3: final persistence recovery | document-v3 | document-v3-orchestrator.test.ts (the V3 orchestrator records erro status after a failed final save) | npx vitest run src/lib/document-v3-orchestrator.test.ts | high | covered-by-direct-evidence |
| Documento V3: retry and fallback progress badges | document-v3 | PipelineProgressPanelV3.test.tsx (the V3 progress panel exposes retry and fallback runtime badges) | npx vitest run src/components/PipelineProgressPanelV3.test.tsx | medium | covered-by-direct-evidence |
| Document rail: detail retry action | document-rail | DocumentDetail.test.tsx (detail page retry action uses the V3 reprocessing rail); DocumentDetail.tsx (detail page exposes a dedicated V3 retry action for failed documents) | npx vitest run src/pages/DocumentDetail.test.tsx | high | covered-by-direct-evidence |
| Document rail: detail open-in-generator action | document-rail | DocumentDetail.test.tsx (detail page forwards notebook-origin documents into the canonical generator route); DocumentDetail.tsx (detail page offers an open-in-generator CTA for notebook-origin documents) | npx vitest run src/pages/DocumentDetail.test.tsx | medium | covered-by-direct-evidence |
| Document rail: detail duplicate action | document-rail | DocumentDetail.test.tsx (detail page duplicate action rebuilds a new canonical request with the same parameters); DocumentDetail.tsx (detail page exposes duplication into the canonical new-document route) | npx vitest run src/pages/DocumentDetail.test.tsx | medium | covered-by-direct-evidence |

## Pending Surfaces
- none

## Implemented Without Direct Evidence
- none
