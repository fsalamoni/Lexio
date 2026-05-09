# Platform Audit Fault Matrix

Generated: 2026-05-09T13:34:01.161Z
Git branch: unknown
Git head: unknown

## Snapshot
- Total scenarios: 19
- Covered by direct evidence: 19
- Implemented without direct evidence: 0
- Pending scenarios: 0
- Pending high-risk scenarios: 0
- Pending medium-risk scenarios: 0

## Scenario Matrix
| Scenario | Domain | Evidence | Recommended Validation | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| API key ausente | providers-auth | error-humanizer.test.ts (user-facing handling for invalid or missing provider key) | npx vitest run src/lib/error-humanizer.test.ts | high | covered-by-direct-evidence |
| Modelo indisponível | llm-provider | llm-client.test.ts (unavailable models are classified so fallback can take over) | npx vitest run src/lib/llm-client.test.ts | high | covered-by-direct-evidence |
| Timeout | llm-provider | llm-client.test.ts (timeouts become transient errors or fallback triggers); document-v3-orchestrator.test.ts (v3 orchestration tolerates hung agents and cancel paths) | npx vitest run src/lib/llm-client.test.ts src/lib/document-v3-orchestrator.test.ts | high | covered-by-direct-evidence |
| HTTP 429 / rate limit | llm-provider | llm-client.test.ts (network retry path exercises rate limiting); error-humanizer.test.ts (user-facing error text covers rate limiting) | npx vitest run src/lib/llm-client.test.ts src/lib/error-humanizer.test.ts | medium | covered-by-direct-evidence |
| Rede intermitente | network-resilience | llm-client.test.ts (LLM client retries transient network failures); web-search-service.test.ts (web search falls back across Jina-backed strategies on network failure) | npx vitest run src/lib/llm-client.test.ts src/lib/web-search-service.test.ts | medium | covered-by-direct-evidence |
| JSON inválido | pipeline-parsing | thesis-extractor.test.ts (thesis extraction degrades safely when extraction JSON is malformed); audio-generation-pipeline.test.ts (audio pipeline reports malformed stage output); datajud-service.test.ts (jurisprudence ranking parser falls back on malformed JSON payloads) | npx vitest run src/lib/thesis-extractor.test.ts src/lib/audio-generation-pipeline.test.ts src/lib/datajud-service.test.ts | medium | covered-by-direct-evidence |
| Permissão negada | firestore-auth | AuthContext.test.tsx (auth hydration survives permission-denied reads); firestore-service.test.ts (firestore retries transient permission-denied operations) | npx vitest run src/contexts/AuthContext.test.tsx src/lib/firestore-service.test.ts | high | covered-by-direct-evidence |
| Sessão stale / auth stale | auth-session | client.test.ts (client refreshes stale token paths without breaking session); firebase-auth-retry.test.ts (firebase auth retry helper covers transient stale-session states) | npx vitest run src/api/client.test.ts src/lib/firebase-auth-retry.test.ts | high | covered-by-direct-evidence |
| Índice ausente | firestore-indexing | PLATFORM_AUDIT_RISK_SCAN.json (risk scan reports zero missing collection group indexes) | npm run audit:riskscan | high | covered-by-direct-evidence |
| Documento parcialmente salvo | document-persistence | document-v3-orchestrator.test.ts (v3 orchestrator records erro status after a failed final save attempt) | npx vitest run src/lib/generation-service.orchestration.test.ts src/lib/document-v3-orchestrator.test.ts | high | covered-by-direct-evidence |
| Upload de mídia interrompido | media-storage | notebook-media-storage.test.ts (storage cancellation is translated to an explicit interrupted upload error) | npx vitest run src/lib/notebook-media-storage.test.ts | high | covered-by-direct-evidence |
| Cancelamento do usuário | abort-cancel | document-v3-orchestrator.test.ts (v3 document generation aborts cleanly on cancellation); orchestrator.test.ts (chat orchestrator propagates cancellation immediately); super-skills.test.ts (chat super-skills preserve abort semantics); video-generation-pipeline.test.ts (video pipeline stops on cancelled signal) | npx vitest run src/lib/document-v3-orchestrator.test.ts src/lib/chat-orchestrator/orchestrator.test.ts src/lib/chat-orchestrator/super-skills.test.ts src/lib/video-generation-pipeline.test.ts | medium | covered-by-direct-evidence |
| Retomada por checkpoint | media-checkpoint | video-generation-pipeline.test.ts (video generation resumes without rerunning completed work) | npx vitest run src/lib/video-generation-pipeline.test.ts | medium | covered-by-direct-evidence |
| Snapshot concorrente stale | firestore-concurrency | firestore-service.test.ts (write retries recover from concurrent stale snapshot conflicts surfaced as firestore aborted) | npx vitest run src/lib/firestore-service.test.ts | high | covered-by-direct-evidence |
| Erro no DataJud | external-datajud | document-v3-orchestrator.test.ts (v3 researcher falls back when DataJud is unavailable); datajud-service.test.ts (jurisprudence search preserves results and fallback flow on upstream issues) | npx vitest run src/lib/datajud-service.test.ts src/lib/document-v3-orchestrator.test.ts | high | covered-by-direct-evidence |
| Erro no Jina | external-jina | web-search-service.test.ts (web search retries and falls back when Jina-backed strategy fails) | npx vitest run src/lib/web-search-service.test.ts | medium | covered-by-direct-evidence |
| Erro no TTS | external-tts | audio-generation-pipeline.test.ts (audio pipeline already exercises TTS-facing stages) | npx vitest run src/lib/tts-client.test.ts src/lib/audio-generation-pipeline.test.ts | high | covered-by-direct-evidence |
| Erro no provider de vídeo | external-video | external-video-provider.test.ts (external video provider surfaces recoverable provider failures) | npx vitest run src/lib/external-video-provider.test.ts | high | covered-by-direct-evidence |
| Erro na Cloud Function | functions-proxy | index.test.cjs (datajud proxy maps missing secret, timeout and upstream proxy failures to explicit HTTP responses); index.ts (function maps timeout, proxy failure and missing secret to explicit HTTP errors) | cd functions && npm test | high | covered-by-direct-evidence |

## Pending Scenarios
- none

## Implemented Without Direct Evidence
- none
