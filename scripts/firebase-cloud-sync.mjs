#!/usr/bin/env node

import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function log(message) {
  process.stdout.write(`[firebase-cloud-sync] ${message}\n`)
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
    project: undefined,
    bucket: undefined,
    databaseId: undefined,
    outDir: undefined,
    includeStorageDownload: false,
    skipStorageDownload: false,
    verifyManifest: false,
  }

  for (let index = 2; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--project') result.project = argv[++index]
    else if (value === '--bucket') result.bucket = argv[++index]
    else if (value === '--database-id') result.databaseId = argv[++index]
    else if (value === '--out-dir') result.outDir = argv[++index]
    else if (value === '--include-storage-download') result.includeStorageDownload = true
    else if (value === '--skip-storage-download') result.skipStorageDownload = true
    else if (value === '--verify-manifest') result.verifyManifest = true
  }

  return result
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function resolveProjectId(explicitProjectId) {
  if (explicitProjectId) return explicitProjectId

  const firebasercPath = path.join(repoRoot, '.firebaserc')
  const firebaserc = await readJson(firebasercPath)
  const projectId = firebaserc?.projects?.default
  if (!projectId) {
    throw new Error('Could not resolve Firebase project ID from .firebaserc')
  }
  return projectId
}

async function resolveStorageBucket(projectId, explicitBucket) {
  if (explicitBucket) return explicitBucket

  const envPath = path.join(repoRoot, 'frontend', '.env.local')
  if (await fileExists(envPath)) {
    const envText = await fs.readFile(envPath, 'utf8')
    const match = envText.match(/^VITE_FIREBASE_STORAGE_BUCKET=(.+)$/m)
    if (match?.[1]?.trim()) return match[1].trim()
  }

  return `${projectId}.firebasestorage.app`
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
  if (!json?.tokens?.access_token) {
    throw new Error('Firebase CLI auth state does not contain an access token')
  }
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
    throw new Error(`HTTP ${response.status} for ${url}: ${errorText.slice(0, 400)}`)
  }

  return response.json()
}

function encodePathSegments(relativePath) {
  return relativePath
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function extractDocumentPath(name) {
  const marker = '/documents/'
  const index = name.indexOf(marker)
  return index >= 0 ? name.slice(index + marker.length) : name
}

function decodeFirestoreValue(value) {
  if ('nullValue' in value) return null
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('stringValue' in value) return value.stringValue
  if ('timestampValue' in value) return value.timestampValue
  if ('referenceValue' in value) return value.referenceValue
  if ('bytesValue' in value) return value.bytesValue
  if ('geoPointValue' in value) return value.geoPointValue
  if ('integerValue' in value) {
    const numeric = Number(value.integerValue)
    return Number.isSafeInteger(numeric) ? numeric : value.integerValue
  }
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(item => decodeFirestoreValue(item))
  }
  if ('mapValue' in value) {
    return decodeFirestoreFields(value.mapValue.fields || {})
  }
  return value
}

function decodeFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  )
}

