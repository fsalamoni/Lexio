import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore'

import type { ThesisAnalysisSessionData, ThesisData } from '../../firestore-types'

export type ListThesesOptions = {
  q?: string
  legalAreaId?: string
  limit?: number
  skip?: number
}

export type ThesisStats = {
  total_theses: number
  by_area: Record<string, number>
  average_quality_score: number | null
  most_used: { id: string; title: string; usage_count: number }[]
}

export type ThesesRepositoryDependencies = {
  ensureFirestore: () => Firestore
  resolveEffectiveUid: (uid: string, contextLabel: string) => Promise<string>
  writeUserScoped: <T>(
    uid: string,
    contextLabel: string,
    operation: (db: Firestore, effectiveUid: string) => Promise<T>,
  ) => Promise<T>
  withFirestoreRetry: <T>(operation: () => Promise<T>, contextLabel: string) => Promise<T>
  isAuthAccessFirestoreError: (error: unknown) => boolean
  getErrorMessage: (error: unknown) => string
  getCreatedAtValue: (value: unknown) => number
  stripUndefined: <T extends Record<string, unknown>>(value: T) => T
}

function sortThesesByCreatedAtDesc(items: ThesisData[]) {
  return items.sort((left, right) => (right.created_at ?? '').localeCompare(left.created_at ?? ''))
}

function filterThesesByText(items: ThesisData[], queryText: string) {
  const normalizedQuery = queryText.toLowerCase()
  return items.filter(thesis =>
    thesis.title.toLowerCase().includes(normalizedQuery) ||
    thesis.content.toLowerCase().includes(normalizedQuery) ||
    (thesis.summary?.toLowerCase().includes(normalizedQuery) ?? false),
  )
}

