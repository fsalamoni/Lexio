#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  anonymizeId,
  collectLexioUidSignals,
  collectionGroupFromPath,
  rootCollectionFromPath,
  selectLexioDocuments,
  summarizeBy,
} from './lexio-firestore-paths.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function log(message) {
  process.stdout.write(`[lexio-firestore-audit] ${message}\n`)
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
    outFile: undefined,
    includeAllUserRoots: false,
    failOnAmbiguous: false,
    sampleSize: 20,
  }

  for (let index = 2; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--snapshot') result.snapshot = argv[++index]
    else if (value === '--out-file') result.outFile = argv[++index]
    else if (value === '--include-all-user-roots') result.includeAllUserRoots = true
    else if (value === '--fail-on-ambiguous') result.failOnAmbiguous = true
    else if (value === '--sample-size') result.sampleSize = Number(argv[++index] || result.sampleSize)
  }

  return result
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
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

function samplePaths(items, sampleSize) {
  return items.slice(0, sampleSize).map(item => {
    const segments = String(item.path || '').split('/').filter(Boolean)
    return {
      pathShape: segments.map((segment, index) => index % 2 === 1 ? `{${anonymizeId(segment)}}` : segment).join('/'),
      category: item.classification?.category,
      reason: item.classification?.reason,
      collectionGroup: collectionGroupFromPath(item.path),
    }
  })
}

function groupAmbiguities(excluded) {
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
  const snapshot = await readJson(snapshotPath)
  const documents = snapshot.documents || []
  const { included, excluded, lexioUidSignals } = selectLexioDocuments(documents, {
    includeAllUserRoots: args.includeAllUserRoots,
  })
  const ambiguities = groupAmbiguities(excluded)
  const backupDir = path.dirname(snapshotPath)
  const manifestPath = path.join(backupDir, 'manifest.json')
  const manifest = await fileExists(manifestPath) ? await readJson(manifestPath) : null
  const outFile = args.outFile
    ? path.resolve(args.outFile)
    : path.join(backupDir, 'lexio-firestore-audit.json')

  const userSignals = [...collectLexioUidSignals(documents).values()].map(signal => ({
    uidHash: signal.uidHash,
    subcollections: signal.subcollections,
    documentCount: signal.documentCount,
  }))

  const report = {
    generatedAt: new Date().toISOString(),
    snapshotPath,
    sourceManifest: manifest ? {
      projectId: manifest.projectId,
      databaseId: manifest.databaseId,
      exportedAt: manifest.exportedAt,
      firestoreDocuments: manifest.firestore?.documents,
      storageObjects: manifest.storage?.objects,
    } : null,
    options: {
      includeAllUserRoots: args.includeAllUserRoots,
      sampleSize: args.sampleSize,
    },
    totals: {
      documents: documents.length,
      lexioIncluded: included.length,
      excluded: excluded.length,
      ambiguous: ambiguities.length,
      lexioUsersWithSignals: lexioUidSignals.size,
    },
    counts: {
      topLevelCollections: summarizeBy(documents, item => rootCollectionFromPath(item.path)),
      includedByCollectionGroup: summarizeBy(included, item => collectionGroupFromPath(item.path)),
      includedByReason: summarizeBy(included, item => item.classification?.reason),
      excludedByReason: summarizeBy(excluded, item => item.classification?.reason),
    },
    samples: {
      included: samplePaths(included, args.sampleSize),
      ambiguous: samplePaths(ambiguities, args.sampleSize),
    },
    userSignals,
    migrationReadiness: {
      readyForShadowDryRun: ambiguities.length === 0 || included.length > 0,
      requiresHumanReview: ambiguities.length > 0,
      blockers: ambiguities.length > 0
        ? ['Ambiguous or unknown paths exist in the source snapshot. Review samples before executing migration.']
        : [],
    },
    safetyPolicy: {
      destructiveOperations: 'forbidden',
      oldDatabaseDeletion: 'requires separate explicit approval; not supported by this script',
      defaultMigrationMode: 'dry-run only until --execute is passed to the migration script',
    },
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, JSON.stringify(report, null, 2), 'utf8')

  log(`Snapshot: ${snapshotPath}`)
  log(`Report: ${outFile}`)
  log(`Documents: ${documents.length}; Lexio candidates: ${included.length}; ambiguous/excluded needing review: ${ambiguities.length}`)

  if (args.failOnAmbiguous && ambiguities.length > 0) {
    throw new Error(`Ambiguous Firestore paths detected: ${ambiguities.length}`)
  }
}

main().catch(error => {
  console.error(`[lexio-firestore-audit] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