async function listCollectionIds(projectId, databaseId, parentDocumentPath, accessToken) {
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`
  const parentSuffix = parentDocumentPath ? `/${encodePathSegments(parentDocumentPath)}` : ''
  const url = `${base}${parentSuffix}:listCollectionIds`

  const collectionIds = []
  let pageToken

  do {
    const payload = {
      pageSize: 100,
      ...(pageToken ? { pageToken } : {}),
    }
    const data = await authorizedJson(url, accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    collectionIds.push(...(data.collectionIds || []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return collectionIds
}

async function listDocuments(projectId, databaseId, collectionPath, accessToken) {
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodePathSegments(collectionPath)}`
  const documents = []
  let pageToken

  do {
    const params = new URLSearchParams({ pageSize: '500' })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await authorizedJson(`${base}?${params.toString()}`, accessToken)
    documents.push(...(data.documents || []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return documents
}

async function snapshotFirestore(projectId, databaseId, accessToken) {
  log('Listing top-level Firestore collections')
  const rootCollections = await listCollectionIds(projectId, databaseId, '', accessToken)
  const queue = [...rootCollections]
  const visitedCollections = []
  const documents = []

  while (queue.length > 0) {
    const collectionPath = queue.shift()
    visitedCollections.push(collectionPath)
    log(`Exporting collection ${collectionPath}`)

    const collectionDocs = await listDocuments(projectId, databaseId, collectionPath, accessToken)
    for (const doc of collectionDocs) {
      const documentPath = extractDocumentPath(doc.name)
      const subcollections = await listCollectionIds(projectId, databaseId, documentPath, accessToken)
      documents.push({
        path: documentPath,
        createTime: doc.createTime,
        updateTime: doc.updateTime,
        subcollections,
        rawFields: doc.fields || {},
        fields: decodeFirestoreFields(doc.fields || {}),
      })
      for (const subcollection of subcollections) {
        queue.push(`${documentPath}/${subcollection}`)
      }
    }
  }

  return {
    topLevelCollections: rootCollections,
    visitedCollections,
    documents,
  }
}

async function getFirestoreDatabaseMetadata(projectId, databaseId, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}`
  return authorizedJson(url, accessToken)
}

async function listStorageObjects(bucket, accessToken) {
  const objects = []
  let pageToken

  do {
    const params = new URLSearchParams({
      maxResults: '1000',
      fields: 'items(name,bucket,size,contentType,md5Hash,timeCreated,updated,metadata),nextPageToken',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?${params.toString()}`
    const data = await authorizedJson(url, accessToken)
    objects.push(...(data.items || []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return objects
}

async function downloadStorageObject(bucket, objectName, accessToken) {
  const encodedName = encodeURIComponent(objectName)
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodedName}?alt=media`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} downloading ${objectName}: ${errorText.slice(0, 400)}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function downloadStorageObjects(bucket, objects, accessToken, outDir) {
  const storageRoot = path.join(outDir, 'storage-files')
  let downloadedCount = 0

  for (const object of objects) {
    const objectPath = String(object.name || '')
    if (!objectPath) continue

    log(`Downloading storage object ${objectPath}`)
    const fileBuffer = await downloadStorageObject(bucket, objectPath, accessToken)
    const targetPath = path.join(storageRoot, ...objectPath.split('/'))
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, fileBuffer)
    downloadedCount++
  }

  return {
    storageRoot,
    downloadedCount,
  }
}

async function writeSnapshotFile(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function toManifestPath(outDir, filePath) {
  return path.relative(outDir, filePath).split(path.sep).join('/')
}

async function checksumOutputFile(outDir, filePath) {
  const stat = await fs.stat(filePath)
  return {
    path: toManifestPath(outDir, filePath),
    bytes: stat.size,
    sha256: await sha256File(filePath),
  }
}

async function listFilesRecursive(rootDir) {
  if (!rootDir || !(await fileExists(rootDir))) return []

  const entries = await fs.readdir(rootDir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) files.push(...await listFilesRecursive(entryPath))
    else if (entry.isFile()) files.push(entryPath)
  }
  return files
}

async function buildChecksumManifest(outDir, primaryFiles, storageRoot) {
  const files = []
  for (const filePath of primaryFiles) {
    files.push(await checksumOutputFile(outDir, filePath))
  }

  const storageFiles = []
  for (const filePath of await listFilesRecursive(storageRoot)) {
    storageFiles.push(await checksumOutputFile(outDir, filePath))
  }

  files.sort((left, right) => left.path.localeCompare(right.path))
  storageFiles.sort((left, right) => left.path.localeCompare(right.path))

  return { files, storageFiles }
}

async function verifyChecksumManifest(outDir, manifest) {
  const expected = [
    ...(manifest?.checksums?.files || []),
    ...(manifest?.checksums?.storageFiles || []),
  ]

  for (const entry of expected) {
    const filePath = path.join(outDir, ...String(entry.path).split('/'))
    const actual = await checksumOutputFile(outDir, filePath)
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) {
      throw new Error(`Checksum mismatch for ${entry.path}`)
    }
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const projectId = await resolveProjectId(args.project)
  const bucket = await resolveStorageBucket(projectId, args.bucket)
  const configPath = resolveFirebaseToolsConfigPath()
  const { email, accessToken } = await ensureFreshAccessToken(configPath)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const outDir = args.outDir || path.join(repoRoot, 'backups', 'firebase-cloud', timestamp)
  const databaseId = args.databaseId || '(default)'

  await fs.mkdir(outDir, { recursive: true })
  log(`Project: ${projectId}`)
  log(`Firestore database: ${databaseId}`)
  log(`Authenticated as: ${email}`)
  log(`Output directory: ${outDir}`)

  const firestoreMetadata = await getFirestoreDatabaseMetadata(projectId, databaseId, accessToken)
  const firestoreSnapshot = await snapshotFirestore(projectId, databaseId, accessToken)

  let storageObjects = []
  let storageError = null
  let storageDownload = {
    storageRoot: null,
    downloadedCount: 0,
    error: null,
  }
  try {
    log(`Listing Cloud Storage objects from bucket ${bucket}`)
    storageObjects = await listStorageObjects(bucket, accessToken)
    if (!args.skipStorageDownload && storageObjects.length > 0) {
      storageDownload = {
        ...await downloadStorageObjects(bucket, storageObjects, accessToken, outDir),
        error: null,
      }
    }
  } catch (error) {
    storageError = error instanceof Error ? error.message : String(error)
    log(`Storage listing failed: ${storageError}`)
  }

  if (!storageError && args.skipStorageDownload) {
    storageDownload.error = 'Skipped by --skip-storage-download'
  }

  const firestoreDatabaseFile = path.join(outDir, 'firestore.database.json')
  const firestoreSnapshotFile = path.join(outDir, 'firestore.snapshot.json')
  const storageObjectsFile = path.join(outDir, 'storage.objects.json')
  const storageDownloadFile = path.join(outDir, 'storage.download.json')
  const manifestFile = path.join(outDir, 'manifest.json')

  await writeSnapshotFile(firestoreDatabaseFile, firestoreMetadata)
  await writeSnapshotFile(firestoreSnapshotFile, firestoreSnapshot)
  await writeSnapshotFile(storageObjectsFile, {
    bucket,
    objects: storageObjects,
    error: storageError,
  })
  await writeSnapshotFile(storageDownloadFile, storageDownload)

  const checksums = await buildChecksumManifest(outDir, [
    firestoreDatabaseFile,
    firestoreSnapshotFile,
    storageObjectsFile,
    storageDownloadFile,
  ], storageDownload.storageRoot)

  const manifest = {
    exportedAt: new Date().toISOString(),
    projectId,
    databaseId,
    bucket,
    authUser: email,
    backupMode: {
      storageDownload: args.skipStorageDownload ? 'skipped' : 'included',
      explicitIncludeStorageDownloadFlag: args.includeStorageDownload,
      verifiedManifest: args.verifyManifest,
    },
    firestore: {
      topLevelCollections: firestoreSnapshot.topLevelCollections.length,
      visitedCollections: firestoreSnapshot.visitedCollections.length,
      documents: firestoreSnapshot.documents.length,
    },
    storage: {
      objects: storageObjects.length,
      error: storageError,
      downloadedFiles: storageDownload.downloadedCount,
      downloadError: storageDownload.error,
    },
    files: [
      'firestore.database.json',
      'firestore.snapshot.json',
      'storage.objects.json',
      'storage.download.json',
      'manifest.json',
    ],
    checksums,
  }

  await writeSnapshotFile(manifestFile, manifest)

  if (args.verifyManifest) {
    await verifyChecksumManifest(outDir, manifest)
    log('Manifest checksum verification passed')
  }

  log(`Done. Firestore documents: ${firestoreSnapshot.documents.length}; storage objects: ${storageObjects.length}; downloaded files: ${storageDownload.downloadedCount}`)
}

main().catch(error => {
  console.error(`[firebase-cloud-sync] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})