import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_LEXIO_TARGET_DATABASE_ID,
  LEXIO_COLLECTION_GROUPS,
  LEXIO_NESTED_USER_SUBCOLLECTIONS,
  LEXIO_ROOT_DOCUMENTS,
  LEXIO_USER_SUBCOLLECTIONS,
} from './lexio-firestore-paths.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

const defaultBaselinePath = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_BASELINE.json')
const defaultJsonOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RISK_SCAN.json')
const defaultMarkdownOutput = path.join(repoRoot, 'docs', 'release', 'PLATFORM_AUDIT_RISK_SCAN.md')

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'])
const ignoredDirectoryNames = new Set(['node_modules', 'dist', 'dist-redesign-v2', 'coverage', '.git', 'backups', 'output', 'uploads'])
const openRouterUrlPattern = /https:\/\/openrouter\.ai\/api\//
const frontendOpenRouterAllowedFiles = new Set([
  'frontend/src/lib/llm-client.ts',
  'frontend/src/lib/image-generation-client.ts',
  'frontend/src/lib/tts-client.ts',
  'frontend/src/lib/model-catalog.ts',
  'frontend/src/lib/providers.ts',
  'frontend/src/lib/datajud-service.ts',
])
const legacyBackendOpenRouterFiles = new Set([
  'packages/core/config.py',
])
const authObserverAllowedFiles = new Set([
  'frontend/src/contexts/AuthContext.tsx',
  'frontend/src/lib/firestore-service.ts',
  'frontend/src/lib/platform-analytics.ts',
])
const adminEmailAllowedFiles = new Set([
  'frontend/src/contexts/AuthContext.tsx',
  'frontend/src/lib/auth-service.ts',
])
const adminRoleCheckAllowedFiles = new Set([
  'frontend/src/contexts/AuthContext.tsx',
  'frontend/src/components/Sidebar.tsx',
  'frontend/src/components/v2/V2WorkspaceLayout.tsx',
  'frontend/src/pages/DocumentDetail.tsx',
  'frontend/src/lib/platform-analytics.ts',
])
const firestoreOperationAllowedFiles = new Set([
  'frontend/src/contexts/AuthContext.tsx',
  'frontend/src/lib/auth-service.ts',
  'frontend/src/lib/document-v3-orchestrator.ts',
  'frontend/src/lib/firestore-service.ts',
  'frontend/src/lib/generation-service.ts',
  'frontend/src/lib/platform-analytics.ts',
  'frontend/src/lib/modules/acervo/repository.ts',
  'frontend/src/lib/modules/chat/repository.ts',
  'frontend/src/lib/modules/documents/repository.ts',
  'frontend/src/lib/modules/notebook/repository.ts',
  'frontend/src/lib/modules/profile/repository.ts',
  'frontend/src/lib/modules/settings/repository.ts',
  'frontend/src/lib/modules/theses/repository.ts',
])
const firestoreWrapperGuardrailFiles = new Set([
  'frontend/src/lib/document-v3-orchestrator.ts',
  'frontend/src/lib/generation-service.ts',
  'frontend/src/lib/platform-analytics.ts',
  'frontend/src/lib/modules/acervo/repository.ts',
  'frontend/src/lib/modules/chat/repository.ts',
  'frontend/src/lib/modules/documents/repository.ts',
  'frontend/src/lib/modules/notebook/repository.ts',
  'frontend/src/lib/modules/profile/repository.ts',
  'frontend/src/lib/modules/settings/repository.ts',
  'frontend/src/lib/modules/theses/repository.ts',
])
const authRecoveryOptOutAllowedFiles = new Set([
  'frontend/src/lib/modules/settings/repository.ts',
])
const firestoreBootstrapAllowedFiles = new Set([
  'frontend/src/lib/firebase.ts',
])
const sessionStorageAllowedFiles = new Set([
  'frontend/src/api/client.ts',
  'frontend/src/contexts/AuthContext.tsx',
  'frontend/src/lib/auth-session-events.ts',
  'frontend/src/lib/firestore-service.ts',
  'frontend/src/lib/platform-analytics.ts',
])
const sessionStorageWriteAllowedFiles = new Set([
  'frontend/src/api/client.ts',
  'frontend/src/contexts/AuthContext.tsx',
])
const firebaseStorageImportPattern = /from\s+['"]firebase\/storage['"]/
const expectedStorageFiles = new Set([
  'frontend/src/lib/firebase.ts',
  'frontend/src/lib/notebook-media-storage.ts',
])
const sessionStorageKeys = ['lexio_token', 'lexio_user_id', 'lexio_role', 'lexio_full_name']

function parseArgs(argv) {
  const result = {
    baselinePath: defaultBaselinePath,
    jsonOutput: defaultJsonOutput,
    markdownOutput: defaultMarkdownOutput,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--baseline') result.baselinePath = path.resolve(argv[++index])
    else if (value === '--json-output') result.jsonOutput = path.resolve(argv[++index])
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

function toPosixRelative(targetPath) {
  return path.relative(repoRoot, targetPath).split(path.sep).join('/')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function listSourceFiles(directory) {
  if (!(await pathExists(directory))) return []
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') || ignoredDirectoryNames.has(entry.name)) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(fullPath))
      continue
    }
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) files.push(fullPath)
  }

  return files.sort((left, right) => toPosixRelative(left).localeCompare(toPosixRelative(right)))
}

function findMatchingDelimiter(source, openIndex, openChar, closeChar) {
  let depth = 0
  let quote = null
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    const previous = source[index - 1]
    if (quote) {
      if (char === quote && previous !== '\\') quote = null
      continue
    }
    if ((char === '"' || char === "'" || char === '`') && previous !== '\\') {
      quote = char
      continue
    }
    if (char === openChar) depth += 1
    if (char === closeChar) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function findMatchingParen(source, openIndex) {
  return findMatchingDelimiter(source, openIndex, '(', ')')
}

function findMatchingBrace(source, openIndex) {
  return findMatchingDelimiter(source, openIndex, '{', '}')
}

function splitTopLevelArgs(source) {
  const args = []
  let current = ''
  let quote = null
  let depth = 0
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const previous = source[index - 1]
    if (quote) {
      current += char
      if (char === quote && previous !== '\\') quote = null
      continue
    }
    if ((char === '"' || char === "'" || char === '`') && previous !== '\\') {
      quote = char
      current += char
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function splitTopLevelArgsWithRanges(source) {
  const args = []
  let quote = null
  let depth = 0
  let segmentStart = 0

  const pushArg = (start, end) => {
    let actualStart = start
    let actualEnd = end
    while (actualStart < actualEnd && /\s/.test(source[actualStart])) actualStart += 1
    while (actualEnd > actualStart && /\s/.test(source[actualEnd - 1])) actualEnd -= 1
    if (actualEnd <= actualStart) return
    args.push({
      text: source.slice(actualStart, actualEnd),
      start: actualStart,
      end: actualEnd,
    })
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const previous = source[index - 1]
    if (quote) {
      if (char === quote && previous !== '\\') quote = null
      continue
    }
    if ((char === '"' || char === "'" || char === '`') && previous !== '\\') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      pushArg(segmentStart, index)
      segmentStart = index + 1
    }
  }

  pushArg(segmentStart, source.length)
  return args
}

function findTopLevelArrowIndex(source) {
  let quote = null
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0

  for (let index = 0; index < source.length - 1; index += 1) {
    const char = source[index]
    const previous = source[index - 1]
    if (quote) {
      if (char === quote && previous !== '\\') quote = null
      continue
    }
    if ((char === '"' || char === "'" || char === '`') && previous !== '\\') {
      quote = char
      continue
    }
    if (char === '(') parenDepth += 1
    if (char === ')') parenDepth -= 1
    if (char === '[') bracketDepth += 1
    if (char === ']') bracketDepth -= 1
    if (char === '{') braceDepth += 1
    if (char === '}') braceDepth -= 1
    if (char === '=' && source[index + 1] === '>' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      return index
    }
  }

  return -1
}

function extractCallbackBodyRange(source, absoluteArgStart, argText) {
  const arrowIndex = findTopLevelArrowIndex(argText)
  if (arrowIndex !== -1) {
    let bodyOffset = arrowIndex + 2
    while (bodyOffset < argText.length && /\s/.test(argText[bodyOffset])) bodyOffset += 1
    if (bodyOffset >= argText.length) return null
    const absoluteBodyStart = absoluteArgStart + bodyOffset
    if (argText[bodyOffset] === '{') {
      const absoluteBodyEnd = findMatchingBrace(source, absoluteBodyStart)
      if (absoluteBodyEnd === -1) return null
      return { start: absoluteBodyStart, end: absoluteBodyEnd + 1 }
    }
    return { start: absoluteBodyStart, end: absoluteArgStart + argText.length }
  }

  const functionBodyOffset = argText.indexOf('{')
  if (functionBodyOffset === -1) return null
  const absoluteBodyStart = absoluteArgStart + functionBodyOffset
  const absoluteBodyEnd = findMatchingBrace(source, absoluteBodyStart)
  if (absoluteBodyEnd === -1) return null
  return { start: absoluteBodyStart, end: absoluteBodyEnd + 1 }
}

function collectFirestoreGuardedRanges(source) {
  const wrappers = [
    { name: 'writeUserScoped', callbackArgIndex: 2 },
    { name: 'withFirestoreRetry', callbackArgIndex: 0 },
    { name: 'withPlatformFirestoreRetry', callbackArgIndex: 0 },
  ]
  const ranges = []

  for (const wrapper of wrappers) {
    const pattern = new RegExp(`\\b${wrapper.name}\\s*\\(`, 'g')
    let match = pattern.exec(source)
    while (match) {
      const openParenIndex = source.indexOf('(', match.index)
      const closeParenIndex = findMatchingParen(source, openParenIndex)
      if (closeParenIndex !== -1) {
        const argRanges = splitTopLevelArgsWithRanges(source.slice(openParenIndex + 1, closeParenIndex))
        const callbackArg = argRanges[wrapper.callbackArgIndex]
        if (callbackArg) {
          const callbackRange = extractCallbackBodyRange(source, openParenIndex + 1 + callbackArg.start, callbackArg.text)
          if (callbackRange) ranges.push(callbackRange)
        }
      }
      match = pattern.exec(source)
    }
  }

  return ranges
}

function isInsideAnyRange(index, ranges) {
  return ranges.some(range => index >= range.start && index < range.end)
}

function unquote(token) {
  if (!token) return null
  const trimmed = token.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return null
}

function scanFirestoreCalls(source, relativePath) {
  const callPattern = /\b(doc|collection|collectionGroup)\s*\(/g
  const results = []
  let match = callPattern.exec(source)
  while (match) {
    const functionName = match[1]
    const openParenIndex = source.indexOf('(', match.index)
    const closeParenIndex = findMatchingParen(source, openParenIndex)
    if (closeParenIndex === -1) {
      match = callPattern.exec(source)
      continue
    }
    const argsSource = source.slice(openParenIndex + 1, closeParenIndex)
    const args = splitTopLevelArgs(argsSource)
    const literalTokens = args.map(unquote)
    const collectionNames = []

    if (functionName === 'collectionGroup') {
      const collectionName = literalTokens[1]
      if (collectionName) collectionNames.push(collectionName)
    } else {
      for (let index = 1; index < literalTokens.length; index += 2) {
        const collectionName = literalTokens[index]
        if (collectionName) collectionNames.push(collectionName)
      }
    }

    if (collectionNames.length > 0) {
      results.push({ file: relativePath, functionName, collectionNames })
    }
    match = callPattern.exec(source)
  }
  return results
}

function inferTestSignal(targetStem, testFiles) {
  if (!targetStem) return 'manual only'
  const normalizedStem = targetStem.replace(/\.[^.]+$/, '')
  const basename = path.posix.basename(normalizedStem)
  const matches = testFiles.filter(testFile => {
    const normalizedTest = testFile.replace(/\.(test|spec)\.[tj]sx?$/, '')
    return normalizedTest === normalizedStem
      || normalizedTest.endsWith(`/${basename}`)
      || normalizedTest.startsWith(`${normalizedStem}.`)
      || normalizedTest.startsWith(`${normalizedStem}/`)
  })
  if (matches.length === 0) return 'no direct match'
  return matches.map(matchPath => path.posix.basename(matchPath)).join(', ')
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

function runArchitectureGuardrail() {
  const scriptPath = path.join(repoRoot, 'scripts', 'lexio-architecture-guardrails.mjs')
  try {
    const output = execFileSync('node', [scriptPath], { cwd: repoRoot, encoding: 'utf8' }).trim()
    return { ok: true, output }
  } catch (error) {
    return {
      ok: false,
      output: String(error.stdout || error.stderr || error.message || '').trim(),
    }
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

function uniq(items) {
  return [...new Set(items.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseFirestoreRulePaths(source) {
  const rulePaths = []
  const matchStack = []

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('match /')) continue

    const withoutMatch = trimmed.replace(/^match\s+/, '')
    const blockOpenIndex = withoutMatch.lastIndexOf('{')
    if (blockOpenIndex === -1) continue

    const rawPath = withoutMatch.slice(0, blockOpenIndex).trim()
    const indent = line.length - line.trimStart().length
    while (matchStack.length > 0 && matchStack[matchStack.length - 1].indent >= indent) {
      matchStack.pop()
    }

    const parentPath = matchStack[matchStack.length - 1]?.fullPath || ''
    const fullPath = normalizeFirestoreRulePath(`${parentPath}${rawPath}`)
    rulePaths.push(fullPath)
    matchStack.push({ indent, fullPath })
  }

  return rulePaths
}

function splitRulePath(rulePath) {
  return String(rulePath || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
}

function normalizeFirestoreRulePath(rulePath) {
  const normalized = `/${String(rulePath || '').replace(/^\/+/, '')}`.replace(/\/+/g, '/')
  return normalized.replace(/^\/databases\/\{[^/]+\}\/documents(?=\/|$)/, '') || '/'
}

function getDirectUserSubcollectionRuleName(rulePath) {
  const segments = splitRulePath(rulePath)
  if (segments[0] !== 'users' || !segments[1]?.startsWith('{')) return null
  const candidate = segments[2]
  return candidate && !candidate.startsWith('{') ? candidate : null
}

function getNestedUserSubcollectionRuleNames(rulePath) {
  const segments = splitRulePath(rulePath)
  if (segments[0] !== 'users' || !segments[1]?.startsWith('{')) return []

  const collectionSegments = []
  for (let index = 2; index < segments.length; index += 1) {
    const segment = segments[index]
    if (!segment.startsWith('{')) collectionSegments.push(segment)
  }

  return collectionSegments.slice(1)
}

function getAdminCollectionGroupRuleName(rulePath) {
  const segments = splitRulePath(rulePath)
  if (!segments[0]?.startsWith('{path=')) return null
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (!segment.startsWith('{')) return segment
  }
  return null
}

function parseInvocationArgs(expression, functionName) {
  const trimmed = String(expression || '').trim()
  if (!trimmed.startsWith(`${functionName}(`)) return null
  const openParenIndex = trimmed.indexOf('(')
  const closeParenIndex = findMatchingParen(trimmed, openParenIndex)
  if (closeParenIndex === -1) return null
  return splitTopLevelArgs(trimmed.slice(openParenIndex + 1, closeParenIndex))
}

function resolveConstraintArray(source, variableName) {
  const pattern = new RegExp(`(?:const|let)\\s+${escapeRegExp(variableName)}(?:\\s*:[^=]+)?\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm')
  const match = source.match(pattern)
  if (!match) return null
  return splitTopLevelArgs(match[1])
}

function parseIndexedConstraint(arg) {
  const whereArgs = parseInvocationArgs(arg, 'where')
  if (whereArgs) {
    return {
      kind: 'where',
      field: unquote(whereArgs[0]),
      operator: unquote(whereArgs[1]) || '==',
    }
  }

  const orderByArgs = parseInvocationArgs(arg, 'orderBy')
  if (orderByArgs) {
    return {
      kind: 'orderBy',
      field: unquote(orderByArgs[0]),
      direction: unquote(orderByArgs[1]) || 'asc',
    }
  }

  if (/^(limit|startAfter|startAt|endAt|endBefore)\s*\(/.test(String(arg || '').trim())) {
    return { kind: 'cursor', field: null }
  }

  return null
}

function parseCollectionGroupQueries(source, relativePath) {
  const queryPattern = /\bquery\s*\(/g
  const results = []
  let match = queryPattern.exec(source)

  while (match) {
    const openParenIndex = source.indexOf('(', match.index)
    const closeParenIndex = findMatchingParen(source, openParenIndex)
    if (closeParenIndex === -1) {
      match = queryPattern.exec(source)
      continue
    }

    const args = splitTopLevelArgs(source.slice(openParenIndex + 1, closeParenIndex))
    const collectionGroupArgs = parseInvocationArgs(args[0], 'collectionGroup')
    if (!collectionGroupArgs) {
      match = queryPattern.exec(source)
      continue
    }

    const collectionName = unquote(collectionGroupArgs[1])
    const indexedConstraints = []
    const unresolvedSignals = []

    for (const rawArg of args.slice(1)) {
      const trimmed = String(rawArg || '').trim()
      if (!trimmed) continue

      if (trimmed.startsWith('...')) {
        const variableName = trimmed.slice(3).trim()
        const resolvedArgs = resolveConstraintArray(source, variableName)
        if (!resolvedArgs) {
          unresolvedSignals.push(`spread:${variableName}`)
          continue
        }
        for (const resolvedArg of resolvedArgs) {
          const parsed = parseIndexedConstraint(resolvedArg)
          if (parsed?.field) indexedConstraints.push(parsed)
        }
        continue
      }

      const parsed = parseIndexedConstraint(trimmed)
      if (parsed?.field) indexedConstraints.push(parsed)
      else if (!/^(limit|startAfter|startAt|endAt|endBefore)\s*\(/.test(trimmed)) unresolvedSignals.push(`dynamic:${trimmed}`)
    }

    const indexedFields = uniq(indexedConstraints.map(item => item.field))
    results.push({
      file: relativePath,
      collectionName,
      indexedConstraints,
      indexedFields,
      unresolvedSignals,
      requiresCompositeIndex: indexedFields.length > 1,
    })

    match = queryPattern.exec(source)
  }

  return results
}

function normalizeIndexFieldNames(index) {
  return uniq((index?.fields || []).map(field => field?.fieldPath).filter(field => field && field !== '__name__'))
}

function hasMatchingCompositeCollectionGroupIndex(queryUsage, compositeIndexes) {
  return compositeIndexes.some(index => {
    if (index.collectionGroup !== queryUsage.collectionName) return false
    return queryUsage.indexedFields.every(field => index.fieldNames.includes(field))
  })
}

function isFrontendRuntimeFile(relativePath) {
  return relativePath.startsWith('frontend/src/') && !/\.test\.[tj]sx?$/.test(relativePath)
}

function scanAuthObserverUsage(source, relativePath) {
  if (!isFrontendRuntimeFile(relativePath)) return []
  const matches = [...source.matchAll(/\b(onAuthStateChanged|onIdTokenChanged)\s*\(/g)]
  if (!matches.length) return []
  return uniq(matches.map(match => match[1])).map(observer => ({ file: relativePath, observer }))
}

function scanFirestoreBootstrapUsage(source, relativePath) {
  if (!isFrontendRuntimeFile(relativePath)) return []
  const results = []
  const bootstrapPattern = /\b(getFirestore|initializeFirestore|connectFirestoreEmulator)\s*\(/g
  let match = bootstrapPattern.exec(source)
  while (match) {
    results.push({ file: relativePath, functionName: match[1] })
    match = bootstrapPattern.exec(source)
  }
  return results
}

function scanFirestoreDatabaseEnvUsage(source, relativePath) {
  if (!isFrontendRuntimeFile(relativePath)) return []
  return source.includes('VITE_FIRESTORE_DATABASE_ID')
    ? [{ file: relativePath, envVar: 'VITE_FIRESTORE_DATABASE_ID' }]
    : []
}

function scanAdminEmailUsage(source, relativePath) {
  if (!isFrontendRuntimeFile(relativePath)) return []
  return source.includes('VITE_ADMIN_EMAIL')
    ? [{ file: relativePath, envVar: 'VITE_ADMIN_EMAIL' }]
    : []
}

function scanAdminRoleCheckUsage(source, relativePath) {
  if (!isFrontendRuntimeFile(relativePath)) return []
  const results = []
  const pattern = /\b(?:role|profileRole|nextRole|user\.role)\s*===\s*['"]admin['"]/g
  let match = pattern.exec(source)
  while (match) {
    results.push({ file: relativePath, expression: match[0] })
    match = pattern.exec(source)
  }
  return results
}

function scanFirestoreOperationUsage(source, relativePath) {
  if (!isFrontendRuntimeFile(relativePath)) return []
  if (!/from\s+['"]firebase\/firestore['"]/.test(source)) return []

  const results = []
  const operationPattern = /\b(getDoc|getDocs|setDoc|updateDoc|deleteDoc|addDoc)\s*\(/g
  let match = operationPattern.exec(source)
  while (match) {
    results.push({ file: relativePath, operation: match[1] })
    match = operationPattern.exec(source)
  }

  return results
}

function scanUnguardedFirestoreOperationUsage(source, relativePath) {
  if (!isFrontendRuntimeFile(relativePath)) return []
  if (!firestoreWrapperGuardrailFiles.has(relativePath)) return []
  if (!/from\s+['"]firebase\/firestore['"]/.test(source)) return []

  const guardedRanges = collectFirestoreGuardedRanges(source)
  const results = []
  const operationPattern = /\b(getDoc|getDocs|setDoc|updateDoc|deleteDoc|addDoc)\s*\(/g
  let match = operationPattern.exec(source)
  while (match) {
    if (!isInsideAnyRange(match.index, guardedRanges)) {
      results.push({ file: relativePath, operation: match[1] })
    }
    match = operationPattern.exec(source)
  }

  return results
}

function scanAuthRecoveryOptOutUsage(source, relativePath) {
  if (!isFrontendRuntimeFile(relativePath)) return []

  const results = []
  const pattern = /recoverAuthAccessErrors\s*:\s*false/g
  let match = pattern.exec(source)
  while (match) {
    results.push({ file: relativePath, expression: match[0] })
    match = pattern.exec(source)
  }

  return results
}

function scanSessionStorageUsage(source, relativePath) {
  if (!isFrontendRuntimeFile(relativePath)) return []

  const results = []
  const usagePattern = /(?:window\.)?localStorage\.(getItem|setItem|removeItem)\(\s*['"](lexio_token|lexio_user_id|lexio_role|lexio_full_name)['"]/g
  let match = usagePattern.exec(source)
  while (match) {
    results.push({
      file: relativePath,
      operation: match[1],
      key: match[2],
    })
    match = usagePattern.exec(source)
  }

  return results
}

function scanSensitiveConfigDefaults(source, relativePath) {
  const findings = []
  const lines = source.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fieldMatch = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[^=]+?=\s*Field\(default=(['"])(.*?)\3/)
    if (!fieldMatch) continue

    const fieldName = fieldMatch[2]
    const defaultValue = fieldMatch[4]
    const lowerFieldName = fieldName.toLowerCase()
    const lowerDefaultValue = defaultValue.toLowerCase()
    const reasons = []

    if (!defaultValue) continue
    if ((/api_key|secret|token|password/.test(lowerFieldName) || lowerFieldName === 'database_url') && defaultValue.trim()) {
      reasons.push('sensitive_field_with_non_empty_default')
    }
    if (/insecure/.test(lowerDefaultValue)) reasons.push('insecure_placeholder_default')
    if (/changeme/.test(lowerDefaultValue)) reasons.push('changeme_default')
    if (/sk-or-v1-/.test(defaultValue)) reasons.push('openrouter_style_key_default')
    if (lowerFieldName.endsWith('_api_key') && /^[A-Za-z0-9+/=]{20,}$/.test(defaultValue)) reasons.push('embedded_api_key_like_default')
    if (lowerFieldName === 'database_url' && /:\/\/[^:]+:[^@]+@/.test(defaultValue)) reasons.push('embedded_database_credentials_default')

    if (!reasons.length) continue
    findings.push({
      file: relativePath,
      line: index + 1,
      fieldName,
      reasons: uniq(reasons),
    })
  }

  return findings
}

function usesFirebaseStorageSdk(source) {
  if (!firebaseStorageImportPattern.test(source)) return false
  return /\b(getStorage|ref|uploadBytes|uploadString|getDownloadURL|deleteObject|listAll)\s*\(/.test(source)
}

async function buildRiskScan(args) {
  const baseline = await readJson(args.baselinePath)
  const workspaceFiles = await listSourceFiles(path.join(repoRoot, 'frontend', 'src'))
  const functionsFiles = await listSourceFiles(path.join(repoRoot, 'functions', 'src'))
  const packagesFiles = await listSourceFiles(path.join(repoRoot, 'packages'))
  const scriptFiles = await listSourceFiles(path.join(repoRoot, 'scripts'))

  const allFiles = [...workspaceFiles, ...functionsFiles, ...packagesFiles, ...scriptFiles]
  const fileContents = []
  for (const filePath of allFiles) {
    fileContents.push({
      filePath,
      relativePath: toPosixRelative(filePath),
      source: await fs.readFile(filePath, 'utf8'),
    })
  }
  const firestoreRulesSource = await fs.readFile(path.join(repoRoot, 'firestore.rules'), 'utf8')
  const firestoreIndexesConfig = await readJson(path.join(repoRoot, 'firestore.indexes.json'))
  const firebaseConfig = await readJson(path.join(repoRoot, 'firebase.json'))

  const architectureGuardrail = runArchitectureGuardrail()
  const frontendTests = baseline.frontend.tests || []
  const frontendTestSources = baseline.frontend.testSources || {}
  const knownRoutePaths = (baseline.frontend.routes.routes || []).map(route => route.path)

  const routeCoverageGaps = baseline.frontend.routes.routes
    .map(route => {
      const directTestSignal = inferRouteTestSignal(route, frontendTests, frontendTestSources, knownRoutePaths)
      return {
        path: route.path,
        access: route.access,
        component: route.component,
        directTestSignal,
      }
    })
    .filter(item => isGapSignal(item.directTestSignal))

  const uiCoverageGaps = baseline.frontend.components.items
    .map(item => ({
      path: item.path,
      kind: item.kind,
      directTestSignal: inferTestSignal(item.path, frontendTests),
    }))
    .filter(item => isGapSignal(item.directTestSignal))

  const pipelineCoverageGaps = baseline.frontend.pipelineRuntime
    .map(item => ({
      path: item.path,
      kind: item.kind,
      directTestSignal: item.exists ? inferTestSignal(item.path, frontendTests) : 'missing surface',
    }))
    .filter(item => item.directTestSignal !== 'missing surface' && isGapSignal(item.directTestSignal))

  const firestoreCalls = fileContents.flatMap(item => scanFirestoreCalls(item.source, item.relativePath))
  const firestoreCollectionUsage = []
  for (const call of firestoreCalls) {
    for (const collectionName of call.collectionNames) {
      firestoreCollectionUsage.push({
        file: call.file,
        functionName: call.functionName,
        collectionName,
      })
    }
  }
  const knownCollections = new Set([
    'users',
    'settings',
    ...LEXIO_USER_SUBCOLLECTIONS,
    ...LEXIO_NESTED_USER_SUBCOLLECTIONS,
  ])
  const unknownFirestoreCollections = firestoreCollectionUsage.filter(item => !knownCollections.has(item.collectionName))
  const collectionGroupUsages = firestoreCollectionUsage.filter(item => item.functionName === 'collectionGroup')
  const unexpectedCollectionGroups = collectionGroupUsages.filter(item => !LEXIO_COLLECTION_GROUPS.includes(item.collectionName))
  const runtimeCollectionGroupNames = uniq(collectionGroupUsages.map(item => item.collectionName))

  const firestoreRulePaths = parseFirestoreRulePaths(firestoreRulesSource)
  const directUserSubcollectionRuleNames = uniq(firestoreRulePaths.map(getDirectUserSubcollectionRuleName))
  const nestedUserSubcollectionRuleNames = uniq(firestoreRulePaths.flatMap(getNestedUserSubcollectionRuleNames))
  const adminCollectionGroupRuleNames = uniq(firestoreRulePaths.map(getAdminCollectionGroupRuleName))
  const missingUserSubcollectionRules = [...LEXIO_USER_SUBCOLLECTIONS].filter(item => !directUserSubcollectionRuleNames.includes(item)).sort((left, right) => left.localeCompare(right))
  const missingNestedSubcollectionRules = [...LEXIO_NESTED_USER_SUBCOLLECTIONS].filter(item => !nestedUserSubcollectionRuleNames.includes(item)).sort((left, right) => left.localeCompare(right))
  const missingRuntimeCollectionGroupRules = runtimeCollectionGroupNames.filter(item => !adminCollectionGroupRuleNames.includes(item))

  const collectionGroupQueries = fileContents.flatMap(item => parseCollectionGroupQueries(item.source, item.relativePath))
  const compositeCollectionGroupIndexes = (firestoreIndexesConfig.indexes || [])
    .filter(index => String(index?.queryScope || '').toUpperCase() === 'COLLECTION_GROUP' && index?.collectionGroup)
    .map(index => ({
      collectionGroup: index.collectionGroup,
      fieldNames: normalizeIndexFieldNames(index),
    }))
  const collectionGroupQueriesRequiringCompositeIndex = collectionGroupQueries.filter(item => item.requiresCompositeIndex)
  const missingCollectionGroupIndexes = collectionGroupQueriesRequiringCompositeIndex.filter(item => !hasMatchingCompositeCollectionGroupIndex(item, compositeCollectionGroupIndexes))
  const unresolvedCollectionGroupQueries = collectionGroupQueries.filter(item => item.unresolvedSignals.length > 0)

  const firestoreDeployEntries = Array.isArray(firebaseConfig.firestore) ? firebaseConfig.firestore : []
  const expectedDeployDatabases = ['(default)', DEFAULT_LEXIO_TARGET_DATABASE_ID]
  const missingFirestoreDeployDatabases = expectedDeployDatabases.filter(databaseId => !firestoreDeployEntries.some(entry => entry?.database === databaseId))
  const misconfiguredFirestoreDeployDatabases = firestoreDeployEntries
    .filter(entry => expectedDeployDatabases.includes(entry?.database))
    .filter(entry => entry?.rules !== 'firestore.rules' || entry?.indexes !== 'firestore.indexes.json')
    .map(entry => ({
      database: entry.database,
      rules: entry.rules || null,
      indexes: entry.indexes || null,
    }))

  const storageUsages = fileContents
    .filter(item => usesFirebaseStorageSdk(item.source))
    .map(item => item.relativePath)
    .filter(item => item.startsWith('frontend/src/') || item.startsWith('functions/src/') || item.startsWith('packages/'))
  const unexpectedStorageUsages = storageUsages.filter(item => !expectedStorageFiles.has(item))

  const openRouterOccurrences = fileContents
    .filter(item => openRouterUrlPattern.test(item.source))
    .map(item => item.relativePath)
  const unexpectedFrontendOpenRouterOccurrences = openRouterOccurrences.filter(item => item.startsWith('frontend/src/') && !frontendOpenRouterAllowedFiles.has(item))
  const nonFrontendOpenRouterOccurrences = openRouterOccurrences.filter(item => !item.startsWith('frontend/src/'))
  const legacyBackendOpenRouterOccurrences = nonFrontendOpenRouterOccurrences.filter(item => legacyBackendOpenRouterFiles.has(item))
  const unexpectedNonFrontendOpenRouterOccurrences = nonFrontendOpenRouterOccurrences.filter(item => !legacyBackendOpenRouterFiles.has(item))
  const authObserverUsages = fileContents.flatMap(item => scanAuthObserverUsage(item.source, item.relativePath))
  const unexpectedAuthObserverUsages = authObserverUsages.filter(item => !authObserverAllowedFiles.has(item.file))
  const adminEmailUsages = fileContents.flatMap(item => scanAdminEmailUsage(item.source, item.relativePath))
  const unexpectedAdminEmailUsages = adminEmailUsages.filter(item => !adminEmailAllowedFiles.has(item.file))
  const adminRoleCheckUsages = fileContents.flatMap(item => scanAdminRoleCheckUsage(item.source, item.relativePath))
  const unexpectedAdminRoleCheckUsages = adminRoleCheckUsages.filter(item => !adminRoleCheckAllowedFiles.has(item.file))
  const firestoreOperationUsages = fileContents.flatMap(item => scanFirestoreOperationUsage(item.source, item.relativePath))
  const firestoreOperationFiles = uniq(firestoreOperationUsages.map(item => item.file))
  const unexpectedFirestoreOperationFiles = firestoreOperationFiles.filter(item => !firestoreOperationAllowedFiles.has(item))
  const unguardedFirestoreOperationUsages = fileContents.flatMap(item => scanUnguardedFirestoreOperationUsage(item.source, item.relativePath))
  const unexpectedUnguardedFirestoreOperationFiles = uniq(unguardedFirestoreOperationUsages.map(item => item.file))
  const authRecoveryOptOutUsages = fileContents.flatMap(item => scanAuthRecoveryOptOutUsage(item.source, item.relativePath))
  const unexpectedAuthRecoveryOptOutUsages = authRecoveryOptOutUsages.filter(item => !authRecoveryOptOutAllowedFiles.has(item.file))
  const firestoreBootstrapUsages = fileContents.flatMap(item => scanFirestoreBootstrapUsage(item.source, item.relativePath))
  const unexpectedFirestoreBootstrapUsages = firestoreBootstrapUsages.filter(item => !firestoreBootstrapAllowedFiles.has(item.file))
  const firestoreDatabaseEnvUsages = fileContents.flatMap(item => scanFirestoreDatabaseEnvUsage(item.source, item.relativePath))
  const unexpectedFirestoreDatabaseEnvUsages = firestoreDatabaseEnvUsages.filter(item => !firestoreBootstrapAllowedFiles.has(item.file))
  const sessionStorageUsages = fileContents.flatMap(item => scanSessionStorageUsage(item.source, item.relativePath))
  const sessionStorageFiles = uniq(sessionStorageUsages.map(item => item.file))
  const unexpectedSessionStorageFiles = sessionStorageFiles.filter(item => !sessionStorageAllowedFiles.has(item))
  const unexpectedSessionStorageWrites = sessionStorageUsages.filter(item => item.operation !== 'getItem' && !sessionStorageWriteAllowedFiles.has(item.file))
  const sensitiveConfigDefaults = fileContents.flatMap(item => scanSensitiveConfigDefaults(item.source, item.relativePath))

  return {
    generatedAt: new Date().toISOString(),
    git: baseline.git,
    baselinePath: toPosixRelative(args.baselinePath),
    guardrails: {
      architecture: architectureGuardrail,
    },
    coverage: {
      routeCoverageGaps,
      uiCoverageGaps,
      pipelineCoverageGaps,
      counts: {
        routeCoverageGaps: routeCoverageGaps.length,
        uiCoverageGaps: uiCoverageGaps.length,
        pipelineCoverageGaps: pipelineCoverageGaps.length,
        uiCoverageGapsByKind: countBy(uiCoverageGaps, item => item.kind),
      },
    },
    firestore: {
      knownCollections: [...knownCollections].sort(),
      collectionUsageByName: countBy(firestoreCollectionUsage, item => item.collectionName),
      unknownCollections: unknownFirestoreCollections,
      collectionGroupUsageByName: countBy(collectionGroupUsages, item => item.collectionName),
      unexpectedCollectionGroups,
      rulesCoverage: {
        rulePaths: firestoreRulePaths,
        directUserSubcollectionRuleNames,
        nestedUserSubcollectionRuleNames,
        adminCollectionGroupRuleNames,
        missingUserSubcollectionRules,
        missingNestedSubcollectionRules,
        missingRuntimeCollectionGroupRules,
      },
      indexCoverage: {
        collectionGroupQueries,
        collectionGroupQueriesRequiringCompositeIndex,
        unresolvedCollectionGroupQueries,
        compositeCollectionGroupIndexes,
        missingCollectionGroupIndexes,
      },
      deployConfig: {
        targetDatabase: DEFAULT_LEXIO_TARGET_DATABASE_ID,
        firestoreEntries: firestoreDeployEntries,
        missingFirestoreDeployDatabases,
        misconfiguredFirestoreDeployDatabases,
      },
      registryReference: {
        lexioRootDocuments: [...LEXIO_ROOT_DOCUMENTS].sort(),
        userSubcollections: [...LEXIO_USER_SUBCOLLECTIONS].sort(),
        nestedSubcollections: [...LEXIO_NESTED_USER_SUBCOLLECTIONS].sort(),
        collectionGroups: [...LEXIO_COLLECTION_GROUPS].sort(),
      },
    },
    storage: {
      storageUsages,
      expectedFiles: [...expectedStorageFiles].sort(),
      unexpectedStorageUsages,
    },
    externalCalls: {
      openRouterOccurrences,
      unexpectedFrontendOpenRouterOccurrences,
      legacyBackendOpenRouterOccurrences,
      nonFrontendOpenRouterOccurrences,
      unexpectedNonFrontendOpenRouterOccurrences,
    },
    auth: {
      authObserverUsages,
      allowedAuthObserverFiles: [...authObserverAllowedFiles].sort(),
      unexpectedAuthObserverUsages,
      adminEmailUsages,
      allowedAdminEmailFiles: [...adminEmailAllowedFiles].sort(),
      unexpectedAdminEmailUsages,
      adminRoleCheckUsages,
      allowedAdminRoleCheckFiles: [...adminRoleCheckAllowedFiles].sort(),
      unexpectedAdminRoleCheckUsages,
      firestoreOperationUsages,
      firestoreOperationFiles,
      allowedFirestoreOperationFiles: [...firestoreOperationAllowedFiles].sort(),
      unexpectedFirestoreOperationFiles,
      firestoreWrapperGuardrailFiles: [...firestoreWrapperGuardrailFiles].sort(),
      unguardedFirestoreOperationUsages,
      unexpectedUnguardedFirestoreOperationFiles,
      authRecoveryOptOutUsages,
      allowedAuthRecoveryOptOutFiles: [...authRecoveryOptOutAllowedFiles].sort(),
      unexpectedAuthRecoveryOptOutUsages,
      firestoreBootstrapUsages,
      allowedFirestoreBootstrapFiles: [...firestoreBootstrapAllowedFiles].sort(),
      unexpectedFirestoreBootstrapUsages,
      firestoreDatabaseEnvUsages,
      unexpectedFirestoreDatabaseEnvUsages,
      sessionStorageKeys,
      sessionStorageUsages,
      sessionStorageUsageByKey: countBy(sessionStorageUsages, item => item.key),
      sessionStorageUsageByOperation: countBy(sessionStorageUsages, item => item.operation),
      sessionStorageFiles,
      allowedSessionStorageFiles: [...sessionStorageAllowedFiles].sort(),
      allowedSessionStorageWriteFiles: [...sessionStorageWriteAllowedFiles].sort(),
      unexpectedSessionStorageFiles,
      unexpectedSessionStorageWrites,
    },
    security: {
      sensitiveConfigDefaults,
    },
  }
}

function buildMarkdown(scan) {
  const topList = (title, items, formatter = item => item) => {
    if (!items.length) return `## ${title}\n- none\n`
    return `## ${title}\n${items.map(item => `- ${formatter(item)}`).join('\n')}\n`
  }

  return [
    '# Platform Audit Risk Scan',
    '',
    `Generated: ${scan.generatedAt}`,
    `Git branch: ${scan.git.branch || 'unknown'}`,
    `Git head: ${scan.git.head || 'unknown'}`,
    '',
    '## Guardrails',
    `- Architecture guardrail: ${scan.guardrails.architecture.ok ? 'pass' : 'fail'}`,
    ...(scan.guardrails.architecture.output ? scan.guardrails.architecture.output.split(/\r?\n/).map(line => `- ${line}`) : ['- no output']),
    '',
    '## Coverage Gap Counts',
    `- Route gaps: ${scan.coverage.counts.routeCoverageGaps}`,
    `- UI gaps: ${scan.coverage.counts.uiCoverageGaps}`,
    `- Pipeline gaps: ${scan.coverage.counts.pipelineCoverageGaps}`,
    ...Object.entries(scan.coverage.counts.uiCoverageGapsByKind).map(([kind, count]) => `- UI gap kind ${kind}: ${count}`),
    '',
    topList('Route Coverage Gaps', scan.coverage.routeCoverageGaps, item => `${item.path} | ${item.access} | ${item.component || 'unknown'} | ${item.directTestSignal}`),
    topList('UI Coverage Gaps', scan.coverage.uiCoverageGaps, item => `${item.path} | ${item.kind} | ${item.directTestSignal}`),
    topList('Pipeline Coverage Gaps', scan.coverage.pipelineCoverageGaps, item => `${item.path} | ${item.kind} | ${item.directTestSignal}`),
    '## Firestore Collection Usage',
    ...Object.entries(scan.firestore.collectionUsageByName).map(([name, count]) => `- ${name}: ${count}`),
    '',
    topList('Unexpected Firestore Collections', scan.firestore.unknownCollections, item => `${item.collectionName} | ${item.file} | ${item.functionName}`),
    topList('Unexpected CollectionGroup Usages', scan.firestore.unexpectedCollectionGroups, item => `${item.collectionName} | ${item.file}`),
    '## Firestore Rules Coverage',
    `- Missing direct user-subcollection rules: ${scan.firestore.rulesCoverage.missingUserSubcollectionRules.length}`,
    `- Missing nested user-subcollection rules: ${scan.firestore.rulesCoverage.missingNestedSubcollectionRules.length}`,
    `- Missing runtime collectionGroup admin rules: ${scan.firestore.rulesCoverage.missingRuntimeCollectionGroupRules.length}`,
    '',
    topList('Missing User Subcollection Rules', scan.firestore.rulesCoverage.missingUserSubcollectionRules),
    topList('Missing Nested User Subcollection Rules', scan.firestore.rulesCoverage.missingNestedSubcollectionRules),
    topList('Missing Runtime CollectionGroup Rules', scan.firestore.rulesCoverage.missingRuntimeCollectionGroupRules),
    '## Firestore Index Coverage',
    `- CollectionGroup queries detected: ${scan.firestore.indexCoverage.collectionGroupQueries.length}`,
    `- CollectionGroup queries requiring composite index review: ${scan.firestore.indexCoverage.collectionGroupQueriesRequiringCompositeIndex.length}`,
    `- Missing composite collectionGroup indexes: ${scan.firestore.indexCoverage.missingCollectionGroupIndexes.length}`,
    `- Unresolved dynamic collectionGroup queries: ${scan.firestore.indexCoverage.unresolvedCollectionGroupQueries.length}`,
    '',
    topList('Missing CollectionGroup Indexes', scan.firestore.indexCoverage.missingCollectionGroupIndexes, item => `${item.collectionName} | ${item.file} | fields=${item.indexedFields.join(',')}`),
    topList('Unresolved CollectionGroup Queries', scan.firestore.indexCoverage.unresolvedCollectionGroupQueries, item => `${item.collectionName} | ${item.file} | signals=${item.unresolvedSignals.join(',')}`),
    '## Firestore Deploy Configuration',
    `- Target database: ${scan.firestore.deployConfig.targetDatabase}`,
    `- Missing Firestore deploy databases: ${scan.firestore.deployConfig.missingFirestoreDeployDatabases.length}`,
    `- Misconfigured Firestore deploy databases: ${scan.firestore.deployConfig.misconfiguredFirestoreDeployDatabases.length}`,
    '',
    topList('Missing Firestore Deploy Databases', scan.firestore.deployConfig.missingFirestoreDeployDatabases),
    topList('Misconfigured Firestore Deploy Databases', scan.firestore.deployConfig.misconfiguredFirestoreDeployDatabases, item => `${item.database} | rules=${item.rules || 'missing'} | indexes=${item.indexes || 'missing'}`),
    topList('Unexpected Storage Usages', scan.storage.unexpectedStorageUsages),
    topList('Unexpected Frontend OpenRouter Occurrences', scan.externalCalls.unexpectedFrontendOpenRouterOccurrences),
    topList('Legacy Backend OpenRouter Occurrences', scan.externalCalls.legacyBackendOpenRouterOccurrences),
    topList('Unexpected Non-Frontend OpenRouter Occurrences', scan.externalCalls.unexpectedNonFrontendOpenRouterOccurrences),
    topList('Non-Frontend OpenRouter Occurrences', scan.externalCalls.nonFrontendOpenRouterOccurrences),
    '## Auth Session Surface',
    `- Auth observer files detected: ${scan.auth.authObserverUsages.length}`,
    `- Unexpected auth observer files: ${scan.auth.unexpectedAuthObserverUsages.length}`,
    `- Admin email consumers detected: ${scan.auth.adminEmailUsages.length}`,
    `- Unexpected admin email consumers: ${scan.auth.unexpectedAdminEmailUsages.length}`,
    `- Direct admin role checks detected: ${scan.auth.adminRoleCheckUsages.length}`,
    `- Unexpected direct admin role checks: ${scan.auth.unexpectedAdminRoleCheckUsages.length}`,
    `- Firestore operation files detected: ${scan.auth.firestoreOperationFiles.length}`,
    `- Unexpected Firestore operation files: ${scan.auth.unexpectedFirestoreOperationFiles.length}`,
    `- Unexpected unguarded Firestore operation files: ${scan.auth.unexpectedUnguardedFirestoreOperationFiles.length}`,
    `- Auth recovery opt-outs detected: ${scan.auth.authRecoveryOptOutUsages.length}`,
    `- Unexpected auth recovery opt-outs: ${scan.auth.unexpectedAuthRecoveryOptOutUsages.length}`,
    `- Firestore bootstrap files detected: ${scan.auth.firestoreBootstrapUsages.length}`,
    `- Unexpected Firestore bootstrap files: ${scan.auth.unexpectedFirestoreBootstrapUsages.length}`,
    `- Unexpected Firestore database env consumers: ${scan.auth.unexpectedFirestoreDatabaseEnvUsages.length}`,
    `- Session storage files detected: ${scan.auth.sessionStorageFiles.length}`,
    `- Unexpected session storage files: ${scan.auth.unexpectedSessionStorageFiles.length}`,
    `- Unexpected session storage writers: ${scan.auth.unexpectedSessionStorageWrites.length}`,
    '',
    topList('Unexpected Auth Observer Usages', scan.auth.unexpectedAuthObserverUsages, item => `${item.file} | ${item.observer}`),
    topList('Unexpected Admin Email Consumers', scan.auth.unexpectedAdminEmailUsages, item => `${item.file} | ${item.envVar}`),
    topList('Unexpected Direct Admin Role Checks', scan.auth.unexpectedAdminRoleCheckUsages, item => `${item.file} | ${item.expression}`),
    topList('Unexpected Firestore Operation Files', scan.auth.unexpectedFirestoreOperationFiles),
    topList('Unexpected Unguarded Firestore Operation Files', scan.auth.unexpectedUnguardedFirestoreOperationFiles),
    topList('Unexpected Auth Recovery Opt-Outs', scan.auth.unexpectedAuthRecoveryOptOutUsages, item => `${item.file} | ${item.expression}`),
    topList('Unexpected Firestore Bootstrap Usages', scan.auth.unexpectedFirestoreBootstrapUsages, item => `${item.file} | ${item.functionName}`),
    topList('Unexpected Firestore Database Env Consumers', scan.auth.unexpectedFirestoreDatabaseEnvUsages, item => `${item.file} | ${item.envVar}`),
    topList('Unexpected Session Storage Files', scan.auth.unexpectedSessionStorageFiles),
    topList('Unexpected Session Storage Writers', scan.auth.unexpectedSessionStorageWrites, item => `${item.file} | ${item.operation} | ${item.key}`),
    `## Sensitive Config Defaults\n- Findings: ${scan.security.sensitiveConfigDefaults.length}\n`,
    topList('Sensitive Config Default Findings', scan.security.sensitiveConfigDefaults, item => `${item.file}:${item.line} | ${item.fieldName} | ${item.reasons.join(',')}`),
  ].join('\n')
}

async function writeOutput(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv)
  const scan = await buildRiskScan(args)
  await writeOutput(args.jsonOutput, JSON.stringify(scan, null, 2))
  await writeOutput(args.markdownOutput, buildMarkdown(scan))

  console.log(`[lexio-platform-audit-risk-scan] JSON: ${toPosixRelative(args.jsonOutput)}`)
  console.log(`[lexio-platform-audit-risk-scan] Markdown: ${toPosixRelative(args.markdownOutput)}`)
  console.log(`[lexio-platform-audit-risk-scan] RouteGaps=${scan.coverage.counts.routeCoverageGaps} UIGaps=${scan.coverage.counts.uiCoverageGaps} PipelineGaps=${scan.coverage.counts.pipelineCoverageGaps} UnknownFirestoreCollections=${scan.firestore.unknownCollections.length} MissingRuntimeCollectionGroupRules=${scan.firestore.rulesCoverage.missingRuntimeCollectionGroupRules.length} MissingCollectionGroupIndexes=${scan.firestore.indexCoverage.missingCollectionGroupIndexes.length} MissingFirestoreDeployDatabases=${scan.firestore.deployConfig.missingFirestoreDeployDatabases.length} UnexpectedNonFrontendOpenRouterOccurrences=${scan.externalCalls.unexpectedNonFrontendOpenRouterOccurrences.length} UnexpectedAuthObserverUsages=${scan.auth.unexpectedAuthObserverUsages.length} UnexpectedAdminEmailUsages=${scan.auth.unexpectedAdminEmailUsages.length} UnexpectedAdminRoleCheckUsages=${scan.auth.unexpectedAdminRoleCheckUsages.length} UnexpectedFirestoreOperationFiles=${scan.auth.unexpectedFirestoreOperationFiles.length} UnexpectedUnguardedFirestoreOperationFiles=${scan.auth.unexpectedUnguardedFirestoreOperationFiles.length} UnexpectedAuthRecoveryOptOutUsages=${scan.auth.unexpectedAuthRecoveryOptOutUsages.length} UnexpectedFirestoreBootstrapUsages=${scan.auth.unexpectedFirestoreBootstrapUsages.length} UnexpectedFirestoreDatabaseEnvUsages=${scan.auth.unexpectedFirestoreDatabaseEnvUsages.length} UnexpectedSessionStorageFiles=${scan.auth.unexpectedSessionStorageFiles.length} UnexpectedSessionStorageWriters=${scan.auth.unexpectedSessionStorageWrites.length} SensitiveConfigDefaults=${scan.security.sensitiveConfigDefaults.length} UnexpectedStorageUsages=${scan.storage.unexpectedStorageUsages.length}`)
}

main().catch(error => {
  console.error('[lexio-platform-audit-risk-scan] Failed:', error)
  process.exit(1)
})