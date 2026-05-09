// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const layoutMocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  sidebarProps: [] as Array<{ open: boolean }>,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => layoutMocks.navigateMock,
  }
})

vi.mock('./Sidebar', () => ({
  default: ({ open }: { open: boolean }) => {
    layoutMocks.sidebarProps.push({ open })
    return <div data-testid="sidebar-state">{open ? 'open' : 'closed'}</div>
  },
}))

vi.mock('./NotificationBell', () => ({
  default: () => <div data-testid="notification-bell">Bell</div>,
}))

vi.mock('./Toast', () => ({
  useToast: () => layoutMocks.toast,
}))

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(async () => ({ data: { items: [] } })),
  },
}))

vi.mock('../lib/firebase', () => ({ IS_FIREBASE: true }))

vi.mock('../lib/model-health-check', () => ({
  runModelHealthCheck: vi.fn(async () => ({ didRun: false, removedModels: [] })),
  formatHealthCheckMessage: vi.fn(() => ({ title: 'Health', message: 'ok' })),
}))

vi.mock('../lib/workspace-routes', () => ({
  buildWorkspaceDocumentDetailPath: (id: string, options?: { preserveSearch?: string }) => `/documents/${id}${options?.preserveSearch ?? ''}`,
}))

import Layout from './Layout'

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/documents']}>
      <Layout>
        <div data-testid="layout-child">Conteúdo</div>
      </Layout>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    layoutMocks.sidebarProps.length = 0
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the global shell, reacts to rate-limit events and opens the sidebar from the mobile menu', () => {
    renderLayout()

    expect(screen.getByTestId('layout-child')).toBeTruthy()
    expect(screen.getAllByTestId('notification-bell')).toHaveLength(2)
    expect(screen.getByTestId('sidebar-state').textContent).toBe('closed')

    window.dispatchEvent(new Event('lexio:rate-limit'))
    expect(layoutMocks.toast.error).toHaveBeenCalledWith('Muitas requisições', 'Aguarde um momento e tente novamente.')

    fireEvent.click(screen.getByRole('button', { name: /abrir menu/i }))

    expect(screen.getByTestId('sidebar-state').textContent).toBe('open')
  })

  it('shows and uses the scroll-to-top action when the main container is scrolled', () => {
    renderLayout()

    const main = screen.getByTestId('layout-child').closest('main')?.parentElement as HTMLDivElement
    main.scrollTo = vi.fn()
    Object.defineProperty(main, 'scrollTop', {
      configurable: true,
      get: () => 480,
    })

    fireEvent.scroll(main)

    fireEvent.click(screen.getByRole('button', { name: /voltar ao topo/i }))

    expect(main.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })
})