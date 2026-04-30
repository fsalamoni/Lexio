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
import {
  FIRESTORE_AUTH_ACCESS_DEGRADED_EVENT,
  FIRESTORE_AUTH_SESSION_INVALID_EVENT,
  getSessionFingerprint,
} from '../lib/auth-session-events'

function Probe({ emitInvalidSession, emitAuthAccessDegraded, triggerManualLogout }: {
  emitInvalidSession?: boolean
  emitAuthAccessDegraded?: boolean
  triggerManualLogout?: boolean
}) {
  const { isReady, userId, logout } = useAuth()

  useEffect(() => {
    if (!emitInvalidSession) return
    window.dispatchEvent(new CustomEvent(FIRESTORE_AUTH_SESSION_INVALID_EVENT, {
      detail: {
        contextLabel: 'listDocuments.query',
        authUid: 'user-1',
        sessionFingerprint: getSessionFingerprint('user-1'),
        occurredAt: Date.now(),
      },
    }))
  }, [emitInvalidSession])

  useEffect(() => {
    if (!triggerManualLogout) return
    void logout()
  }, [logout, triggerManualLogout])

  useEffect(() => {
    if (!emitAuthAccessDegraded) return
    window.dispatchEvent(new CustomEvent(FIRESTORE_AUTH_ACCESS_DEGRADED_EVENT, {
      detail: {
        contextLabel: 'listDocuments.query',
        authUid: 'user-1',
        sessionFingerprint: getSessionFingerprint('user-1'),
        occurredAt: Date.now(),
        routePath: '/documents',
        appVersion: 'test',
        errorCode: 'permission-denied',
        burstCount: 6,
        uniqueContexts: 3,
      },
    }))
  }, [emitAuthAccessDegraded])

  return (
    <>
      <div data-testid="ready">{String(isReady)}</div>
      <div data-testid="user-id">{userId ?? 'null'}</div>
    </>
  )
}

describe('AuthContext session recovery', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
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

  it('resyncs token/profile on session-invalid signal without forcing logout when refresh succeeds', async () => {
    render(
      <AuthProvider>
        <Probe emitInvalidSession />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('user-1')
    })

    await waitFor(() => {
      expect(currentUser.getIdToken).toHaveBeenCalledWith(true)
    })

    expect(mockFirebaseLogout).not.toHaveBeenCalled()
    expect(localStorage.getItem('lexio_user_id')).toBe('user-1')
  })

  it('keeps session active when forced refresh fails after invalid-session signal', async () => {
    currentUser.getIdToken
      .mockResolvedValueOnce('token-first-hydration')
      .mockRejectedValueOnce(new Error('token refresh failed'))

    render(
      <AuthProvider>
        <Probe emitInvalidSession />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('user-1')
    })

    expect(mockFirebaseLogout).not.toHaveBeenCalled()
    expect(localStorage.getItem('lexio_user_id')).toBe('user-1')
  })

  it('forces clean logout when Firestore keeps rejecting access after forced refresh', async () => {
    // CRITICAL regression test: when Firebase Auth issues a fresh token but
    // Firestore continues to return permission-denied on the bootstrap read,
    // the persisted token is structurally invalid for this account. Restoring
    // it from localStorage would re-trigger the same denial on every query
    // and produce the dashboard "Erro ao carregar dashboard" loop observed in
    // production (Apr 2026). The recovery handler MUST escalate to a clean
    // logout so the user re-authenticates from scratch instead of looping.
    currentUser.getIdToken.mockResolvedValue('token-refreshed')
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ role: 'user', full_name: 'Test User' }),
      })
      .mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      }))

    render(
      <AuthProvider>
        <Probe emitInvalidSession />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(mockFirebaseLogout).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('null')
    })

    expect(localStorage.getItem('lexio_user_id')).toBeNull()
    expect(localStorage.getItem('lexio_token')).toBeNull()
  })

  it('forces clean logout when initial hydration is rejected by Firestore', async () => {
    // Boot-time variant: the very first /users/{uid} read after
    // onAuthStateChanged returns permission-denied. The previous code path
    // restored the dead token from localStorage, leaving the dashboard in a
    // permanent "logged in but every read fails" state. The fix must clear
    // the session cleanly so the route guard redirects to /login.
    currentUser.getIdToken.mockResolvedValue('token-refreshed')
    mockGetDoc.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    }))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(mockFirebaseLogout).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('null')
    })

    expect(localStorage.getItem('lexio_user_id')).toBeNull()
    expect(localStorage.getItem('lexio_token')).toBeNull()
  })

  it('only logs out when user explicitly requests logoff', async () => {
    render(
      <AuthProvider>
        <Probe triggerManualLogout />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(mockFirebaseLogout).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('null')
    })

    expect(localStorage.getItem('lexio_user_id')).toBeNull()
    expect(localStorage.getItem('lexio_token')).toBeNull()
  })

  it('triggers kill switch and clears session on auth-access degraded event', async () => {
    render(
      <AuthProvider>
        <Probe emitAuthAccessDegraded />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(mockFirebaseLogout).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('user-id').textContent).toBe('null')
    })

    expect(localStorage.getItem('lexio_user_id')).toBeNull()
    expect(localStorage.getItem('lexio_token')).toBeNull()
  })
})
