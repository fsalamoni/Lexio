import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const defaultJsonOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_DEEP_SWEEP.json')
const defaultMarkdownOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_DEEP_SWEEP.md')

function parseArgs(argv) {
  const result = {
    jsonOutput: defaultJsonOutput,
    markdownOutput: defaultMarkdownOutput,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json-output') result.jsonOutput = path.resolve(argv[++index])
    else if (value === '--markdown-output') result.markdownOutput = path.resolve(argv[++index])
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

const surfaceDefinitions = [
  {
    key: 'notebook_source_viewer_utilities',
    label: 'Notebook: source viewer utilities',
    rail: 'notebook',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/research-notebook-v2.test.ts',
    anchors: ['frontend/src/lib/research-notebook-v2.ts'],
    tests: [
      {
        path: 'frontend/src/lib/research-notebook-v2.test.ts',
        pattern: /canOpenNotebookSourceViewer|viewer avançado deste workbench/i,
        note: 'source preview and viewer affordances are exercised for notebook sources',
      },
    ],
  },
  {
    key: 'notebook_saved_search_memory',
    label: 'Notebook: saved searches and semantic tags',
    rail: 'notebook',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/research-notebook-v2.test.ts',
    anchors: ['frontend/src/lib/research-notebook-v2.ts'],
    tests: [
      {
        path: 'frontend/src/lib/research-notebook-v2.test.ts',
        pattern: /builds saved search labels and semantic tags|filters and sorts saved searches with pinned entries first/i,
        note: 'saved-search titles, semantic tags and pin-first ordering are covered',
      },
    ],
  },
  {
    key: 'notebook_artifacts_empty_state',
    label: 'Notebook: artifacts empty state',
    rail: 'notebook',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/pages/labs/ResearchNotebookV2.test.tsx',
    anchors: ['frontend/src/pages/labs/ResearchNotebookV2.tsx'],
    tests: [
      {
        path: 'frontend/src/pages/labs/ResearchNotebookV2.test.tsx',
        pattern: /shows the empty state when opening the artifacts section directly/i,
        note: 'artifacts section is validated when reached directly with no generated outputs',
      },
    ],
  },
  {
    key: 'notebook_studio_quick_action_handoff',
    label: 'Notebook: studio quick-action handoff',
    rail: 'notebook',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/pages/labs/ResearchNotebookV2.test.tsx',
    anchors: ['frontend/src/pages/labs/ResearchNotebookV2.tsx'],
    tests: [
      {
        path: 'frontend/src/pages/labs/ResearchNotebookV2.test.tsx',
        pattern: /switches to the studio section from quick actions/i,
        note: 'workbench quick actions reach the studio section through the intended flow',
      },
    ],
  },
  {
    key: 'notebook_artifact_operational_summary',
    label: 'Notebook: artifact operational summary',
    rail: 'notebook',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/notebook-artifact-tasks.test.ts',
    anchors: ['frontend/src/lib/notebook-artifact-tasks.ts'],
    tests: [
      {
        path: 'frontend/src/lib/notebook-artifact-tasks.test.ts',
        pattern: /accumulates operational summary and de-duplicates degradation reasons/i,
        note: 'artifact-task operational degradation is aggregated without duplicating reasons',
      },
    ],
  },
  {
    key: 'chat_orchestrator_loop_control',
    label: 'Chat: orchestrator loop control',
    rail: 'chat',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/chat-orchestrator/orchestrator.test.ts',
    anchors: ['frontend/src/lib/chat-orchestrator/orchestrator.ts'],
    tests: [
      {
        path: 'frontend/src/lib/chat-orchestrator/orchestrator.test.ts',
        pattern: /submit_final_answer|respects maxIterations|awaiting_user/i,
        note: 'orchestrator finalization, iteration caps and clarification pauses are exercised directly',
      },
    ],
  },
  {
    key: 'chat_decision_parser',
    label: 'Chat: tool decision parser',
    rail: 'chat',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/chat-orchestrator/tools-adapter.test.ts',
    anchors: ['frontend/src/lib/chat-orchestrator/tools-adapter.ts'],
    tests: [
      {
        path: 'frontend/src/lib/chat-orchestrator/tools-adapter.test.ts',
        pattern: /strips markdown fences before parsing|rejects malformed JSON|rejects tools outside the allow-list/i,
        note: 'tool-call parsing rejects malformed or unapproved orchestrator decisions',
      },
    ],
  },
  {
    key: 'chat_workspace_bindings',
    label: 'Chat: workspace roots and bindings',
    rail: 'chat',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/firestore-service.test.ts',
    anchors: ['frontend/src/lib/firestore-service.ts'],
    tests: [
      {
        path: 'frontend/src/lib/firestore-service.test.ts',
        pattern: /persists sidecar devices, workspace roots and bindings through the facade|retries workspace binding writes after transient permission-denied/i,
        note: 'workspace roots and conversation bindings are persisted and retried through the facade',
      },
    ],
  },
  {
    key: 'chat_approvals_and_audit',
    label: 'Chat: approvals and sidecar audit trail',
    rail: 'chat',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/firestore-service.test.ts',
    anchors: ['frontend/src/lib/firestore-service.ts'],
    tests: [
      {
        path: 'frontend/src/lib/firestore-service.test.ts',
        pattern: /persists sidecar commands, approvals and audit entries through the facade|retries approval request writes after transient permission-denied/i,
        note: 'approval requests and sidecar audit entries have direct persistence and retry coverage',
      },
    ],
  },
  {
    key: 'media_checkpoint_resume',
    label: 'Media: video checkpoint resume',
    rail: 'media',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/video-generation-pipeline.test.ts',
    anchors: ['frontend/src/lib/video-generation-pipeline.ts'],
    tests: [
      {
        path: 'frontend/src/lib/video-generation-pipeline.test.ts',
        pattern: /resumes after a planning checkpoint|resumes media generation from a checkpoint/i,
        note: 'video generation resumes from planning and media checkpoints without redoing completed work',
      },
    ],
  },
  {
    key: 'media_progress_execution_states',
    label: 'Media: progress execution states',
    rail: 'media',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/lib/video-pipeline-progress.test.ts',
    anchors: ['frontend/src/lib/video-pipeline-progress.ts'],
    tests: [
      {
        path: 'frontend/src/lib/video-pipeline-progress.test.ts',
        pattern: /uses waiting_io for media phases|elevates to retrying when retry metadata is present|honors explicit executionState/i,
        note: 'media progress state maps waiting IO, retrying and persisting phases explicitly',
      },
    ],
  },
  {
    key: 'media_cost_breakdown',
    label: 'Media: cost analytics breakdown',
    rail: 'media',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/lib/cost-analytics-coverage.test.ts',
    anchors: ['frontend/src/lib/cost-analytics.ts'],
    tests: [
      {
        path: 'frontend/src/lib/cost-analytics-coverage.test.ts',
        pattern: /aggregates video, audio and presentation executions into the proper function breakdowns|surfaces the v3 pipeline orchestrator as zero-cost operational usage/i,
        note: 'cross-pipeline media and v3 operational costs are aggregated into the intended breakdowns',
      },
    ],
  },
  {
    key: 'document_v3_final_persistence',
    label: 'Documento V3: final persistence recovery',
    rail: 'document-v3',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/lib/document-v3-orchestrator.test.ts',
    anchors: ['frontend/src/lib/document-v3-orchestrator.ts'],
    tests: [
      {
        path: 'frontend/src/lib/document-v3-orchestrator.test.ts',
        pattern: /persists error status when the final document save fails after earlier writes/i,
        note: 'the V3 orchestrator records erro status after a failed final save',
      },
    ],
  },
  {
    key: 'document_v3_runtime_badges',
    label: 'Documento V3: retry and fallback progress badges',
    rail: 'document-v3',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/components/PipelineProgressPanelV3.test.tsx',
    anchors: ['frontend/src/components/PipelineProgressPanelV3.tsx'],
    tests: [
      {
        path: 'frontend/src/components/PipelineProgressPanelV3.test.tsx',
        pattern: /renders a retry badge when runtimeRetryCount > 0|renders an "escalado" badge when runtimeUsedFallback is true/i,
        note: 'the V3 progress panel exposes retry and fallback runtime badges',
      },
    ],
  },
  {
    key: 'document_detail_retry_action',
    label: 'Document rail: detail retry action',
    rail: 'document-rail',
    risk: 'high',
    recommendedValidation: 'npx vitest run src/pages/DocumentDetail.test.tsx',
    anchors: ['frontend/src/pages/DocumentDetail.tsx'],
    tests: [
      {
        path: 'frontend/src/pages/DocumentDetail.test.tsx',
        pattern: /retries failed documents through the v3 rail/i,
        note: 'detail page retry action uses the V3 reprocessing rail',
      },
    ],
    sources: [
      {
        path: 'frontend/src/pages/DocumentDetail.tsx',
        pattern: /handleRetry|Reprocessar documento|generateDocumentV3/i,
        note: 'detail page exposes a dedicated V3 retry action for failed documents',
      },
    ],
  },
  {
    key: 'document_detail_open_generator',
    label: 'Document rail: detail open-in-generator action',
    rail: 'document-rail',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/pages/DocumentDetail.test.tsx',
    anchors: ['frontend/src/pages/DocumentDetail.tsx'],
    tests: [
      {
        path: 'frontend/src/pages/DocumentDetail.test.tsx',
        pattern: /opens notebook-origin documents in the canonical generator flow/i,
        note: 'detail page forwards notebook-origin documents into the canonical generator route',
      },
    ],
    sources: [
      {
        path: 'frontend/src/pages/DocumentDetail.tsx',
        pattern: /Abrir no Gerador|buildWorkspaceNewDocumentPath/i,
        note: 'detail page offers an open-in-generator CTA for notebook-origin documents',
      },
    ],
  },
  {
    key: 'document_detail_duplicate_action',
    label: 'Document rail: detail duplicate action',
    rail: 'document-rail',
    risk: 'medium',
    recommendedValidation: 'npx vitest run src/pages/DocumentDetail.test.tsx',
    anchors: ['frontend/src/pages/DocumentDetail.tsx'],
    tests: [
      {
        path: 'frontend/src/pages/DocumentDetail.test.tsx',
        pattern: /duplicates documents into a canonical new-document request/i,
        note: 'detail page duplicate action rebuilds a new canonical request with the same parameters',
      },
    ],
    sources: [
      {
        path: 'frontend/src/pages/DocumentDetail.tsx',
        pattern: /Duplicar|buildWorkspaceNewDocumentPath/i,
        note: 'detail page exposes duplication into the canonical new-document route',
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

async function buildDeepSweepReport() {
  const sourceCache = new Map()
  const surfaces = []

  for (const definition of surfaceDefinitions) {
    const testEvidence = await resolveEvidenceEntries(definition.tests, sourceCache)
    const sourceEvidence = await resolveEvidenceEntries(definition.sources, sourceCache)

    const status = testEvidence.length > 0
      ? 'covered-by-direct-evidence'
      : sourceEvidence.length > 0
        ? 'implemented-no-direct-evidence'
        : 'pending'

    surfaces.push({
      key: definition.key,
      label: definition.label,
      rail: definition.rail,
      risk: definition.risk,
      status,
      recommendedValidation: definition.recommendedValidation,
      anchors: definition.anchors || [],
      evidence: {
        tests: testEvidence,
        sources: sourceEvidence,
      },
    })
  }

  const counts = {
    total: surfaces.length,
    coveredByDirectEvidence: surfaces.filter(item => item.status === 'covered-by-direct-evidence').length,
    implementedNoDirectEvidence: surfaces.filter(item => item.status === 'implemented-no-direct-evidence').length,
    pending: surfaces.filter(item => item.status === 'pending').length,
    pendingHighRisk: surfaces.filter(item => item.status === 'pending' && item.risk === 'high').length,
    pendingMediumRisk: surfaces.filter(item => item.status === 'pending' && item.risk === 'medium').length,
  }

  return {
    generatedAt: new Date().toISOString(),
    git: readGitMetadata(),
    counts,
    surfaces,
  }
}

function formatEvidence(item) {
  const entries = [
    ...item.evidence.tests.map(entry => `${path.posix.basename(entry.path)} (${entry.note})`),
    ...item.evidence.sources.map(entry => `${path.posix.basename(entry.path)} (${entry.note})`),
  ]
  return entries.length ? entries.join('; ') : 'none yet'
}

function buildMarkdownReport(report) {
  const rows = report.surfaces
    .map(item => `| ${item.label} | ${item.rail} | ${formatEvidence(item)} | ${item.recommendedValidation} | ${item.risk} | ${item.status} |`)
    .join('\n')

  const pendingRows = report.surfaces
    .filter(item => item.status === 'pending')
    .map(item => `- ${item.label} | risk=${item.risk} | validate with: ${item.recommendedValidation}`)
    .join('\n')

  const sourceOnlyRows = report.surfaces
    .filter(item => item.status === 'implemented-no-direct-evidence')
    .map(item => `- ${item.label} | ${formatEvidence(item)} | validate with: ${item.recommendedValidation}`)
    .join('\n')

  return [
    '# Platform Audit Deep Sweep',
    '',
    `Generated: ${report.generatedAt}`,
    `Git branch: ${report.git.branch || 'unknown'}`,
    `Git head: ${report.git.head || 'unknown'}`,
    '',
    '## Snapshot',
    `- Total surfaces: ${report.counts.total}`,
    `- Covered by direct evidence: ${report.counts.coveredByDirectEvidence}`,
    `- Implemented without direct evidence: ${report.counts.implementedNoDirectEvidence}`,
    `- Pending surfaces: ${report.counts.pending}`,
    `- Pending high-risk surfaces: ${report.counts.pendingHighRisk}`,
    `- Pending medium-risk surfaces: ${report.counts.pendingMediumRisk}`,
    '',
    '## Deep Sweep Matrix',
    '| Surface | Rail | Evidence | Recommended Validation | Risk | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    rows || '| none | — | — | — | — | — |',
    '',
    '## Pending Surfaces',
    pendingRows || '- none',
    '',
    '## Implemented Without Direct Evidence',
    sourceOnlyRows || '- none',
    '',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv)
  const report = await buildDeepSweepReport()
  await writeOutput(args.jsonOutput, JSON.stringify(report, null, 2))
  await writeOutput(args.markdownOutput, buildMarkdownReport(report))

  console.log(`[lexio-platform-audit-deep-sweep] JSON: ${toPosixRelative(args.jsonOutput)}`)
  console.log(`[lexio-platform-audit-deep-sweep] Markdown: ${toPosixRelative(args.markdownOutput)}`)
  console.log(`[lexio-platform-audit-deep-sweep] Total=${report.counts.total} Covered=${report.counts.coveredByDirectEvidence} SourceOnly=${report.counts.implementedNoDirectEvidence} Pending=${report.counts.pending}`)
}

main().catch(error => {
  console.error('[lexio-platform-audit-deep-sweep] Failed:', error)
  process.exit(1)
})