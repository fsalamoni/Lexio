import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  type DocumentSnapshot,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore'

import {
  buildNotebookSearchMemoryDocPath,
  buildResearchNotebookDocPath,
  getRefUserId,
  normalizeFirestoreDocumentId,
} from '../../core/firestore'
import type {
  NotebookJurisprudenceSemanticMemoryEntry,
  NotebookResearchAuditEntry,
  NotebookSavedSearchEntry,
  NotebookSource,
  ResearchNotebookData,
} from '../../firestore-types'

export type NotebookSearchMemoryBackfillReport = {
  scanned: number
  migrated: number
  already_dedicated: number
  empty_legacy: number
  failed: number
  chunks_processed: number
  chunk_size: number
  max_notebooks?: number
  reached_limit: boolean
  dry_run: boolean
}

type NotebookSearchMemoryRetentionMeta = {
  audits_before?: number
  audits_after?: number
  audits_dropped?: number
  saved_searches_before?: number
  saved_searches_after?: number
  saved_searches_dropped?: number
  jurisprudence_semantic_before?: number
  jurisprudence_semantic_after?: number
  jurisprudence_semantic_dropped?: number
  audit_ttl_days: number
  max_audits: number
  max_saved_searches: number
  max_jurisprudence_semantic_entries?: number
  applied_at: string
}

type NotebookSearchMemoryData = {
  research_audits?: NotebookResearchAuditEntry[]
  saved_searches?: NotebookSavedSearchEntry[]
  jurisprudence_semantic_memory?: NotebookJurisprudenceSemanticMemoryEntry[]
  retention?: NotebookSearchMemoryRetentionMeta
  updated_at?: string
  migrated_from_notebook_doc_at?: string
}

export type ResearchNotebookRepositoryDependencies = {
  ensureFirestore: () => Firestore
  resolveEffectiveUid: (uid: string, contextLabel: string) => Promise<string>
  withFirestoreRetry: <T>(operation: () => Promise<T>, contextLabel: string) => Promise<T>
  isAuthAccessFirestoreError: (error: unknown) => boolean
  getErrorMessage: (error: unknown) => string
  getCreatedAtValue: (value: unknown) => number
  stripUndefined: <T extends Record<string, unknown>>(value: T) => T
}

const NOTEBOOK_MAX_DOC_BYTES = 950_000
const MIN_SOURCE_TEXT_CHARS = 100
const NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS = 45
const NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS = 60
const NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES = 120
const NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES = 24

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function getSavedSearchSortMs(item: NotebookSavedSearchEntry): number {
  return parseIsoMs(item.updated_at) ?? parseIsoMs(item.created_at) ?? 0
}

function getJurisprudenceSemanticMemorySortMs(item: NotebookJurisprudenceSemanticMemoryEntry): number {
  return parseIsoMs(item.updated_at) ?? parseIsoMs(item.created_at) ?? 0
}

function estimateJsonBytes(value: unknown): number {
  try {
    const len = JSON.stringify(value).length
    return len + Math.ceil(len * 0.1)
  } catch (error) {
    console.warn('[Lexio] estimateJsonBytes: JSON.stringify failed', error)
    return 0
  }
}

