import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const defaultJsonOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_FINAL_CLOSEOUT.json')
const defaultMarkdownOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_FINAL_CLOSEOUT.md')

const baselineMarkdownPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_BASELINE.md')
const matrixMarkdownPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_MATRIX.md')
const riskScanMarkdownPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RISK_SCAN.md')
const faultMatrixJsonPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_FAULT_MATRIX.json')
const deepSweepJsonPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_DEEP_SWEEP.json')
const releaseCloseoutJsonPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RELEASE_CLOSEOUT.json')
const residualSummaryJsonPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RESIDUAL_SUMMARY.json')
const handoffMarkdownPath = path.join(repoRoot, 'docs', 'release', 'CROSS_PLATFORM_HANDOFF.md')

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

async function readRequiredText(filePath) {
  return fs.readFile(filePath, 'utf8')
}

async function readRequiredJson(filePath) {
  return JSON.parse(await readRequiredText(filePath))
}

async function writeOutput(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

function toPosixRelative(targetPath) {
  return toPosixPath(path.relative(repoRoot, targetPath))
}

function readGitMetadata() {
  return {
    branch: process.env.GITHUB_REF_NAME || process.env.BRANCH_NAME || null,
    head: process.env.GITHUB_SHA || null,
  }
}

function extractCount(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = markdown.match(new RegExp(`- ${escaped}: (\\d+)`, 'i'))
  return Number(match?.[1] || 0)
}

function sumValues(record) {
  return Object.values(record).reduce((total, value) => total + Number(value || 0), 0)
}

function buildMacroPhases(inputs) {
  const matrixCounts = {
    routeGapsOpen: extractCount(inputs.matrixMarkdown, 'Route gaps open'),
    uiGapsOpen: extractCount(inputs.matrixMarkdown, 'UI gaps open'),
    pipelineGapsOpen: extractCount(inputs.matrixMarkdown, 'Pipeline gaps open'),
    pipelineFaultInjectionGapsOpen: extractCount(inputs.matrixMarkdown, 'Pipeline fault-injection gaps open'),
    backendPackageSlicesPending: extractCount(inputs.matrixMarkdown, 'Backend package slices pending'),
    cloudFunctionSlicesPending: extractCount(inputs.matrixMarkdown, 'Cloud function slices pending'),
  }

  const phases = [
    {
      id: 1,
      key: 'baseline_inventory',
      title: 'Baseline inventory',
      sourceArtifact: 'docs/release/PLATFORM_AUDIT_BASELINE.md',
      completed: /## Counts/i.test(inputs.baselineMarkdown),
      evidence: 'baseline inventory artifact generated',
    },
    {
      id: 2,
      key: 'coverage_matrix',
      title: 'Coverage matrix',
      sourceArtifact: 'docs/release/PLATFORM_AUDIT_MATRIX.md',
      completed: /## Prioritization Snapshot/i.test(inputs.matrixMarkdown),
      evidence: 'execution matrix artifact generated',
    },
    {
      id: 3,
      key: 'structural_static_scan',
      title: 'Structural and static scan',
      sourceArtifact: 'docs/release/PLATFORM_AUDIT_RISK_SCAN.md',
      completed: /Architecture guardrail: pass/i.test(inputs.riskScanMarkdown),
      evidence: 'architecture guardrail passed in the risk scan artifact',
    },
    {
      id: 4,
      key: 'data_auth_security_scan',
      title: 'Data, auth and security scan',
      sourceArtifact: 'docs/release/PLATFORM_AUDIT_RESIDUAL_SUMMARY.json',
      completed: sumValues(inputs.residualSummary.categories.securityAndConfig || {}) === 0,
      evidence: 'security/config residual bucket is zero',
    },
    {
      id: 5,
      key: 'functional_sweep',
      title: 'Functional sweep',
      sourceArtifact: 'docs/release/PLATFORM_AUDIT_MATRIX.md',
      completed: sumValues(matrixCounts) === 0,
      evidence: 'route, UI, pipeline, backend and cloud gaps are zero',
    },
    {
      id: 6,
      key: 'fault_injection',
      title: 'Fault injection matrix',
      sourceArtifact: 'docs/release/PLATFORM_AUDIT_FAULT_MATRIX.json',
      completed: Number(inputs.faultMatrix.counts?.implementedNoDirectEvidence || 0) === 0 && Number(inputs.faultMatrix.counts?.pending || 0) === 0,
      evidence: `${Number(inputs.faultMatrix.counts?.coveredByDirectEvidence || 0)} fault scenarios covered by direct evidence`,
    },
    {
      id: 7,
      key: 'deep_sweep',
      title: 'Deep stateful sweep',
      sourceArtifact: 'docs/release/PLATFORM_AUDIT_DEEP_SWEEP.json',
      completed: Number(inputs.deepSweep.counts?.implementedNoDirectEvidence || 0) === 0 && Number(inputs.deepSweep.counts?.pending || 0) === 0,
      evidence: `${Number(inputs.deepSweep.counts?.coveredByDirectEvidence || 0)} deep surfaces covered by direct evidence`,
    },
    {
      id: 8,
      key: 'release_closeout',
      title: 'Operational and release closeout',
      sourceArtifact: 'docs/release/PLATFORM_AUDIT_RELEASE_CLOSEOUT.json',
      completed: Number(inputs.releaseCloseout.counts?.driftDetected || 0) === 0 && Number(inputs.releaseCloseout.counts?.missing || 0) === 0,
      evidence: `${Number(inputs.releaseCloseout.counts?.coveredByRepoEvidence || 0)} release gates covered by repo evidence`,
    },
    {
      id: 9,
      key: 'residual_consolidation',
      title: 'Residual consolidation',
      sourceArtifact: 'docs/release/PLATFORM_AUDIT_RESIDUAL_SUMMARY.json',
      completed: Number(inputs.residualSummary.counts?.totalOpenResiduals || 0) === 0,
      evidence: `${Number(inputs.residualSummary.counts?.totalOpenResiduals || 0)} open residuals across ${Number(inputs.residualSummary.counts?.zeroedCategories || 0)} zeroed categories`,
    },
    {
      id: 10,
      key: 'handoff_sync',
      title: 'Handoff and doc sync',
      sourceArtifact: 'docs/release/CROSS_PLATFORM_HANDOFF.md',
      completed: /PLATFORM_AUDIT_FINAL_CLOSEOUT\.md/i.test(inputs.handoffMarkdown) && /npm run audit:final/i.test(inputs.handoffMarkdown),
      evidence: 'handoff contains the full audit chain and final closeout command',
    },
  ]

  const finalCloseoutReady = phases.every(phase => phase.completed)
  phases.push({
    id: 11,
    key: 'final_closeout',
    title: 'Final closeout',
    sourceArtifact: 'docs/release/PLATFORM_AUDIT_FINAL_CLOSEOUT.md',
    completed: finalCloseoutReady,
    evidence: finalCloseoutReady
      ? 'all prior macrophases are complete and the plan is ready for archival closeout'
      : 'waiting for one or more prior macrophases to complete before final archival closeout',
  })

  return phases
}

async function buildFinalCloseoutReport() {
  const [baselineMarkdown, matrixMarkdown, riskScanMarkdown, faultMatrix, deepSweep, releaseCloseout, residualSummary, handoffMarkdown] = await Promise.all([
    readRequiredText(baselineMarkdownPath),
    readRequiredText(matrixMarkdownPath),
    readRequiredText(riskScanMarkdownPath),
    readRequiredJson(faultMatrixJsonPath),
    readRequiredJson(deepSweepJsonPath),
    readRequiredJson(releaseCloseoutJsonPath),
    readRequiredJson(residualSummaryJsonPath),
    readRequiredText(handoffMarkdownPath),
  ])

  const phases = buildMacroPhases({
    baselineMarkdown,
    matrixMarkdown,
    riskScanMarkdown,
    faultMatrix,
    deepSweep,
    releaseCloseout,
    residualSummary,
    handoffMarkdown,
  })

  const completedMacrophases = phases.filter(phase => phase.completed).length
  const totalMacrophases = phases.length
  const remainingMacrophases = totalMacrophases - completedMacrophases

  return {
    generatedAt: new Date().toISOString(),
    git: readGitMetadata(),
    status: remainingMacrophases === 0 ? 'plan-fully-closed' : 'plan-still-open',
    counts: {
      totalMacrophases,
      completedMacrophases,
      remainingMacrophases,
      openResiduals: Number(residualSummary.counts?.totalOpenResiduals || 0),
      openReleaseDrift: Number(releaseCloseout.counts?.driftDetected || 0) + Number(releaseCloseout.counts?.missing || 0),
    },
    releaseBaseline: releaseCloseout.releaseBaseline || residualSummary.releaseBaseline || null,
    macrophases: phases,
  }
}

function buildMarkdownReport(report) {
  const rows = report.macrophases
    .map(phase => `| ${phase.id} | ${phase.title} | ${phase.sourceArtifact} | ${phase.completed ? 'completed' : 'pending'} | ${phase.evidence} |`)
    .join('\n')

  const remainingRows = report.macrophases
    .filter(phase => !phase.completed)
    .map(phase => `- ${phase.id}. ${phase.title} | source=${phase.sourceArtifact} | ${phase.evidence}`)
    .join('\n')

  const releaseBaseline = report.releaseBaseline
    ? [
        report.releaseBaseline.mergeCommit && `- Merge commit: ${report.releaseBaseline.mergeCommit}`,
        report.releaseBaseline.testsRun && `- Tests workflow run: ${report.releaseBaseline.testsRun}`,
        report.releaseBaseline.firebaseRun && `- Firebase production run: ${report.releaseBaseline.firebaseRun}`,
        report.releaseBaseline.releaseRun && `- Release-web run: ${report.releaseBaseline.releaseRun}`,
        report.releaseBaseline.targetDatabase && `- Target database: ${report.releaseBaseline.targetDatabase}`,
      ].filter(Boolean).join('\n')
    : '- unavailable'

  return [
    '# Platform Audit Final Closeout',
    '',
    `Generated: ${report.generatedAt}`,
    `Git branch: ${report.git.branch || 'unknown'}`,
    `Git head: ${report.git.head || 'unknown'}`,
    '',
    '## Final Plan Status',
    `- Status: ${report.status}`,
    `- Total macrophases: ${report.counts.totalMacrophases}`,
    `- Completed macrophases: ${report.counts.completedMacrophases}`,
    `- Remaining macrophases: ${report.counts.remainingMacrophases}`,
    `- Open residuals: ${report.counts.openResiduals}`,
    `- Open release drift: ${report.counts.openReleaseDrift}`,
    '',
    '## Latest Release Baseline',
    releaseBaseline,
    '',
    '## Macrophase Ledger',
    '| # | Macrophase | Source artifact | Status | Evidence |',
    '| --- | --- | --- | --- | --- |',
    rows,
    '',
    '## Remaining Macrophases',
    remainingRows || '- none',
    '',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv)
  const report = await buildFinalCloseoutReport()
  await writeOutput(args.jsonOutput, JSON.stringify(report, null, 2))
  await writeOutput(args.markdownOutput, buildMarkdownReport(report))

  console.log(`[lexio-platform-audit-final-closeout] JSON: ${toPosixRelative(args.jsonOutput)}`)
  console.log(`[lexio-platform-audit-final-closeout] Markdown: ${toPosixRelative(args.markdownOutput)}`)
  console.log(`[lexio-platform-audit-final-closeout] Status=${report.status} Completed=${report.counts.completedMacrophases}/${report.counts.totalMacrophases} Remaining=${report.counts.remainingMacrophases}`)
}

main().catch(error => {
  console.error('[lexio-platform-audit-final-closeout] Failed:', error)
  process.exit(1)
})