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
const mockGetDocs = vi.fn()
const mockQuery = vi.fn()
const mockOrderBy = vi.fn()
const mockLimit = vi.fn()
const mockSetDoc = vi.fn()
const mockServerTimestamp = vi.fn()
const mockUpdateDoc = vi.fn()
const mockEmitFirestoreAuthSessionInvalid = vi.fn()
const mockEmitFirestoreAuthAccessDegraded = vi.fn()

const {
  mockGetIdToken,
  mockOnAuthStateChanged,
  mockFirebaseAuth,
} = vi.hoisted(() => {
  const hoistedGetIdToken = vi.fn()
  const hoistedOnAuthStateChanged = vi.fn()
  const hoistedFirebaseAuth: {
    currentUser: {
      uid: string
      getIdToken: (...args: unknown[]) => unknown
    } | null
  } = {
    currentUser: {
      uid: 'user-123',
      getIdToken: (...args: unknown[]) => hoistedGetIdToken(...args),
    },
  }

  return {
    mockGetIdToken: hoistedGetIdToken,
    mockOnAuthStateChanged: hoistedOnAuthStateChanged,
    mockFirebaseAuth: hoistedFirebaseAuth,
  }
})

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: vi.fn(),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  where: vi.fn(),
  serverTimestamp: (...args: unknown[]) => mockServerTimestamp(...args),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}))

// ── Mock local firebase module ──────────────────────────────────────────────