function fitSourcesToFirestoreLimit(
  sources: NotebookSource[],
  otherDataEstimateBytes: number,
): { sources: NotebookSource[]; truncated: boolean } {
  const totalBytes = estimateJsonBytes(sources) + otherDataEstimateBytes
  if (totalBytes <= NOTEBOOK_MAX_DOC_BYTES) return { sources, truncated: false }

  const withoutRaw: NotebookSource[] = sources.map(source => {
    if (source.type !== 'jurisprudencia' || !source.results_raw) return source
    const { results_raw: _dropped, ...rest } = source
    return rest
  })
  if (estimateJsonBytes(withoutRaw) + otherDataEstimateBytes <= NOTEBOOK_MAX_DOC_BYTES) {
    console.warn('[Lexio] Notebook sources: results_raw stripped to fit Firestore 1 MB limit')
    return { sources: withoutRaw, truncated: true }
  }

  const budget = Math.max(NOTEBOOK_MAX_DOC_BYTES - otherDataEstimateBytes, 0)
  const totalTextChars = withoutRaw.reduce((sum, source) => sum + (source.text_content?.length ?? 0), 0)
  if (totalTextChars === 0) return { sources: withoutRaw, truncated: true }

  const metaOverhead = estimateJsonBytes(withoutRaw) - Math.ceil(totalTextChars * 1.1)
  const availableForText = Math.max(budget - metaOverhead, 0)
  const ratio = availableForText / Math.ceil(totalTextChars * 1.1)

  const trimmed: NotebookSource[] = withoutRaw.map(source => {
    const text = source.text_content ?? ''
    if (text.length === 0 || ratio >= 1) return source
    const maxChars = Math.max(Math.floor(text.length * ratio), MIN_SOURCE_TEXT_CHARS)
    if (maxChars >= text.length) return source
    return { ...source, text_content: text.slice(0, maxChars) }
  })

  console.warn(
    `[Lexio] Notebook sources trimmed to fit Firestore 1 MB limit ` +
    `(estimated ${(totalBytes / 1024).toFixed(0)} KiB -> budget ${(NOTEBOOK_MAX_DOC_BYTES / 1024).toFixed(0)} KiB)`,
  )

  return { sources: trimmed, truncated: true }
}

function fitExecutionsToFirestoreLimit(
  executions: NonNullable<ResearchNotebookData['llm_executions']>,
  otherDataEstimateBytes: number,
): { executions: NonNullable<ResearchNotebookData['llm_executions']>; truncated: boolean } {
  const totalBytes = estimateJsonBytes(executions) + otherDataEstimateBytes
  if (totalBytes <= NOTEBOOK_MAX_DOC_BYTES) return { executions, truncated: false }

  const retained = [...executions]
  while (retained.length > 0 && estimateJsonBytes(retained) + otherDataEstimateBytes > NOTEBOOK_MAX_DOC_BYTES) {
    retained.shift()
  }

  if (retained.length < executions.length) {
    console.warn(
      `[Lexio] Notebook llm_executions trimmed to fit Firestore 1 MB limit ` +
      `(removed ${executions.length - retained.length} oldest records; kept ${retained.length}/${executions.length} most recent records).`,
    )
  }

  return { executions: retained, truncated: retained.length < executions.length }
}

