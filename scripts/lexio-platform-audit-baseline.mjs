import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const defaultJsonOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_BASELINE.json')
const defaultMarkdownOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_BASELINE.md')
const defaultMatrixOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_MATRIX.md')
const defaultRiskScanPath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RISK_SCAN.json')

const canonicalDocs = [
  'docs/PLANO.md',
  'docs/MANIFEST.json',
  'NOTEBOOK_IMPLEMENTATION_STATUS.md',
  'docs/release/WEB_RELEASE_CACHE.md',
  'docs/release/WEB_RELEASE_INDEX.md',
  'docs/release/CROSS_PLATFORM_HANDOFF.md',
  'docs/architecture/firestore-data-boundaries.md',
  'docs/migration/firestore-database-isolation.md',
]

const pipelineRuntimeFiles = [
  'frontend/src/lib/generation-service.ts',
  'frontend/src/lib/document-v3-orchestrator.ts',
  'frontend/src/lib/thesis-analyzer.ts',
  'frontend/src/lib/thesis-extractor.ts',
  'frontend/src/lib/notebook-studio-pipeline.ts',
  'frontend/src/lib/notebook-audio-pipeline.ts',
  'frontend/src/lib/notebook-acervo-analyzer.ts',
  'frontend/src/lib/video-generation-pipeline.ts',
  'frontend/src/lib/literal-video-production.ts',
  'frontend/src/lib/chat-orchestrator',
]

function parseArgs(argv) {
  const result = {
    jsonOutput: defaultJsonOutput,
    markdownOutput: defaultMarkdownOutput,
    matrixOutput: defaultMatrixOutput,
    riskScanPath: defaultRiskScanPath,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--json-output') result.jsonOutput = path.resolve(argv[++index])
    else if (value === '--markdown-output') result.markdownOutput = path.resolve(argv[++index])
    else if (value === '--matrix-output') result.matrixOutput = path.resolve(argv[++index])
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

function toPosixRelative(targetPath) {
  return path.relative(repoRoot, targetPath).split(path.sep).join('/')
}

async function listFilesRecursive(rootPath, extensions = null) {
  if (!(await pathExists(rootPath))) return []

  const entries = await fs.readdir(rootPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(fullPath, extensions))
      continue
    }
    if (!entry.isFile()) continue
    if (extensions && !extensions.has(path.extname(entry.name))) continue
    files.push(fullPath)
  }

  return files.sort((left, right) => toPosixRelative(left).localeCompare(toPosixRelative(right)))
}

async function listDirectories(rootPath) {
  if (!(await pathExists(rootPath))) return []
  const entries = await fs.readdir(rootPath, { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(rootPath, entry.name))
    .sort((left, right) => toPosixRelative(left).localeCompare(toPosixRelative(right)))
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function readOptionalJson(filePath) {
  if (!(await pathExists(filePath))) return null
  return readJson(filePath)
}

async function readPackageScripts(packageJsonPath) {
  if (!(await pathExists(packageJsonPath))) return null
  const packageJson = await readJson(packageJsonPath)
  return packageJson.scripts || {}
}

async function readMakeTargets(makefilePath) {
  if (!(await pathExists(makefilePath))) return []
  const source = await fs.readFile(makefilePath, 'utf8')
  return [...new Set(
    source
      .split(/\r?\n/)
      .map(line => line.match(/^([A-Za-z0-9_.-]+):(?:\s|$)/)?.[1])
      .filter(Boolean),
  )].sort()
}

function readGitMetadata() {
  const safeExec = (args) => {
    try {
      return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
    } catch {
      return null
    }
  }

  const head = safeExec(['rev-parse', 'HEAD'])
  const branch = safeExec(['rev-parse', '--abbrev-ref', 'HEAD'])
  const status = safeExec(['status', '--short'])
  return {
    head,
    branch,
    dirty: Boolean(status),
    statusLines: status ? status.split(/\r?\n/).filter(Boolean) : [],
  }
}

async function buildRouteInventory(appFilePath) {
  if (!(await pathExists(appFilePath))) {
    return {
      file: toPosixRelative(appFilePath),
      lazyImports: [],
      routes: [],
    }
  }

  const source = await fs.readFile(appFilePath, 'utf8')
  const lazyImportRegex = /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\('([^']+)'\)\)/g
  const lazyImports = []
  const importMap = new Map()
  for (const match of source.matchAll(lazyImportRegex)) {
    lazyImports.push({ symbol: match[1], importPath: match[2] })
    importMap.set(match[1], match[2])
  }

  const routes = []
  const lines = source.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/<Route\s+path="([^"]+)"\s+element={(.+)}\s*\/>/)
    if (!match) continue

    const pathValue = match[1]
    const rawElement = match[2].trim()
    const componentMatches = [...rawElement.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map(item => item[1])
    const wrappers = componentMatches.length > 1 ? componentMatches.slice(0, -1) : []
    const primaryComponent = componentMatches[componentMatches.length - 1] || null
    const importPath = primaryComponent ? importMap.get(primaryComponent) || null : null

    let access = 'protected'
    if (['/login', '/register', '/forgot-password', '/reset-password'].includes(pathValue)) access = 'public'
    else if (wrappers.includes('AdminRoute')) access = 'admin'

    routes.push({
      path: pathValue,
      access,
      rawElement,
      wrappers,
      component: primaryComponent,
      importPath,
    })
  }

  return {
    file: toPosixRelative(appFilePath),
    lazyImports,
    routes,
  }
}

