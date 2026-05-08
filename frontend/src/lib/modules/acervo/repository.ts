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

import type { UsageExecutionRecord } from '../../cost-analytics'
import {
  resolveTextContent,
  serializeStructuredJson,
  textToStructuredJson,
} from '../../document-json-converter'
import type { AcervoDocumentData } from '../../firestore-types'

const ACERVO_CHUNK_SIZE = 500
const ACERVO_MAX_EXCERPT_LENGTH = 2000
const ACERVO_MAX_TEXT_LENGTH = 900_000

export type ListAcervoDocumentsOptions = {
  limit?: number
}

export type CreateAcervoDocumentInput = {
  filename: string
  content_type: string
  size_bytes: number
  text_content: string
  pageCount?: number
}

export type AcervoSearchDocument = {
  id: string
  filename: string
  text_content: string
  created_at: string
  ementa?: string
  ementa_keywords?: string[]
  natureza?: AcervoDocumentData['natureza']
  area_direito?: string[]
  assuntos?: string[]
  tipo_documento?: string
  contexto?: string[]
}

export type AcervoAnalysisStatus = {
  analyzed_count: number
  unanalyzed_count: number
  unanalyzed_docs: AcervoDocumentData[]
}

export type AcervoRepositoryDependencies = {
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
}

export function createAcervoRepository(deps: AcervoRepositoryDependencies) {
  async function getIndexedAcervoDocs(
    uid: string,
    contextLabel: string,
  ): Promise<Array<{ id: string; data: AcervoDocumentData }>> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, contextLabel)
    const colRef = collection(db, 'users', effectiveUid, 'acervo')

    try {
      const snapshot = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, where('status', '==', 'indexed'), orderBy('created_at', 'desc'))),
        `${contextLabel}.query`,
      )
      return snapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, data: docSnapshot.data() as AcervoDocumentData }))
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      console.warn('Firestore indexed acervo query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnapshot = await deps.withFirestoreRetry(() => getDocs(colRef), `${contextLabel}.fallback`)
      return fallbackSnapshot.docs
        .map(docSnapshot => ({ id: docSnapshot.id, data: docSnapshot.data() as AcervoDocumentData }))
        .filter(entry => entry.data.status === 'indexed')
        .sort((left, right) => deps.getCreatedAtValue(right.data.created_at) - deps.getCreatedAtValue(left.data.created_at))
    }
  }

  async function listAcervoDocuments(
    uid: string,
    opts: ListAcervoDocumentsOptions = {},
  ): Promise<{ items: AcervoDocumentData[]; total: number }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'listAcervoDocuments')
    const constraints: QueryConstraint[] = [orderBy('created_at', 'desc')]
    if (opts.limit) constraints.push(limit(opts.limit))
    const colRef = collection(db, 'users', effectiveUid, 'acervo')

    try {
      const snapshot = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, ...constraints)),
        'listAcervoDocuments.query',
      )
      const items = snapshot.docs.map(docSnapshot => {
        const raw = docSnapshot.data() as AcervoDocumentData
        return {
          ...raw,
          id: docSnapshot.id,
          text_content: resolveTextContent(raw.text_content || ''),
        }
      })
      return { items, total: items.length }
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      console.warn('Firestore acervo query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnapshot = await deps.withFirestoreRetry(() => getDocs(colRef), 'listAcervoDocuments.fallback')
      let items = fallbackSnapshot.docs.map(docSnapshot => {
        const raw = docSnapshot.data() as AcervoDocumentData
        return {
          ...raw,
          id: docSnapshot.id,
          text_content: resolveTextContent(raw.text_content || ''),
        }
      })
      items = items.sort((left, right) => deps.getCreatedAtValue(right.created_at) - deps.getCreatedAtValue(left.created_at))
      if (opts.limit) items = items.slice(0, opts.limit)
      return { items, total: items.length }
    }
  }

  async function createAcervoDocument(
    uid: string,
    data: CreateAcervoDocumentInput,
  ): Promise<AcervoDocumentData & { truncated?: boolean }> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'createAcervoDocument')
    const now = new Date().toISOString()

    try {
      const existing = await deps.withFirestoreRetry(
        () => getDocs(query(collection(db, 'users', effectiveUid, 'acervo'), where('filename', '==', data.filename))),
        'createAcervoDocument.dedup',
      )
      for (const snapshot of existing.docs) {
        await deps.withFirestoreRetry(() => deleteDoc(snapshot.ref), 'createAcervoDocument.dedupDelete')
      }
    } catch (error) {
      console.warn('Acervo dedup check failed (non-fatal):', error)
    }

    const raw = data.text_content.trim()
    const structured = textToStructuredJson(raw, data.filename, data.pageCount)
    const jsonStr = serializeStructuredJson(structured)
    const truncated = jsonStr.length > ACERVO_MAX_TEXT_LENGTH
    const textToStore = truncated ? jsonStr.slice(0, ACERVO_MAX_TEXT_LENGTH) : jsonStr
    if (truncated) {
      console.warn(
        `Acervo document "${data.filename}" JSON truncated from ${jsonStr.length} to ${ACERVO_MAX_TEXT_LENGTH} chars ` +
        `(original text: ${raw.length} chars, compression: ${(structured.meta.compression_ratio * 100).toFixed(1)}%)`,
      )
    }

    const chunks = structured.full_text.length > 0
      ? Math.ceil(structured.full_text.length / ACERVO_CHUNK_SIZE)
      : 0

    const acervoDoc: Omit<AcervoDocumentData, 'id'> = {
      filename: data.filename,
      content_type: data.content_type,
      size_bytes: data.size_bytes,
      text_content: textToStore,
      chunks_count: chunks,
      status: structured.full_text.length > 0 ? 'indexed' : 'index_empty',
      storage_format: 'json',
      created_at: now,
    }
    const ref = await deps.withFirestoreRetry(
      () => addDoc(collection(db, 'users', effectiveUid, 'acervo'), acervoDoc),
      'createAcervoDocument.write',
    )
    return { id: ref.id, ...acervoDoc, truncated }
  }

  async function deleteAcervoDocument(uid: string, docId: string): Promise<void> {
    await deps.writeUserScoped(uid, 'deleteAcervoDocument', async (db, effectiveUid) => {
      await deleteDoc(doc(db, 'users', effectiveUid, 'acervo', docId))
    })
  }

  async function getAllAcervoDocumentsForSearch(uid: string): Promise<AcervoSearchDocument[]> {
    const docs = await getIndexedAcervoDocs(uid, 'getAllAcervoDocumentsForSearch')
    return docs
      .map(({ id, data }) => {
        return {
          id,
          filename: data.filename,
          text_content: resolveTextContent(data.text_content || ''),
          created_at: data.created_at,
          ementa: data.ementa,
          ementa_keywords: data.ementa_keywords,
          natureza: data.natureza,
          area_direito: data.area_direito,
          assuntos: data.assuntos,
          tipo_documento: data.tipo_documento,
          contexto: data.contexto,
        }
      })
      .filter(document => document.text_content.length > 0)
  }

  async function mergeAcervoExecutions(
    uid: string,
    docId: string,
    executions: UsageExecutionRecord[],
  ): Promise<UsageExecutionRecord[]> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'mergeAcervoExecutions')
    try {
      const existing = await deps.withFirestoreRetry(
        () => getDoc(doc(db, 'users', effectiveUid, 'acervo', docId)),
        'mergeAcervoExecutions',
      )
      const existingExecs = (existing.data()?.llm_executions ?? []) as UsageExecutionRecord[]
      return [...existingExecs, ...executions]
    } catch {
      return executions
    }
  }

  async function updateAcervoEmenta(
    uid: string,
    docId: string,
    ementa: string,
    keywords: string[],
    executions?: UsageExecutionRecord[],
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      ementa,
      ementa_keywords: keywords,
    }
    if (executions && executions.length > 0) {
      updateData.llm_executions = await mergeAcervoExecutions(uid, docId, executions)
    }
    await deps.writeUserScoped(uid, 'updateAcervoEmenta', async (db, effectiveUid) => {
      await updateDoc(doc(db, 'users', effectiveUid, 'acervo', docId), updateData)
    })
  }

  async function updateAcervoTags(
    uid: string,
    docId: string,
    tags: {
      natureza?: AcervoDocumentData['natureza']
      area_direito?: string[]
      assuntos?: string[]
      tipo_documento?: string
      contexto?: string[]
    },
    executions?: UsageExecutionRecord[],
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      ...tags,
      tags_generated: true,
    }
    if (executions && executions.length > 0) {
      updateData.llm_executions = await mergeAcervoExecutions(uid, docId, executions)
    }
    await deps.writeUserScoped(uid, 'updateAcervoTags', async (db, effectiveUid) => {
      await updateDoc(doc(db, 'users', effectiveUid, 'acervo', docId), updateData)
    })
  }

  async function updateAcervoTextContent(
    uid: string,
    docId: string,
    textContent: string,
    filename?: string,
  ): Promise<void> {
    const structured = textToStructuredJson(textContent, filename || 'document')
    const jsonStr = serializeStructuredJson(structured)
    const textToStore = jsonStr.length > ACERVO_MAX_TEXT_LENGTH
      ? jsonStr.slice(0, ACERVO_MAX_TEXT_LENGTH)
      : jsonStr
    await deps.writeUserScoped(uid, 'updateAcervoTextContent', async (db, effectiveUid) => {
      await updateDoc(doc(db, 'users', effectiveUid, 'acervo', docId), {
        text_content: textToStore,
        storage_format: 'json',
        chunks_count: structured.full_text.length > 0
          ? Math.ceil(structured.full_text.length / ACERVO_CHUNK_SIZE)
          : 0,
      })
    })
  }

  async function convertAcervoToJson(
    uid: string,
    docId: string,
    resolvedTextContent: string,
    filename: string,
  ): Promise<void> {
    await updateAcervoTextContent(uid, docId, resolvedTextContent, filename)
  }

  async function getAcervoDocsWithoutTags(
    uid: string,
  ): Promise<Array<{ id: string; filename: string; text_content: string }>> {
    const docs = await getIndexedAcervoDocs(uid, 'getAcervoDocsWithoutTags')
    return docs
      .map(({ id, data }) => {
        return { id, filename: data.filename, text_content: resolveTextContent(data.text_content || ''), tags_generated: data.tags_generated }
      })
      .filter(document => document.text_content.length > 0 && !document.tags_generated)
      .map(({ tags_generated: _tagsGenerated, ...rest }) => rest)
  }

  async function getAcervoDocsWithoutEmenta(
    uid: string,
  ): Promise<Array<{ id: string; filename: string; text_content: string }>> {
    const docs = await getIndexedAcervoDocs(uid, 'getAcervoDocsWithoutEmenta')
    return docs
      .map(({ id, data }) => {
        return { id, filename: data.filename, text_content: resolveTextContent(data.text_content || ''), ementa: data.ementa }
      })
      .filter(document => document.text_content.length > 0 && !document.ementa)
      .map(({ ementa: _ementa, ...rest }) => rest)
  }

  async function getAcervoContext(uid: string, maxChars = 8000): Promise<string> {
    const docs = await getIndexedAcervoDocs(uid, 'getAcervoContext')
    const parts: string[] = []
    let total = 0
    for (const { data } of docs) {
      if (!data.text_content) continue
      const text = resolveTextContent(data.text_content)
      const excerpt = text.slice(0, ACERVO_MAX_EXCERPT_LENGTH)
      if (total + excerpt.length > maxChars) break
      parts.push(`[${data.filename}]\n${excerpt}`)
      total += excerpt.length
    }
    return parts.join('\n\n---\n\n')
  }

  async function markAcervoDocumentsAnalyzed(
    uid: string,
    docIds: string[],
  ): Promise<void> {
    await deps.writeUserScoped(uid, 'markAcervoDocumentsAnalyzed', async (db, effectiveUid) => {
      for (const docId of docIds) {
        try {
          await updateDoc(doc(db, 'users', effectiveUid, 'acervo', docId), {
            analyzed_for_theses: true,
          })
        } catch (error) {
          if (deps.isAuthAccessFirestoreError(error)) throw error
        }
      }
    })
  }

  async function getAcervoAnalysisStatus(uid: string): Promise<AcervoAnalysisStatus> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'getAcervoAnalysisStatus')
    const colRef = collection(db, 'users', effectiveUid, 'acervo')

    let all: AcervoDocumentData[]
    try {
      const snapshot = await deps.withFirestoreRetry(
        () => getDocs(query(colRef, orderBy('created_at', 'desc'))),
        'getAcervoAnalysisStatus.query',
      )
      all = snapshot.docs.map(docSnapshot => {
        const raw = docSnapshot.data() as AcervoDocumentData
        return {
          ...raw,
          id: docSnapshot.id,
          text_content: resolveTextContent(raw.text_content || ''),
        }
      })
    } catch (error) {
      if (deps.isAuthAccessFirestoreError(error)) {
        throw error
      }
      console.warn('Firestore acervo analysis query failed; using client-side fallback:', deps.getErrorMessage(error))
      const fallbackSnapshot = await deps.withFirestoreRetry(() => getDocs(colRef), 'getAcervoAnalysisStatus.fallback')
      all = fallbackSnapshot.docs
        .map(docSnapshot => {
          const raw = docSnapshot.data() as AcervoDocumentData
          return {
            ...raw,
            id: docSnapshot.id,
            text_content: resolveTextContent(raw.text_content || ''),
          }
        })
        .sort((left, right) => deps.getCreatedAtValue(right.created_at) - deps.getCreatedAtValue(left.created_at))
    }

    const analyzed = all.filter(document => document.analyzed_for_theses === true)
    const unanalyzed = all.filter(document => document.analyzed_for_theses !== true && document.status === 'indexed' && document.text_content?.length > 0)
    return {
      analyzed_count: analyzed.length,
      unanalyzed_count: unanalyzed.length,
      unanalyzed_docs: unanalyzed,
    }
  }

  return {
    listAcervoDocuments,
    createAcervoDocument,
    deleteAcervoDocument,
    getAllAcervoDocumentsForSearch,
    updateAcervoEmenta,
    updateAcervoTags,
    updateAcervoTextContent,
    convertAcervoToJson,
    getAcervoDocsWithoutTags,
    getAcervoDocsWithoutEmenta,
    getAcervoContext,
    markAcervoDocumentsAnalyzed,
    getAcervoAnalysisStatus,
  }
}
