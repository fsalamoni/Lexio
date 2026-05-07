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
  updateDoc,
  where,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore'

import type { ContextDetailData, DocumentData } from '../../firestore-types'

export type CreateDocumentInput = {
  document_type_id: string
  original_request: string
  template_variant?: string | null
  legal_area_ids?: string[] | null
  request_context?: Record<string, unknown> | null
  context_detail?: ContextDetailData | null
}

export type ListDocumentsOptions = {
  status?: string
  document_type_id?: string
  limit?: number
  sortBy?: string
  sortDir?: string
}

export type SaveNotebookDocumentToDocumentsInput = {
  topic: string
  content: string
  notebookId: string
  notebookTitle: string
  llm_executions?: DocumentData['llm_executions']
}

export type DocumentsRepositoryDependencies = {
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
  stripUndefined: <T extends Record<string, unknown>>(value: T) => T
}

function matchesDocumentFilters(docData: DocumentData, opts?: Pick<ListDocumentsOptions, 'status' | 'document_type_id'>) {
  if (opts?.status && docData.status !== opts.status) return false
  if (opts?.document_type_id && docData.document_type_id !== opts.document_type_id) return false
  return true
}

function getDocumentCreatedAtValue(value: unknown) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (typeof value === 'number') return value
  return 0
}

function sortDocuments(items: DocumentData[], sortDir?: string) {
  const direction = sortDir === 'asc' ? 1 : -1
  return [...items].sort((a, b) =>
    (getDocumentCreatedAtValue(a.created_at) - getDocumentCreatedAtValue(b.created_at)) * direction,
  )
}

export function createDocumentsRepository(deps: DocumentsRepositoryDependencies) {
  async function createDocument(uid: string, input: CreateDocumentInput): Promise<DocumentData> {
    const now = new Date().toISOString()
    const docData: Omit<DocumentData, 'id'> = {
      document_type_id: input.document_type_id,
      original_request: input.original_request,
      template_variant: input.template_variant ?? null,
      legal_area_ids: input.legal_area_ids ?? [],
      request_context: input.request_context ?? null,
      context_detail: input.context_detail ?? null,
      tema: null,
      status: 'rascunho',
      quality_score: null,
      texto_completo: null,
      origem: 'web',
      created_at: now,
      updated_at: now,
    }

    return deps.writeUserScoped(uid, 'createDocument', async (db, effectiveUid) => {
      const colRef = collection(db, 'users', effectiveUid, 'documents')
      const ref = await addDoc(colRef, docData)
      return { id: ref.id, ...docData }
    })
  }

  async function getDocument(uid: string, docId: string): Promise<DocumentData | null> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'getDocument')
    const ref = doc(db, 'users', effectiveUid, 'documents', docId)
    const snap = await deps.withFirestoreRetry(() => getDoc(ref), 'getDocument')
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as DocumentData
  }

  async function listDocuments(uid: string, opts?: ListDocumentsOptions): Promise<{ items: DocumentData[]; total: number }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listDocuments')
    const colRef = collection(db, 'users', effectiveUid, 'documents')

    const constraints: QueryConstraint[] = []

    if (opts?.status) {
      constraints.push(where('status', '==', opts.status))
    }
    if (opts?.document_type_id) {
      constraints.push(where('document_type_id', '==', opts.document_type_id))
    }

    constraints.push(orderBy('created_at', opts?.sortDir === 'asc' ? 'asc' : 'desc'))

    if (opts?.limit) {
      constraints.push(limit(opts.limit))
    }

    const q = query(colRef, ...constraints)
    try {
      const snap = await deps.withFirestoreRetry(() => getDocs(q), 'listDocuments.query')
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentData))
      return { items, total: items.length }
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      try {
        console.warn('Firestore document query failed; using client-side fallback:', deps.getErrorMessage(error))
        const fallbackSnap = await deps.withFirestoreRetry(() => getDocs(colRef), 'listDocuments.fallback')
        const filteredItems = sortDocuments(
          fallbackSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as DocumentData))
            .filter(docData => matchesDocumentFilters(docData, opts)),
          opts?.sortDir,
        )
        const limitedItems = opts?.limit ? filteredItems.slice(0, opts?.limit) : filteredItems
        return { items: limitedItems, total: filteredItems.length }
      } catch (fallbackError) {
        console.warn('Firestore document fallback query also failed:', deps.getErrorMessage(fallbackError))
        throw fallbackError
      }
    }
  }

  async function updateDocument(uid: string, docId: string, data: Partial<DocumentData>): Promise<void> {
    await deps.writeUserScoped(uid, 'updateDocument', async (db, effectiveUid) => {
      const ref = doc(db, 'users', effectiveUid, 'documents', docId)
      await updateDoc(ref, { ...data, updated_at: new Date().toISOString() })
    })
  }

  async function deleteDocument(uid: string, docId: string): Promise<void> {
    await deps.writeUserScoped(uid, 'deleteDocument', async (db, effectiveUid) => {
      const ref = doc(db, 'users', effectiveUid, 'documents', docId)
      await deleteDoc(ref)
    })
  }

  async function saveNotebookDocumentToDocuments(
    uid: string,
    input: SaveNotebookDocumentToDocumentsInput,
  ): Promise<DocumentData> {
    const now = new Date().toISOString()
    const docData = deps.stripUndefined({
      document_type_id: 'documento_caderno',
      original_request: input.topic,
      template_variant: null,
      legal_area_ids: [],
      request_context: null,
      context_detail: null,
      tema: input.topic,
      status: 'concluido',
      quality_score: null,
      texto_completo: input.content,
      origem: 'caderno' as const,
      notebook_id: input.notebookId,
      notebook_title: input.notebookTitle,
      llm_executions: input.llm_executions ?? [],
      created_at: now,
      updated_at: now,
    })

    return deps.writeUserScoped(uid, 'saveNotebookDocumentToDocuments', async (db, effectiveUid) => {
      const colRef = collection(db, 'users', effectiveUid, 'documents')
      const ref = await addDoc(colRef, docData)
      return { id: ref.id, ...docData }
    })
  }

  return {
    createDocument,
    getDocument,
    listDocuments,
    updateDocument,
    deleteDocument,
    saveNotebookDocumentToDocuments,
  }
}
