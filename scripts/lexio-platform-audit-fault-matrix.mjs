import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const defaultJsonOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_FAULT_MATRIX.json')
const defaultMarkdownOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_FAULT_MATRIX.md')
const defaultRiskScanPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RISK_SCAN.json')

function parseArgs(argv) {
  const result = {
    jsonOutput: defaultJsonOutput,
    markdownOutput: defaultMarkdownOutput,
    riskScanPath: defaultRiskScanPath,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json-output') result.jsonOutput = path.resolve(argv[++index])
    else if (value === '--markdown-output') result.markdownOutput = path.resolve(argv[++index])
    else if (value === '--risk-scan') result.riskScanPath = path.resolve(argv[++index])
  }

  return result
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

function toPosixRelative(targetPath) {
  return toPosixPath(path.relative(repoRoot, targetPath))
}

async function readOptionalJson(filePath) {
  if (!(await pathExists(filePath))) return null
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeOutput(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

function readGitMetadata() {
  return {
    branch: process.env.GITHUB_REF_NAME || process.env.BRANCH_NAME || null,
    head: process.env.GITHUB_SHA || null,
  }
}

const scenarioDefinitions = [
  {
    key: 'missing_api_key',
    label: 'API key ausente',
    domain: 'providers-auth',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/error-humanizer.test.ts',
    anchors: ['frontend/src/lib/llm-client.ts', 'frontend/src/lib/provider-credentials.ts'],
    tests: [
      {
        path: 'frontend/src/lib/error-humanizer.test.ts',
        pattern: /invalid API key/i,
        note: 'user-facing handling for invalid or missing provider key',
      },
    ],
  },
  {
    key: 'model_unavailable',
    label: 'Modelo indisponível',
    domain: 'llm-provider',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/llm-client.test.ts',
    anchors: ['frontend/src/lib/llm-client.ts'],
    tests: [
      {
        path: 'frontend/src/lib/llm-client.test.ts',
        pattern: /ModelUnavailableError/i,
        note: 'unavailable models are classified so fallback can take over',
      },
    ],
  },
  {
    key: 'request_timeout',
    label: 'Timeout',
    domain: 'llm-provider',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/llm-client.test.ts src/lib/document-v3-orchestrator.test.ts',
    anchors: ['frontend/src/lib/llm-client.ts', 'frontend/src/lib/document-v3-orchestrator.ts', 'functions/src/index.ts'],
    tests: [
      {
        path: 'frontend/src/lib/llm-client.test.ts',
        pattern: /gateway timeouts|timed out|504/i,
        note: 'timeouts become transient errors or fallback triggers',
      },
      {
        path: 'frontend/src/lib/document-v3-orchestrator.test.ts',
        pattern: /tempo limite|AbortError/i,
        note: 'v3 orchestration tolerates hung agents and cancel paths',
      },
    ],
  },
  {
    key: 'rate_limit_429',
    label: 'HTTP 429 / rate limit',
    domain: 'llm-provider',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/lib/llm-client.test.ts src/lib/error-humanizer.test.ts',
    anchors: ['frontend/src/lib/llm-client.ts', 'frontend/src/lib/error-humanizer.ts'],
    tests: [
      {
        path: 'frontend/src/lib/llm-client.test.ts',
        pattern: /429|rate limited/i,
        note: 'network retry path exercises rate limiting',
      },
      {
        path: 'frontend/src/lib/error-humanizer.test.ts',
        pattern: /Too Many Requests|429/i,
        note: 'user-facing error text covers rate limiting',
      },
    ],
  },
  {
    key: 'intermittent_network',
    label: 'Rede intermitente',
    domain: 'network-resilience',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/lib/llm-client.test.ts src/lib/web-search-service.test.ts',
    anchors: ['frontend/src/lib/llm-client.ts', 'frontend/src/lib/web-search-service.ts'],
    tests: [
      {
        path: 'frontend/src/lib/llm-client.test.ts',
        pattern: /networkRetryCount|ok after retry/i,
        note: 'LLM client retries transient network failures',
      },
      {
        path: 'frontend/src/lib/web-search-service.test.ts',
        pattern: /network down|errorType === 'network'/i,
        note: 'web search falls back across Jina-backed strategies on network failure',
      },
    ],
  },
  {
    key: 'invalid_json',
    label: 'JSON inválido',
    domain: 'pipeline-parsing',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/lib/thesis-extractor.test.ts src/lib/audio-generation-pipeline.test.ts src/lib/datajud-service.test.ts',
    anchors: ['frontend/src/lib/thesis-extractor.ts', 'frontend/src/lib/audio-generation-pipeline.ts', 'frontend/src/lib/datajud-service.ts'],
    tests: [
      {
        path: 'frontend/src/lib/thesis-extractor.test.ts',
        pattern: /invalid JSON|invalid json/i,
        note: 'thesis extraction degrades safely when extraction JSON is malformed',
      },
      {
        path: 'frontend/src/lib/audio-generation-pipeline.test.ts',
        pattern: /invalid JSON/i,
        note: 'audio pipeline reports malformed stage output',
      },
      {
        path: 'frontend/src/lib/datajud-service.test.ts',
        pattern: /invalid json payloads/i,
        note: 'jurisprudence ranking parser falls back on malformed JSON payloads',
      },
    ],
  },
  {
    key: 'permission_denied',
    label: 'Permissão negada',
    domain: 'firestore-auth',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/contexts/AuthContext.test.tsx src/lib/firestore-service.test.ts',
    anchors: ['frontend/src/contexts/AuthContext.tsx', 'frontend/src/lib/firestore-service.ts'],
    tests: [
      {
        path: 'frontend/src/contexts/AuthContext.test.tsx',
        pattern: /permission-denied/i,
        note: 'auth hydration survives permission-denied reads',
      },
      {
        path: 'frontend/src/lib/firestore-service.test.ts',
        pattern: /permission-denied/i,
        note: 'firestore retries transient permission-denied operations',
      },
    ],
  },
  {
    key: 'auth_stale',
    label: 'Sessão stale / auth stale',
    domain: 'auth-session',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/api/client.test.ts src/lib/firebase-auth-retry.test.ts',
    anchors: ['frontend/src/api/client.ts', 'frontend/src/lib/firebase-auth-retry.ts'],
    tests: [
      {
        path: 'frontend/src/api/client.test.ts',
        pattern: /stale-token/i,
        note: 'client refreshes stale token paths without breaking session',
      },
      {
        path: 'frontend/src/lib/firebase-auth-retry.test.ts',
        pattern: /unauthenticated|retry/i,
        note: 'firebase auth retry helper covers transient stale-session states',
      },
    ],
  },
  {
    key: 'missing_index',
    label: 'Índice ausente',
    domain: 'firestore-indexing',
    risk: 'high',
    recommendedValidation: 'npm run audit:riskscan',
    anchors: ['firestore.indexes.json', 'scripts/lexio-platform-audit-risk-scan.mjs'],
    auditChecks: [
      ({ riskScan }) => riskScan?.firestore?.indexCoverage?.missingCollectionGroupIndexes?.length === 0
        ? {
            path: 'docs/release/PLATFORM_AUDIT_RISK_SCAN.json',
            note: 'risk scan reports zero missing collection group indexes',
          }
        : null,
    ],
  },
  {
    key: 'partial_document_save',
    label: 'Documento parcialmente salvo',
    domain: 'document-persistence',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/generation-service.orchestration.test.ts src/lib/document-v3-orchestrator.test.ts',
    anchors: ['frontend/src/lib/generation-service.ts', 'frontend/src/lib/document-v3-orchestrator.ts', 'frontend/src/pages/DocumentDetail.tsx'],
    tests: [
      {
        path: 'frontend/src/lib/document-v3-orchestrator.test.ts',
        pattern: /persists error status when the final document save fails/i,
        note: 'v3 orchestrator records erro status after a failed final save attempt',
      },
    ],
  },
  {
    key: 'media_upload_interrupted',
    label: 'Upload de mídia interrompido',
    domain: 'media-storage',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/notebook-media-storage.test.ts',
    anchors: ['frontend/src/lib/notebook-media-storage.ts', 'frontend/src/lib/video-generation-pipeline.ts', 'frontend/src/pages/labs/ResearchNotebookV2.tsx'],
    tests: [
      {
        path: 'frontend/src/lib/notebook-media-storage.test.ts',
        pattern: /canceled uploads as an interrupted media upload error/i,
        note: 'storage cancellation is translated to an explicit interrupted upload error',
      },
    ],
  },
  {
    key: 'user_cancelled',
    label: 'Cancelamento do usuário',
    domain: 'abort-cancel',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/lib/document-v3-orchestrator.test.ts src/lib/chat-orchestrator/orchestrator.test.ts src/lib/chat-orchestrator/super-skills.test.ts src/lib/video-generation-pipeline.test.ts',
    anchors: ['frontend/src/lib/document-v3-orchestrator.ts', 'frontend/src/lib/chat-orchestrator/orchestrator.ts', 'frontend/src/lib/video-generation-pipeline.ts'],
    tests: [
      {
        path: 'frontend/src/lib/document-v3-orchestrator.test.ts',
        pattern: /AbortError/i,
        note: 'v3 document generation aborts cleanly on cancellation',
      },
      {
        path: 'frontend/src/lib/chat-orchestrator/orchestrator.test.ts',
        pattern: /AbortError/i,
        note: 'chat orchestrator propagates cancellation immediately',
      },
      {
        path: 'frontend/src/lib/chat-orchestrator/super-skills.test.ts',
        pattern: /AbortError/i,
        note: 'chat super-skills preserve abort semantics',
      },
      {
        path: 'frontend/src/lib/video-generation-pipeline.test.ts',
        pattern: /AbortError/i,
        note: 'video pipeline stops on cancelled signal',
      },
    ],
  },
  {
    key: 'checkpoint_resume',
    label: 'Retomada por checkpoint',
    domain: 'media-checkpoint',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/lib/video-generation-pipeline.test.ts',
    anchors: ['frontend/src/lib/video-generation-pipeline.ts'],
    tests: [
      {
        path: 'frontend/src/lib/video-generation-pipeline.test.ts',
        pattern: /resumes after a planning checkpoint|resumes media generation from a checkpoint/i,
        note: 'video generation resumes without rerunning completed work',
      },
    ],
  },
  {
    key: 'stale_snapshot_conflict',
    label: 'Snapshot concorrente stale',
    domain: 'firestore-concurrency',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/firestore-service.test.ts',
    anchors: ['frontend/src/lib/firestore-service.ts', 'frontend/src/lib/modules/notebook/repository.ts', 'frontend/src/lib/modules/chat/repository.ts'],
    tests: [
      {
        path: 'frontend/src/lib/firestore-service.test.ts',
        pattern: /stale snapshot write conflicts surfaced as firestore aborted/i,
        note: 'write retries recover from concurrent stale snapshot conflicts surfaced as firestore aborted',
      },
    ],
  },
  {
    key: 'datajud_error',
    label: 'Erro no DataJud',
    domain: 'external-datajud',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/datajud-service.test.ts src/lib/document-v3-orchestrator.test.ts',
    anchors: ['frontend/src/lib/datajud-service.ts', 'frontend/src/lib/document-v3-orchestrator.ts', 'functions/src/index.ts'],
    tests: [
      {
        path: 'frontend/src/lib/document-v3-orchestrator.test.ts',
        pattern: /datajud-disabled-in-tests|LLM-only fallback/i,
        note: 'v3 researcher falls back when DataJud is unavailable',
      },
      {
        path: 'frontend/src/lib/datajud-service.test.ts',
        pattern: /keeps DataJud results when public enrichment fails|skips DataJud API for STF/i,
        note: 'jurisprudence search preserves results and fallback flow on upstream issues',
      },
    ],
  },
  {
    key: 'jina_error',
    label: 'Erro no Jina',
    domain: 'external-jina',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/lib/web-search-service.test.ts',
    anchors: ['frontend/src/lib/web-search-service.ts'],
    tests: [
      {
        path: 'frontend/src/lib/web-search-service.test.ts',
        pattern: /Jina Reader|network down|falls back through additional Jina-backed strategies/i,
        note: 'web search retries and falls back when Jina-backed strategy fails',
      },
    ],
  },
  {
    key: 'tts_error',
    label: 'Erro no TTS',
    domain: 'external-tts',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/tts-client.test.ts src/lib/audio-generation-pipeline.test.ts',
    anchors: ['frontend/src/lib/tts-client.ts', 'frontend/src/lib/audio-generation-pipeline.ts'],
    tests: [
      {
        path: 'frontend/src/lib/tts-client.test.ts',
        pattern: /TTS API error|resposta sem stream de áudio|stream concluído sem áudio|AbortError/i,
        note: 'TTS client handles provider-side failures explicitly',
      },
      {
        path: 'frontend/src/lib/audio-generation-pipeline.test.ts',
        pattern: /Narrador \/ TTS|invalid JSON/i,
        note: 'audio pipeline already exercises TTS-facing stages',
      },
    ],
  },
  {
    key: 'video_provider_error',
    label: 'Erro no provider de vídeo',
    domain: 'external-video',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/external-video-provider.test.ts',
    anchors: ['frontend/src/lib/external-video-provider.ts'],
    tests: [
      {
        path: 'frontend/src/lib/external-video-provider.test.ts',
        pattern: /auth failure as actionable warning|Location fallback/i,
        note: 'external video provider surfaces recoverable provider failures',
      },
    ],
  },
  {
    key: 'cloud_function_error',
    label: 'Erro na Cloud Function',
    domain: 'functions-proxy',
    risk: 'high',
    recommendedValidation: 'cd functions && npm test',
    anchors: ['functions/src/index.ts'],
    tests: [
      {
        path: 'functions/test/index.test.cjs',
        pattern: /fails when secret is missing|times out DataJud proxy requests|surfaces upstream proxy failures/i,
        note: 'datajud proxy maps missing secret, timeout and upstream proxy failures to explicit HTTP responses',
      },
    ],
    sources: [
      {
        path: 'functions/src/index.ts',
        pattern: /status\(504\)\.json|status\(502\)\.json|secret is not configured/i,
        note: 'function maps timeout, proxy failure and missing secret to explicit HTTP errors',
      },
    ],
  },
]

async function resolveEvidenceEntries(definitions, sourceCache) {
  const results = []
  for (const definition of definitions || []) {
    const absolutePath = path.join(repoRoot, definition.path.replaceAll('/', path.sep))
    if (!(await pathExists(absolutePath))) continue
    const source = sourceCache.get(definition.path) || await fs.readFile(absolutePath, 'utf8')
    sourceCache.set(definition.path, source)
    if (!definition.pattern || definition.pattern.test(source)) {
      results.push({ path: definition.path, note: definition.note || 'evidence matched' })
    }
  }
  return results
}

async function buildFaultMatrix(args) {
  const riskScan = await readOptionalJson(args.riskScanPath)
  const sourceCache = new Map()
  const scenarios = []

  for (const definition of scenarioDefinitions) {
    const testEvidence = await resolveEvidenceEntries(definition.tests, sourceCache)
    const sourceEvidence = await resolveEvidenceEntries(definition.sources, sourceCache)
    const auditEvidence = (definition.auditChecks || [])
      .map(check => check({ riskScan, riskScanPath: args.riskScanPath }))
      .filter(Boolean)

    const status = testEvidence.length > 0 || auditEvidence.length > 0
      ? 'covered-by-direct-evidence'
      : sourceEvidence.length > 0
        ? 'implemented-no-direct-evidence'
        : 'pending'

    scenarios.push({
      key: definition.key,
      label: definition.label,
      domain: definition.domain,
      risk: definition.risk,
      status,
      recommendedValidation: definition.recommendedValidation,
      anchors: definition.anchors || [],
      evidence: {
        tests: testEvidence,
        audits: auditEvidence,
        sources: sourceEvidence,
      },
    })
  }

  const counts = {
    total: scenarios.length,
    coveredByDirectEvidence: scenarios.filter(item => item.status === 'covered-by-direct-evidence').length,
    implementedNoDirectEvidence: scenarios.filter(item => item.status === 'implemented-no-direct-evidence').length,
    pending: scenarios.filter(item => item.status === 'pending').length,
    pendingHighRisk: scenarios.filter(item => item.status === 'pending' && item.risk === 'high').length,
    pendingMediumRisk: scenarios.filter(item => item.status === 'pending' && item.risk === 'medium').length,
  }

  return {
    generatedAt: new Date().toISOString(),
    git: readGitMetadata(),
    counts,
    scenarios,
  }
}

function formatEvidence(item) {
  const entries = [
    ...item.evidence.tests.map(entry => `${path.posix.basename(entry.path)} (${entry.note})`),
    ...item.evidence.audits.map(entry => `${path.posix.basename(entry.path)} (${entry.note})`),
    ...item.evidence.sources.map(entry => `${path.posix.basename(entry.path)} (${entry.note})`),
  ]
  return entries.length ? entries.join('; ') : 'none yet'
}

function buildMarkdownReport(report) {
  const rows = report.scenarios
    .map(item => `| ${item.label} | ${item.domain} | ${formatEvidence(item)} | ${item.recommendedValidation} | ${item.risk} | ${item.status} |`)
    .join('\n')

  const pendingRows = report.scenarios
    .filter(item => item.status === 'pending')
    .map(item => `- ${item.label} | risk=${item.risk} | validate with: ${item.recommendedValidation}`)
    .join('\n')

  const sourceOnlyRows = report.scenarios
    .filter(item => item.status === 'implemented-no-direct-evidence')
    .map(item => `- ${item.label} | ${formatEvidence(item)} | validate with: ${item.recommendedValidation}`)
    .join('\n')

  return [
    '# Platform Audit Fault Matrix',
    '',
    `Generated: ${report.generatedAt}`,
    `Git branch: ${report.git.branch || 'unknown'}`,
    `Git head: ${report.git.head || 'unknown'}`,
    '',
    '## Snapshot',
    `- Total scenarios: ${report.counts.total}`,
    `- Covered by direct evidence: ${report.counts.coveredByDirectEvidence}`,
    `- Implemented without direct evidence: ${report.counts.implementedNoDirectEvidence}`,
    `- Pending scenarios: ${report.counts.pending}`,
    `- Pending high-risk scenarios: ${report.counts.pendingHighRisk}`,
    `- Pending medium-risk scenarios: ${report.counts.pendingMediumRisk}`,
    '',
    '## Scenario Matrix',
    '| Scenario | Domain | Evidence | Recommended Validation | Risk | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    rows || '| none | — | — | — | — | — |',
    '',
    '## Pending Scenarios',
    pendingRows || '- none',
    '',
    '## Implemented Without Direct Evidence',
    sourceOnlyRows || '- none',
    '',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv)
  const report = await buildFaultMatrix(args)
  await writeOutput(args.jsonOutput, JSON.stringify(report, null, 2))
  await writeOutput(args.markdownOutput, buildMarkdownReport(report))

  console.log(`[lexio-platform-audit-fault-matrix] JSON: ${toPosixRelative(args.jsonOutput)}`)
  console.log(`[lexio-platform-audit-fault-matrix] Markdown: ${toPosixRelative(args.markdownOutput)}`)
  console.log(`[lexio-platform-audit-fault-matrix] Total=${report.counts.total} Covered=${report.counts.coveredByDirectEvidence} SourceOnly=${report.counts.implementedNoDirectEvidence} Pending=${report.counts.pending}`)
}

main().catch(error => {
  console.error('[lexio-platform-audit-fault-matrix] Failed:', error)
  process.exit(1)
})