export function createThesesRepository(deps: ThesesRepositoryDependencies) {
  async function listTheses(
    uid: string,
    opts: ListThesesOptions = {},
  ): Promise<{ items: ThesisData[]; total: number }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listTheses')
    const constraints: QueryConstraint[] = opts.legalAreaId
      ? [where('legal_area_id', '==', opts.legalAreaId)]
      : [orderBy('created_at', 'desc')]
    if (!opts.legalAreaId && opts.limit) constraints.push(limit(opts.limit + (opts.skip ?? 0)))
    const colRef = collection(db, 'users', effectiveUid, 'theses')

    let items: ThesisData[]
    try {
      const snapshot = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, ...constraints)),
        'listTheses.query',
      )
      items = snapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ThesisData))
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      console.warn('Firestore thesis query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnapshot = await deps.withFirestoreRetry(() => getDocs(colRef), 'listTheses.fallback')
      items = fallbackSnapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ThesisData))
    }

    if (opts.legalAreaId) {
      sortThesesByCreatedAtDesc(items)
    }
    if (opts.q) {
      items = filterThesesByText(items, opts.q)
    }
    const total = items.length
    if (opts.skip) items = items.slice(opts.skip)
    if (opts.limit) items = items.slice(0, opts.limit)
    return { items, total }
  }

  async function createThesis(uid: string, data: Partial<ThesisData>): Promise<ThesisData> {
    const now = new Date().toISOString()
    const thesis: Omit<ThesisData, 'id'> = {
      title: data.title || '',
      content: data.content || '',
      summary: data.summary ?? null,
      legal_area_id: data.legal_area_id || 'civil',
      document_type_id: data.document_type_id ?? null,
      tags: data.tags ?? null,
      category: data.category ?? null,
      quality_score: data.quality_score ?? null,
      usage_count: 0,
      source_type: data.source_type || 'manual',
      created_at: now,
      updated_at: now,
    }
    return deps.writeUserScoped(uid, 'createThesis', async (db, effectiveUid) => {
      const ref = await addDoc(collection(db, 'users', effectiveUid, 'theses'), thesis)
      return { id: ref.id, ...thesis }
    })
  }

  async function updateThesis(uid: string, thesisId: string, data: Partial<ThesisData>): Promise<ThesisData> {
    const { id: _id, ...rest } = data
    const updates = { ...rest, updated_at: serverTimestamp() }
    const { db, effectiveUid } = await deps.writeUserScoped(uid, 'updateThesis.write', async (db, effectiveUid) => {
      const ref = doc(db, 'users', effectiveUid, 'theses', thesisId)
      await updateDoc(ref, updates)
      return { db, effectiveUid }
    })
    const ref = doc(db, 'users', effectiveUid, 'theses', thesisId)
    const snapshot = await deps.withFirestoreRetry(() => getDoc(ref), 'updateThesis.read')
    return { id: snapshot.id, ...snapshot.data() } as ThesisData
  }

  async function deleteThesis(uid: string, thesisId: string): Promise<void> {
    await deps.writeUserScoped(uid, 'deleteThesis', async (db, effectiveUid) => {
      await deleteDoc(doc(db, 'users', effectiveUid, 'theses', thesisId))
    })
  }

  async function getThesisStats(uid: string): Promise<ThesisStats> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'getThesisStats')
    const colRef = collection(db, 'users', effectiveUid, 'theses')

    let items: ThesisData[]
    try {
      const snapshot = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, orderBy('created_at', 'desc'))),
        'getThesisStats.query',
      )
      items = snapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ThesisData))
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      console.warn('Firestore thesis stats query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnapshot = await deps.withFirestoreRetry(() => getDocs(colRef), 'getThesisStats.fallback')
      items = sortThesesByCreatedAtDesc(
        fallbackSnapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ThesisData)),
      )
    }

    const by_area: Record<string, number> = {}
    let scoreSum = 0
    let scoreCount = 0
    for (const thesis of items) {
      by_area[thesis.legal_area_id] = (by_area[thesis.legal_area_id] ?? 0) + 1
      if (thesis.quality_score != null) {
        scoreSum += thesis.quality_score
        scoreCount++
      }
    }

    const sorted = [...items].sort((left, right) => (right.usage_count ?? 0) - (left.usage_count ?? 0))
    return {
      total_theses: items.length,
      by_area,
      average_quality_score: scoreCount ? Math.round(scoreSum / scoreCount) : null,
      most_used: sorted.slice(0, 5).map(thesis => ({
        id: thesis.id!,
        title: thesis.title,
        usage_count: thesis.usage_count,
      })),
    }
  }

  async function listThesisAnalysisSessions(uid: string): Promise<ThesisAnalysisSessionData[]> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listThesisAnalysisSessions')
    const colRef = collection(db, 'users', effectiveUid, 'thesis_analysis_sessions')
    try {
      const snapshot = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, orderBy('created_at', 'desc'))),
        'listThesisAnalysisSessions.query',
      )
      return snapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ThesisAnalysisSessionData))
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      console.warn('Firestore thesis analysis query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnapshot = await deps.withFirestoreRetry(
        () => getDocs(colRef),
        'listThesisAnalysisSessions.fallback',
      )
      return fallbackSnapshot.docs
        .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as ThesisAnalysisSessionData))
        .sort((left, right) => deps.getCreatedAtValue(right.created_at) - deps.getCreatedAtValue(left.created_at))
    }
  }

  async function saveThesisAnalysisSession(
    uid: string,
    data: Omit<ThesisAnalysisSessionData, 'id'>,
  ): Promise<string> {
    return deps.writeUserScoped(uid, 'saveThesisAnalysisSession', async (db, effectiveUid) => {
      const ref = await addDoc(collection(db, 'users', effectiveUid, 'thesis_analysis_sessions'), deps.stripUndefined({
        ...data,
        created_at: data.created_at ?? new Date().toISOString(),
      }))
      return ref.id
    })
  }

  async function getLastThesisAnalysisSession(
    uid: string,
  ): Promise<ThesisAnalysisSessionData | null> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'getLastThesisAnalysisSession')
    const colRef = collection(db, 'users', effectiveUid, 'thesis_analysis_sessions')
    try {
      const snapshot = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, orderBy('created_at', 'desc'), limit(1))),
        'getLastThesisAnalysisSession.query',
      )
      if (snapshot.empty) return null
      const docSnapshot = snapshot.docs[0]
      return { id: docSnapshot.id, ...docSnapshot.data() } as ThesisAnalysisSessionData
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      console.warn('Firestore last thesis analysis query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnapshot = await deps.withFirestoreRetry(
        () => getDocs(colRef),
        'getLastThesisAnalysisSession.fallback',
      )
      if (fallbackSnapshot.empty) return null
      const [latest] = fallbackSnapshot.docs.sort((left, right) => {
        return deps.getCreatedAtValue(right.data()?.created_at) - deps.getCreatedAtValue(left.data()?.created_at)
      })
      return latest ? ({ id: latest.id, ...latest.data() } as ThesisAnalysisSessionData) : null
    }
  }

  return {
    listTheses,
    createThesis,
    updateThesis,
    deleteThesis,
    getThesisStats,
    listThesisAnalysisSessions,
    saveThesisAnalysisSession,
    getLastThesisAnalysisSession,
  }
}
