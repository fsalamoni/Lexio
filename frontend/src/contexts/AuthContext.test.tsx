// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'

const {
  mockOnAuthStateChanged,
  mockGetDoc,
  mockDoc,
  mockFirebaseLogout,
  mockFirebaseAuth,
  currentUser,
} = vi.hoisted(() => {
  const hoistedCurrentUser = {
    uid: 'user-1',
    email: 'user@example.com',
    displayName: 'Test User',
    getIdToken: vi.fn(),
  }

  return {
    mockOnAuthStateChanged: vi.fn(),
    mockGetDoc: vi.fn(),
    mockDoc: vi.fn(),
    mockFirebaseLogout: vi.fn(),
    mockFirebaseAuth: { currentUser: hoistedCurrentUser as typeof hoistedCurrentUser | null },
    currentUser: hoistedCurrentUser,
  }
})

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
  onIdTokenChanged: () => () => undefined,
}))

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}))

vi.mock('../lib/firebase', () => ({
  IS_FIREBASE: true,
  firebaseAuth: mockFirebaseAuth,
  firestore: { _fake: true },
}))

vi.mock('../lib/auth-service', () => ({
  firebaseLogin: vi.fn(),
  firebaseRegister: vi.fn(),
  firebaseLogout: (...args: unknown[]) => mockFirebaseLogout(...args),
  firebaseGoogleLogin: vi.fn(),
  handleGoogleRedirectResult: vi.fn().mockResolvedValue(null),
  translateFirebaseError: vi.fn((code: string) => code || 'erro'),
}))

import { AuthProvider, useAuth } from './AuthContext'

function Probe({ triggerManualLogout }: { triggerManualLogout?: boolean }) {
  const { isReady, userId, role, logout } = useAuth()

  useEffect(() => {
    if (!triggerManualLogout) return
    void logout()
  }, [logout, triggerManualLogout])

  return (
    <>
      <div data-testid="ready">{String(isReady)}</div>
      <div data-testid="user-id">{userId ?? 'null'}</div>
      <div data-testid="role">{role ?? 'null'}</div>
    </>
  )
}

describe('AuthContext session lifecycle', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.unstubAllEnvs()
    localStorage.setItem('lexio_token', 'token-initial-abcdefghijklmnop')
    localStorage.setItem('lexio_user_id', 'user-1')
    localStorage.setItem('lexio_role', 'user')
    localStorage.setItem('lexio_full_name', 'Test User')

    mockFirebaseAuth.currentUser = currentUser
    currentUser.getIdToken.mockResolvedValue('token-refreshed')
    mockFirebaseLogout.mockResolvedValue(undefined)
    mockDoc.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }))
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ role: 'user', full_name: 'Test User' }),
    })
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: unknown) => void) => {
      callback(mockFirebaseAuth.currentUser)
      return () => undefined
    })
  })

  it('hydrates session from Firebase Auth and persists fresh token', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('user-1')
    })

    expect(localStorage.getItem('lexio_token')).toBe('token-refreshed')
    expect(localStorage.getItem('lexio_user_id')).toBe('user-1')
    expect(mockFirebaseLogout).not.toHaveBeenCalled()
  })

  it('keeps the session live when /users/{uid} read fails with permission-denied', async () => {
    // Critical regression: a transient Firestore permission-denied during
    // profile hydration must NOT destroy the live session. Falls back to
    // localStorage values; the next read will retry naturally.
    mockGetDoc.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    }))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('user-1')
    })

    expect(mockFirebaseLogout).not.toHaveBeenCalled()
    expect(localStorage.getItem('lexio_user_id')).toBe('user-1')
    expect(localStorage.getItem('lexio_token')).toBe('token-refreshed')
  })

  it('preserves admin access for the configured admin email when profile hydration is deferred', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@example.com')
    currentUser.email = 'admin@example.com'
    mockGetDoc.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    }))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('role').textContent).toBe('admin')
    })

    expect(localStorage.getItem('lexio_role')).toBe('admin')
    expect(mockFirebaseLogout).not.toHaveBeenCalled()
  })

  it('keeps the session live when getIdToken fails transiently', async () => {
    currentUser.getIdToken.mockRejectedValue(new Error('network-request-failed'))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('user-1')
    })

    expect(mockFirebaseLogout).not.toHaveBeenCalled()
    // Token from localStorage stays in place; SDK retries on next call.
    expect(localStorage.getItem('lexio_token')).toBe('token-initial-abcdefghijklmnop')
  })

  it('clears the session when Firebase Auth reports no user (signed out remotely)', async () => {
    mockFirebaseAuth.currentUser = null
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: unknown) => void) => {
      callback(null)
      return () => undefined
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('null')
    })

    expect(localStorage.getItem('lexio_user_id')).toBeNull()
    expect(localStorage.getItem('lexio_token')).toBeNull()
  })

  it('clears the session only when the user explicitly requests logout', async () => {
    render(
      <AuthProvider>
        <Probe triggerManualLogout />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(mockFirebaseLogout).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('user-id').textContent).toBe('null')
    })

    expect(localStorage.getItem('lexio_user_id')).toBeNull()
    expect(localStorage.getItem('lexio_token')).toBeNull()
  })
})
