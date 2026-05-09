// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const authState = vi.hoisted(() => ({
  current: {
    fullName: 'Tester',
    role: 'user',
    logout: vi.fn(),
  },
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}))

vi.mock('../../lib/workspace-routes', () => ({
  buildWorkspaceShellPath: (to: string, options?: { preserveSearch?: string }) => `${to}${options?.preserveSearch ?? ''}`,
}))

vi.mock('../ConfirmDialog', () => ({
  default: () => null,
}))

import V2WorkspaceLayout from './V2WorkspaceLayout'

function renderLayout(route = '/documents/new-v3?tab=overview') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <V2WorkspaceLayout>
        <div data-testid="layout-child">Workspace child</div>
      </V2WorkspaceLayout>
    </MemoryRouter>,
  )
}

describe('V2WorkspaceLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.current = {
      fullName: 'Tester',
      role: 'user',
      logout: vi.fn(),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps a single canonical novo documento entry active for the v3 alias and preserves search params', () => {
    renderLayout()

    expect(screen.getByTestId('layout-child')).toBeTruthy()

    const links = screen.getAllByRole('link', { name: /novo documento/i })
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/documents/new?tab=overview')
    expect(links[0].className).toContain('v2-nav-card-active')
  })

  it('hides admin navigation for non-admin users', () => {
    renderLayout('/settings')

    expect(screen.queryByRole('link', { name: /administracao/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /custos da plataforma/i })).toBeNull()
  })

  it('shows admin navigation for admin users', () => {
    authState.current = {
      fullName: 'Admin Tester',
      role: 'admin',
      logout: vi.fn(),
    }

    renderLayout('/admin')

    expect(screen.getByRole('link', { name: /administracao/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /custos da plataforma/i })).toBeTruthy()
  })
})