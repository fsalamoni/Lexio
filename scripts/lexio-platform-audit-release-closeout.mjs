import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const defaultJsonOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RELEASE_CLOSEOUT.json')
const defaultMarkdownOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RELEASE_CLOSEOUT.md')
const releaseIndexRelativePath = 'docs/release/WEB_RELEASE_INDEX.md'

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function readSource(relativePath, sourceCache) {
  const absolutePath = path.join(repoRoot, relativePath.replaceAll('/', path.sep))
  if (!(await pathExists(absolutePath))) return null
  if (sourceCache.has(relativePath)) return sourceCache.get(relativePath)

  const source = await fs.readFile(absolutePath, 'utf8')
  sourceCache.set(relativePath, source)
  return source
}

function extractLatestReleaseBaseline(indexSource) {
  return {
    testsRun: indexSource.match(/`Tests` run `(\d+)` success/i)?.[1] || null,
    firebaseRun: indexSource.match(/Firebase production deploy run `(\d+)` success/i)?.[1] || null,
    releaseRun: indexSource.match(/release-web one-shot run `(\d+)` success/i)?.[1] || null,
    mergeCommit: indexSource.match(/merge commit `([0-9a-f]+)`/i)?.[1] || null,
    validatedHead: indexSource.match(/head validado before merge `([0-9a-f]+)`/i)?.[1] || null,
    targetDatabase: indexSource.match(/point to `([^`]+)`; legacy/i)?.[1] || null,
  }
}

function buildIdPattern(values) {
  const filtered = values.filter(Boolean).map(escapeRegExp)
  return filtered.length ? new RegExp(filtered.join('|'), 'i') : null
}

function buildReleaseCloseoutGateDefinitions(baseline) {
  const releaseIdPattern = buildIdPattern([baseline.testsRun, baseline.firebaseRun, baseline.releaseRun])
  const releaseAndCommitPattern = buildIdPattern([baseline.testsRun, baseline.firebaseRun, baseline.releaseRun, baseline.mergeCommit])

  return [
    {
      key: 'release_workflow_dispatch',
      label: 'Release workflow dispatch contract',
      area: 'workflow',
      risk: 'high',
      recommendedValidation: 'rg -n "workflow_dispatch|deploy_firebase|deploy_github_pages|deploy_redesign_v2" .github/workflows/release-web.yml',
      checks: [
        {
          path: '.github/workflows/release-web.yml',
          pattern: /workflow_dispatch/i,
          note: 'one-shot workflow keeps manual dispatch enabled',
          missingNote: 'workflow_dispatch is missing from release-web.yml',
        },
        {
          path: '.github/workflows/release-web.yml',
          pattern: /deploy_firebase/i,
          note: 'Firebase production remains a first-class release input',
          missingNote: 'deploy_firebase input is missing from release-web.yml',
        },
        {
          path: '.github/workflows/release-web.yml',
          pattern: /deploy_github_pages/i,
          note: 'GitHub Pages remains a first-class release input',
          missingNote: 'deploy_github_pages input is missing from release-web.yml',
        },
        {
          path: '.github/workflows/release-web.yml',
          pattern: /deploy_redesign_v2/i,
          note: 'redesign V2 stays explicitly optional during one-shot release',
          missingNote: 'deploy_redesign_v2 input is missing from release-web.yml',
        },
      ],
    },
    {
      key: 'release_workflow_fanout',
      label: 'Release lane fanout and summary',
      area: 'workflow',
      risk: 'high',
      recommendedValidation: 'rg -n "quality-gates|deploy-firebase|deploy-pages|release-summary" .github/workflows/release-web.yml',
      checks: [
        {
          path: '.github/workflows/release-web.yml',
          pattern: /quality-gates/i,
          note: 'release lane still gates on the reusable quality workflow',
          missingNote: 'quality-gates job is missing from release-web.yml',
        },
        {
          path: '.github/workflows/release-web.yml',
          pattern: /deploy-firebase/i,
          note: 'release lane still fans out to Firebase production deploy',
          missingNote: 'deploy-firebase job is missing from release-web.yml',
        },
        {
          path: '.github/workflows/release-web.yml',
          pattern: /deploy-pages/i,
          note: 'release lane still fans out to GitHub Pages deploy',
          missingNote: 'deploy-pages job is missing from release-web.yml',
        },
        {
          path: '.github/workflows/release-web.yml',
          pattern: /release-summary/i,
          note: 'release lane still emits a final outcome summary',
          missingNote: 'release-summary job is missing from release-web.yml',
        },
        {
          path: '.github/workflows/firebase-deploy.yml',
          note: 'Firebase production workflow file exists for release fanout',
          missingNote: 'firebase-deploy.yml is missing',
        },
        {
          path: '.github/workflows/deploy-pages.yml',
          note: 'GitHub Pages workflow file exists for release fanout',
          missingNote: 'deploy-pages.yml is missing',
        },
        {
          path: '.github/workflows/test.yml',
          note: 'quality-gates workflow target exists',
          missingNote: 'test.yml is missing for quality-gates reuse',
        },
      ],
    },
    {
      key: 'release_plan_doc',
      label: 'Release plan document present',
      area: 'docs',
      risk: 'medium',
      recommendedValidation: 'rg -n "## Goal|## Scope" docs/release/WEB_RELEASE_PLAN.md',
      checks: [
        {
          path: 'docs/release/WEB_RELEASE_PLAN.md',
          pattern: /## Goal/i,
          note: 'release plan keeps an explicit goal section',
          missingNote: 'Goal section is missing from WEB_RELEASE_PLAN.md',
        },
        {
          path: 'docs/release/WEB_RELEASE_PLAN.md',
          pattern: /## Scope/i,
          note: 'release plan keeps an explicit scope section',
          missingNote: 'Scope section is missing from WEB_RELEASE_PLAN.md',
        },
      ],
    },
    {
      key: 'release_index_current_baseline',
      label: 'Release index current baseline',
      area: 'docs',
      risk: 'high',
      recommendedValidation: 'rg -n "Main deploys|Public smoke|Authenticated production smoke|Firestore monitoring|DataJud proxy smoke" docs/release/WEB_RELEASE_INDEX.md',
      checks: [
        {
          path: releaseIndexRelativePath,
          pattern: /## Current Validation Baseline/i,
          note: 'release index keeps a current validation baseline section',
          missingNote: 'Current Validation Baseline section is missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: releaseIndexRelativePath,
          pattern: /Main deploys:/i,
          note: 'current baseline records main deploy run IDs',
          missingNote: 'Main deploy summary is missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: releaseIndexRelativePath,
          pattern: /Public smoke:/i,
          note: 'current baseline records public smoke results',
          missingNote: 'Public smoke summary is missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: releaseIndexRelativePath,
          pattern: /Authenticated production smoke:/i,
          note: 'current baseline records authenticated production smoke results',
          missingNote: 'Authenticated production smoke summary is missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: releaseIndexRelativePath,
          pattern: /Firestore monitoring:/i,
          note: 'current baseline records Firestore monitoring results',
          missingNote: 'Firestore monitoring summary is missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: releaseIndexRelativePath,
          pattern: /DataJud proxy smoke:/i,
          note: 'current baseline records DataJud proxy smoke results',
          missingNote: 'DataJud proxy smoke summary is missing from WEB_RELEASE_INDEX.md',
        },
      ],
    },
    {
      key: 'release_cache_current_baseline',
      label: 'Release cache synced with current baseline',
      area: 'docs',
      risk: 'high',
      recommendedValidation: `rg -n "Current Validation Cache|${baseline.testsRun || 'tests'}|${baseline.firebaseRun || 'firebase'}|${baseline.releaseRun || 'release'}" docs/release/WEB_RELEASE_CACHE.md`,
      checks: [
        {
          path: 'docs/release/WEB_RELEASE_CACHE.md',
          pattern: /## Current Validation Cache/i,
          note: 'release cache keeps a current validation section',
          missingNote: 'Current Validation Cache section is missing from WEB_RELEASE_CACHE.md',
        },
        ...(releaseIdPattern ? [{
          path: 'docs/release/WEB_RELEASE_CACHE.md',
          pattern: releaseIdPattern,
          note: 'release cache carries the latest recorded run IDs',
          missingNote: 'Latest release run IDs are missing from WEB_RELEASE_CACHE.md',
        }] : []),
      ],
    },
    {
      key: 'plan_synced_with_current_release',
      label: 'Planning doc synced with current release IDs',
      area: 'docs',
      risk: 'high',
      recommendedValidation: `rg -n "${[baseline.testsRun, baseline.firebaseRun, baseline.releaseRun, baseline.mergeCommit].filter(Boolean).join('|')}" docs/PLANO.md`,
      checks: [
        ...(releaseAndCommitPattern ? [{
          path: 'docs/PLANO.md',
          pattern: releaseAndCommitPattern,
          note: 'planning log carries the latest merge and deploy IDs',
          missingNote: 'Latest merge/deploy IDs are missing from docs/PLANO.md',
        }] : []),
      ],
    },
    {
      key: 'manifest_synced_with_current_release',
      label: 'Manifest synced with current release IDs',
      area: 'docs',
      risk: 'high',
      recommendedValidation: `rg -n "${[baseline.testsRun, baseline.firebaseRun, baseline.releaseRun, baseline.mergeCommit].filter(Boolean).join('|')}" docs/MANIFEST.json`,
      checks: [
        ...(releaseAndCommitPattern ? [{
          path: 'docs/MANIFEST.json',
          pattern: releaseAndCommitPattern,
          note: 'manifest notes carry the latest merge and deploy IDs',
          missingNote: 'Latest merge/deploy IDs are missing from docs/MANIFEST.json',
        }] : []),
      ],
    },
    {
      key: 'handoff_synced_with_current_release',
      label: 'Cross-platform handoff synced with current release',
      area: 'handoff',
      risk: 'high',
      recommendedValidation: `rg -n "${[baseline.testsRun, baseline.firebaseRun, baseline.releaseRun, baseline.mergeCommit].filter(Boolean).join('|')}" docs/release/CROSS_PLATFORM_HANDOFF.md`,
      checks: [
        ...(releaseAndCommitPattern ? [{
          path: 'docs/release/CROSS_PLATFORM_HANDOFF.md',
          pattern: releaseAndCommitPattern,
          note: 'handoff doc carries the same merge and deploy IDs as the current release baseline',
          missingNote: 'CROSS_PLATFORM_HANDOFF.md is not synced to the latest merge/deploy IDs',
        }] : []),
      ],
    },
    {
      key: 'handoff_resume_package',
      label: 'Cross-platform handoff resume package',
      area: 'handoff',
      risk: 'medium',
      recommendedValidation: 'rg -n "Canonical Docs to Continue Work|git pull --rebase --autostash origin main|npm run typecheck|gh workflow run release-web.yml" docs/release/CROSS_PLATFORM_HANDOFF.md',
      checks: [
        {
          path: 'docs/release/CROSS_PLATFORM_HANDOFF.md',
          pattern: /## Canonical Docs to Continue Work/i,
          note: 'handoff doc keeps the canonical docs read order',
          missingNote: 'Canonical Docs section is missing from CROSS_PLATFORM_HANDOFF.md',
        },
        {
          path: 'docs/release/CROSS_PLATFORM_HANDOFF.md',
          pattern: /git pull --rebase --autostash origin main/i,
          note: 'handoff doc keeps git resume commands',
          missingNote: 'git resume command is missing from CROSS_PLATFORM_HANDOFF.md',
        },
        {
          path: 'docs/release/CROSS_PLATFORM_HANDOFF.md',
          pattern: /npm run typecheck/i,
          note: 'handoff doc keeps frontend validation commands',
          missingNote: 'typecheck command is missing from CROSS_PLATFORM_HANDOFF.md',
        },
        {
          path: 'docs/release/CROSS_PLATFORM_HANDOFF.md',
          pattern: /gh workflow run release-web\.yml/i,
          note: 'handoff doc keeps the one-shot release trigger command',
          missingNote: 'release trigger command is missing from CROSS_PLATFORM_HANDOFF.md',
        },
      ],
    },
    {
      key: 'release_history_chain',
      label: 'Release history chain retained',
      area: 'docs',
      risk: 'low',
      recommendedValidation: 'rg -n "Previous Validation Baseline|Previous One-shot Validation|Wave 39 Release Outcome|Wave 38 Release Outcome" docs/release/WEB_RELEASE_INDEX.md docs/release/WEB_RELEASE_CACHE.md',
      checks: [
        {
          path: 'docs/release/WEB_RELEASE_INDEX.md',
          pattern: /Previous Validation Baseline|Previous One-shot Validation/i,
          note: 'release index retains historical validation snapshots',
          missingNote: 'historical release snapshots are missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: 'docs/release/WEB_RELEASE_CACHE.md',
          pattern: /Wave 39 Release Outcome|Wave 38 Release Outcome/i,
          note: 'release cache retains previous wave outcomes',
          missingNote: 'historical wave outcomes are missing from WEB_RELEASE_CACHE.md',
        },
      ],
    },
    {
      key: 'production_cutover_recorded',
      label: 'Production cutover target recorded',
      area: 'operational',
      risk: 'high',
      recommendedValidation: 'rg -n "lexio-prod|0 to `\(default\)`|34 observed Firestore calls" docs/release/WEB_RELEASE_INDEX.md docs/release/WEB_RELEASE_CACHE.md',
      checks: [
        {
          path: 'docs/release/WEB_RELEASE_INDEX.md',
          pattern: /lexio-prod/i,
          note: 'release index records the production Firestore target',
          missingNote: 'production Firestore target is missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: 'docs/release/WEB_RELEASE_INDEX.md',
          pattern: /34 observed Firestore calls/i,
          note: 'release index records browser-side Firestore monitoring volume',
          missingNote: 'Firestore monitoring count is missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: 'docs/release/WEB_RELEASE_CACHE.md',
          pattern: /0 calls to `\(default\)`/i,
          note: 'release cache preserves the `(default)` zero-traffic cutoff signal',
          missingNote: '`(default)` zero-traffic signal is missing from WEB_RELEASE_CACHE.md',
        },
      ],
    },
    {
      key: 'smoke_and_proxy_recorded',
      label: 'Public/auth/proxy smoke matrix recorded',
      area: 'operational',
      risk: 'high',
      recommendedValidation: 'rg -n "Public smoke|Authenticated production smoke|DataJud proxy smoke" docs/release/WEB_RELEASE_INDEX.md',
      checks: [
        {
          path: 'docs/release/WEB_RELEASE_INDEX.md',
          pattern: /Public smoke:/i,
          note: 'release index records public smoke coverage',
          missingNote: 'public smoke coverage is missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: 'docs/release/WEB_RELEASE_INDEX.md',
          pattern: /Authenticated production smoke:/i,
          note: 'release index records authenticated smoke coverage',
          missingNote: 'authenticated smoke coverage is missing from WEB_RELEASE_INDEX.md',
        },
        {
          path: 'docs/release/WEB_RELEASE_INDEX.md',
          pattern: /DataJud proxy smoke:/i,
          note: 'release index records proxy smoke coverage',
          missingNote: 'proxy smoke coverage is missing from WEB_RELEASE_INDEX.md',
        },
      ],
    },
    {
      key: 'historical_closeout_archive',
      label: 'Historical closeout archive present',
      area: 'docs',
      risk: 'low',
      recommendedValidation: 'rg -n "Closeout da Release|Fechamento Operacional|Próximos Passos" docs/release/SUBONDA2_CLOSEOUT.md',
      checks: [
        {
          path: 'docs/release/SUBONDA2_CLOSEOUT.md',
          pattern: /Closeout da Release/i,
          note: 'historical closeout archive is still present',
          missingNote: 'historical closeout title is missing from SUBONDA2_CLOSEOUT.md',
        },
        {
          path: 'docs/release/SUBONDA2_CLOSEOUT.md',
          pattern: /Fechamento Operacional/i,
          note: 'historical closeout retains its operational section',
          missingNote: 'historical operational section is missing from SUBONDA2_CLOSEOUT.md',
        },
      ],
    },
  ]
}

async function evaluateGate(definition, sourceCache) {
  const evidence = []
  const missingSignals = []
  let matchedChecks = 0
  let missingFiles = 0

  for (const check of definition.checks) {
    const absolutePath = path.join(repoRoot, check.path.replaceAll('/', path.sep))
    if (!(await pathExists(absolutePath))) {
      missingFiles += 1
      missingSignals.push(check.missingNote || `${check.path} is missing`)
      continue
    }

    const source = await readSource(check.path, sourceCache)
    if (!check.pattern || (source && check.pattern.test(source))) {
      matchedChecks += 1
      evidence.push({ path: check.path, note: check.note || 'signal present' })
      continue
    }

    missingSignals.push(check.missingNote || `required signal missing in ${check.path}`)
  }

  const status = matchedChecks === definition.checks.length
    ? 'covered-by-repo-evidence'
    : missingFiles === definition.checks.length
      ? 'missing'
      : 'drift-detected'

  return {
    key: definition.key,
    label: definition.label,
    area: definition.area,
    risk: definition.risk,
    status,
    recommendedValidation: definition.recommendedValidation,
    evidence,
    missingSignals,
  }
}

async function buildReleaseCloseoutReport() {
  const sourceCache = new Map()
  const releaseIndexSource = await readSource(releaseIndexRelativePath, sourceCache)
  if (!releaseIndexSource) {
    throw new Error(`${releaseIndexRelativePath} is required to build the release closeout report`)
  }

  const releaseBaseline = extractLatestReleaseBaseline(releaseIndexSource)
  const gates = []
  for (const definition of buildReleaseCloseoutGateDefinitions(releaseBaseline)) {
    gates.push(await evaluateGate(definition, sourceCache))
  }

  const counts = {
    total: gates.length,
    coveredByRepoEvidence: gates.filter(item => item.status === 'covered-by-repo-evidence').length,
    driftDetected: gates.filter(item => item.status === 'drift-detected').length,
    missing: gates.filter(item => item.status === 'missing').length,
    openHighRisk: gates.filter(item => item.status !== 'covered-by-repo-evidence' && item.risk === 'high').length,
    openMediumRisk: gates.filter(item => item.status !== 'covered-by-repo-evidence' && item.risk === 'medium').length,
  }

  return {
    generatedAt: new Date().toISOString(),
    git: readGitMetadata(),
    releaseBaseline,
    counts,
    gates,
  }
}

function formatEvidence(gate) {
  const entries = gate.evidence.map(entry => `${path.posix.basename(entry.path)} (${entry.note})`)
  if (gate.missingSignals.length) {
    entries.push(`Missing: ${gate.missingSignals.join('; ')}`)
  }
  return entries.length ? entries.join('; ') : 'none yet'
}

function buildMarkdownReport(report) {
  const rows = report.gates
    .map(item => `| ${item.label} | ${item.area} | ${formatEvidence(item)} | ${item.recommendedValidation} | ${item.risk} | ${item.status} |`)
    .join('\n')

  const openRows = report.gates
    .filter(item => item.status !== 'covered-by-repo-evidence')
    .map(item => `- ${item.label} | status=${item.status} | risk=${item.risk} | ${formatEvidence(item)}`)
    .join('\n')

  const baselineSummary = [
    report.releaseBaseline.mergeCommit && `- Merge commit: ${report.releaseBaseline.mergeCommit}`,
    report.releaseBaseline.validatedHead && `- Validated head before merge: ${report.releaseBaseline.validatedHead}`,
    report.releaseBaseline.testsRun && `- Tests workflow run: ${report.releaseBaseline.testsRun}`,
    report.releaseBaseline.firebaseRun && `- Firebase production run: ${report.releaseBaseline.firebaseRun}`,
    report.releaseBaseline.releaseRun && `- Release-web run: ${report.releaseBaseline.releaseRun}`,
    report.releaseBaseline.targetDatabase && `- Target database: ${report.releaseBaseline.targetDatabase}`,
  ].filter(Boolean).join('\n')

  return [
    '# Platform Audit Release Closeout',
    '',
    `Generated: ${report.generatedAt}`,
    `Git branch: ${report.git.branch || 'unknown'}`,
    `Git head: ${report.git.head || 'unknown'}`,
    '',
    '## Latest Release Baseline',
    baselineSummary || '- unable to extract the latest release baseline from WEB_RELEASE_INDEX.md',
    '',
    '## Snapshot',
    `- Total gates: ${report.counts.total}`,
    `- Covered by repo evidence: ${report.counts.coveredByRepoEvidence}`,
    `- Drift detected: ${report.counts.driftDetected}`,
    `- Missing gates: ${report.counts.missing}`,
    `- Open high-risk gates: ${report.counts.openHighRisk}`,
    `- Open medium-risk gates: ${report.counts.openMediumRisk}`,
    '',
    '## Release Closeout Matrix',
    '| Gate | Area | Evidence | Recommended Validation | Risk | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    rows || '| none | — | — | — | — | — |',
    '',
    '## Open Gates',
    openRows || '- none',
    '',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv)
  const report = await buildReleaseCloseoutReport()
  await writeOutput(args.jsonOutput, JSON.stringify(report, null, 2))
  await writeOutput(args.markdownOutput, buildMarkdownReport(report))

  console.log(`[lexio-platform-audit-release-closeout] JSON: ${toPosixRelative(args.jsonOutput)}`)
  console.log(`[lexio-platform-audit-release-closeout] Markdown: ${toPosixRelative(args.markdownOutput)}`)
  console.log(`[lexio-platform-audit-release-closeout] Total=${report.counts.total} Covered=${report.counts.coveredByRepoEvidence} Drift=${report.counts.driftDetected} Missing=${report.counts.missing}`)
}

main().catch(error => {
  console.error('[lexio-platform-audit-release-closeout] Failed:', error)
  process.exit(1)
})