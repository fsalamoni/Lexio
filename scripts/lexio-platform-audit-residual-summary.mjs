import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const defaultJsonOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RESIDUAL_SUMMARY.json')
const defaultMarkdownOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RESIDUAL_SUMMARY.md')

const matrixMarkdownPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_MATRIX.md')
const riskScanJsonPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RISK_SCAN.json')
const faultMatrixJsonPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_FAULT_MATRIX.json')
const deepSweepJsonPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_DEEP_SWEEP.json')
const releaseCloseoutJsonPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RELEASE_CLOSEOUT.json')

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

function pickLength(value) {
  return Array.isArray(value) ? value.length : 0
}

async function buildResidualSummaryReport() {
  const [matrixMarkdown, riskScan, faultMatrix, deepSweep, releaseCloseout] = await Promise.all([
    readRequiredText(matrixMarkdownPath),
    readRequiredJson(riskScanJsonPath),
    readRequiredJson(faultMatrixJsonPath),
    readRequiredJson(deepSweepJsonPath),
    readRequiredJson(releaseCloseoutJsonPath),
  ])

  const matrixResiduals = {
    routeGapsOpen: extractCount(matrixMarkdown, 'Route gaps open'),
    uiGapsOpen: extractCount(matrixMarkdown, 'UI gaps open'),
    pipelineGapsOpen: extractCount(matrixMarkdown, 'Pipeline gaps open'),
    pipelineFaultInjectionGapsOpen: extractCount(matrixMarkdown, 'Pipeline fault-injection gaps open'),
    backendPackageSlicesPending: extractCount(matrixMarkdown, 'Backend package slices pending'),
    cloudFunctionSlicesPending: extractCount(matrixMarkdown, 'Cloud function slices pending'),
  }

  const riskResiduals = {
    unexpectedFirestoreCollections: pickLength(riskScan.firestore?.unknownCollections),
    missingUserSubcollectionRules: pickLength(riskScan.firestore?.rulesCoverage?.missingUserSubcollectionRules),
    missingNestedSubcollectionRules: pickLength(riskScan.firestore?.rulesCoverage?.missingNestedSubcollectionRules),
    missingRuntimeCollectionGroupRules: pickLength(riskScan.firestore?.rulesCoverage?.missingRuntimeCollectionGroupRules),
    missingCollectionGroupIndexes: pickLength(riskScan.firestore?.indexCoverage?.missingCollectionGroupIndexes),
    unresolvedCollectionGroupQueries: pickLength(riskScan.firestore?.indexCoverage?.unresolvedCollectionGroupQueries),
    missingFirestoreDeployDatabases: pickLength(riskScan.firestore?.deployConfig?.missingFirestoreDeployDatabases),
    misconfiguredFirestoreDeployDatabases: pickLength(riskScan.firestore?.deployConfig?.misconfiguredFirestoreDeployDatabases),
    unexpectedAuthObserverUsages: pickLength(riskScan.auth?.unexpectedAuthObserverUsages),
    unexpectedAdminEmailUsages: pickLength(riskScan.auth?.unexpectedAdminEmailUsages),
    unexpectedAdminRoleCheckUsages: pickLength(riskScan.auth?.unexpectedAdminRoleCheckUsages),
    unexpectedFirestoreOperationFiles: pickLength(riskScan.auth?.unexpectedFirestoreOperationFiles),
    unexpectedUnguardedFirestoreOperationFiles: pickLength(riskScan.auth?.unexpectedUnguardedFirestoreOperationFiles),
    unexpectedAuthRecoveryOptOutUsages: pickLength(riskScan.auth?.unexpectedAuthRecoveryOptOutUsages),
    unexpectedFirestoreBootstrapUsages: pickLength(riskScan.auth?.unexpectedFirestoreBootstrapUsages),
    unexpectedFirestoreDatabaseEnvUsages: pickLength(riskScan.auth?.unexpectedFirestoreDatabaseEnvUsages),
    unexpectedSessionStorageFiles: pickLength(riskScan.auth?.unexpectedSessionStorageFiles),
    unexpectedSessionStorageWrites: pickLength(riskScan.auth?.unexpectedSessionStorageWrites),
    sensitiveConfigDefaults: pickLength(riskScan.security?.sensitiveConfigDefaults),
  }

  const faultResiduals = {
    implementedNoDirectEvidence: Number(faultMatrix.counts?.implementedNoDirectEvidence || 0),
    pending: Number(faultMatrix.counts?.pending || 0),
  }

  const deepResiduals = {
    implementedNoDirectEvidence: Number(deepSweep.counts?.implementedNoDirectEvidence || 0),
    pending: Number(deepSweep.counts?.pending || 0),
  }

  const releaseResiduals = {
    driftDetected: Number(releaseCloseout.counts?.driftDetected || 0),
    missing: Number(releaseCloseout.counts?.missing || 0),
  }

  const categoryTotals = {
    executionMatrix: sumValues(matrixResiduals),
    securityAndConfig: sumValues(riskResiduals),
    faultMatrix: sumValues(faultResiduals),
    deepSweep: sumValues(deepResiduals),
    releaseCloseout: sumValues(releaseResiduals),
  }

  const totalOpenResiduals = sumValues(categoryTotals)
  const status = totalOpenResiduals === 0 ? 'ready-for-final-closeout' : 'residuals-open'

  return {
    generatedAt: new Date().toISOString(),
    git: readGitMetadata(),
    status,
    counts: {
      totalOpenResiduals,
      openCategories: Object.values(categoryTotals).filter(value => value > 0).length,
      zeroedCategories: Object.values(categoryTotals).filter(value => value === 0).length,
    },
    sourceArtifacts: {
      executionMatrix: toPosixRelative(matrixMarkdownPath),
      riskScan: toPosixRelative(riskScanJsonPath),
      faultMatrix: toPosixRelative(faultMatrixJsonPath),
      deepSweep: toPosixRelative(deepSweepJsonPath),
      releaseCloseout: toPosixRelative(releaseCloseoutJsonPath),
    },
    categories: {
      executionMatrix: matrixResiduals,
      securityAndConfig: riskResiduals,
      faultMatrix: faultResiduals,
      deepSweep: deepResiduals,
      releaseCloseout: releaseResiduals,
    },
    categoryTotals,
    releaseBaseline: releaseCloseout.releaseBaseline || null,
  }
}