vi.mock('./firebase', () => ({
  firestore: { _fake: true },   // truthy object to pass ensureFirestore()
  firebaseAuth: mockFirebaseAuth,
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

vi.mock('./auth-session-events', () => ({
  emitFirestoreAuthSessionInvalid: (...args: unknown[]) => mockEmitFirestoreAuthSessionInvalid(...args),
  emitFirestoreAuthAccessDegraded: (...args: unknown[]) => mockEmitFirestoreAuthAccessDegraded(...args),
}))

// ── Import under test (AFTER mocks are registered) ──────────────────────────

import {
  __resetFirebaseTokenRefreshGuardsForTests,
} from './firebase-auth-errors'

import {
  __resetFirestoreAuthCircuitForTests,
  getUserSettings,
  getResearchNotebook,
  listDocuments,
  sanitizeAdminDocumentTypes,
  sanitizeAdminLegalAreas,
  saveUserSettings,
  saveNotebookDocumentToDocuments,
  listTheses,
  listThesisAnalysisSessions,
  getAcervoDocsWithoutTags,
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
    __resetFirebaseTokenRefreshGuardsForTests()
    __resetFirestoreAuthCircuitForTests()
    mockGetIdToken.mockResolvedValue('token')
    mockFirebaseAuth.currentUser = {
      uid,
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: unknown) => void) => {
      callback(mockFirebaseAuth.currentUser)
      return () => undefined
    })
    mockCollection.mockReturnValue('col-ref')
    mockAddDoc.mockResolvedValue({ id: 'new-doc-id' })
    mockDoc.mockImplementation((...segments: unknown[]) => {
      const pathSegments = typeof segments[0] === 'object' ? segments.slice(1) : segments
      return { path: pathSegments.join('/') }
    })
    mockGetDoc.mockResolvedValue({ exists: () => true, id: 'nb-abc', data: () => ({ title: 'Notebook' }) })
    mockGetDocs.mockResolvedValue({ docs: [], empty: true })
    mockOrderBy.mockImplementation((...args: unknown[]) => ({ orderBy: args }))
    mockLimit.mockImplementation((value: unknown) => ({ limit: value }))
    mockQuery.mockImplementation((...args: unknown[]) => ({ query: args }))
    mockSetDoc.mockResolvedValue(undefined)
    mockServerTimestamp.mockReturnValue('__server_timestamp__')
    mockUpdateDoc.mockResolvedValue(undefined)
    mockEmitFirestoreAuthSessionInvalid.mockReset()
    mockEmitFirestoreAuthAccessDegraded.mockReset()
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
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, id: 'nb-xyz', data: () => ({ title: 'Notebook' }) })
      .mockResolvedValueOnce({ exists: () => false, id: 'search_memory', data: () => ({}) })

    await getResearchNotebook(uid, 'projects/hocapp-44760/databases/(default)/documents/users/user-123/research_notebooks/nb-xyz')

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'research_notebooks', 'nb-xyz',
    )
    // getResearchNotebook now performs a second read for dedicated search memory.
    expect(mockGetDoc).toHaveBeenCalledTimes(2)
    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'research_notebooks', 'nb-xyz', 'memory', 'search_memory',
    )
  })

  it('normalizes a slash-delimited notebook path when updating a notebook', async () => {
    await updateResearchNotebook(uid, 'users/user-123/research_notebooks/nb-xyz', { title: 'Atualizado' })

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'research_notebooks', 'nb-xyz',
    )
    expect(mockUpdateDoc).toHaveBeenCalledOnce()
  })

  it('loads user settings from the preferences document', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ last_jurisprudence_tribunal_aliases: ['trf1', 'tjrs'] }),
    })

    const result = await getUserSettings(uid)

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'settings', 'preferences',
    )
    expect(result.last_jurisprudence_tribunal_aliases).toEqual(['trf1', 'tjrs'])
  })

  it('prefers authenticated uid when requested uid is stale', async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'auth-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ platform_skin: 'teal' }),
    })

    await getUserSettings(uid)

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'auth-456', 'settings', 'preferences',
    )
  })

  it('fails fast with unauthenticated code when firebase session is missing', async () => {
    mockFirebaseAuth.currentUser = null
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: unknown) => void) => {
      callback(null)
      return () => undefined
    })

    await expect(getUserSettings(uid)).rejects.toMatchObject({
      message: 'Sessão do Firebase não sincronizada. Faça login novamente.',
      code: 'firestore/unauthenticated',
    })
  })

  it('uses authenticated uid when listing thesis analysis sessions', async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'auth-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'sess-1', data: () => ({ created_at: '2026-01-01T00:00:00.000Z', summary: 'ok' }) },
      ],
      empty: false,
    })

    const sessions = await listThesisAnalysisSessions(uid)

    expect(mockCollection).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'auth-456', 'thesis_analysis_sessions',
    )
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('sess-1')
  })

  it('fails fast for thesis sessions when firebase session is missing', async () => {
    mockFirebaseAuth.currentUser = null
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: unknown) => void) => {
      callback(null)
      return () => undefined
    })

    await expect(listThesisAnalysisSessions(uid)).rejects.toMatchObject({
      message: 'Sessão do Firebase não sincronizada. Faça login novamente.',
      code: 'firestore/unauthenticated',
    })
  })

  it('uses authenticated uid when listing theses', async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'auth-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'thesis-1', data: () => ({ title: 'Tese', content: 'Conteudo', legal_area_id: 'civil', usage_count: 0, created_at: '2026-01-01T00:00:00.000Z' }) },
      ],
      empty: false,
    })

    await listTheses(uid)

    expect(mockCollection).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'auth-456', 'theses',
    )
  })

  it('uses authenticated uid when loading indexed acervo docs without tags', async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'auth-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'acervo-1',
          data: () => ({
            filename: 'doc.pdf',
            status: 'indexed',
            text_content: 'texto',
            created_at: '2026-01-01T00:00:00.000Z',
            tags_generated: false,
          }),
        },
      ],
      empty: false,
    })

    const docs = await getAcervoDocsWithoutTags(uid)

    expect(mockCollection).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'auth-456', 'acervo',
    )
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe('acervo-1')
  })

  it('retries listDocuments after permission-denied and recovers on token refresh', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDocs
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'doc-1',
            data: () => ({
              document_type_id: 'parecer',
              tema: 'Tema',
              status: 'concluido',
              quality_score: 90,
              created_at: '2026-01-01T00:00:00.000Z',
              origem: 'web',
            }),
          },
        ],
        empty: false,
      })

    const result = await listDocuments(uid)

    expect(mockGetDocs).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('doc-1')
  })

  it('surfaces the original Firestore error when token refresh keeps failing', async () => {
    // Critical contract: even if the token refresh is unable to mint a fresh
    // credential, the retry layer must NEVER synthesize an
    // `auth-session-invalid` error. Doing so previously triggered AuthContext
    // to log the user out automatically — the exact symptom the user reported.
    // We surface the original permission-denied so the caller can show a
    // soft retry UI; the live Firebase Auth session is preserved.
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })
    const refreshError = Object.assign(new Error('Firebase: Error (auth/invalid-user-token).'), {
      code: 'auth/invalid-user-token',
    })

    mockGetDocs.mockRejectedValue(permissionError)
    mockGetIdToken.mockRejectedValue(refreshError)

    await expect(listDocuments(uid)).rejects.toMatchObject({
      code: 'firestore/permission-denied',
    })

    expect(mockEmitFirestoreAuthSessionInvalid).not.toHaveBeenCalled()
    expect(mockEmitFirestoreAuthAccessDegraded).not.toHaveBeenCalled()
  }, 10_000)

  it('keeps retrying with exponential backoff until permission-denied resolves', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDocs
      .mockRejectedValueOnce(permissionError)
      .mockRejectedValueOnce(permissionError)
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce({ docs: [], empty: true })

    const result = await listDocuments(uid)

    // Up to 4 attempts (1 initial + 3 retries) before giving up.
    expect(mockGetDocs).toHaveBeenCalledTimes(4)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
    expect(result.items).toEqual([])
  }, 10_000)

  it('does not run fallback query when listDocuments auth permission-denied persists', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDocs
      .mockRejectedValueOnce(permissionError)
      .mockRejectedValueOnce(permissionError)
      .mockRejectedValueOnce(permissionError)
      .mockRejectedValueOnce(permissionError)

    await expect(listDocuments(uid)).rejects.toMatchObject({
      code: 'firestore/permission-denied',
    })

    // Four attempts (initial + 3 retries). No fallback query should be issued for auth errors.
    expect(mockGetDocs).toHaveBeenCalledTimes(4)
  }, 10_000)

  it('never escalates persistent permission-denied bursts into a session-invalid signal', async () => {
    // CRITICAL contract: bursts of permission-denied across multiple contexts
    // are NOT interpreted as "session is dead". The previous behavior opened
    // a global circuit breaker after a few consecutive failures and emitted
    // `auth-session-invalid`, which AuthContext then turned into an automatic
    // logout. That logic is what was bouncing live users to /login mid-flow.
    // Each call must fail independently with its original error, leaving the
    // session intact so the user can retry without re-authenticating.
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDocs.mockRejectedValue(permissionError)
    mockGetDoc.mockRejectedValue(permissionError)

    await expect(listDocuments(uid)).rejects.toMatchObject({ code: 'firestore/permission-denied' })
    await expect(getUserSettings(uid)).rejects.toMatchObject({ code: 'firestore/permission-denied' })
    await expect(getResearchNotebook(uid, 'nb-1')).rejects.toMatchObject({ code: 'firestore/permission-denied' })
    await expect(listDocuments(uid)).rejects.toMatchObject({ code: 'firestore/permission-denied' })
    await expect(getUserSettings(uid)).rejects.toMatchObject({ code: 'firestore/permission-denied' })
    await expect(getResearchNotebook(uid, 'nb-2')).rejects.toMatchObject({ code: 'firestore/permission-denied' })

    // No automatic session-invalidation events. The Firebase Auth session
    // remains live; only the user (or onAuthStateChanged null) can clear it.
    expect(mockEmitFirestoreAuthAccessDegraded).not.toHaveBeenCalled()
    expect(mockEmitFirestoreAuthSessionInvalid).not.toHaveBeenCalled()
  }, 30_000)

  it('does not open a circuit that fast-fails healthy calls after transient failures', async () => {
    const unauthenticatedError = Object.assign(new Error('Auth token expired.'), {
      code: 'firestore/unauthenticated',
    })

    mockGetDocs.mockRejectedValue(unauthenticatedError)
    await expect(listDocuments(uid)).rejects.toMatchObject({ code: 'firestore/unauthenticated' })
    await expect(listDocuments(uid)).rejects.toMatchObject({ code: 'firestore/unauthenticated' })
    await expect(listDocuments(uid)).rejects.toMatchObject({ code: 'firestore/unauthenticated' })
    await expect(listDocuments(uid)).rejects.toMatchObject({ code: 'firestore/unauthenticated' })

    // Once the underlying call recovers, the next request must succeed —
    // no global "circuit open" cooldown blocking healthy traffic.
    mockGetDocs.mockReset()
    mockGetDocs.mockResolvedValueOnce({ docs: [], empty: true })

    const result = await listDocuments(uid)

    expect(result.items).toEqual([])
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    expect(mockEmitFirestoreAuthSessionInvalid).not.toHaveBeenCalled()
  }, 30_000)

  it('persists user settings to the preferences document with merge', async () => {
    await saveUserSettings(uid, { last_jurisprudence_tribunal_aliases: ['trf2', 'tjmg'] })

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'settings', 'preferences',
    )
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/user-123/settings/preferences' },
      expect.objectContaining({ last_jurisprudence_tribunal_aliases: ['trf2', 'tjmg'] }),
      { merge: true },
    )
  })

  it('saves user settings under the authenticated uid and retries transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })
    mockFirebaseAuth.currentUser = {
      uid: 'live-user-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: unknown) => void) => {
      callback(mockFirebaseAuth.currentUser)
      return () => undefined
    })
    mockSetDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined)

    await saveUserSettings('stale-user-123', { last_jurisprudence_tribunal_aliases: ['stf'] })

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'live-user-456', 'settings', 'preferences',
    )
    expect(mockSetDoc).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })
})