function classifyComponent(filePath) {
  const basename = path.basename(filePath)
  const relativePath = toPosixRelative(filePath)
  return {
    path: relativePath,
    kind: relativePath.includes('/artifacts/')
      ? 'artifact-viewer'
      : /Modal|Dialog/.test(basename)
        ? 'modal'
        : /Progress|Tracker|Trail/.test(basename)
          ? 'progress'
          : 'component',
  }
}

function classifyPage(filePath) {
  const relativePath = toPosixRelative(filePath)
  return {
    path: relativePath,
    bucket: relativePath.includes('/pages/auth/')
      ? 'auth'
      : relativePath.includes('/pages/labs/')
        ? 'labs'
        : relativePath.includes('/pages/notebook/')
          ? 'notebook-shared'
          : 'main',
  }
}

function countBy(items, getKey) {
  const counts = {}
  for (const item of items) {
    const key = getKey(item)
    counts[key] = (counts[key] || 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function relativeEntries(filePaths) {
  return filePaths.map(filePath => toPosixRelative(filePath))
}

async function readRelativeFileSources(relativePaths) {
  const entries = await Promise.all(relativePaths.map(async (relativePath) => {
    const absolutePath = path.join(repoRoot, relativePath.replaceAll('/', path.sep))
    return [relativePath, await fs.readFile(absolutePath, 'utf8')]
  }))
  return Object.fromEntries(entries)
}

async function buildInventory() {
  const frontendRoot = path.join(repoRoot, 'frontend')
  const frontendSrcRoot = path.join(frontendRoot, 'src')
  const pagesRoot = path.join(frontendSrcRoot, 'pages')
  const componentsRoot = path.join(frontendSrcRoot, 'components')
  const contextsRoot = path.join(frontendSrcRoot, 'contexts')
  const modulesRoot = path.join(frontendSrcRoot, 'lib', 'modules')
  const agentDefinitionsRoot = path.join(frontendSrcRoot, 'lib', 'pipelines', 'agent-definitions')
  const frontendTestsRoot = frontendSrcRoot
  const repoTestsRoot = path.join(repoRoot, 'tests')
  const packagesRoot = path.join(repoRoot, 'packages')
  const workflowsRoot = path.join(repoRoot, '.github', 'workflows')
  const scriptsRoot = path.join(repoRoot, 'scripts')
  const functionsRoot = path.join(repoRoot, 'functions', 'src')

  const pageFiles = (await listFilesRecursive(pagesRoot, new Set(['.ts', '.tsx'])))
    .filter(filePath => !/\.test\.[tj]sx?$/.test(filePath))
    .map(classifyPage)
  const componentFiles = (await listFilesRecursive(componentsRoot, new Set(['.ts', '.tsx'])))
    .filter(filePath => !/\.test\.[tj]sx?$/.test(filePath))
    .map(classifyComponent)
  const contextFiles = relativeEntries(await listFilesRecursive(contextsRoot, new Set(['.ts', '.tsx'])))
  const moduleDirectories = relativeEntries(await listDirectories(modulesRoot))
  const agentDefinitionFiles = relativeEntries(await listFilesRecursive(agentDefinitionsRoot, new Set(['.ts'])))
  const frontendTestFiles = relativeEntries(
    (await listFilesRecursive(frontendTestsRoot, new Set(['.ts', '.tsx']))).filter(filePath => /\.test\.[tj]sx?$/.test(filePath)),
  )
  const frontendTestSources = await readRelativeFileSources(frontendTestFiles)
  const pythonTestFiles = relativeEntries(
    (await listFilesRecursive(repoTestsRoot, new Set(['.py']))).filter(filePath => /^test_|_test\.py$/.test(path.basename(filePath)) || path.basename(filePath).startsWith('test_')),
  )
  const backendPackageRoots = relativeEntries(await listDirectories(packagesRoot))
  const backendPythonSourceFiles = relativeEntries(
    (await listFilesRecursive(packagesRoot, new Set(['.py']))).filter(filePath => !/\/tests\//.test(toPosixRelative(filePath))),
  )
  const workflowFiles = relativeEntries(await listFilesRecursive(workflowsRoot, new Set(['.yml', '.yaml'])))
  const scriptFiles = relativeEntries(await listFilesRecursive(scriptsRoot, new Set(['.mjs', '.js', '.sh'])))
  const functionSourceFiles = relativeEntries(await listFilesRecursive(functionsRoot, new Set(['.ts', '.js'])))
  const pipelineFiles = pipelineRuntimeFiles.filter(filePath => filePath && path.normalize(path.join(repoRoot, filePath.replaceAll('/', path.sep))))
  const pipelineRuntimeInventory = []
  for (const relativePath of pipelineRuntimeFiles) {
    const absolutePath = path.join(repoRoot, relativePath.replaceAll('/', path.sep))
    pipelineRuntimeInventory.push({
      path: relativePath,
      exists: await pathExists(absolutePath),
      kind: relativePath.endsWith('/chat-orchestrator') ? 'directory' : 'file',
    })
  }

  const routeInventory = await buildRouteInventory(path.join(frontendSrcRoot, 'App.tsx'))
  const frontendScripts = await readPackageScripts(path.join(frontendRoot, 'package.json'))
  const functionsScripts = await readPackageScripts(path.join(repoRoot, 'functions', 'package.json'))
  const makeTargets = await readMakeTargets(path.join(repoRoot, 'Makefile'))

  const canonicalDocsInventory = []
  for (const relativePath of canonicalDocs) {
    const absolutePath = path.join(repoRoot, relativePath.replaceAll('/', path.sep))
    canonicalDocsInventory.push({
      path: relativePath,
      exists: await pathExists(absolutePath),
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    git: readGitMetadata(),
    workspace: {
      repoRoot: '.',
      frontendRoot: toPosixRelative(frontendRoot),
      functionsRoot: toPosixRelative(path.join(repoRoot, 'functions')),
      packagesRoot: toPosixRelative(packagesRoot),
    },
    counts: {
      routes: routeInventory.routes.length,
      pages: pageFiles.length,
      components: componentFiles.length,
      modals: componentFiles.filter(item => item.kind === 'modal').length,
      progressComponents: componentFiles.filter(item => item.kind === 'progress').length,
      artifactViewers: componentFiles.filter(item => item.kind === 'artifact-viewer').length,
      contexts: contextFiles.length,
      modules: moduleDirectories.length,
      agentDefinitionFiles: agentDefinitionFiles.length,
      pipelineRuntimeEntries: pipelineRuntimeInventory.length,
      frontendTests: frontendTestFiles.length,
      pythonTests: pythonTestFiles.length,
      backendPackageRoots: backendPackageRoots.length,
      backendPythonSourceFiles: backendPythonSourceFiles.length,
      workflows: workflowFiles.length,
      scripts: scriptFiles.length,
      functionSourceFiles: functionSourceFiles.length,
      canonicalDocs: canonicalDocsInventory.length,
    },
    frontend: {
      routes: routeInventory,
      pages: {
        byBucket: countBy(pageFiles, item => item.bucket),
        items: pageFiles,
      },
      components: {
        byKind: countBy(componentFiles, item => item.kind),
        items: componentFiles,
      },
      contexts: contextFiles,
      modules: moduleDirectories,
      agentDefinitions: agentDefinitionFiles,
      pipelineRuntime: pipelineRuntimeInventory,
      tests: frontendTestFiles,
      testSources: frontendTestSources,
    },
    platform: {
      functionSourceFiles,
      backendPackageRoots,
      backendPythonSourceFiles,
      pythonTests: pythonTestFiles,
      workflows: workflowFiles,
      scripts: scriptFiles,
      canonicalDocs: canonicalDocsInventory,
    },
    validationCommands: {
      frontendScripts,
      functionsScripts,
      makeTargets,
    },
  }
}

function buildMarkdownReport(inventory) {
  const routeLines = inventory.frontend.routes.routes
    .map(route => `- ${route.path} | ${route.access} | ${route.component || 'unknown'}${route.importPath ? ` | ${route.importPath}` : ''}`)
    .join('\n')

  const topLines = (title, items) => {
    if (!items.length) return `## ${title}\n- none\n`
    return `## ${title}\n${items.map(item => `- ${item}`).join('\n')}\n`
  }

  return [
    '# Platform Audit Baseline',
    '',
    `Generated: ${inventory.generatedAt}`,
    `Git branch: ${inventory.git.branch || 'unknown'}`,
    `Git head: ${inventory.git.head || 'unknown'}`,
    `Dirty worktree: ${inventory.git.dirty ? 'yes' : 'no'}`,
    '',
    '## Counts',
    `- Routes: ${inventory.counts.routes}`,
    `- Pages: ${inventory.counts.pages}`,
    `- Components: ${inventory.counts.components}`,
    `- Modals/Dialog surfaces: ${inventory.counts.modals}`,
    `- Progress/Trail surfaces: ${inventory.counts.progressComponents}`,
    `- Artifact viewers: ${inventory.counts.artifactViewers}`,
    `- Contexts: ${inventory.counts.contexts}`,
    `- Domain modules: ${inventory.counts.modules}`,
    `- Agent definition files: ${inventory.counts.agentDefinitionFiles}`,
    `- Pipeline runtime entries: ${inventory.counts.pipelineRuntimeEntries}`,
    `- Frontend tests: ${inventory.counts.frontendTests}`,
    `- Python tests: ${inventory.counts.pythonTests}`,
    `- Backend package roots: ${inventory.counts.backendPackageRoots}`,
    `- Backend Python source files: ${inventory.counts.backendPythonSourceFiles}`,
    `- Workflows: ${inventory.counts.workflows}`,
    `- Scripts: ${inventory.counts.scripts}`,
    '',
    '## Route Inventory',
    routeLines || '- none',
    '',
    '## Page Buckets',
    ...Object.entries(inventory.frontend.pages.byBucket).map(([bucket, count]) => `- ${bucket}: ${count}`),
    '',
    '## Component Buckets',
    ...Object.entries(inventory.frontend.components.byKind).map(([bucket, count]) => `- ${bucket}: ${count}`),
    '',
    topLines('Domain Modules', inventory.frontend.modules),
    topLines('Agent Definition Files', inventory.frontend.agentDefinitions),
    topLines('Pipeline Runtime Entries', inventory.frontend.pipelineRuntime.map(item => `${item.path} | ${item.exists ? 'present' : 'missing'}`)),
    topLines('Workflows', inventory.platform.workflows),
    topLines('Scripts', inventory.platform.scripts),
    topLines('Backend Package Roots', inventory.platform.backendPackageRoots),
    topLines('Canonical Docs', inventory.platform.canonicalDocs.map(item => `${item.path} | ${item.exists ? 'present' : 'missing'}`)),
    '## Validation Commands',
    ...Object.entries(inventory.validationCommands.frontendScripts || {}).map(([name, command]) => `- frontend:${name} => ${command}`),
    ...Object.entries(inventory.validationCommands.functionsScripts || {}).map(([name, command]) => `- functions:${name} => ${command}`),
    ...inventory.validationCommands.makeTargets.filter(target => target !== '.PHONY').map(target => `- make:${target}`),
    '',
  ].join('\n')
}

function inferTestSignal(targetStem, testFiles) {
  if (!targetStem) return 'manual only'
  const matches = findMatchingTestFiles(targetStem, testFiles)
  if (matches.length === 0) return 'no direct match'
  return matches.map(match => path.posix.basename(match)).join(', ')
}

function findMatchingTestFiles(targetStem, testFiles) {
  if (!targetStem) return []
  const normalizedStem = targetStem.replace(/\.[^.]+$/, '')
  const basename = path.posix.basename(normalizedStem)
  return testFiles.filter(testFile => {
    const normalizedTest = testFile.replace(/\.(test|spec)\.[tj]sx?$/, '')
    return normalizedTest === normalizedStem
      || normalizedTest.endsWith(`/${basename}`)
      || normalizedTest.startsWith(`${normalizedStem}.`)
      || normalizedTest.startsWith(`${normalizedStem}/`)
  })
}

const faultInjectionEvidencePattern = /fallback|retry|timeout|abort|AbortError|429|unavailable|degrad|continue_without_agent|graceful|permission-denied|cancel/i

function inferFaultInjectionSignal(targetStem, testFiles, testSources = {}) {
  if (!targetStem) return 'manual only'
  const matches = findMatchingTestFiles(targetStem, testFiles)
  if (matches.length === 0) return 'no mapped resilience tests'
  const resilienceMatches = matches.filter(testFile => faultInjectionEvidencePattern.test(testSources[testFile] || ''))
  if (resilienceMatches.length === 0) return 'no resilience signal'
  return resilienceMatches.map(match => path.posix.basename(match)).join(', ')
}

function collectPathLiterals(source) {
  return [...new Set([...source.matchAll(/["'`](\/[A-Za-z0-9_./?&=#:-]*)["'`]/g)].map(match => match[1]))]
}

function stripPathDecorations(value) {
  return value.split('?')[0].split('#')[0]
}

function matchesConcreteRoutePath(routePath, literalPath) {
  if (!routePath || routePath === '*') return false

  const normalizedLiteral = stripPathDecorations(literalPath)
  if (routePath === '/') return normalizedLiteral === '/'

  const routeSegments = routePath.split('/').filter(Boolean)
  const literalSegments = normalizedLiteral.split('/').filter(Boolean)
  if (routeSegments.length !== literalSegments.length) return false
  return routeSegments.every((segment, index) => segment.startsWith(':') || segment === literalSegments[index])
}

function hasExplicitRoutePathEvidence(source, routePath, knownRoutePaths = []) {
  if (!source || !routePath) return false

  const pathLiterals = collectPathLiterals(source)
  if (routePath === '*') {
    return source.includes('not-found-page') && pathLiterals.some(literal => (
      !knownRoutePaths.some(knownRoutePath => knownRoutePath !== '*' && matchesConcreteRoutePath(knownRoutePath, literal))
    ))
  }

  return pathLiterals.some(literal => matchesConcreteRoutePath(routePath, literal))
}

function inferRouteTestSignal(route, testFiles, testSources, knownRoutePaths) {
  const importStem = route.importPath
    ? `frontend/src/${route.importPath.replace(/^\.\//, '')}`
    : route.component === 'DefaultNewDocumentPage'
      ? 'frontend/src/pages/NewDocumentV3'
      : null
  const directTestSignal = inferTestSignal(importStem, testFiles)
  if (!isGapSignal(directTestSignal)) return directTestSignal

  const explicitMatches = testFiles.filter(testFile => hasExplicitRoutePathEvidence(testSources?.[testFile] || '', route.path, knownRoutePaths))
  if (explicitMatches.length === 0) return directTestSignal
  return explicitMatches.map(match => path.posix.basename(match)).join(', ')
}

function isGapSignal(signal) {
  return signal === 'no direct match' || signal === 'manual only'
}

function buildGapSet(items) {
  return new Set((items || []).map(item => item.path).filter(Boolean))
}

function formatRiskCounts(rows) {
  const openRows = rows.filter(item => !item.status.startsWith('covered'))
  return countBy(openRows, item => item.risk)
}

function formatCountLines(counts, prefix) {
  const entries = Object.entries(counts || {})
  if (!entries.length) return [`- ${prefix}: none`]
  return entries.map(([risk, count]) => `- ${prefix} ${risk}: ${count}`)
}

function classifyRouteRisk(route, directTestSignal) {
  if (!isGapSignal(directTestSignal)) return 'covered'
  if (route.path === '/documents/new-v3') return 'low'
  if (route.access === 'admin') return 'high'
  if (['/chat', '/documents/:id', '/documents/:id/edit', '/upload', '/theses', '/settings', '/settings/costs', '/profile'].includes(route.path)) return 'high'
  return 'medium'
}

function classifyRouteStatus(route, risk, directTestSignal) {
  if (!isGapSignal(directTestSignal)) return 'covered-by-test'
  if (route.path === '/documents/new-v3') return 'manual-review'
  return risk === 'high' ? 'priority-review' : 'review-queued'
}

function buildRouteNotes(route, directTestSignal) {
  const notes = []
  if (route.component === 'Navigate') notes.push('technical alias or redirect surface')
  if (route.component === 'DefaultNewDocumentPage') notes.push('indirect runtime selector between legacy and V3 rails')
  if (isGapSignal(directTestSignal) && route.access === 'admin') notes.push('admin surface without direct route-level test')
  if (isGapSignal(directTestSignal) && route.path === '/chat') notes.push('chat orchestration route remains uncovered')
  return notes.join('; ') || '—'
}

function classifyUiRisk(item, directTestSignal) {
  if (!isGapSignal(directTestSignal)) return 'covered'
  if (item.kind === 'progress') return 'high'
  if (/AgentTrail|PipelineProgress|DeepResearchModal|SearchResultsModal|ModelSelectorModal|ArtifactViewerModal|Sidebar|V2WorkspaceLayout|Layout|ErrorBoundary|RichTextEditor|NotificationBell|\/chat\//.test(item.path)) return 'high'
  if (item.kind === 'modal' || item.kind === 'artifact-viewer') return 'medium'
  return /ConfigCard|ProviderCatalog|ThemeSkinSelector|StatusBadge|TaskBar/.test(item.path) ? 'medium' : 'low'
}

function classifyUiStatus(risk, directTestSignal) {
  if (!isGapSignal(directTestSignal)) return 'covered-by-test'
  return risk === 'high' ? 'priority-review' : risk === 'medium' ? 'review-queued' : 'backlog'
}

function classifyPipelineRisk(item, directTestSignal) {
  if (!isGapSignal(directTestSignal)) return 'covered'
  if (/generation-service|chat-orchestrator/.test(item.path)) return 'high'
  return 'medium'
}

function classifyPipelineStatus(risk, directTestSignal) {
  if (!isGapSignal(directTestSignal)) return 'covered-by-test'
  return risk === 'high' ? 'priority-review' : 'review-queued'
}

function isFaultInjectionGapSignal(signal) {
  return signal === 'manual only' || signal === 'no mapped resilience tests' || signal === 'no resilience signal'
}

function classifyPipelineFaultRisk(item, faultInjectionSignal) {
  if (!isFaultInjectionGapSignal(faultInjectionSignal)) return 'covered'
  if (/generation-service|document-v3-orchestrator|video-generation-pipeline|audio-generation-pipeline|notebook-audio-pipeline|chat-orchestrator/.test(item.path)) return 'high'
  return 'medium'
}

function classifyAgentRisk(registrySignal) {
  return registrySignal === 'agent-config-coverage.test.ts' ? 'shared-coverage' : 'medium'
}

function classifyAgentStatus(registrySignal) {
  return registrySignal === 'agent-config-coverage.test.ts' ? 'registry-covered' : 'review-queued'
}

function classifyOpsRisk(item) {
  if (item.type === 'canonical-doc') return item.verified === '[x]' ? 'baseline-present' : 'high'
  return 'inventory-captured'
}

function classifyOpsStatus(item) {
  if (item.type === 'canonical-doc') return item.verified === '[x]' ? 'baseline-ready' : 'missing'
  return 'inventory-ready'
}

function inferBackendPackageTestSignal(packageRoot, pythonTestFiles) {
  if (!packageRoot) return 'manual only'

  let mappedPrefix = null
  if (packageRoot.endsWith('/api')) mappedPrefix = 'tests/api/'
  else if (packageRoot.endsWith('/core')) mappedPrefix = 'tests/core/'
  else if (packageRoot.endsWith('/modules') || packageRoot.endsWith('/pipeline')) mappedPrefix = 'tests/unit/'

  if (!mappedPrefix) return 'manual only'
  const matches = pythonTestFiles.filter(testFile => testFile.startsWith(mappedPrefix))
  if (matches.length === 0) return 'no mapped python tests'
  return matches.map(matchPath => path.posix.basename(matchPath)).join(', ')
}

function classifyBackendRisk(item, testSignal) {
  if (!isGapSignal(testSignal)) return 'covered'
  if (item.type === 'cloud-function') return 'high'
  if (item.surface.endsWith('/api') || item.surface.endsWith('/core')) return 'high'
  return 'medium'
}

function classifyBackendStatus(risk, testSignal) {
  if (!isGapSignal(testSignal)) return 'covered-by-tests-or-build'
  return risk === 'high' ? 'priority-review' : 'review-queued'
}

function buildAuditMatrix(inventory, riskScan = null) {
  const frontendTests = inventory.frontend.tests
  const frontendTestSources = inventory.frontend.testSources || {}
  const pythonTests = inventory.platform.pythonTests || []
  const knownRoutePaths = inventory.frontend.routes.routes.map(route => route.path)
  const routeGapSet = buildGapSet(riskScan?.coverage?.routeCoverageGaps)
  const uiGapSet = buildGapSet(riskScan?.coverage?.uiCoverageGaps)
  const pipelineGapSet = buildGapSet(riskScan?.coverage?.pipelineCoverageGaps)
  const routeRowsData = inventory.frontend.routes.routes.map(route => {
    const directTestSignal = inferRouteTestSignal(route, frontendTests, frontendTestSources, knownRoutePaths)
    const isGap = routeGapSet.size ? routeGapSet.has(route.path) : isGapSignal(directTestSignal)
    const effectiveSignal = isGap ? directTestSignal : directTestSignal
    const risk = classifyRouteRisk(route, effectiveSignal)
    return {
      surface: route.path,
      access: route.access,
      component: route.component || 'unknown',
      directTestSignal: effectiveSignal,
      manualSmoke: '[ ]',
      risk,
      notes: buildRouteNotes(route, effectiveSignal),
      status: classifyRouteStatus(route, risk, effectiveSignal),
    }
  })
  const routeRows = routeRowsData
    .map(item => `| ${item.surface} | ${item.access} | ${item.component} | ${item.directTestSignal} | ${item.manualSmoke} | ${item.risk} | ${item.notes} | ${item.status} |`)
    .join('\n')

  const uiSurfaceRowsData = inventory.frontend.components.items.map(item => {
    const directTestSignal = inferTestSignal(item.path, frontendTests)
    const isGap = uiGapSet.size ? uiGapSet.has(item.path) : isGapSignal(directTestSignal)
    const effectiveSignal = isGap ? directTestSignal : directTestSignal
    const risk = classifyUiRisk(item, effectiveSignal)
    return {
      surface: item.path,
      kind: item.kind,
      directTestSignal: effectiveSignal,
      manualSmoke: '[ ]',
      risk,
      status: classifyUiStatus(risk, effectiveSignal),
    }
  })
  const uiSurfaceRows = uiSurfaceRowsData
    .map(item => `| ${item.surface} | ${item.kind} | ${item.directTestSignal} | ${item.manualSmoke} | ${item.risk} | ${item.status} |`)
    .join('\n')

  const pipelineRowsData = inventory.frontend.pipelineRuntime.map(item => {
    const directTestSignal = item.exists ? inferTestSignal(item.path, frontendTests) : 'missing surface'
    const faultInjectionSignal = item.exists
      ? inferFaultInjectionSignal(item.path, frontendTests, frontendTestSources)
      : 'missing surface'
    const isGap = pipelineGapSet.size ? pipelineGapSet.has(item.path) : item.directTestSignal !== 'missing surface' && isGapSignal(directTestSignal)
    const effectiveSignal = isGap ? directTestSignal : directTestSignal
    const risk = classifyPipelineRisk(item, effectiveSignal)
    const faultRisk = classifyPipelineFaultRisk(item, faultInjectionSignal)
    return {
      surface: item.path,
      kind: item.kind,
      directTestSignal: effectiveSignal,
      faultInjection: faultInjectionSignal,
      risk,
      faultRisk,
      status: classifyPipelineStatus(risk, effectiveSignal),
    }
  })
  const pipelineRows = pipelineRowsData
    .map(item => `| ${item.surface} | ${item.kind} | ${item.directTestSignal} | ${item.faultInjection} | ${item.risk} | ${item.status} |`)
    .join('\n')

  const agentCoverageSignal = frontendTests.includes('frontend/src/lib/agent-config-coverage.test.ts')
    ? 'agent-config-coverage.test.ts'
    : 'no shared registry coverage found'
  const agentRowsData = inventory.frontend.agentDefinitions
    .filter(item => !item.endsWith('/index.ts'))
    .map(item => ({
      surface: item,
      registrySignal: agentCoverageSignal,
      configValidation: '[ ]',
      risk: classifyAgentRisk(agentCoverageSignal),
      status: classifyAgentStatus(agentCoverageSignal),
    }))
  const agentRows = agentRowsData
    .map(item => `| ${item.surface} | ${item.registrySignal} | ${item.configValidation} | ${item.risk} | ${item.status} |`)
    .join('\n')

  const opsRowsData = [
    ...inventory.platform.workflows.map(item => ({ surface: item, type: 'workflow', verified: '[ ]', notes: 'inventory captured at baseline' })),
    ...inventory.platform.scripts.map(item => ({ surface: item, type: 'script', verified: '[ ]', notes: 'inventory captured at baseline' })),
    ...inventory.platform.canonicalDocs.map(item => ({ surface: item.path, type: 'canonical-doc', verified: item.exists ? '[x]' : '[ ]', notes: item.exists ? 'present at baseline' : 'missing at baseline' })),
  ].map(item => ({
    ...item,
    risk: classifyOpsRisk(item),
    status: classifyOpsStatus(item),
  }))
  const opsRows = opsRowsData
    .map(item => `| ${item.surface} | ${item.type} | ${item.verified} | ${item.notes} | ${item.status} |`)
    .join('\n')

  const backendRowsData = inventory.platform.backendPackageRoots.map(item => {
    const sourceCount = inventory.platform.backendPythonSourceFiles.filter(file => file.startsWith(`${item}/`)).length
    const testSignal = inferBackendPackageTestSignal(item, pythonTests)
    const validationCommand = item.endsWith('/api') ? 'pytest tests/api/ or make:test-api'
      : item.endsWith('/core') ? 'pytest tests/core/'
        : 'pytest tests/unit/ or make:test-unit'
    const risk = classifyBackendRisk({ surface: item, type: 'backend-package' }, testSignal)
    return {
      surface: item,
      sourceCount,
      testSignal,
      validationCommand,
      risk,
      status: classifyBackendStatus(risk, testSignal),
    }
  })
  const backendRows = backendRowsData
    .map(item => `| ${item.surface} | ${item.sourceCount} | ${item.testSignal} | ${item.validationCommand} | ${item.risk} | ${item.status} |`)
    .join('\n')

  const functionRowsData = inventory.platform.functionSourceFiles.map(item => {
    const buildSignal = inventory.validationCommands.functionsScripts?.build ? 'functions:build' : 'no build script'
    const risk = classifyBackendRisk({ surface: item, type: 'cloud-function' }, buildSignal)
    return {
      surface: item,
      buildSignal,
      manualSmoke: '[ ]',
      risk,
      status: classifyBackendStatus(risk, buildSignal),
    }
  })
  const functionRows = functionRowsData
    .map(item => `| ${item.surface} | ${item.buildSignal} | ${item.manualSmoke} | ${item.risk} | ${item.status} |`)
    .join('\n')

  const routeRiskCounts = formatRiskCounts(routeRowsData)
  const uiRiskCounts = formatRiskCounts(uiSurfaceRowsData)
  const pipelineRiskCounts = formatRiskCounts(pipelineRowsData)
  const pipelineFaultRiskCounts = countBy(
    pipelineRowsData.filter(item => isFaultInjectionGapSignal(item.faultInjection)),
    item => item.faultRisk,
  )
  const backendRiskCounts = formatRiskCounts(backendRowsData)
  const functionRiskCounts = formatRiskCounts(functionRowsData)
  const routeGapCount = routeRowsData.filter(item => item.status !== 'covered-by-test').length
  const uiGapCount = uiSurfaceRowsData.filter(item => item.status !== 'covered-by-test').length
  const pipelineGapCount = pipelineRowsData.filter(item => item.status !== 'covered-by-test').length
  const pipelineFaultGapCount = pipelineRowsData.filter(item => isFaultInjectionGapSignal(item.faultInjection)).length
  const backendGapCount = backendRowsData.filter(item => item.status !== 'covered-by-tests-or-build').length
  const functionGapCount = functionRowsData.filter(item => item.status !== 'covered-by-tests-or-build').length

  return [
    '# Platform Audit Matrix',
    '',
    `Generated: ${inventory.generatedAt}`,
    `Git branch: ${inventory.git.branch || 'unknown'}`,
    `Git head: ${inventory.git.head || 'unknown'}`,
    '',
    'Use this file as the execution matrix for the whole-platform sweep. Replace placeholders with evidence, risks, and pass/fail status as the audit progresses.',
    '',
    '## Prioritization Snapshot',
    `- Route gaps open: ${routeGapCount}`,
    `- UI gaps open: ${uiGapCount}`,
    `- Pipeline gaps open: ${pipelineGapCount}`,
    `- Pipeline fault-injection gaps open: ${pipelineFaultGapCount}`,
    `- Backend package slices pending: ${backendGapCount}`,
    `- Cloud function slices pending: ${functionGapCount}`,
    ...formatCountLines(routeRiskCounts, 'Route gap risk'),
    ...formatCountLines(uiRiskCounts, 'UI gap risk'),
    ...formatCountLines(pipelineRiskCounts, 'Pipeline gap risk'),
    ...formatCountLines(pipelineFaultRiskCounts, 'Pipeline fault risk'),
    ...formatCountLines(backendRiskCounts, 'Backend slice risk'),
    ...formatCountLines(functionRiskCounts, 'Cloud function slice risk'),
    `- Unexpected Firestore collections: ${riskScan?.firestore?.unknownCollections?.length ?? 0}`,
    `- Missing runtime collectionGroup rules: ${riskScan?.firestore?.rulesCoverage?.missingRuntimeCollectionGroupRules?.length ?? 0}`,
    `- Missing collectionGroup indexes: ${riskScan?.firestore?.indexCoverage?.missingCollectionGroupIndexes?.length ?? 0}`,
    `- Missing Firestore deploy databases: ${riskScan?.firestore?.deployConfig?.missingFirestoreDeployDatabases?.length ?? 0}`,
    `- Unexpected frontend OpenRouter occurrences: ${riskScan?.externalCalls?.unexpectedFrontendOpenRouterOccurrences?.length ?? 0}`,
    `- Unexpected non-frontend OpenRouter occurrences: ${riskScan?.externalCalls?.unexpectedNonFrontendOpenRouterOccurrences?.length ?? 0}`,
    `- Unexpected auth observer files: ${riskScan?.auth?.unexpectedAuthObserverUsages?.length ?? 0}`,
    `- Unexpected admin email consumers: ${riskScan?.auth?.unexpectedAdminEmailUsages?.length ?? 0}`,
    `- Unexpected direct admin role checks: ${riskScan?.auth?.unexpectedAdminRoleCheckUsages?.length ?? 0}`,
    `- Unexpected Firestore operation files: ${riskScan?.auth?.unexpectedFirestoreOperationFiles?.length ?? 0}`,
    `- Unexpected unguarded Firestore operation files: ${riskScan?.auth?.unexpectedUnguardedFirestoreOperationFiles?.length ?? 0}`,
    `- Unexpected auth recovery opt-outs: ${riskScan?.auth?.unexpectedAuthRecoveryOptOutUsages?.length ?? 0}`,
    `- Unexpected Firestore bootstrap files: ${riskScan?.auth?.unexpectedFirestoreBootstrapUsages?.length ?? 0}`,
    `- Unexpected Firestore database env consumers: ${riskScan?.auth?.unexpectedFirestoreDatabaseEnvUsages?.length ?? 0}`,
    `- Unexpected session storage files: ${riskScan?.auth?.unexpectedSessionStorageFiles?.length ?? 0}`,
    `- Unexpected session storage writers: ${riskScan?.auth?.unexpectedSessionStorageWrites?.length ?? 0}`,
    `- Sensitive config defaults: ${riskScan?.security?.sensitiveConfigDefaults?.length ?? 0}`,
    '',
    '## Route Coverage Matrix',
    '| Surface | Access | Component | Direct Test Signal | Manual Smoke | Risk | Notes | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    routeRows || '| none | — | — | — | — | — | — | — |',
    '',
    '## UI Surface Matrix',
    '| Surface | Kind | Direct Test Signal | Manual Smoke | Risk | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    uiSurfaceRows || '| none | — | — | — | — | — |',
    '',
    '## Pipeline Runtime Matrix',
    '| Surface | Kind | Direct Test Signal | Fault Injection | Risk | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    pipelineRows || '| none | — | — | — | — | — |',
    '',
    '## Agent Registry Matrix',
    '| Surface | Registry/Test Signal | Config Validation | Risk | Status |',
    '| --- | --- | --- | --- | --- |',
    agentRows || '| none | — | — | — | — |',
    '',
    '## Operations and Documentation Matrix',
    '| Surface | Type | Verified at Baseline | Notes | Status |',
    '| --- | --- | --- | --- | --- |',
    opsRows || '| none | — | — | — | — |',
    '',
    '## Secondary Backend Matrix',
    '| Surface | Python Source Files | Mapped Test Signal | Validation Command | Risk | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    backendRows || '| none | — | — | — | — | — |',
    '',
    '## Cloud Function Matrix',
    '| Surface | Build Signal | Manual Smoke | Risk | Status |',
    '| --- | --- | --- | --- | --- |',
    functionRows || '| none | — | — | — | — |',
    '',
  ].join('\n')
}

async function writeOutput(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv)
  const inventory = await buildInventory()
  const riskScan = await readOptionalJson(args.riskScanPath)
  await writeOutput(args.jsonOutput, JSON.stringify(inventory, null, 2))
  await writeOutput(args.markdownOutput, buildMarkdownReport(inventory))
  await writeOutput(args.matrixOutput, buildAuditMatrix(inventory, riskScan))

  console.log(`[lexio-platform-audit-baseline] JSON: ${toPosixRelative(args.jsonOutput)}`)
  console.log(`[lexio-platform-audit-baseline] Markdown: ${toPosixRelative(args.markdownOutput)}`)
  console.log(`[lexio-platform-audit-baseline] Matrix: ${toPosixRelative(args.matrixOutput)}`)
  console.log(`[lexio-platform-audit-baseline] Routes=${inventory.counts.routes} Pages=${inventory.counts.pages} Components=${inventory.counts.components} FrontendTests=${inventory.counts.frontendTests} PythonTests=${inventory.counts.pythonTests}`)
}

main().catch((error) => {
  console.error('[lexio-platform-audit-baseline] Failed:', error)
  process.exit(1)
})