import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore'

import { normalizeFirestoreDocumentId } from '../../core/firestore'
import type { DesignStudioSessionData } from '../../firestore-types'

export type DesignStudioRepositoryDependencies = {
  ensureFirestore: () => Firestore
  resolveEffectiveUid: (uid: string, contextLabel: string) => Promise<string>
  withFirestoreRetry: <T>(operation: () => Promise<T>, contextLabel: string) => Promise<T>
  isAuthAccessFirestoreError: (error: unknown) => boolean
  getErrorMessage: (error: unknown) => string
  getCreatedAtValue: (value: unknown) => number
  stripUndefined: <T extends Record<string, unknown>>(value: T) => T
}

const DESIGN_STUDIO_SESSIONS_COLLECTION = 'design_studio_sessions'

function sessionsCollection(db: Firestore, uid: string) {
  return collection(db, 'users', uid, DESIGN_STUDIO_SESSIONS_COLLECTION)
}

function sessionDoc(db: Firestore, uid: string, sessionId: string) {
  return doc(db, 'users', uid, DESIGN_STUDIO_SESSIONS_COLLECTION, normalizeFirestoreDocumentId(sessionId))
}

export function createDesignStudioRepository(deps: DesignStudioRepositoryDependencies) {
  async function listDesignStudioSessions(
    uid: string,
    opts?: { startAfter?: string; limit?: number },
  ): Promise<{ items: DesignStudioSessionData[]; hasMore?: boolean }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listDesignStudioSessions')
    const colRef = sessionsCollection(db, effectiveUid)
    const pageLimit = Math.max(1, Math.min(50, opts?.limit ?? 50))
    const constraints: QueryConstraint[] = [orderBy('updated_at', 'desc'), limit(pageLimit + 1)]
    if (opts?.startAfter) {
      const cursorRef = sessionDoc(db, effectiveUid, opts.startAfter)
      const cursorSnap = await deps.withFirestoreRetry(() => getDoc(cursorRef), 'listDesignStudioSessions.cursor')
      if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap))
    }
    try {
      const snap = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, ...constraints)),
        'listDesignStudioSessions.query',
      )
      const docs = snap.docs
      const hasMore = docs.length > pageLimit
      const visible = docs.filter((snapshot) => !snapshot.data().deleted_at)
      const items = visible.slice(0, pageLimit).map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as DesignStudioSessionData))
      return { items, hasMore }
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) throw error
      console.warn('Firestore design studio sessions query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnap = await deps.withFirestoreRetry(() => getDocs(colRef), 'listDesignStudioSessions.fallback')
      const allItems = fallbackSnap.docs
        .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as DesignStudioSessionData))
        .filter((item) => !item.deleted_at)
        .sort((left, right) => deps.getCreatedAtValue(right.updated_at ?? right.created_at) - deps.getCreatedAtValue(left.updated_at ?? left.created_at))
      return { items: allItems.slice(0, pageLimit), hasMore: allItems.length > pageLimit }
    }
  }

  async function getDesignStudioSession(uid: string, sessionId: string): Promise<DesignStudioSessionData | null> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'getDesignStudioSession')
    const snap = await deps.withFirestoreRetry(() => getDoc(sessionDoc(db, effectiveUid, sessionId)), 'getDesignStudioSession')
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as DesignStudioSessionData
  }

  async function createDesignStudioSession(
    uid: string,
    data: Omit<DesignStudioSessionData, 'id' | 'created_at' | 'updated_at'> & { created_at?: string },
  ): Promise<string> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'createDesignStudioSession')
    const now = new Date().toISOString()
    const sanitized = deps.stripUndefined({
      ...data,
      title: data.title?.trim() || 'Nova sessão',
      status: data.status ?? 'active',
      files: data.files ?? [],
      messages: data.messages ?? [],
      created_at: data.created_at ?? now,
      updated_at: now,
    })
    const ref = await deps.withFirestoreRetry(() => addDoc(sessionsCollection(db, effectiveUid), sanitized), 'createDesignStudioSession.write')
    return ref.id
  }

  async function updateDesignStudioSession(
    uid: string,
    sessionId: string,
    patch: Partial<DesignStudioSessionData>,
  ): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'updateDesignStudioSession')
    const { id, created_at, ...rest } = patch
    void id
    void created_at
    const sanitized = deps.stripUndefined({ ...rest, updated_at: new Date().toISOString() })
    await deps.withFirestoreRetry(
      () => setDoc(sessionDoc(db, effectiveUid, sessionId), sanitized, { merge: true }),
      'updateDesignStudioSession.update',
    )
  }

  async function renameDesignStudioSession(uid: string, sessionId: string, title: string): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'renameDesignStudioSession')
    await deps.withFirestoreRetry(
      () => updateDoc(sessionDoc(db, effectiveUid, sessionId), { title: title.trim() || 'Nova sessão', updated_at: new Date().toISOString() }),
      'renameDesignStudioSession.update',
    )
  }

  async function deleteDesignStudioSession(uid: string, sessionId: string): Promise<void> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'deleteDesignStudioSession')
    const now = new Date().toISOString()
    await deps.withFirestoreRetry(
      () => setDoc(sessionDoc(db, effectiveUid, sessionId), { deleted_at: now, updated_at: now }, { merge: true }),
      'deleteDesignStudioSession.archive',
    )
  }

  return {
    listDesignStudioSessions,
    getDesignStudioSession,
    createDesignStudioSession,
    updateDesignStudioSession,
    renameDesignStudioSession,
    deleteDesignStudioSession,
  }
}