function buildDetailsList(entries) {
  return Object.entries(entries)
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')
}

function buildMarkdownReport(report) {
  const rows = [
    ['Execution matrix', report.categoryTotals.executionMatrix, report.sourceArtifacts.executionMatrix],
    ['Security and config', report.categoryTotals.securityAndConfig, report.sourceArtifacts.riskScan],
    ['Fault matrix', report.categoryTotals.faultMatrix, report.sourceArtifacts.faultMatrix],
    ['Deep sweep', report.categoryTotals.deepSweep, report.sourceArtifacts.deepSweep],
    ['Release closeout', report.categoryTotals.releaseCloseout, report.sourceArtifacts.releaseCloseout],
  ]
    .map(([label, count, source]) => `| ${label} | ${count} | ${source} |`)
    .join('\n')

  const openSections = [
    ['Execution matrix', buildDetailsList(report.categories.executionMatrix)],
    ['Security and config', buildDetailsList(report.categories.securityAndConfig)],
    ['Fault matrix', buildDetailsList(report.categories.faultMatrix)],
    ['Deep sweep', buildDetailsList(report.categories.deepSweep)],
    ['Release closeout', buildDetailsList(report.categories.releaseCloseout)],
  ]
    .filter(([, details]) => details)
    .map(([title, details]) => [`### ${title}`, details].join('\n'))
    .join('\n\n')

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
    '# Platform Audit Residual Summary',
    '',
    `Generated: ${report.generatedAt}`,
    `Git branch: ${report.git.branch || 'unknown'}`,
    `Git head: ${report.git.head || 'unknown'}`,
    '',
    '## Final Residual Count',
    `- Status: ${report.status}`,
    `- Total open residuals: ${report.counts.totalOpenResiduals}`,
    `- Open categories: ${report.counts.openCategories}`,
    `- Zeroed categories: ${report.counts.zeroedCategories}`,
    '',
    '## Latest Release Baseline',
    releaseBaseline,
    '',
    '## Residual Categories',
    '| Category | Open residuals | Source artifact |',
    '| --- | --- | --- |',
    rows,
    '',
    '## Open Residual Details',
    openSections || '- none',
    '',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv)
  const report = await buildResidualSummaryReport()
  await writeOutput(args.jsonOutput, JSON.stringify(report, null, 2))
  await writeOutput(args.markdownOutput, buildMarkdownReport(report))

  console.log(`[lexio-platform-audit-residual-summary] JSON: ${toPosixRelative(args.jsonOutput)}`)
  console.log(`[lexio-platform-audit-residual-summary] Markdown: ${toPosixRelative(args.markdownOutput)}`)
  console.log(`[lexio-platform-audit-residual-summary] Status=${report.status} OpenResiduals=${report.counts.totalOpenResiduals} OpenCategories=${report.counts.openCategories}`)
}

main().catch(error => {
  console.error('[lexio-platform-audit-residual-summary] Failed:', error)
  process.exit(1)
})