describe('admin catalog sanitizers', () => {
  it('drops malformed document types and backfills safe defaults for built-ins', () => {
    expect(sanitizeAdminDocumentTypes([
      null,
      { id: 'parecer', name: '', description: 42, templates: [null, '  ', 'custom'], is_enabled: undefined },
      { id: 'customizado', name: 'Tipo próprio', description: 'Descrição', templates: [], is_enabled: false, structure: '# Modelo' },
      { id: '', name: 'Inválido' },
    ])).toEqual([
      {
        id: 'parecer',
        name: 'Parecer Jurídico',
        description: 'Opinião técnico-jurídica fundamentada sobre questão de direito',
        templates: ['custom'],
        is_enabled: true,
      },
      {
        id: 'customizado',
        name: 'Tipo próprio',
        description: 'Descrição',
        templates: ['generic'],
        is_enabled: false,
        structure: '# Modelo',
      },
    ])
  })

  it('drops malformed legal areas and preserves valid assuntos', () => {
    expect(sanitizeAdminLegalAreas([
      undefined,
      { id: 'civil', name: '', description: null, assuntos: ['contratos', ' ', 1], is_enabled: undefined },
      { id: 'nova_area', name: 'Nova área', description: 'Descrição', assuntos: [], is_enabled: false },
      { id: 'sem_nome', description: 'inválido' },
    ])).toEqual([
      {
        id: 'civil',
        name: 'Direito Civil',
        description: 'Obrigações, contratos, responsabilidade civil, direitos reais, família e sucessões',
        assuntos: ['contratos'],
        is_enabled: true,
      },
      {
        id: 'nova_area',
        name: 'Nova área',
        description: 'Descrição',
        is_enabled: false,
      },
    ])
  })
})
