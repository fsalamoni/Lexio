// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const authState = vi.hoisted(() => ({
  current: {
    fullName: 'Tester',
    role: 'user',
    userId: 'user-1',
    logout: vi.fn(),
  },
}))

const listDocumentsMock = vi.hoisted(() => vi.fn(async (_userId?: string, _options?: unknown) => ({ items: [] })))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}))

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('../lib/firebase', () => ({ IS_FIREBASE: true }))

vi.mock('../lib/firestore-service', () => ({
  listDocuments: listDocumentsMock,
}))

vi.mock('../lib/workspace-routes', () => ({
  buildWorkspaceShellPath: (to: string, options?: { preserveSearch?: string }) => `${to}${options?.preserveSearch ?? ''}`,
}))

vi.mock('./ConfirmDialog', () => ({
  default: () => null,
}))

import Sidebar from './Sidebar'

function renderSidebar(route = '/documents/new-v3?tab=review') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Sidebar open={false} onClose={() => undefined} />
    </MemoryRouter>,
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.current = {
      fullName: 'Tester',
      role: 'user',
      userId: 'user-1',
      logout: vi.fn(),
    }
    listDocumentsMock.mockResolvedValue({ items: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps a single canonical novo documento entry and preserves search params', async () => {
    renderSidebar()

    const links = await screen.findAllByRole('link', { name: /novo documento/i })
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/documents/new?tab=review')

    await waitFor(() => {
      expect(listDocumentsMock).toHaveBeenCalledWith('user-1', { status: 'em_revisao' })
    })
  })

  it('hides admin navigation for non-admin users', () => {
    renderSidebar('/settings')

    expect(screen.queryByRole('link', { name: /administração/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /custos da plataforma/i })).toBeNull()
  })

  it('shows admin navigation for admin users', () => {
    authState.current = {
      fullName: 'Admin Tester',
      role: 'admin',
      userId: 'user-1',
      logout: vi.fn(),
    }

    renderSidebar('/admin')

    expect(screen.getByRole('link', { name: /administração/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /custos da plataforma/i })).toBeTruthy()
  })
})