/**
 * firestore-service.test.ts — Unit tests for saveNotebookDocumentToDocuments.
 *
 * Mocks the Firebase SDK and the local firebase module so that we can test
 * the function in isolation without a real Firestore connection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { UsageExecutionRecord } from './cost-analytics'

// ── Mock firebase/firestore SDK ─────────────────────────────────────────────

const mockAddDoc = vi.fn()
const mockCollection = vi.fn()
const mockCollectionGroup = vi.fn()
const mockDoc = vi.fn()
const mockGetDoc = vi.fn()
const mockGetDocs = vi.fn()
const mockQuery = vi.fn()
const mockOrderBy = vi.fn()
const mockLimit = vi.fn()
const mockStartAfter = vi.fn()
const mockSetDoc = vi.fn()
const mockServerTimestamp = vi.fn()
const mockUpdateDoc = vi.fn()
const mockDeleteDoc = vi.fn()
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
  collectionGroup: (...args: unknown[]) => mockCollectionGroup(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  startAfter: (...args: unknown[]) => mockStartAfter(...args),
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
  CLASSIFICATION_TIPOS: { civil: { contratos: ['locacao'] } },
  DEFAULT_AREA_ASSUNTOS: { civil: ['contratos', 'responsabilidade civil'] },
}))

vi.mock('./document-structures', () => ({
  DEFAULT_DOC_STRUCTURES: { parecer: '# Estrutura padrão do parecer' },
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
  completeOnboarding,
  ensureUserSettingsMigrated,
  getProfile,
  getSettings,
  getUserSettings,
  getWizardData,
  getDocumentTypesForProfile,
  getLegalAreasForProfile,
  getRequestFields,
  getStats,
  getDailyStats,
  getByTypeStats,
  getRecentDocuments,
  getDashboardSnapshot,
  getCostBreakdown,
  getPlatformCostBreakdown,
  getPlatformOverview,
  getResearchNotebook,
  invalidatePlatformAnalyticsCache,
  loadAdminClassificationTipos,
  loadAdminDocumentTypes,
  loadAdminLegalAreas,
  listDocuments,
  sanitizeAdminDocumentTypes,
  sanitizeAdminLegalAreas,
  saveAdminClassificationTipos,
  saveAdminDocumentTypes,
  saveAdminLegalAreas,
  saveSettings,
  saveUserSettings,
  saveProfile,
  saveNotebookDocumentToDocuments,
  listTheses,
  listThesisAnalysisSessions,
  saveThesisAnalysisSession,
  getLastThesisAnalysisSession,
  getAcervoDocsWithoutTags,
  updateAcervoEmenta,
  deleteResearchNotebook,
  updateResearchNotebook,
  listChatConversations,
  getChatConversation,
  createChatConversation,
  ensureChatConversation,
  renameChatConversation,
  updateChatConversationEffort,
  updateChatConversationPreview,
  deleteChatConversation,
  listChatTurns,
  appendChatTurn,
  updateChatTurn,
  saveChatSidecarDevice,
  listChatSidecarDevices,
  saveChatWorkspaceRoot,
  listChatWorkspaceRoots,
  bindChatWorkspaceRoot,
  listChatWorkspaceBindings,
  createChatSidecarCommand,
  updateChatSidecarCommand,
  createChatApprovalRequest,
  updateChatApprovalRequest,
  appendChatSidecarAuditEntry,
} from './firestore-service'

// ── Tests ───────────────────────────────────────────────────────────────────

function stubStoredUserId(uid: string) {
  const store = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
  }
  localStorage.setItem('lexio_user_id', uid)
  vi.stubGlobal('window', { localStorage })
}

function makeGetDocsSnapshot(items: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    docs: items.map(item => ({ id: item.id, ref: { path: `mock/${item.id}` }, data: () => item.data })),
    empty: items.length === 0,
  }
}

function makeUsageExecution(overrides: Partial<UsageExecutionRecord> = {}): UsageExecutionRecord {
  return {
    source_type: 'document_generation',
    source_id: 'doc-1',
    created_at: '2026-05-07T12:00:00.000Z',
    function_key: 'document_generation',
    function_label: 'Geração de documentos',
    phase: 'redacao',
    phase_label: 'Redação',
    agent_name: 'redator',
    model: 'openai/gpt-4o-mini',
    model_label: 'GPT-4o Mini',
    tokens_in: 100,
    tokens_out: 50,
    total_tokens: 150,
    cost_usd: 0.2,
    duration_ms: 1200,
    execution_state: 'completed',
    ...overrides,
  }
}

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
    invalidatePlatformAnalyticsCache()
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
    mockCollectionGroup.mockImplementation((...args: unknown[]) => ({ collectionGroup: args }))
    mockAddDoc.mockResolvedValue({ id: 'new-doc-id' })
    mockDoc.mockImplementation((...segments: unknown[]) => {
      const pathSegments = typeof segments[0] === 'object' ? segments.slice(1) : segments
      return { path: pathSegments.join('/') }
    })
    mockGetDoc.mockResolvedValue({ exists: () => true, id: 'nb-abc', data: () => ({ title: 'Notebook' }) })
    mockGetDocs.mockResolvedValue({ docs: [], empty: true })
    mockOrderBy.mockImplementation((...args: unknown[]) => ({ orderBy: args }))
    mockLimit.mockImplementation((value: unknown) => ({ limit: value }))
    mockStartAfter.mockImplementation((value: unknown) => ({ startAfter: value }))
    mockQuery.mockImplementation((...args: unknown[]) => ({ query: args }))
    mockSetDoc.mockResolvedValue(undefined)
    mockServerTimestamp.mockReturnValue('__server_timestamp__')
    mockUpdateDoc.mockResolvedValue(undefined)
    mockDeleteDoc.mockResolvedValue(undefined)
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

  it('retries notebook reads after transient permission-denied and still checks dedicated memory', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce({
        exists: () => true,
        id: 'nb-xyz',
        data: () => ({ title: 'Notebook', sources: [] }),
      })
      .mockResolvedValueOnce({ exists: () => false, id: 'search_memory', data: () => ({}) })

    const result = await getResearchNotebook(uid, 'nb-xyz')

    expect(result?.id).toBe('nb-xyz')
    expect(mockGetDoc).toHaveBeenCalledTimes(3)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('retries notebook updates after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockUpdateDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined)

    await updateResearchNotebook(uid, 'nb-xyz', { title: 'Atualizado' })

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'research_notebooks', 'nb-xyz',
    )
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('retries notebook dedicated memory sync after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockUpdateDoc.mockResolvedValueOnce(undefined)
    mockSetDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined)

    await updateResearchNotebook(uid, 'nb-xyz', {
      research_audits: [{
        id: 'audit-1',
        query: 'controle concentrado',
        provider: 'datajud',
        created_at: '2026-05-08T10:00:00.000Z',
      }] as never,
      saved_searches: [{
        id: 'search-1',
        label: 'Pesquisa principal',
        query: 'controle concentrado',
        created_at: '2026-05-08T10:00:00.000Z',
      }] as never,
    })

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
    expect(mockSetDoc).toHaveBeenCalledTimes(2)
    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'research_notebooks', 'nb-xyz', 'memory', 'search_memory',
    )
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('retries notebook dedicated memory deletion after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockDeleteDoc
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined)

    await deleteResearchNotebook(uid, 'nb-xyz')

    expect(mockDeleteDoc).toHaveBeenCalledTimes(3)
    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'research_notebooks', 'nb-xyz', 'memory', 'search_memory',
    )
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
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

  it('loads legacy platform settings through the settings repository facade', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ api_keys: { openrouter_api_key: 'sk-platform' } }),
    })

    const result = await getSettings()

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'settings', 'platform',
    )
    expect(result.api_keys).toEqual({ openrouter_api_key: 'sk-platform' })
  })

  it('saves legacy platform settings through the settings repository facade', async () => {
    await saveSettings({ api_keys: { datajud_api_key: 'datajud-key' } })

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'settings', 'platform',
    )
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'settings/platform' },
      expect.objectContaining({
        api_keys: { datajud_api_key: 'datajud-key' },
        updated_at: '__server_timestamp__',
      }),
      { merge: true },
    )
  })

  it('retries legacy platform settings writes after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockSetDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined)

    await saveSettings({ api_keys: { datajud_api_key: 'datajud-key' } })

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'settings', 'platform',
    )
    expect(mockSetDoc).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('retries platform overview collection reads after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDocs
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'doc-1',
          data: {
            document_type_id: 'parecer',
            status: 'concluido',
            quality_score: 88,
            origem: 'web',
            created_at: '2026-05-08T12:00:00.000Z',
          },
        },
      ]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'nb-1',
          data: {
            title: 'Notebook teste',
            created_at: '2026-05-08T12:00:00.000Z',
            sources: [],
            artifacts: [],
          },
        },
      ]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'user-1',
          data: {
            role: 'platform_admin',
            created_at: '2026-05-08T12:00:00.000Z',
          },
        },
      ]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([]))

    const overview = await getPlatformOverview()

    expect(overview.total_users).toBe(1)
    expect(overview.admin_users).toBe(1)
    expect(overview.standard_users).toBe(0)
    expect(overview.total_documents).toBe(1)
    expect(overview.total_notebooks).toBe(1)
    expect(overview.operational_warnings).toEqual([])
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('loads platform analytics with partial metrics when user profiles are unavailable', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockCollection.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }))
    mockCollectionGroup.mockImplementation((_db: unknown, collectionName: string) => ({ path: collectionName }))

    mockGetDocs.mockImplementation(async (ref: { path?: string }) => {
      switch (ref?.path) {
        case 'users':
          throw permissionError
        case 'documents':
          return makeGetDocsSnapshot([
            {
              id: 'doc-1',
              data: {
                document_type_id: 'parecer',
                status: 'concluido',
                quality_score: 92,
                origem: 'web',
                created_at: '2026-05-08T12:00:00.000Z',
                llm_executions: [makeUsageExecution()],
              },
            },
          ])
        case 'theses':
        case 'thesis_analysis_sessions':
        case 'acervo':
        case 'memory':
          return makeGetDocsSnapshot([])
        case 'research_notebooks':
          return makeGetDocsSnapshot([
            {
              id: 'nb-1',
              data: {
                title: 'Notebook teste',
                created_at: '2026-05-08T12:00:00.000Z',
                sources: [],
                artifacts: [],
              },
            },
          ])
        default:
          return makeGetDocsSnapshot([])
      }
    })

    const overview = await getPlatformOverview()
    const breakdown = await getPlatformCostBreakdown(true)

    expect(overview.total_users).toBe(0)
    expect(overview.total_documents).toBe(1)
    expect(overview.total_notebooks).toBe(1)
    expect(overview.operational_warnings).toHaveLength(1)
    expect(overview.operational_warnings?.[0] ?? '').toContain('perfis de usuarios')
    expect(breakdown.total_calls).toBe(1)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('loads platform overview with partial metrics when notebook search memory is unavailable', async () => {
    const memoryUnavailableError = Object.assign(
      new Error('PERMISSION_DENIED: Missing or insufficient permissions.'),
      { code: 'firestore/internal' },
    )

    mockGetDocs
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'user-1',
          data: {
            role: 'admin',
            created_at: '2026-05-08T12:00:00.000Z',
          },
        },
      ]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'nb-1',
          data: {
            title: 'Notebook teste',
            created_at: '2026-05-08T12:00:00.000Z',
            sources: [],
            artifacts: [],
          },
        },
      ]))
      .mockRejectedValueOnce(memoryUnavailableError)

    const overview = await getPlatformOverview()

    expect(overview.total_users).toBe(1)
    expect(overview.total_notebooks).toBe(1)
    expect(overview.total_notebook_search_memory_docs).toBe(0)
    expect(overview.operational_warnings).toHaveLength(1)
    expect(overview.operational_warnings?.[0] ?? '').toContain('metricas parciais')
  })

  it('surfaces permission-denied immediately when legacy settings read opts out of auth recovery', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDoc.mockRejectedValueOnce(permissionError)

    await expect(getSettings({ recoverAuthAccessErrors: false })).rejects.toMatchObject({
      code: 'firestore/permission-denied',
    })

    expect(mockGetDoc).toHaveBeenCalledTimes(1)
    expect(mockGetIdToken).not.toHaveBeenCalled()
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

  it('migrates legacy settings into user preferences once', async () => {
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({}) })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          openrouter_api_key: 'sk-flat',
          api_keys: { datajud_api_key: 'datajud-platform' },
          agent_models: { triagem: 'openai/gpt-4o-mini' },
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          items: [{ id: 'parecer', name: 'Parecer', description: '', templates: ['generic'], is_enabled: true }],
        }),
      })
      .mockResolvedValueOnce({ exists: () => false, data: () => ({}) })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ tipos: { civil: { contratos: ['locacao'] } } }),
      })

    const result = await ensureUserSettingsMigrated(uid)

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'settings', 'preferences',
    )
    expect(mockDoc).toHaveBeenCalledWith({ _fake: true }, 'settings', 'platform')
    expect(mockDoc).toHaveBeenCalledWith({ _fake: true }, 'settings', 'admin_document_types')
    expect(mockDoc).toHaveBeenCalledWith({ _fake: true }, 'settings', 'admin_classification_tipos')
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/user-123/settings/preferences' },
      expect.objectContaining({
        legacy_migrated_at: expect.any(String),
        api_keys: { datajud_api_key: 'datajud-platform', openrouter_api_key: 'sk-flat' },
        agent_models: { triagem: 'openai/gpt-4o-mini' },
        document_types: [{ id: 'parecer', name: 'Parecer', description: '', templates: ['generic'], is_enabled: true }],
        classification_tipos: { civil: { contratos: ['locacao'] } },
        updated_at: '__server_timestamp__',
      }),
      { merge: true },
    )
    expect(result.legacy_migrated_at).toEqual(expect.any(String))
  })

  it('loads profile data from the authenticated uid', async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'auth-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ position: 'Promotor de Justiça', onboarding_completed: true }),
    })

    const result = await getProfile(uid)

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'auth-456', 'profile', 'data',
    )
    expect(result.position).toBe('Promotor de Justiça')
  })

  it('saves profile data under the authenticated uid', async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'auth-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }

    await saveProfile(uid, { position: 'Advogada' })

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'auth-456', 'profile', 'data',
    )
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/auth-456/profile/data' },
      expect.objectContaining({ position: 'Advogada', updated_at: '__server_timestamp__' }),
      { merge: true },
    )
  })

  it('marks onboarding complete under the authenticated uid', async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'auth-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }

    await completeOnboarding(uid, { institution: 'MPRS' })

    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/auth-456/profile/data' },
      expect.objectContaining({
        institution: 'MPRS',
        onboarding_completed: true,
        updated_at: '__server_timestamp__',
      }),
      { merge: true },
    )
  })

  it('loads wizard data from profile and canonical onboarding steps', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ onboarding_completed: false }),
    })

    const result = await getWizardData(uid)

    expect(result.onboarding_completed).toBe(false)
    expect(result.onboarding_steps).toHaveLength(4)
    expect(result.onboarding_steps[0].title).toBe('Perfil Profissional')
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

  it('saves thesis analysis sessions under the authenticated uid', async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'auth-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }
    mockAddDoc.mockResolvedValueOnce({ id: 'sess-new' })

    const result = await saveThesisAnalysisSession(uid, {
      created_at: '2026-01-01T00:00:00.000Z',
      total_theses_analyzed: 2,
      total_docs_analyzed: 1,
      total_new_docs: 1,
      suggestions_count: 1,
      accepted_count: 0,
      rejected_count: 0,
      executive_summary: 'Resumo',
      status: 'completed',
    })

    expect(mockCollection).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'auth-456', 'thesis_analysis_sessions',
    )
    expect(mockAddDoc).toHaveBeenCalledWith('col-ref', expect.objectContaining({
      created_at: '2026-01-01T00:00:00.000Z',
      executive_summary: 'Resumo',
    }))
    expect(result).toBe('sess-new')
  })

  it('loads the latest thesis analysis session under the authenticated uid', async () => {
    mockFirebaseAuth.currentUser = {
      uid: 'auth-456',
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    }
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'sess-last', data: () => ({ created_at: '2026-01-02T00:00:00.000Z', summary: 'last' }) },
      ],
      empty: false,
    })

    const result = await getLastThesisAnalysisSession(uid)

    expect(mockCollection).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'auth-456', 'thesis_analysis_sessions',
    )
    expect(mockOrderBy).toHaveBeenCalledWith('created_at', 'desc')
    expect(mockLimit).toHaveBeenCalledWith(1)
    expect(result?.id).toBe('sess-last')
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

  it('retries indexed acervo reads after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDocs
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'acervo-1',
          data: {
            filename: 'peticao.pdf',
            text_content: 'texto',
            status: 'indexed',
            created_at: '2026-05-08T12:00:00.000Z',
          },
        },
      ]))

    const docs = await getAcervoDocsWithoutTags(uid)

    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe('acervo-1')
    expect(mockGetDocs).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('retries acervo ementa updates after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockUpdateDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined)

    await updateAcervoEmenta(uid, 'acervo-1', 'Ementa sintética', ['tributario'])

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'acervo', 'acervo-1',
    )
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
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

  it('strips undefined values before persisting user settings', async () => {
    await saveUserSettings(uid, {
      model_catalog: [
        {
          id: 'test/model',
          label: 'Test Model',
          provider: 'Test',
          tier: 'balanced',
          description: 'Modelo de teste',
          contextWindow: 128000,
          inputCost: 0,
          outputCost: 0,
          isFree: false,
          agentFit: { extraction: 7, synthesis: 7, reasoning: 7, writing: 7 },
          rateLimits: undefined,
        },
      ],
    })

    const lastCall = mockSetDoc.mock.calls[mockSetDoc.mock.calls.length - 1]
    const payload = lastCall?.[1] as { model_catalog?: Array<Record<string, unknown>> }
    expect(payload.model_catalog?.[0]).not.toHaveProperty('rateLimits')
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

  it('retries stale snapshot write conflicts surfaced as firestore aborted', async () => {
    const abortedError = Object.assign(new Error('Transaction aborted due to concurrent modification.'), {
      code: 'firestore/aborted',
    })

    mockSetDoc
      .mockRejectedValueOnce(abortedError)
      .mockResolvedValueOnce(undefined)

    await saveUserSettings(uid, { last_jurisprudence_tribunal_aliases: ['stm'] })

    expect(mockSetDoc).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).not.toHaveBeenCalled()
  })

  it('repairs a missing chat conversation document with an idempotent merge', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false, id: 'conv-1', data: () => ({}) })

    const result = await ensureChatConversation(uid, 'conv-1', { title: 'Parecer constitucional', effort: 'medio' })

    expect(result.id).toBe('conv-1')
    expect(result.title).toBe('Parecer constitucional')
    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'chat_conversations', 'conv-1',
    )
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/user-123/chat_conversations/conv-1' },
      expect.objectContaining({
        title: 'Parecer constitucional',
        effort: 'medio',
        last_preview: '',
        created_at: expect.any(String),
        updated_at: expect.any(String),
      }),
      { merge: true },
    )
  })

  it('ensures the chat conversation parent before appending a turn', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false, id: 'conv-1', data: () => ({}) })
    mockAddDoc.mockResolvedValueOnce({ id: 'turn-1' })

    const turnId = await appendChatTurn(uid, 'conv-1', {
      conversation_id: 'conv-1',
      user_input: 'Elabore um parecer sobre nepotismo.',
      trail: [],
      assistant_markdown: null,
      status: 'running',
    })

    expect(turnId).toBe('turn-1')
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/user-123/chat_conversations/conv-1' },
      expect.objectContaining({ title: 'Elabore um parecer sobre nepotismo.' }),
      { merge: true },
    )
    expect(mockCollection).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'chat_conversations', 'conv-1', 'turns',
    )
    expect(mockAddDoc).toHaveBeenCalledWith('col-ref', expect.objectContaining({
      conversation_id: 'conv-1',
      user_input: 'Elabore um parecer sobre nepotismo.',
      status: 'running',
    }))
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'users/user-123/chat_conversations/conv-1' },
      expect.objectContaining({ updated_at: expect.any(String) }),
    )
  })

  it('lists and updates chat conversation metadata through the facade', async () => {
    mockGetDocs.mockResolvedValueOnce(makeGetDocsSnapshot([
      { id: 'conv-new', data: { title: 'Nova', effort: 'medio', updated_at: '2026-05-08T12:00:00.000Z', created_at: '2026-05-08T11:00:00.000Z' } },
      { id: 'conv-old', data: { title: 'Antiga', effort: 'rapido', updated_at: '2026-05-07T12:00:00.000Z', created_at: '2026-05-07T11:00:00.000Z' } },
    ]))

    const listed = await listChatConversations(uid, { limit: 1 })

    expect(listed.items.map(item => item.id)).toEqual(['conv-new'])
    expect(listed.hasMore).toBe(true)
    expect(mockCollection).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'chat_conversations',
    )
    expect(mockOrderBy).toHaveBeenCalledWith('updated_at', 'desc')
    expect(mockLimit).toHaveBeenCalledWith(2)

    mockAddDoc.mockResolvedValueOnce({ id: 'conv-created' })
    const createdId = await createChatConversation(uid, { title: '  Nova pauta  ' })

    expect(createdId).toBe('conv-created')
    expect(mockAddDoc).toHaveBeenLastCalledWith('col-ref', expect.objectContaining({
      title: 'Nova pauta',
      effort: 'medio',
      last_preview: '',
    }))

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'conv-new',
      data: () => ({ title: 'Nova', effort: 'medio', created_at: '2026-05-08T11:00:00.000Z', updated_at: '2026-05-08T12:00:00.000Z' }),
    })
    const loaded = await getChatConversation(uid, 'conv-new')

    expect(loaded?.id).toBe('conv-new')
    expect(loaded?.title).toBe('Nova')

    await renameChatConversation(uid, 'conv-new', '  Tese ajustada  ')
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-123/chat_conversations/conv-new' },
      expect.objectContaining({ title: 'Tese ajustada', updated_at: expect.any(String) }),
    )

    await updateChatConversationEffort(uid, 'conv-new', 'profundo')
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-123/chat_conversations/conv-new' },
      expect.objectContaining({ effort: 'profundo', updated_at: expect.any(String) }),
    )

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'conv-new',
      data: () => ({ title: 'Nova', effort: 'medio', created_at: '2026-05-08T11:00:00.000Z', updated_at: '2026-05-08T12:00:00.000Z' }),
    })
    await updateChatConversationPreview(uid, 'conv-new', 'x'.repeat(260))

    const previewPayload = mockUpdateDoc.mock.calls[mockUpdateDoc.mock.calls.length - 1]?.[1] as { last_preview?: string }
    expect(previewPayload.last_preview).toHaveLength(238)
    expect(previewPayload.last_preview?.endsWith('…')).toBe(true)
  })

  it('retries chat conversation listing after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDocs
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        { id: 'conv-new', data: { title: 'Nova', effort: 'medio', updated_at: '2026-05-08T12:00:00.000Z', created_at: '2026-05-08T11:00:00.000Z' } },
      ]))

    const result = await listChatConversations(uid, { limit: 1 })

    expect(result.items.map(item => item.id)).toEqual(['conv-new'])
    expect(mockGetDocs).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('retries appendChatTurn writes after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'conv-1',
      data: () => ({ title: 'Parecer constitucional', effort: 'medio', created_at: '2026-05-08T11:00:00.000Z', updated_at: '2026-05-08T12:00:00.000Z' }),
    })
    mockAddDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce({ id: 'turn-1' })

    const turnId = await appendChatTurn(uid, 'conv-1', {
      conversation_id: 'conv-1',
      user_input: 'Elabore um parecer sobre nepotismo.',
      trail: [],
      assistant_markdown: null,
      status: 'running',
    })

    expect(turnId).toBe('turn-1')
    expect(mockAddDoc).toHaveBeenCalledTimes(2)
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'users/user-123/chat_conversations/conv-1' },
      expect.objectContaining({ updated_at: expect.any(String) }),
    )
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('lists, finalizes and archives chat conversations without deleting turns', async () => {
    mockGetDocs.mockResolvedValueOnce(makeGetDocsSnapshot([
      { id: 'turn-1', data: { conversation_id: 'conv-1', user_input: 'Oi', trail: [], assistant_markdown: null, status: 'done', created_at: '2026-05-08T10:00:00.000Z' } },
    ]))

    const turns = await listChatTurns(uid, 'conv-1')

    expect(turns.items).toHaveLength(1)
    expect(turns.items[0].id).toBe('turn-1')
    expect(mockCollection).toHaveBeenCalledWith(
      { _fake: true },
      'users', uid, 'chat_conversations', 'conv-1', 'turns',
    )

    await updateChatTurn(uid, 'conv-1', 'turn-1', {
      id: 'ignored',
      conversation_id: 'ignored',
      status: 'done',
      assistant_markdown: 'Resposta final',
    })

    expect(mockUpdateDoc).toHaveBeenNthCalledWith(
      1,
      { path: 'users/user-123/chat_conversations/conv-1/turns/turn-1' },
      expect.not.objectContaining({ id: expect.anything(), conversation_id: expect.anything() }),
    )
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-123/chat_conversations/conv-1' },
      expect.objectContaining({ updated_at: expect.any(String) }),
    )

    await deleteChatConversation(uid, 'conv-1')

    expect(mockDeleteDoc).not.toHaveBeenCalled()
    expect(mockSetDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-123/chat_conversations/conv-1' },
      expect.objectContaining({
        deleted_at: expect.any(String),
        deleted_by: 'user-123',
        updated_at: expect.any(String),
      }),
      { merge: true },
    )
  })

  it('persists sidecar devices, workspace roots and bindings through the facade', async () => {
    const deviceId = await saveChatSidecarDevice(uid, {
      id: 'device-1',
      label: '  ',
      device_fingerprint: 'fingerprint-1',
      status: 'online',
      capabilities: ['read'],
      paired_at: '2026-05-08T10:00:00.000Z',
    })

    expect(deviceId).toBe('device-1')
    expect(mockSetDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-123/sidecar_devices/device-1' },
      expect.objectContaining({ label: 'Lexio Sidecar', status: 'online' }),
      { merge: true },
    )

    mockGetDocs.mockResolvedValueOnce(makeGetDocsSnapshot([
      { id: 'device-1', data: { label: 'Lexio Sidecar', device_fingerprint: 'fingerprint-1', status: 'online', capabilities: ['read'], paired_at: '2026-05-08T10:00:00.000Z' } },
    ]))
    const devices = await listChatSidecarDevices(uid)

    expect(devices.items[0].id).toBe('device-1')
    expect(mockOrderBy).toHaveBeenLastCalledWith('last_seen_at', 'desc')

    const rootId = await saveChatWorkspaceRoot(uid, {
      id: 'root-1',
      provider: 'local_folder',
      label: '',
      permissions: ['read', 'write'],
      approval_policy: 'always',
      sync_enabled: true,
    })

    expect(rootId).toBe('root-1')
    expect(mockSetDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-123/chat_workspace_roots/root-1' },
      expect.objectContaining({ label: 'Workspace', permissions: ['read', 'write'] }),
      { merge: true },
    )

    mockGetDocs.mockResolvedValueOnce(makeGetDocsSnapshot([
      { id: 'root-1', data: { provider: 'local_folder', label: 'Workspace', permissions: ['read'], approval_policy: 'always', sync_enabled: true, created_at: '2026-05-08T10:00:00.000Z', updated_at: '2026-05-08T11:00:00.000Z' } },
    ]))
    const roots = await listChatWorkspaceRoots(uid)

    expect(roots.items[0].id).toBe('root-1')

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'conv-1',
      data: () => ({ title: 'Chat', effort: 'medio', created_at: '2026-05-08T10:00:00.000Z', updated_at: '2026-05-08T11:00:00.000Z' }),
    })
    const bindingId = await bindChatWorkspaceRoot(uid, 'conv-1', {
      root_id: 'root-1',
      provider: 'local_folder',
      label: '',
      permissions: ['read'],
      approval_policy: 'always',
    })

    expect(bindingId).toBe('root-1')
    expect(mockSetDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-123/chat_conversations/conv-1/workspace_bindings/root-1' },
      expect.objectContaining({ conversation_id: 'conv-1', label: 'local_folder' }),
      { merge: true },
    )

    mockGetDocs.mockResolvedValueOnce(makeGetDocsSnapshot([
      { id: 'root-1', data: { conversation_id: 'conv-1', root_id: 'root-1', provider: 'local_folder', label: 'Workspace', permissions: ['read'], approval_policy: 'always', created_at: '2026-05-08T10:00:00.000Z', updated_at: '2026-05-08T11:00:00.000Z' } },
    ]))
    const bindings = await listChatWorkspaceBindings(uid, 'conv-1')

    expect(bindings.items[0].root_id).toBe('root-1')
  })

  it('retries workspace root writes after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockSetDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined)

    const rootId = await saveChatWorkspaceRoot(uid, {
      id: 'root-1',
      provider: 'local_folder',
      label: '',
      permissions: ['read', 'write'],
      approval_policy: 'always',
      sync_enabled: true,
    })

    expect(rootId).toBe('root-1')
    expect(mockSetDoc).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('retries workspace binding writes after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'conv-1',
      data: () => ({ title: 'Chat', effort: 'medio', created_at: '2026-05-08T10:00:00.000Z', updated_at: '2026-05-08T11:00:00.000Z' }),
    })
    mockSetDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined)

    const bindingId = await bindChatWorkspaceRoot(uid, 'conv-1', {
      root_id: 'root-1',
      provider: 'local_folder',
      label: '',
      permissions: ['read'],
      approval_policy: 'always',
    })

    expect(bindingId).toBe('root-1')
    expect(mockSetDoc).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('persists sidecar commands, approvals and audit entries through the facade', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'conv-1',
      data: () => ({ title: 'Chat', effort: 'medio', created_at: '2026-05-08T10:00:00.000Z', updated_at: '2026-05-08T11:00:00.000Z' }),
    })
    mockAddDoc
      .mockResolvedValueOnce({ id: 'cmd-1' })
      .mockResolvedValueOnce({ id: 'approval-1' })
      .mockResolvedValueOnce({ id: 'audit-1' })

    const commandId = await createChatSidecarCommand(uid, 'conv-1', {
      root_id: 'root-1',
      operation: 'read',
      path: 'peticao.md',
    })

    expect(commandId).toBe('cmd-1')
    expect(mockAddDoc).toHaveBeenLastCalledWith('col-ref', expect.objectContaining({
      conversation_id: 'conv-1',
      status: 'waiting_approval',
      operation: 'read',
    }))

    await updateChatSidecarCommand(uid, 'conv-1', 'cmd-1', {
      id: 'ignored',
      conversation_id: 'ignored',
      created_at: 'ignored',
      status: 'completed',
      result_summary: 'Arquivo lido',
    })

    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-123/chat_conversations/conv-1/sidecar_commands/cmd-1' },
      expect.not.objectContaining({ id: expect.anything(), conversation_id: expect.anything(), created_at: expect.anything() }),
    )

    const approvalId = await createChatApprovalRequest(uid, 'conv-1', {
      command_ids: ['cmd-1'],
      title: 'Ler arquivo',
      summary: 'Permite leitura de peticao.md',
      risk_level: 'low',
      requested_permissions: ['read'],
    })

    expect(approvalId).toBe('approval-1')
    expect(mockAddDoc).toHaveBeenLastCalledWith('col-ref', expect.objectContaining({
      conversation_id: 'conv-1',
      status: 'pending',
      command_ids: ['cmd-1'],
    }))

    await updateChatApprovalRequest(uid, 'conv-1', 'approval-1', {
      id: 'ignored',
      conversation_id: 'ignored',
      created_at: 'ignored',
      status: 'approved',
      decided_by: uid,
    })

    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'users/user-123/chat_conversations/conv-1/approvals/approval-1' },
      expect.objectContaining({ status: 'approved', decided_by: uid, updated_at: expect.any(String) }),
    )

    const auditId = await appendChatSidecarAuditEntry(uid, 'conv-1', {
      command_id: 'cmd-1',
      root_id: 'root-1',
      operation: 'read',
      actor: 'sidecar',
      status: 'executed',
      message: 'Arquivo lido com sucesso',
    })

    expect(auditId).toBe('audit-1')
    expect(mockAddDoc).toHaveBeenLastCalledWith('col-ref', expect.objectContaining({
      conversation_id: 'conv-1',
      operation: 'read',
      actor: 'sidecar',
      status: 'executed',
    }))
  })

  it('retries sidecar command writes after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'conv-1',
      data: () => ({ title: 'Chat', effort: 'medio', created_at: '2026-05-08T10:00:00.000Z', updated_at: '2026-05-08T11:00:00.000Z' }),
    })
    mockAddDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce({ id: 'cmd-1' })

    const commandId = await createChatSidecarCommand(uid, 'conv-1', {
      root_id: 'root-1',
      operation: 'read',
      path: 'peticao.md',
    })

    expect(commandId).toBe('cmd-1')
    expect(mockAddDoc).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('retries approval request writes after transient permission-denied', async () => {
    const permissionError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'conv-1',
      data: () => ({ title: 'Chat', effort: 'medio', created_at: '2026-05-08T10:00:00.000Z', updated_at: '2026-05-08T11:00:00.000Z' }),
    })
    mockAddDoc
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce({ id: 'approval-1' })

    const approvalId = await createChatApprovalRequest(uid, 'conv-1', {
      command_ids: ['cmd-1'],
      title: 'Ler arquivo',
      summary: 'Permite leitura de peticao.md',
      risk_level: 'low',
      requested_permissions: ['read'],
    })

    expect(approvalId).toBe('approval-1')
    expect(mockAddDoc).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })
})

describe('dashboard stats facade', () => {
  const uid = 'user-123'

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
    mockOrderBy.mockImplementation((...args: unknown[]) => ({ orderBy: args }))
    mockLimit.mockImplementation((value: unknown) => ({ limit: value }))
    mockQuery.mockImplementation((...args: unknown[]) => ({ query: args }))
    mockGetDocs.mockResolvedValue(makeGetDocsSnapshot([]))
  })

  it('builds aggregate dashboard stats from documents and thesis sessions', async () => {
    mockGetDocs
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'doc-1',
          data: {
            document_type_id: 'parecer',
            status: 'concluido',
            quality_score: 90,
            created_at: '2026-05-07T12:00:00.000Z',
            llm_executions: [makeUsageExecution({ cost_usd: 0.2 })],
          },
        },
        {
          id: 'doc-2',
          data: {
            document_type_id: 'contestacao',
            status: 'em_revisao',
            quality_score: 70,
            created_at: '2026-05-07T13:00:00.000Z',
            llm_executions: [],
          },
        },
      ]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'session-1',
          data: {
            created_at: '2026-05-07T14:00:00.000Z',
            status: 'completed',
            llm_executions: [makeUsageExecution({ source_type: 'thesis_analysis', function_key: 'thesis_analysis', cost_usd: 0.15 })],
          },
        },
      ]))

    const result = await getStats(uid)

    expect(result).toMatchObject({
      total_documents: 2,
      completed_documents: 1,
      processing_documents: 0,
      pending_review_documents: 1,
      average_quality_score: 80,
      average_duration_ms: null,
    })
    expect(result.total_cost_usd).toBeCloseTo(0.35, 6)
    expect(mockCollection).toHaveBeenCalledWith({ _fake: true }, 'users', uid, 'documents')
    expect(mockCollection).toHaveBeenCalledWith({ _fake: true }, 'users', uid, 'thesis_analysis_sessions')
  })

  it('keeps dashboard snapshot, recent docs, daily stats and type stats behind the facade', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-05-08T12:00:00.000Z'))
      const documentSnapshot = makeGetDocsSnapshot([
        {
          id: 'doc-1',
          data: {
            document_type_id: 'parecer',
            tema: 'Tema A',
            status: 'concluido',
            quality_score: 90,
            created_at: '2026-05-07T12:00:00.000Z',
            llm_cost_usd: 0.1,
            llm_executions: [makeUsageExecution({ created_at: '2026-05-07T12:00:00.000Z', cost_usd: 0.2 })],
          },
        },
        {
          id: 'doc-2',
          data: {
            document_type_id: 'parecer',
            tema: 'Tema B',
            status: 'rascunho',
            quality_score: 70,
            created_at: '2026-05-08T10:00:00.000Z',
            llm_executions: [],
          },
        },
      ])
      const emptySessions = makeGetDocsSnapshot([])

      mockGetDocs
        .mockResolvedValueOnce(documentSnapshot)
        .mockResolvedValueOnce(emptySessions)
        .mockResolvedValueOnce(documentSnapshot)
        .mockResolvedValueOnce(documentSnapshot)
        .mockResolvedValueOnce(documentSnapshot)
        .mockResolvedValueOnce(emptySessions)

      const snapshot = await getDashboardSnapshot(uid)
      const recent = await getRecentDocuments(uid, 1)
      const byType = await getByTypeStats(uid)
      const daily = await getDailyStats(uid, 2)

      expect(snapshot.documents).toHaveLength(2)
      expect(recent.map(document => document.id)).toEqual(['doc-1', 'doc-2'])
      expect(mockLimit).toHaveBeenCalledWith(1)
      expect(byType).toEqual([{ document_type_id: 'parecer', total: 2, avg_score: 80 }])
      expect(daily).toEqual([
        { dia: '2026-05-07', total: 1, concluidos: 1, custo: 0.3 },
        { dia: '2026-05-08', total: 1, concluidos: 0, custo: 0 },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('aggregates user cost breakdown across documents, theses, acervo and notebooks', async () => {
    mockGetDocs
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'doc-1',
          data: {
            document_type_id: 'parecer',
            status: 'concluido',
            created_at: '2026-05-07T12:00:00.000Z',
            llm_executions: [makeUsageExecution({ source_id: 'doc-1', cost_usd: 0.2 })],
          },
        },
      ]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'session-1',
          data: {
            created_at: '2026-05-07T13:00:00.000Z',
            llm_executions: [makeUsageExecution({ source_type: 'thesis_analysis', function_key: 'thesis_analysis', source_id: 'session-1', cost_usd: 0.3 })],
          },
        },
      ]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'acervo-1',
          data: {
            filename: 'referencia.pdf',
            status: 'indexed',
            created_at: '2026-05-07T14:00:00.000Z',
            llm_executions: [makeUsageExecution({ source_type: 'acervo_classificador', function_key: 'acervo_classificador', source_id: 'acervo-1', cost_usd: 0.4 })],
          },
        },
      ]))
      .mockResolvedValueOnce(makeGetDocsSnapshot([
        {
          id: 'notebook-1',
          data: {
            title: 'Caderno',
            created_at: '2026-05-07T15:00:00.000Z',
            llm_executions: [makeUsageExecution({ source_type: 'caderno_pesquisa', function_key: 'caderno_pesquisa', source_id: 'notebook-1', cost_usd: 0.5 })],
          },
        },
      ]))

    const result = await getCostBreakdown(uid)

    expect(result.total_cost_usd).toBeCloseTo(1.4, 6)
    expect(result.by_function.map(item => item.key)).toEqual(expect.arrayContaining([
      'document_generation',
      'thesis_analysis',
      'acervo_classificador',
      'caderno_pesquisa',
    ]))
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

describe('admin taxonomy facade', () => {
  beforeEach(() => {
    stubStoredUserId('user-123')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads user document types and merges default structures', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        legacy_migrated_at: '2026-05-08T00:00:00.000Z',
        document_types: [
          { id: 'parecer', name: 'Parecer customizado', description: 'Uso interno', templates: ['custom'], is_enabled: true },
        ],
      }),
    })

    const result = await loadAdminDocumentTypes()

    expect(mockDoc).toHaveBeenCalledWith(
      { _fake: true },
      'users', 'user-123', 'settings', 'preferences',
    )
    expect(result).toEqual([
      expect.objectContaining({
        id: 'parecer',
        name: 'Parecer customizado',
        templates: ['custom'],
        structure: '# Estrutura padrão do parecer',
      }),
    ])
  })

  it('saves sanitized document types into user preferences', async () => {
    await saveAdminDocumentTypes([
      { id: 'tipo_custom', name: 'Tipo Custom', description: 'Descrição', templates: [], is_enabled: false },
    ])

    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/user-123/settings/preferences' },
      expect.objectContaining({
        document_types: [{
          id: 'tipo_custom',
          name: 'Tipo Custom',
          description: 'Descrição',
          templates: ['generic'],
          is_enabled: false,
        }],
        updated_at: '__server_timestamp__',
      }),
      { merge: true },
    )
  })

  it('loads user legal areas and merges default assuntos', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        legacy_migrated_at: '2026-05-08T00:00:00.000Z',
        legal_areas: [
          { id: 'civil', name: 'Civil custom', description: 'Descrição', is_enabled: true },
        ],
      }),
    })

    const result = await loadAdminLegalAreas()

    expect(result).toEqual([
      expect.objectContaining({
        id: 'civil',
        name: 'Civil custom',
        assuntos: ['contratos', 'responsabilidade civil'],
      }),
    ])
  })

  it('saves sanitized legal areas into user preferences', async () => {
    await saveAdminLegalAreas([
      { id: 'area_custom', name: 'Área Custom', description: 'Descrição', assuntos: [' válido ', ''], is_enabled: true },
    ])

    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/user-123/settings/preferences' },
      expect.objectContaining({
        legal_areas: [{
          id: 'area_custom',
          name: 'Área Custom',
          description: 'Descrição',
          assuntos: ['válido'],
          is_enabled: true,
        }],
        updated_at: '__server_timestamp__',
      }),
      { merge: true },
    )
  })

  it('loads and saves classification tipos through user preferences', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        legacy_migrated_at: '2026-05-08T00:00:00.000Z',
        classification_tipos: { civil: { contratos: ['compra e venda'] } },
      }),
    })

    await expect(loadAdminClassificationTipos()).resolves.toEqual({
      tipos: { civil: { contratos: ['compra e venda'] } },
    })

    await saveAdminClassificationTipos({ tax: { tributos: ['icms'] } })

    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/user-123/settings/preferences' },
      expect.objectContaining({
        classification_tipos: { tax: { tributos: ['icms'] } },
        updated_at: '__server_timestamp__',
      }),
      { merge: true },
    )
  })

  it('keeps profile taxonomy filters and request fields available through the facade', () => {
    const promotorDocIds = getDocumentTypesForProfile({ position: 'Promotor de Justiça' } as never).map(item => item.id)
    const sortedAreaIds = getLegalAreasForProfile({ primary_areas: ['tax', 'civil'] } as never).slice(0, 2).map(item => item.id)
    const parecerFields = getRequestFields('parecer').fields.map(field => field.key)

    expect(promotorDocIds).toContain('parecer')
    expect(promotorDocIds).not.toContain('sentenca')
    expect(sortedAreaIds).toEqual(['civil', 'tax'])
    expect(parecerFields).toContain('objeto')
  })
})
