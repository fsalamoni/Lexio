#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_LEXIO_TARGET_DATABASE_ID,
  collectionGroupFromPath,
  normalizeDocumentPath,
  selectLexioDocuments,
  summarizeBy,
} from './lexio-firestore-paths.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function log(message) {
  process.stdout.write(`[lexio-firestore-migrate-shadow] ${message}\n`)
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function parseArgs(argv) {
  const result = {
    snapshot: undefined,
    project: undefined,
    targetDatabaseId: DEFAULT_LEXIO_TARGET_DATABASE_ID,
    outFile: undefined,
    execute: false,
    allowDefaultTarget: false,
    allowAmbiguousSource: false,
    includeAllUserRoots: false,
    limit: 0,
  }

  for (let index = 2; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--snapshot') result.snapshot = argv[++index]
    else if (value === '--project') result.project = argv[++index]
    else if (value === '--target-database-id') result.targetDatabaseId = argv[++index]
    else if (value === '--out-file') result.outFile = argv[++index]
    else if (value === '--execute') result.execute = true
    else if (value === '--allow-default-target') result.allowDefaultTarget = true
    else if (value === '--allow-ambiguous-source') result.allowAmbiguousSource = true
    else if (value === '--include-all-user-roots') result.includeAllUserRoots = true
    else if (value === '--limit') result.limit = Number(argv[++index] || 0)
  }

  return result
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function resolveProjectId(explicitProjectId, manifest) {
  if (explicitProjectId) return explicitProjectId
  if (manifest?.projectId) return manifest.projectId

  const firebasercPath = path.join(repoRoot, '.firebaserc')
  const firebaserc = await readJson(firebasercPath)
  const projectId = firebaserc?.projects?.default
  if (!projectId) throw new Error('Could not resolve Firebase project ID from .firebaserc or backup manifest')
  return projectId
}

function resolveFirebaseToolsConfigPath() {
  const candidates = [
    process.env.FIREBASE_TOOLS_CONFIG,
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'configstore', 'firebase-tools.json') : undefined,
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32'
        ? ['/d', '/s', '/c', `if exist "${candidate}" exit 0 else exit 1`]
        : ['-lc', `[ -f '${candidate}' ]`], { stdio: 'ignore' })
      return candidate
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('Could not locate firebase-tools.json with CLI authentication state')
}

async function loadFirebaseToolsConfig(configPath) {
  const json = await readJson(configPath)
  if (!json?.tokens?.access_token) throw new Error('Firebase CLI auth state does not contain an access token')
  return json
}

async function ensureFreshAccessToken(configPath) {
  let config = await loadFirebaseToolsConfig(configPath)
  const expiresAt = Number(config?.tokens?.expires_at || 0)
  const expiresSoon = !expiresAt || expiresAt <= Date.now() + 120_000

  if (expiresSoon) {
    log('Access token is close to expiration; asking Firebase CLI to refresh auth state')
    execFileSync('firebase', ['login:list'], { cwd: repoRoot, stdio: 'ignore' })
    config = await loadFirebaseToolsConfig(configPath)
  }

  return {
    email: config?.user?.email || 'unknown',
    accessToken: config.tokens.access_token,
  }
}

async function authorizedJson(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} for ${url}: ${errorText.slice(0, 600)}`)
  }

  return response.json()
}

function encodePathSegments(relativePath) {
  return normalizeDocumentPath(relativePath)
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function encodeDecodedFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(item => encodeDecodedFirestoreValue(item)) } }
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeDecodedFirestoreFields(value) } }
  }
  return { stringValue: String(value) }
}

function encodeDecodedFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, encodeDecodedFirestoreValue(value)]),
  )
}

function firestoreFieldsForDocument(item) {
  if (item.rawFields && typeof item.rawFields === 'object') return item.rawFields
  return encodeDecodedFirestoreFields(item.fields || {})
}

async function getDatabaseMetadata(projectId, databaseId, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}`
  return authorizedJson(url, accessToken)
}

