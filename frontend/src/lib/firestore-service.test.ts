/**
 * firestore-service.test.ts — Unit tests for saveNotebookDocumentToDocuments.
 *
 * Mocks the Firebase SDK and the local firebase module so that we can test
 * the function in isolation without a real Firestore connection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock firebase/firestore SDK ─────────────────────────────────────────────

const mockAddDoc = vi.fn()
const mockCollection = vi.fn()
const mockDoc = vi.fn()
const mockGetDoc = vi.fn()
const mockUpdateDoc = vi.fn()

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: vi.fn(),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(),
}))

// ── Mock local firebase module ──────────────────────────────────────────────

vi.mock('./firebase', () => ({
  firestore: { _fake: true },   // truthy object to pass ensureFirestore()
  IS_FIREBASE: true,
}))

// ── Mock classification-data (imported by firestore-service at module level) ─

vi.mock('./classification-data', () => ({
  CLASSIFICATION_TIPOS: {},
  DEFAULT_AREA_ASSUNTOS: {},
}))

vi.mock('./document-structures', () => ({
  DEFAULT_DOC_STRUCTURES: {},
}))

vi.mock('./document-json-converter', () => ({
  textToStructuredJson: vi.fn(),
  serializeStructuredJson: vi.fn(),
  resolveTextContent: vi.fn((t: string) => t),
  getStructuredSections: vi.fn(() => []),
  getStructuredMeta: vi.fn(() => null),
}))

// ── Import under test (AFTER mocks are registered) ──────────────────────────

import {
  getResearchNotebook,
  saveNotebookDocumentToDocuments,
  updateResearchNotebook,
} from './firestore-service'

// ── Tests ───────────────────────────────────────────────────────────────────

describe('saveNotebookDocumentToDocuments', () => {
  const uid = 'user-123'
  const input = {
    topic: 'Responsabilidade civil por dano moral',
    content: '# Parecer\n\nTexto do parecer completo...',
    notebookId: 'nb-abc',
    notebookTitle: 'Caderno Dano Moral',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCollection.mockReturnValue('col-ref')
    mockAddDoc.mockResolvedValue({ id: 'new-doc-id' })
    mockDoc.mockImplementation((...segments: unknown[]) => ({ path: segments.join('/') }))
    mockGetDoc.mockResolvedValue({ exists: () => true, id: 'nb-abc', data: () => ({ title: 'Notebook' }) })
    mockUpdateDoc.mockResolvedValue(undefined)
  })

  it('creates a document in the correct Firestore collection path', async () => {
    await saveNotebookDocumentToDocuments(uid, input)

    expect(mockCollection).toHaveBeenCalledWith(
      { _fake: true },            // ensureFirestore() returns the mock db
      'users', uid, 'documents',
    )
    expect(mockAddDoc).toHaveBeenCalledOnce()
    expect(mockAddDoc).toHaveBeenCalledWith('col-ref', expect.any(Object))
  })

  it('persists expected fields with correct values', async () => {
    await saveNotebookDocumentToDocuments(uid, input)

    const docData = mockAddDoc.mock.calls[0][1]
    expect(docData.document_type_id).toBe('documento_caderno')
    expect(docData.original_request).toBe(input.topic)
    expect(docData.tema).toBe(input.topic)
    expect(docData.texto_completo).toBe(input.content)
    expect(docData.origem).toBe('caderno')
    expect(docData.notebook_id).toBe(input.notebookId)
    expect(docData.notebook_title).toBe(input.notebookTitle)
    expect(docData.status).toBe('concluido')
    expect(docData.llm_executions).toEqual([])
  })

  it('returns DocumentData with id from Firestore', async () => {
    const result = await saveNotebookDocumentToDocuments(uid, input)

    expect(result.id).toBe('new-doc-id')
    expect(result.tema).toBe(input.topic)
    expect(result.origem).toBe('caderno')
    expect(result.notebook_id).toBe(input.notebookId)
  })

  it('includes llm_executions when provided', async () => {
    const executions = [
      { agent_name: 'pesquisador', phase: 'research', model: 'gpt-4o', tokens_in: 100, tokens_out: 50, cost_usd: 0.001, duration_ms: 500, created_at: '2026-01-01' },
    ]
    await saveNotebookDocumentToDocuments(uid, {
      ...input,
      llm_executions: executions as never,
    })

    const docData = mockAddDoc.mock.calls[0][1]
    expect(docData.llm_executions).toEqual(executions)
  })

  it('sets created_at and updated_at as ISO strings', async () => {
    const before = new Date().toISOString()
    await saveNotebookDocumentToDocuments(uid, input)
    const after = new Date().toISOString()

    const docData = mockAddDoc.mock.calls[0][1]
    expect(docData.created_at >= before).toBe(true)
    expect(docData.created_at <= after).toBe(true)
    expect(docData.updated_at).toBe(docData.created_at)
  })

  it('does not include undefined values in the document data', async () => {
    await saveNotebookDocumentToDocuments(uid, input)

    const docData = mockAddDoc.mock.calls[0][1]
    // stripUndefined should remove any key with value `undefined`
    const values = Object.values(docData)
    expect(values.every(v => v !== undefined)).toBe(true)
  })

  it('normalizes a full Firestore resource path when reading a notebook', async () => {
    await getResearchNotebook(uid, 'projects/hocapp-44760/databases/(default)/documents/users/user-123/research_notebooks/nb-xyz')

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'research_notebooks', 'nb-xyz',
    )
    expect(mockGetDoc).toHaveBeenCalledOnce()
  })

  it('normalizes a slash-delimited notebook path when updating a notebook', async () => {
    await updateResearchNotebook(uid, 'users/user-123/research_notebooks/nb-xyz', { title: 'Atualizado' })

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'research_notebooks', 'nb-xyz',
    )
    expect(mockUpdateDoc).toHaveBeenCalledOnce()
  })
})
