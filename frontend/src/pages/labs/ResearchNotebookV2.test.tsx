// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const {
  createResearchNotebookMock,
  deleteResearchNotebookMock,
  getResearchNotebookMock,
  getUserSettingsMock,
  listAcervoDocumentsMock,
  listResearchNotebooksMock,
  saveNotebookDocumentToDocumentsMock,
  saveUserSettingsMock,
  startTaskMock,
  toast,
  updateResearchNotebookMock,
} = vi.hoisted(() => ({
  createResearchNotebookMock: vi.fn(),
  deleteResearchNotebookMock: vi.fn(),
  getResearchNotebookMock: vi.fn(),
  getUserSettingsMock: vi.fn(),
  listAcervoDocumentsMock: vi.fn(),
  listResearchNotebooksMock: vi.fn(),
  saveNotebookDocumentToDocumentsMock: vi.fn(),
  saveUserSettingsMock: vi.fn(),
  startTaskMock: vi.fn(() => 'task-1'),
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  updateResearchNotebookMock: vi.fn(),
}))

vi.mock('../../components/DeepResearchModal', () => ({
  DeepResearchModal: () => null,
  createDeepSearchSteps: () => [],
  createExternalSearchSteps: () => [],
  createJurisprudenceSteps: () => [],
}))

vi.mock('../../components/JurisprudenceConfigModal', () => ({
  default: () => null,
}))

vi.mock('../../components/SearchResultsModal', () => ({
  default: () => null,
}))

vi.mock('../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
}))

vi.mock('../../components/Toast', () => ({
  useToast: () => toast,
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}))

vi.mock('../../contexts/TaskManagerContext', () => ({
  useTaskManager: () => ({
    startTask: startTaskMock,
    tasks: [],
  }),
}))

vi.mock('../../lib/firebase', () => ({
  IS_FIREBASE: true,
}))

vi.mock('../../lib/firestore-service', () => ({
  createResearchNotebook: createResearchNotebookMock,
  deleteResearchNotebook: deleteResearchNotebookMock,
  getResearchNotebook: getResearchNotebookMock,
  getUserSettings: getUserSettingsMock,
  listAcervoDocuments: listAcervoDocumentsMock,
  listResearchNotebooks: listResearchNotebooksMock,
  saveNotebookDocumentToDocuments: saveNotebookDocumentToDocumentsMock,
  saveUserSettings: saveUserSettingsMock,
  updateResearchNotebook: updateResearchNotebookMock,
}))

vi.mock('../../lib/notebook-context-audit', () => {
  const baseAudit = {
    conversationEntries: [],
    conversationSummary: {
      droppedMessages: 0,
      includedChars: 180,
      includedMessages: 1,
      totalMessages: 1,
      truncatedByChars: false,
    },
    conversationText: 'Mensagem recente aproveitada.',
    customInstructionsChars: 0,
    liveWebChars: 0,
    liveWebEnabled: false,
    searchSummary: {
      includedChars: 0,
      totalEntries: 0,
      truncated: false,
    },
    sourceEntries: [
      {
        id: 'src-1',
        included: true,
        includedChars: 1200,
        label: 'Acervo',
        originalChars: 1200,
        title: 'Acórdão base',
        truncated: false,
      },
    ],
    sourceSummary: {
      includedChars: 1200,
      includedSources: 1,
      totalSources: 1,
      truncatedSources: 0,
    },
    sourceText: 'Trecho relevante do acórdão base.',
    totalContextChars: 1380,
  }

  return {
    buildChatContextAudit: () => baseAudit,
    buildResearchContextAudit: () => ({
      compiledChars: 0,
      dateRangeLabel: null,
      legalArea: null,
      mode: 'preview',
      queryChars: 0,
      resultCount: 0,
      selectedCount: 0,
      sourceKindLabel: 'Pesquisa externa',
      totalContextChars: 0,
      tribunalCount: 0,
      usedSnippetFallback: false,
    }),
    buildStudioContextAudit: () => baseAudit,
  }
})

