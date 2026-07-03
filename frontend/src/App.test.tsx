// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  current: {
    isReady: true,
    role: 'user',
    token: 'token-1',
    userId: 'user-1',
  },
}))

vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => authState.current,
}))

vi.mock('./contexts/TaskManagerContext', () => ({
  TaskManagerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./components/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./components/TaskBar', () => ({
  default: () => <div data-testid="task-bar" />,
}))

vi.mock('./components/ThemeSkinSelector', () => ({
  useApplyPlatformSkin: () => undefined,
}))

vi.mock('./components/v2/V2WorkspaceLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="workspace-layout">{children}</div>,
}))

vi.mock('./lib/feature-flags', () => ({
  FEATURE_FLAGS_UPDATED_EVENT: 'lexio:flags-updated',
  clearRuntimeFeatureFlags: vi.fn(),
  isEnabled: vi.fn(() => false),
}))

vi.mock('./lib/firebase', () => ({ IS_FIREBASE: true }))

vi.mock('./lib/settings-store', () => ({
  hydrateRuntimeFeatureFlags: vi.fn(async () => undefined),
}))

vi.mock('./lib/workspace-routes', () => ({
  buildWorkspaceSettingsPath: ({ preserveSearch }: { preserveSearch?: string }) => `/settings${preserveSearch ?? ''}`,
}))

vi.mock('./pages/auth/Login', () => ({
  default: () => <div data-testid="login-page">Login</div>,
}))

vi.mock('./pages/auth/Register', () => ({
  default: () => <div data-testid="register-page">Register</div>,
}))

vi.mock('./pages/auth/ForgotPassword', () => ({
  default: () => <div data-testid="forgot-password-page">Forgot Password</div>,
}))

vi.mock('./pages/auth/ResetPassword', () => ({
  default: () => <div data-testid="reset-password-page">Reset Password</div>,
}))

vi.mock('./pages/labs/DashboardV2', () => ({
  default: () => <div data-testid="dashboard-page">Dashboard</div>,
}))

vi.mock('./pages/DocumentList', () => ({
  default: () => <div data-testid="documents-page">Documents</div>,
}))

vi.mock('./pages/NewDocument', () => ({
  default: () => <div data-testid="legacy-new-document-page">Legacy New Document</div>,
}))

vi.mock('./pages/NewDocumentV3', () => ({
  default: () => <div data-testid="new-document-v3-page">New Document V3</div>,
}))

vi.mock('./pages/DocumentDetail', () => ({
  default: () => <div data-testid="document-detail-page">Document Detail</div>,
}))

vi.mock('./pages/DocumentEditor', () => ({
  default: () => <div data-testid="document-editor-page">Document Editor</div>,
}))

vi.mock('./pages/Upload', () => ({
  default: () => <div data-testid="upload-page">Upload</div>,
}))

vi.mock('./pages/AdminPanel', () => ({
  default: () => <div data-testid="settings-page">Settings</div>,
}))

vi.mock('./pages/CostTokensPage', () => ({
  default: () => <div data-testid="personal-costs-page">Personal Costs</div>,
}))

vi.mock('./pages/PlatformAdminPanel', () => ({
  default: () => <div data-testid="platform-admin-page">Platform Admin</div>,
}))

vi.mock('./pages/PlatformCostsPage', () => ({
  default: () => <div data-testid="platform-costs-page">Platform Costs</div>,
}))

vi.mock('./pages/Onboarding', () => ({
  default: () => <div data-testid="onboarding-page">Onboarding</div>,
}))

vi.mock('./pages/ThesisBank', () => ({
  default: () => <div data-testid="thesis-page">Theses</div>,
}))

vi.mock('./pages/labs/ResearchNotebookV2', () => ({
  default: () => <div data-testid="notebook-page">Notebook</div>,
}))

vi.mock('./pages/Chat', () => ({
  default: () => <div data-testid="chat-page">Chat</div>,
}))

vi.mock('./pages/labs/ProfileV2', () => ({
  default: () => <div data-testid="profile-page">Profile</div>,
}))

vi.mock('./pages/NotFound', () => ({
  default: () => <div data-testid="not-found-page">Not Found</div>,
}))

import App from './App'

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

describe('App route coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.current = {
      isReady: true,
      role: 'user',
      token: 'token-1',
      userId: 'user-1',
    }
  })

  afterEach(() => {
    cleanup()
    window.history.pushState({}, '', '/')
  })

  it('renders the protected chat route for authenticated sessions', async () => {
    renderAt('/chat')

    expect(await screen.findByTestId('chat-page')).toBeTruthy()
    expect(window.location.pathname).toBe('/chat')
  })

  it('renders the protected dashboard route at the workspace root', async () => {
    renderAt('/')

    expect(await screen.findByTestId('dashboard-page')).toBeTruthy()
    expect(window.location.pathname).toBe('/')
  })

  it('redirects protected routes to login when the session is missing', async () => {
    authState.current = {
      isReady: true,
      role: 'user',
      token: '',
      userId: 'user-1',
    }

    renderAt('/chat')

    expect(await screen.findByTestId('login-page')).toBeTruthy()
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login')
    })
  })

  it('redirects the legacy v3 alias to the canonical new document route', async () => {
    renderAt('/documents/new-v3')

    expect(await screen.findByTestId('new-document-v3-page')).toBeTruthy()
    await waitFor(() => {
      expect(window.location.pathname).toBe('/documents/new')
    })
  })

  it('renders the protected document detail route for authenticated sessions', async () => {
    renderAt('/documents/doc-1')

    expect(await screen.findByTestId('document-detail-page')).toBeTruthy()
    expect(window.location.pathname).toBe('/documents/doc-1')
  })

  it('renders the protected document editor route for authenticated sessions', async () => {
    renderAt('/documents/doc-1/edit')

    expect(await screen.findByTestId('document-editor-page')).toBeTruthy()
    expect(window.location.pathname).toBe('/documents/doc-1/edit')
  })

  it('redirects non-admin users away from admin routes while preserving the query string', async () => {
    renderAt('/admin?tab=advanced')

    expect(await screen.findByTestId('settings-page')).toBeTruthy()
    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings')
      expect(window.location.search).toBe('?tab=advanced')
    })
  })

  it('renders the protected onboarding route for authenticated sessions', async () => {
    renderAt('/onboarding')

    expect(await screen.findByTestId('onboarding-page')).toBeTruthy()
    expect(window.location.pathname).toBe('/onboarding')
  })

  it('renders the public register route', async () => {
    renderAt('/register')

    expect(await screen.findByTestId('register-page')).toBeTruthy()
    expect(window.location.pathname).toBe('/register')
  })

  it('renders the public forgot-password route', async () => {
    renderAt('/forgot-password')

    expect(await screen.findByTestId('forgot-password-page')).toBeTruthy()
    expect(window.location.pathname).toBe('/forgot-password')
  })

  it('renders the public reset-password route', async () => {
    renderAt('/reset-password')

    expect(await screen.findByTestId('reset-password-page')).toBeTruthy()
    expect(window.location.pathname).toBe('/reset-password')
  })

  it('renders the not-found route for unmatched workspace paths', async () => {
    renderAt('/route-not-found')

    expect(await screen.findByTestId('not-found-page')).toBeTruthy()
    expect(window.location.pathname).toBe('/route-not-found')
  })
})