function applyNotebookSearchMemoryRetention(
  payload: Partial<NotebookSearchMemoryData>,
): {
  sanitized: Partial<NotebookSearchMemoryData>
  droppedAudits: number
  droppedSavedSearches: number
  droppedSemanticEntries: number
} {
  const nowIso = new Date().toISOString()
  const next: Partial<NotebookSearchMemoryData> = { ...payload }
  let droppedAudits = 0
  let droppedSavedSearches = 0
  let droppedSemanticEntries = 0

  if (payload.research_audits !== undefined) {
    const cutoffMs = Date.now() - NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS * 86_400_000
    const sortedAudits = [...payload.research_audits].sort((left, right) =>
      (parseIsoMs(right.created_at) ?? 0) - (parseIsoMs(left.created_at) ?? 0),
    )
    const ttlFiltered = sortedAudits.filter(audit => {
      const ts = parseIsoMs(audit.created_at)
      return ts !== null && ts >= cutoffMs
    })

    const continuityBase = ttlFiltered.length > 0 ? ttlFiltered : sortedAudits.slice(0, 1)
    const retainedAudits = continuityBase.slice(0, NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS)
    droppedAudits = Math.max(sortedAudits.length - retainedAudits.length, 0)
    next.research_audits = retainedAudits

    next.retention = {
      ...(next.retention || {
        audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
        max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
        max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
        max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
        applied_at: nowIso,
      }),
      audits_before: sortedAudits.length,
      audits_after: retainedAudits.length,
      audits_dropped: droppedAudits,
      audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
      max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
      max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
      max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
      applied_at: nowIso,
    }
  }

  if (payload.saved_searches !== undefined) {
    const sortedSaved = [...payload.saved_searches].sort((left, right) => getSavedSearchSortMs(right) - getSavedSearchSortMs(left))
    const retainedSaved = sortedSaved.slice(0, NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES)
    droppedSavedSearches = Math.max(sortedSaved.length - retainedSaved.length, 0)
    next.saved_searches = retainedSaved

    next.retention = {
      ...(next.retention || {
        audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
        max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
        max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
        max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
        applied_at: nowIso,
      }),
      saved_searches_before: sortedSaved.length,
      saved_searches_after: retainedSaved.length,
      saved_searches_dropped: droppedSavedSearches,
      audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
      max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
      max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
      max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
      applied_at: nowIso,
    }
  }

  if (payload.jurisprudence_semantic_memory !== undefined) {
    const sortedSemanticEntries = [...payload.jurisprudence_semantic_memory]
      .filter(entry => Array.isArray(entry.query_embedding) && entry.query_embedding.length > 0 && Boolean(entry.source_id?.trim()) && Boolean(entry.query?.trim()))
      .sort((left, right) => getJurisprudenceSemanticMemorySortMs(right) - getJurisprudenceSemanticMemorySortMs(left))

    const retainedSemanticEntries = sortedSemanticEntries.slice(0, NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES)
    droppedSemanticEntries = Math.max(sortedSemanticEntries.length - retainedSemanticEntries.length, 0)
    next.jurisprudence_semantic_memory = retainedSemanticEntries

    next.retention = {
      ...(next.retention || {
        audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
        max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
        max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
        max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
        applied_at: nowIso,
      }),
      jurisprudence_semantic_before: sortedSemanticEntries.length,
      jurisprudence_semantic_after: retainedSemanticEntries.length,
      jurisprudence_semantic_dropped: droppedSemanticEntries,
      audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
      max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
      max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
      max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
      applied_at: nowIso,
    }
  }

  return { sanitized: next, droppedAudits, droppedSavedSearches, droppedSemanticEntries }
}

