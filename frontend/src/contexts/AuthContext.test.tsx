import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
import { FIRESTORE_AUTH_SESSION_INVALID_EVENT, getSessionFingerprint } from '../lib/auth-session-events'

function Probe({ emitInvalidSession }: { emitInvalidSession?: boolean }) {
  const { isReady, userId } = useAuth()

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

  return (
    <>
      <div data-testid="ready">{String(isReady)}</div>
      <div data-testid="user-id">{userId ?? 'null'}</div>
    </>
  )
}

describe('AuthContext session recovery', () => {
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

  it('re-syncs token/profile on session-invalid signal without forcing logout when refresh succeeds', async () => {
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

  it('falls back to logout and clears local session when forced refresh fails', async () => {
    currentUser.getIdToken
      .mockResolvedValueOnce('token-first-hydration')
      .mockRejectedValueOnce(new Error('token refresh failed'))

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
  })
})