async function writeDocument(projectId, databaseId, item, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodePathSegments(item.path)}`
  return authorizedJson(url, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ fields: firestoreFieldsForDocument(item) }),
  })
}

async function findLatestSnapshot() {
  const backupRoot = path.join(repoRoot, 'backups', 'firebase-cloud')
  if (!(await fileExists(backupRoot))) {
    throw new Error('No backups/firebase-cloud directory found. Run scripts/firebase-cloud-sync.mjs first or pass --snapshot.')
  }

  const candidates = []
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(entryPath)
      else if (entry.isFile() && entry.name === 'firestore.snapshot.json') {
        const stat = await fs.stat(entryPath)
        candidates.push({ filePath: entryPath, mtimeMs: stat.mtimeMs })
      }
    }
  }

  await walk(backupRoot)
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
  if (!candidates[0]) throw new Error('No firestore.snapshot.json files found under backups/firebase-cloud')
  return candidates[0].filePath
}

function ambiguousItems(excluded) {
  return excluded.filter(item => [
    'ambiguous_user_root',
    'unknown_user_data',
    'unknown_top_level',
    'ambiguous',
  ].includes(item.classification?.category))
}

async function main() {
  const args = parseArgs(process.argv)
  const snapshotPath = args.snapshot ? path.resolve(args.snapshot) : await findLatestSnapshot()
  const backupDir = path.dirname(snapshotPath)
  const manifestPath = path.join(backupDir, 'manifest.json')
  const manifest = await fileExists(manifestPath) ? await readJson(manifestPath) : null
  const snapshot = await readJson(snapshotPath)
  const documents = snapshot.documents || []
  const projectId = await resolveProjectId(args.project, manifest)
  const targetDatabaseId = args.targetDatabaseId || DEFAULT_LEXIO_TARGET_DATABASE_ID
  const { included, excluded, lexioUidSignals } = selectLexioDocuments(documents, {
    includeAllUserRoots: args.includeAllUserRoots,
  })
  const ambiguities = ambiguousItems(excluded)
  const plannedWrites = args.limit > 0 ? included.slice(0, args.limit) : included
  const outFile = args.outFile
    ? path.resolve(args.outFile)
    : path.join(backupDir, args.execute ? 'lexio-shadow-migration-result.json' : 'lexio-shadow-migration-dry-run.json')

  if (targetDatabaseId === '(default)' && !args.allowDefaultTarget) {
    throw new Error('Refusing to target (default). Pass --allow-default-target only for local/emulator tests.')
  }

  if (args.execute && ambiguities.length > 0 && !args.allowAmbiguousSource) {
    throw new Error(`Refusing execute with ${ambiguities.length} ambiguous source paths. Run audit first or pass --allow-ambiguous-source after review.`)
  }

  let email = null
  let accessToken = null
  let targetDatabase = null
  if (args.execute) {
    const configPath = resolveFirebaseToolsConfigPath()
    const auth = await ensureFreshAccessToken(configPath)
    email = auth.email
    accessToken = auth.accessToken
    targetDatabase = await getDatabaseMetadata(projectId, targetDatabaseId, accessToken)
  }

  const result = {
    generatedAt: new Date().toISOString(),
    mode: args.execute ? 'execute' : 'dry-run',
    projectId,
    source: {
      snapshotPath,
      databaseId: manifest?.databaseId || '(unknown)',
      exportedAt: manifest?.exportedAt || null,
    },
    target: {
      databaseId: targetDatabaseId,
      databaseName: targetDatabase?.name || null,
    },
    authUser: email,
    options: {
      includeAllUserRoots: args.includeAllUserRoots,
      allowAmbiguousSource: args.allowAmbiguousSource,
      limit: args.limit,
    },
    totals: {
      sourceDocuments: documents.length,
      lexioIncluded: included.length,
      excluded: excluded.length,
      ambiguous: ambiguities.length,
      plannedWrites: plannedWrites.length,
      lexioUsersWithSignals: lexioUidSignals.size,
    },
    counts: {
      plannedByCollectionGroup: summarizeBy(plannedWrites, item => collectionGroupFromPath(item.path)),
      plannedByReason: summarizeBy(plannedWrites, item => item.classification?.reason),
      excludedByReason: summarizeBy(excluded, item => item.classification?.reason),
    },
    writes: [],
    errors: [],
    safetyPolicy: {
      deletesSourceData: false,
      overwritesTargetDocuments: args.execute,
      oldDatabaseCleanup: 'not supported; requires separate explicit approval',
    },
  }

  if (args.execute) {
    log(`Executing shadow migration to ${projectId}/${targetDatabaseId}; documents: ${plannedWrites.length}`)
    for (const item of plannedWrites) {
      try {
        const response = await writeDocument(projectId, targetDatabaseId, item, accessToken)
        result.writes.push({ path: normalizeDocumentPath(item.path), updateTime: response.updateTime || null })
      } catch (error) {
        result.errors.push({
          path: normalizeDocumentPath(item.path),
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, JSON.stringify(result, null, 2), 'utf8')

  log(`Snapshot: ${snapshotPath}`)
  log(`Output: ${outFile}`)
  log(`Mode: ${result.mode}; planned writes: ${plannedWrites.length}; errors: ${result.errors.length}`)

  if (result.errors.length > 0) {
    throw new Error(`Shadow migration finished with ${result.errors.length} write errors`)
  }
}

main().catch(error => {
  console.error(`[lexio-firestore-migrate-shadow] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
