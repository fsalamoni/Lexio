// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  updateDocumentMock: vi.fn(),
  deleteDocumentMock: vi.fn(),
  generateDocumentV3Mock: vi.fn(),
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiDeleteMock: vi.fn(),
  invalidateApiCacheMock: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('../lib/firebase', () => ({ IS_FIREBASE: true }))

vi.mock('../lib/firestore-service', () => ({
  getDocument: (...args: unknown[]) => mocks.getDocumentMock(...args),
  updateDocument: (...args: unknown[]) => mocks.updateDocumentMock(...args),
  deleteDocument: (...args: unknown[]) => mocks.deleteDocumentMock(...args),
}))

vi.mock('../lib/document-v3-orchestrator', () => ({
  generateDocumentV3: (...args: unknown[]) => mocks.generateDocumentV3Mock(...args),
}))

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGetMock(...args),
    post: (...args: unknown[]) => mocks.apiPostMock(...args),
    delete: (...args: unknown[]) => mocks.apiDeleteMock(...args),
  },
  invalidateApiCache: (...args: unknown[]) => mocks.invalidateApiCacheMock(...args),
}))

vi.mock('../components/StatusBadge', () => ({
  default: ({ status }: { status: string }) => <div data-testid="status-badge">{status}</div>,
}))

vi.mock('../components/Breadcrumb', () => ({
  default: () => <div data-testid="breadcrumb" />,
}))

vi.mock('../components/ProgressTracker', () => ({
  default: () => <div data-testid="progress-tracker" />,
}))

vi.mock('../components/PipelineProgressPanelV3', () => ({
  default: () => <div data-testid="pipeline-progress-panel-v3" />,
}))

vi.mock('../components/AgentTrailProgressModalV3', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children?: React.ReactNode }) => (
    isOpen ? <div data-testid="agent-trail-progress-modal-v3">{children}</div> : null
  ),
}))

vi.mock('../components/ConfirmDialog', () => ({
  default: () => null,
}))

vi.mock('../components/Toast', () => ({
  useToast: () => mocks.toast,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    role: 'user',
    userId: 'user-1',
  }),
}))

vi.mock('../components/v2/V2PagePrimitives', () => ({
  V2EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  ),
  V2MetricGrid: () => <div data-testid="metric-grid" />,
  V2PageHero: ({ title, description, actions, aside }: { title: string; description: string; actions?: React.ReactNode; aside?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
      {aside}
    </div>
  ),
}))

vi.mock('../lib/docx-generator', () => ({
  generateAndDownloadDocx: vi.fn(),
}))

import DocumentDetail from './DocumentDetail'

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    document_type_id: 'parecer',
    tema: 'Tema de teste',
    status: 'concluido',
    quality_score: null,
    quality_issues: null,
    original_request: 'Pedido original',
    created_at: '2026-05-09T10:00:00.000Z',
    docx_path: null,
    legal_area_ids: [],
    request_context: null,
    texto_completo: 'Texto integral para o documento.',
    context_detail: null,
    origem: 'workspace',
    notebook_id: null,
    notebook_title: null,
    metadata_: undefined,
    ...overrides,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}{location.search}</div>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/documents/doc-1?tab=review']}>
      <Routes>
        <Route
          path="/documents/:id"
          element={(
            <>
              <DocumentDetail />
              <LocationProbe />
            </>
          )}
        />
        <Route
          path="/documents/new"
          element={(
            <>
              <div data-testid="new-document-target">Novo Documento</div>
              <LocationProbe />
            </>
          )}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function readLocation() {
  const locationText = screen.getByTestId('location-probe').textContent || ''
  const [pathname, search = ''] = locationText.split('?')
  return {
    pathname,
    params: new URLSearchParams(search),
  }
}

describe('DocumentDetail page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDocumentMock.mockResolvedValue(makeDocument())
    mocks.updateDocumentMock.mockResolvedValue(undefined)
    mocks.deleteDocumentMock.mockResolvedValue(undefined)
    mocks.generateDocumentV3Mock.mockResolvedValue(undefined)
    mocks.apiGetMock.mockResolvedValue({ data: [] })
    mocks.apiPostMock.mockResolvedValue({})
    mocks.apiDeleteMock.mockResolvedValue({})
  })

  afterEach(() => {
    cleanup()
  })

  it('retries failed documents through the v3 rail', async () => {
    mocks.getDocumentMock.mockResolvedValue(makeDocument({ status: 'erro', texto_completo: null }))

    renderPage()

    const retryButton = await screen.findByRole('button', { name: /reprocessar documento/i })
    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(mocks.updateDocumentMock).toHaveBeenCalledWith(
        'user-1',
        'doc-1',
        expect.objectContaining({
          request_context: expect.objectContaining({ pipeline_version: 'v3' }),
        }),
      )
    })

    await waitFor(() => {
      expect(mocks.generateDocumentV3Mock).toHaveBeenCalledWith(
        'user-1',
        'doc-1',
        'parecer',
        'Pedido original',
        [],
        expect.objectContaining({ pipeline_version: 'v3' }),
        expect.any(Function),
        undefined,
        null,
      )
    })

    expect(mocks.toast.success).toHaveBeenCalledWith('Reprocessamento iniciado')
  })

  it('opens notebook-origin documents in the canonical generator flow', async () => {
    mocks.getDocumentMock.mockResolvedValue(makeDocument({
      origem: 'caderno',
      notebook_id: 'nb-1',
      notebook_title: 'Caderno de Teste',
      original_request: 'Pedido notebook',
      texto_completo: null,
    }))

    renderPage()

    const openGeneratorButton = await screen.findByRole('button', { name: /abrir no gerador/i })
    fireEvent.click(openGeneratorButton)

    await waitFor(() => {
      expect(screen.getByTestId('new-document-target')).toBeTruthy()
    })

    const location = readLocation()
    expect(location.pathname).toBe('/documents/new')
    expect(location.params.get('request')).toBe('Pedido notebook')
    expect(location.params.get('type')).toBe('parecer')
  })

  it('duplicates documents into a canonical new-document request', async () => {
    mocks.getDocumentMock.mockResolvedValue(makeDocument({
      original_request: 'Pedido duplicado',
    }))

    renderPage()

    const duplicateButton = await screen.findByRole('button', { name: /duplicar/i })
    fireEvent.click(duplicateButton)

    await waitFor(() => {
      expect(screen.getByTestId('new-document-target')).toBeTruthy()
    })

    const location = readLocation()
    expect(location.pathname).toBe('/documents/new')
    expect(location.params.get('request')).toBe('Pedido duplicado')
    expect(location.params.get('type')).toBe('parecer')
  })
})