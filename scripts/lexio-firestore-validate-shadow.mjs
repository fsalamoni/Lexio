#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  collectionGroupFromPath,
  normalizeDocumentPath,
  selectLexioDocuments,
  summarizeBy,
} from './lexio-firestore-paths.mjs'

function log(message) {
  process.stdout.write(`[lexio-firestore-validate-shadow] ${message}\n`)
}

function parseArgs(argv) {
  const result = {
    sourceSnapshot: undefined,
    targetSnapshot: undefined,
    outFile: undefined,
    includeAllUserRoots: false,
    failOnMismatch: false,
  }

  for (let index = 2; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--source-snapshot') result.sourceSnapshot = argv[++index]
    else if (value === '--target-snapshot') result.targetSnapshot = argv[++index]
    else if (value === '--out-file') result.outFile = argv[++index]
    else if (value === '--include-all-user-roots') result.includeAllUserRoots = true
    else if (value === '--fail-on-mismatch') result.failOnMismatch = true
  }

  return result
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableSort(item)]),
    )
  }
  return value
}

function hashDocumentFields(item) {
  const payload = item.rawFields && typeof item.rawFields === 'object' ? item.rawFields : item.fields || {}
  return createHash('sha256').update(JSON.stringify(stableSort(payload))).digest('hex')
}

function mapLexioDocuments(snapshot, includeAllUserRoots) {
  const { included, excluded } = selectLexioDocuments(snapshot.documents || [], { includeAllUserRoots })
  const byPath = new Map()
  for (const item of included) {
    byPath.set(normalizeDocumentPath(item.path), {
      path: normalizeDocumentPath(item.path),
      hash: hashDocumentFields(item),
      collectionGroup: collectionGroupFromPath(item.path),
      classification: item.classification,
    })
  }
  return { included, excluded, byPath }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.sourceSnapshot || !args.targetSnapshot) {
    throw new Error('Pass --source-snapshot and --target-snapshot')
  }

  const sourceSnapshotPath = path.resolve(args.sourceSnapshot)
  const targetSnapshotPath = path.resolve(args.targetSnapshot)
  const sourceSnapshot = await readJson(sourceSnapshotPath)
  const targetSnapshot = await readJson(targetSnapshotPath)
  const source = mapLexioDocuments(sourceSnapshot, args.includeAllUserRoots)
  const target = mapLexioDocuments(targetSnapshot, true)

  const missingInTarget = []
  const hashMismatches = []
  for (const [documentPath, sourceItem] of source.byPath.entries()) {
    const targetItem = target.byPath.get(documentPath)
    if (!targetItem) {
      missingInTarget.push(documentPath)
    } else if (targetItem.hash !== sourceItem.hash) {
      hashMismatches.push({ path: documentPath, sourceHash: sourceItem.hash, targetHash: targetItem.hash })
    }
  }

  const extraInTarget = []
  for (const documentPath of target.byPath.keys()) {
    if (!source.byPath.has(documentPath)) extraInTarget.push(documentPath)
  }

  const outFile = args.outFile
    ? path.resolve(args.outFile)
    : path.join(path.dirname(targetSnapshotPath), 'lexio-shadow-parity-report.json')

  const report = {
    generatedAt: new Date().toISOString(),
    sourceSnapshotPath,
    targetSnapshotPath,
    options: {
      includeAllUserRoots: args.includeAllUserRoots,
    },
    totals: {
      sourceLexioDocuments: source.byPath.size,
      targetLexioDocuments: target.byPath.size,
      missingInTarget: missingInTarget.length,
      extraInTarget: extraInTarget.length,
      hashMismatches: hashMismatches.length,
    },
    counts: {
      sourceByCollectionGroup: summarizeBy([...source.byPath.values()], item => item.collectionGroup),
      targetByCollectionGroup: summarizeBy([...target.byPath.values()], item => item.collectionGroup),
    },
    missingInTarget,
    extraInTarget,
    hashMismatches,
    migrationReady: missingInTarget.length === 0 && extraInTarget.length === 0 && hashMismatches.length === 0,
    safetyPolicy: {
      cutoverBlockedWhenMigrationReadyFalse: true,
      destructiveOperations: 'forbidden',
    },
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, JSON.stringify(report, null, 2), 'utf8')

  log(`Report: ${outFile}`)
  log(`Source Lexio docs: ${source.byPath.size}; target Lexio docs: ${target.byPath.size}; missing: ${missingInTarget.length}; extra: ${extraInTarget.length}; mismatched: ${hashMismatches.length}`)

  if (args.failOnMismatch && !report.migrationReady) {
    throw new Error('Shadow parity validation failed')
  }
}

main().catch(error => {
  console.error(`[lexio-firestore-validate-shadow] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