export function createResearchNotebookRepository(deps: ResearchNotebookRepositoryDependencies) {
  function getNotebookSearchMemoryDocRef(uid: string, notebookId: string) {
    const db = deps.ensureFirestore()
    return doc(db, ...buildNotebookSearchMemoryDocPath(uid, notebookId))
  }

  async function getNotebookSearchMemory(uid: string, notebookId: string): Promise<NotebookSearchMemoryData | null> {
    const ref = getNotebookSearchMemoryDocRef(uid, notebookId)
    const snapshot = await deps.withFirestoreRetry(() => getDoc(ref), 'getNotebookSearchMemory')
    if (!snapshot.exists()) return null
    return snapshot.data() as NotebookSearchMemoryData
  }

  async function saveNotebookSearchMemory(
    uid: string,
    notebookId: string,
    payload: Partial<NotebookSearchMemoryData>,
  ): Promise<void> {
    const ref = getNotebookSearchMemoryDocRef(uid, notebookId)
    const { sanitized, droppedAudits, droppedSavedSearches, droppedSemanticEntries } = applyNotebookSearchMemoryRetention(payload)
    await deps.withFirestoreRetry(
      () => setDoc(ref, deps.stripUndefined({ ...sanitized, updated_at: new Date().toISOString() }), { merge: true }),
      'saveNotebookSearchMemory',
    )
    if (droppedAudits > 0 || droppedSavedSearches > 0 || droppedSemanticEntries > 0) {
      console.info(
        `[Lexio] saveNotebookSearchMemory: retention applied for notebook ${normalizeFirestoreDocumentId(notebookId)} ` +
        `(audits dropped: ${droppedAudits}, saved searches dropped: ${droppedSavedSearches}, semantic entries dropped: ${droppedSemanticEntries}).`,
      )
    }
  }

  async function backfillNotebookSearchMemoryAcrossPlatform(opts?: {
    dryRun?: boolean
    maxNotebooks?: number
    chunkSize?: number
  }): Promise<NotebookSearchMemoryBackfillReport> {
    const db = deps.ensureFirestore()
    const dryRun = Boolean(opts?.dryRun)
    const maxNotebooks = opts?.maxNotebooks && opts.maxNotebooks > 0 ? Math.floor(opts.maxNotebooks) : undefined
    const chunkSize = Math.max(50, Math.min(500, Math.floor(opts?.chunkSize ?? 200)))

    const report: NotebookSearchMemoryBackfillReport = {
      scanned: 0,
      migrated: 0,
      already_dedicated: 0,
      empty_legacy: 0,
      failed: 0,
      chunks_processed: 0,
      chunk_size: chunkSize,
      max_notebooks: maxNotebooks,
      reached_limit: false,
      dry_run: dryRun,
    }

    let cursor: DocumentSnapshot | null = null

    while (true) {
      const remaining = maxNotebooks ? maxNotebooks - report.scanned : chunkSize
      if (maxNotebooks && remaining <= 0) {
        report.reached_limit = true
        break
      }

      const pageLimit = Math.max(1, Math.min(chunkSize, remaining))
      const constraints: QueryConstraint[] = [orderBy('created_at', 'desc'), limit(pageLimit)]
      if (cursor) constraints.push(startAfter(cursor))

      const notebooksSnapshot = await deps.withFirestoreRetry(
        () => getDocs(query(collectionGroup(db, 'research_notebooks'), ...constraints)),
        'backfillNotebookSearchMemoryAcrossPlatform.notebooks',
      )
      if (notebooksSnapshot.empty) break

      report.chunks_processed += 1
      cursor = notebooksSnapshot.docs[notebooksSnapshot.docs.length - 1]

      for (const notebookDoc of notebooksSnapshot.docs) {
        if (maxNotebooks && report.scanned >= maxNotebooks) {
          report.reached_limit = true
          break
        }

        report.scanned += 1

        try {
          const uid = getRefUserId(notebookDoc.ref.path)
          if (!uid) {
            report.failed += 1
            continue
          }

          const memorySnapshot = await deps.withFirestoreRetry(
            () => getDoc(getNotebookSearchMemoryDocRef(uid, notebookDoc.id)),
            `backfillNotebookSearchMemoryAcrossPlatform.memory.${notebookDoc.id}`,
          )
          if (memorySnapshot.exists()) {
            report.already_dedicated += 1
            continue
          }

          const notebook = notebookDoc.data() as ResearchNotebookData
          const legacyAudits = Array.isArray(notebook.research_audits) ? notebook.research_audits : []
          const legacySavedSearches = Array.isArray(notebook.saved_searches) ? notebook.saved_searches : []
          const legacySemanticMemory = Array.isArray(notebook.jurisprudence_semantic_memory) ? notebook.jurisprudence_semantic_memory : []

          if (legacyAudits.length === 0 && legacySavedSearches.length === 0 && legacySemanticMemory.length === 0) {
            report.empty_legacy += 1
            continue
          }

          if (!dryRun) {
            await saveNotebookSearchMemory(uid, notebookDoc.id, {
              research_audits: legacyAudits,
              saved_searches: legacySavedSearches,
              jurisprudence_semantic_memory: legacySemanticMemory,
              migrated_from_notebook_doc_at: new Date().toISOString(),
            })
          }

          report.migrated += 1
        } catch (error) {
          report.failed += 1
          console.warn('[Lexio] backfillNotebookSearchMemoryAcrossPlatform: failed for notebook', notebookDoc.id, error)
        }
      }

      if (maxNotebooks && report.scanned >= maxNotebooks) {
        report.reached_limit = true
        break
      }
    }

    return report
  }

  async function listResearchNotebooks(uid: string): Promise<{ items: ResearchNotebookData[] }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listResearchNotebooks')
    const colRef = collection(db, 'users', effectiveUid, 'research_notebooks')
    try {
      const snapshot = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, orderBy('created_at', 'desc'))),
        'listResearchNotebooks.query',
      )
      return { items: snapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ResearchNotebookData)) }
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      console.warn('Firestore notebook query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnapshot = await deps.withFirestoreRetry(() => getDocs(colRef), 'listResearchNotebooks.fallback')
      const items = fallbackSnapshot.docs
        .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ResearchNotebookData))
        .sort((left, right) => deps.getCreatedAtValue(right.created_at) - deps.getCreatedAtValue(left.created_at))
      return { items }
    }
  }

  async function getResearchNotebook(uid: string, notebookId: string): Promise<ResearchNotebookData | null> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'getResearchNotebook')
    const ref = doc(db, ...buildResearchNotebookDocPath(effectiveUid, notebookId))
    const snapshot = await deps.withFirestoreRetry(() => getDoc(ref), 'getResearchNotebook')
    if (!snapshot.exists()) return null
    const notebook = { id: snapshot.id, ...snapshot.data() } as ResearchNotebookData

    try {
      const memory = await getNotebookSearchMemory(effectiveUid, snapshot.id)
      if (memory) {
        return {
          ...notebook,
          research_audits: memory.research_audits ?? notebook.research_audits,
          saved_searches: memory.saved_searches ?? notebook.saved_searches,
          jurisprudence_semantic_memory: memory.jurisprudence_semantic_memory ?? notebook.jurisprudence_semantic_memory,
        }
      }

      if ((notebook.research_audits && notebook.research_audits.length > 0)
        || (notebook.saved_searches && notebook.saved_searches.length > 0)
        || (notebook.jurisprudence_semantic_memory && notebook.jurisprudence_semantic_memory.length > 0)) {
        await saveNotebookSearchMemory(effectiveUid, snapshot.id, {
          research_audits: notebook.research_audits ?? [],
          saved_searches: notebook.saved_searches ?? [],
          jurisprudence_semantic_memory: notebook.jurisprudence_semantic_memory ?? [],
          migrated_from_notebook_doc_at: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.warn('[Lexio] getResearchNotebook: dedicated search memory unavailable, using notebook document fields.', error)
    }

    return notebook
  }

  async function createResearchNotebook(
    uid: string,
    data: Omit<ResearchNotebookData, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'createResearchNotebook')
    const now = new Date().toISOString()

    const baseMeta = deps.stripUndefined({
      title: data.title,
      topic: data.topic,
      description: data.description ?? '',
      sources: [] as NotebookSource[],
      messages: data.messages ?? [],
      artifacts: data.artifacts ?? [],
      research_audits: data.research_audits ?? [],
      saved_searches: data.saved_searches ?? [],
      jurisprudence_semantic_memory: data.jurisprudence_semantic_memory ?? [],
      status: data.status ?? 'active',
      llm_executions: data.llm_executions ?? [],
      created_at: now,
      updated_at: now,
    })
    const otherBytes = estimateJsonBytes(baseMeta)
    const { sources } = fitSourcesToFirestoreLimit(data.sources ?? [], otherBytes)

    const withSources = { ...baseMeta, sources }
    const { executions: llm_executions } = fitExecutionsToFirestoreLimit(
      withSources.llm_executions ?? [],
      estimateJsonBytes({ ...withSources, llm_executions: [] }),
    )
    const sanitized = { ...withSources, llm_executions }
    const docRef = await deps.withFirestoreRetry(
      () => addDoc(collection(db, 'users', effectiveUid, 'research_notebooks'), sanitized),
      'createResearchNotebook.write',
    )

    try {
      await saveNotebookSearchMemory(effectiveUid, docRef.id, {
        research_audits: sanitized.research_audits,
        saved_searches: sanitized.saved_searches,
        jurisprudence_semantic_memory: sanitized.jurisprudence_semantic_memory,
        migrated_from_notebook_doc_at: now,
      })
    } catch (error) {
      console.warn('[Lexio] createResearchNotebook: failed to seed dedicated search memory store.', error)
    }

    return docRef.id
  }

  async function updateResearchNotebook(
    uid: string,
    notebookId: string,
    data: Partial<ResearchNotebookData>,
  ): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'updateResearchNotebook')
    const ref = doc(db, ...buildResearchNotebookDocPath(effectiveUid, notebookId))
    const { id: _id, ...rest } = data
    const shouldSyncSearchMemory = rest.research_audits !== undefined || rest.saved_searches !== undefined || rest.jurisprudence_semantic_memory !== undefined
    const rootPayload = shouldSyncSearchMemory
      ? {
          ...rest,
          ...(rest.research_audits !== undefined ? { research_audits: [] as NotebookResearchAuditEntry[] } : {}),
          ...(rest.saved_searches !== undefined ? { saved_searches: [] as NotebookSavedSearchEntry[] } : {}),
          ...(rest.jurisprudence_semantic_memory !== undefined ? { jurisprudence_semantic_memory: [] as NotebookJurisprudenceSemanticMemoryEntry[] } : {}),
        }
      : rest

    if (rootPayload.sources || rootPayload.llm_executions) {
      const snapshot = await deps.withFirestoreRetry(() => getDoc(ref), 'updateResearchNotebook.read')
      const existing = snapshot.exists() ? snapshot.data() : {}
      const now = new Date().toISOString()
      let fittedPayload = deps.stripUndefined({ ...rootPayload })

      if (rootPayload.sources) {
        const merged = { ...existing, ...fittedPayload, updated_at: now }
        const { sources: _sources, ...mergedMeta } = merged
        const { sources } = fitSourcesToFirestoreLimit(rootPayload.sources, estimateJsonBytes(mergedMeta))
        fittedPayload = { ...fittedPayload, sources }
      }

      if (rootPayload.llm_executions) {
        const merged = { ...existing, ...fittedPayload, updated_at: now }
        const { llm_executions: _llmExecutions, ...mergedMeta } = merged
        const { executions } = fitExecutionsToFirestoreLimit(rootPayload.llm_executions, estimateJsonBytes(mergedMeta))
        fittedPayload = { ...fittedPayload, llm_executions: executions }
      }

      const sanitized = deps.stripUndefined({ ...fittedPayload, updated_at: now })
      await deps.withFirestoreRetry(() => updateDoc(ref, sanitized), 'updateResearchNotebook.updateWithFittedPayload')
    } else {
      const sanitized = deps.stripUndefined({ ...rootPayload, updated_at: new Date().toISOString() })
      await deps.withFirestoreRetry(() => updateDoc(ref, sanitized), 'updateResearchNotebook.update')
    }

    if (shouldSyncSearchMemory) {
      try {
        await saveNotebookSearchMemory(effectiveUid, normalizeFirestoreDocumentId(notebookId), {
          ...(rest.research_audits !== undefined ? { research_audits: rest.research_audits } : {}),
          ...(rest.saved_searches !== undefined ? { saved_searches: rest.saved_searches } : {}),
          ...(rest.jurisprudence_semantic_memory !== undefined ? { jurisprudence_semantic_memory: rest.jurisprudence_semantic_memory } : {}),
        })
      } catch (error) {
        console.warn('[Lexio] updateResearchNotebook: failed to sync dedicated search memory store.', error)
      }
    }
  }

  async function deleteResearchNotebook(uid: string, notebookId: string): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'deleteResearchNotebook')
    const normalizedNotebookId = normalizeFirestoreDocumentId(notebookId)
    await deps.withFirestoreRetry(
      () => deleteDoc(doc(db, 'users', effectiveUid, 'research_notebooks', normalizedNotebookId)),
      'deleteResearchNotebook',
    )
    try {
      await deps.withFirestoreRetry(
        () => deleteDoc(getNotebookSearchMemoryDocRef(effectiveUid, normalizedNotebookId)),
        'deleteResearchNotebook.memory',
      )
    } catch {
      // Ignore missing/forbidden dedicated memory doc; notebook deletion is the source of truth.
    }
  }

  return {
    backfillNotebookSearchMemoryAcrossPlatform,
    listResearchNotebooks,
    getResearchNotebook,
    createResearchNotebook,
    updateResearchNotebook,
    deleteResearchNotebook,
  }
}
