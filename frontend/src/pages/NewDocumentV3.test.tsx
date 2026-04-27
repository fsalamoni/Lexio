// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const {
  createDocumentV3Mock,
  generateDocumentV3Mock,
  loadAdminDocumentTypesMock,
  loadAdminLegalAreasMock,
  getProfileMock,
  startTaskMock,
  toast,
} = vi.hoisted(() => ({
  createDocumentV3Mock: vi.fn(async (..._args: unknown[]) => ({ id: 'doc-v3-1' })),
  generateDocumentV3Mock: vi.fn(async (..._args: unknown[]) => undefined),
  loadAdminDocumentTypesMock: vi.fn(async (..._args: unknown[]) => [
    { id: 'parecer', name: 'Parecer Jurídico', description: '', templates: [] },
  ]),
  loadAdminLegalAreasMock: vi.fn(async (..._args: unknown[]) => [
    { id: 'civil', name: 'Direito Civil', description: '' },
  ]),
  getProfileMock: vi.fn(async (..._args: unknown[]) => null),
  startTaskMock: vi.fn((_label: string, fn: (cb: (p: unknown) => void) => Promise<unknown>) => {
    // Execute the task synchronously for the test
    fn(() => {}).catch(() => {})
    return 'task-1'
  }),
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

vi.mock('../lib/firebase', () => ({ IS_FIREBASE: true }))

vi.mock('../lib/firestore-service', () => ({
  loadAdminDocumentTypes: () => loadAdminDocumentTypesMock(),
  loadAdminLegalAreas: () => loadAdminLegalAreasMock(),
  getProfile: (uid: string) => getProfileMock(uid),
  getDocumentTypesForProfile: (_p: unknown, list: unknown) => list,
  getLegalAreasForProfile: (_p: unknown, list: unknown) => list,
}))

vi.mock('../lib/document-v3-orchestrator', () => ({
  createDocumentV3: (...a: unknown[]) => createDocumentV3Mock(...(a as Parameters<typeof createDocumentV3Mock>)),
  generateDocumentV3: (...a: unknown[]) => generateDocumentV3Mock(...(a as Parameters<typeof generateDocumentV3Mock>)),
}))

vi.mock('../components/Toast', () => ({
  useToast: () => toast,
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'uid-1', token: 'tok', role: 'user', isReady: true, fullName: 'Tester' }),
}))

vi.mock('../contexts/TaskManagerContext', () => ({
  useTaskManager: () => ({ startTask: startTaskMock }),
}))

vi.mock('../components/AgentTrailProgressModalV3', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children?: React.ReactNode }) => (
    isOpen ? <div data-testid="agent-trail-v3-modal">{children}</div> : null
  ),
}))

vi.mock('../components/PipelineProgressPanelV3', () => ({
  default: () => <div data-testid="pipeline-panel-v3" />,
}))

import NewDocumentV3 from './NewDocumentV3'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/documents/new-v3"]}>
      <NewDocumentV3 />
    </MemoryRouter>,
  )
}

describe('NewDocumentV3 page', () => {
  beforeEach(() => {
    createDocumentV3Mock.mockClear()
    generateDocumentV3Mock.mockClear()
    startTaskMock.mockClear()
  })
  afterEach(() => cleanup())

  it('renders the v3 hero, doc type select and submit button', async () => {
    renderPage()
    expect(screen.getByText(/Pipeline supervisionada multi-agente/i)).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Parecer Jurídico' })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: /Gerar com pipeline v3/i })).toBeTruthy()
  })

  it('calls createDocumentV3 + generateDocumentV3 on submit', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('option', { name: 'Parecer Jurídico' }))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'parecer' } })
    fireEvent.change(screen.getByPlaceholderText(/Descreva a questão jurídica/i), {
      target: { value: 'Caso de teste para v3' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Gerar com pipeline v3/i }))

    await waitFor(() => expect(createDocumentV3Mock).toHaveBeenCalledTimes(1))
    const calls = createDocumentV3Mock.mock.calls as unknown as Array<[string, { document_type_id: string }]>
    expect(calls[0][0]).toBe('uid-1')
    expect(calls[0][1].document_type_id).toBe('parecer')
    await waitFor(() => expect(generateDocumentV3Mock).toHaveBeenCalledTimes(1))
  })
})