vi.mock('../notebook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../notebook')>()

  return {
    ...actual,
    CopyButton: () => null,
  }
})

vi.mock('../notebook/utils', () => ({
  formatDate: () => '19 abr 2026',
  generateId: () => 'generated-id',
  getExtensionFromMimeType: () => 'txt',
  renderMarkdownToHtml: (content: string) => content,
}))

import ResearchNotebookV2 from './ResearchNotebookV2'

function makeNotebook(overrides: Record<string, unknown> = {}) {
  return {
    artifacts: [],
    created_at: '2026-04-19T10:00:00.000Z',
    description: 'Mapeamento das fontes, teses e riscos do tema.',
    id: 'nb-1',
    llm_executions: [],
    messages: [
      {
        content: 'Mapeie a jurisprudência dominante.',
        created_at: '2026-04-19T10:30:00.000Z',
        id: 'msg-1',
        role: 'user',
      },
    ],
    research_audits: [],
    saved_searches: [],
    sources: [
      {
        added_at: '2026-04-19T10:05:00.000Z',
        id: 'src-1',
        kind: 'document',
        status: 'ready',
        text_content: 'Texto integral da fonte principal.',
        title: 'Acórdão base',
        type: 'acervo',
      },
    ],
    status: 'active',
    title: 'Caderno de Nepotismo',
    topic: 'Nepotismo administrativo',
    updated_at: '2026-04-19T11:00:00.000Z',
    ...overrides,
  }
}

function renderWorkbench(route = '/labs/notebook-v2?open=nb-1&section=overview') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/notebook" element={<ResearchNotebookV2 />} />
        <Route path="/labs/notebook-v2" element={<ResearchNotebookV2 />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ResearchNotebookV2 page', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    listResearchNotebooksMock.mockImplementation(async () => ({ items: [makeNotebook()] }))
    getResearchNotebookMock.mockImplementation(async () => makeNotebook())
    getUserSettingsMock.mockResolvedValue({ last_jurisprudence_tribunal_aliases: [] })
    listAcervoDocumentsMock.mockResolvedValue({ items: [] })
    createResearchNotebookMock.mockResolvedValue(makeNotebook())
    deleteResearchNotebookMock.mockResolvedValue(undefined)
    saveNotebookDocumentToDocumentsMock.mockResolvedValue(undefined)
    saveUserSettingsMock.mockResolvedValue(undefined)
    updateResearchNotebookMock.mockResolvedValue(undefined)
  })

  it('renders the workbench with V2-first actions after hydrating the notebook', async () => {
    renderWorkbench()

    await waitFor(() => {
      expect(getResearchNotebookMock).toHaveBeenCalledWith('user-1', 'nb-1')
    })

    expect(await screen.findByRole('heading', { name: 'Nepotismo administrativo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /contingência clássica/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /modo classico/i })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /abrir notebook clássico/i })).toBeNull()
  })

  it('navigates from the overview deck to the sources section through the V2 path', async () => {
    renderWorkbench()

    const openSourcesLink = await screen.findByRole('link', { name: /abrir fontes no v2/i })
    fireEvent.click(openSourcesLink)

    expect(await screen.findByText('Pesquisadores de fonte')).toBeTruthy()
    await waitFor(() => {
      expect(listAcervoDocumentsMock).toHaveBeenCalledWith('user-1')
    })
  })

  it('shows the V2-first empty state when opening the artifacts section directly', async () => {
    renderWorkbench('/labs/notebook-v2?open=nb-1&section=artifacts')

    expect(await screen.findByText('Viewer, estúdio e pós-geração agora vivem no V2')).toBeTruthy()
    expect(screen.getByText(/use o estúdio v2 para criar a primeira saída/i)).toBeTruthy()
  })

  it('switches to the contingency section from the workbench chip', async () => {
    renderWorkbench()

    const contingencyChip = await screen.findByRole('button', { name: /contingência clássica/i })
    fireEvent.click(contingencyChip)

    expect(await screen.findByText('Notebook classico')).toBeTruthy()
    expect(screen.getByText('Estudio classico')).toBeTruthy()
  })
})