import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockGetIdToken, mockCurrentUser } = vi.hoisted(() => {
  const getIdToken = vi.fn()
  return {
    mockGetIdToken: getIdToken,
    mockCurrentUser: { uid: 'user-1', getIdToken },
  }
})

vi.mock('./firebase', () => ({
  firebaseAuth: { currentUser: mockCurrentUser },
  IS_FIREBASE: true,
  firestore: { _fake: true },
}))

import {
  __resetFirebaseTokenRefreshGuardsForTests,
  UNRECOVERABLE_FIREBASE_TOKEN_REFRESH_CODE,
  markUnrecoverableFirebaseTokenRefresh,
} from './firebase-auth-errors'

import {
  shouldRetryTransientFirebaseAuthError,
  withTransientFirebaseAuthRetry,
} from './firebase-auth-retry'

describe('firebase-auth-retry', () => {
  beforeEach(() => {
    __resetFirebaseTokenRefreshGuardsForTests()
    mockGetIdToken.mockReset()
    mockGetIdToken.mockResolvedValue('token-fresh')
  })

  it('recognizes bare unauthenticated codes as hydration-retry candidates', () => {
    expect(shouldRetryTransientFirebaseAuthError({
      code: 'unauthenticated',
      message: 'temporary auth sync',
    })).toBe(true)
  })

  it('retries once when firebase auth is still hydrating', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Sessão do Firebase não sincronizada. Faça login novamente.'), {
        code: 'firestore/unauthenticated',
      }))
      .mockResolvedValueOnce('ok')

    await expect(withTransientFirebaseAuthRetry(operation, 0)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('retries permission-denied exactly once after forcing a fresh ID token', async () => {
    // CRITICAL regression test: ThesisBank/Dashboard mount-time bursts can
    // briefly trip the Firestore SDK into permission-denied even though the
    // session is fully valid. The page-level retry must give the SDK ONE
    // more chance after force-refreshing the ID token before surfacing the
    // error to the user. This complements (does not replace) the inner
    // 3x retry loop in withFirestoreRetry.
    const error = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })
    const operation = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('ok')

    await expect(withTransientFirebaseAuthRetry(operation, 0)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledWith(true)
  })

  it('propagates persistent permission-denied without amplifying load past one retry', async () => {
    const error = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })
    const operation = vi.fn().mockRejectedValue(error)

    await expect(withTransientFirebaseAuthRetry(operation, 0)).rejects.toBe(error)
    // Initial attempt + exactly 1 retry after token refresh — never more.
    expect(operation).toHaveBeenCalledTimes(2)
    expect(mockGetIdToken).toHaveBeenCalledTimes(1)
    // The classifier itself still treats permission-denied as non-transient
    // for the legacy hydration path; the retry happens via a dedicated branch.
    expect(shouldRetryTransientFirebaseAuthError(error)).toBe(false)
  })

  it('does not retry the operation when forced token refresh is unrecoverable', async () => {
    const error = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })
    const refreshError = Object.assign(new Error('Firebase: Error (auth/invalid-user-token).'), {
      code: 'auth/invalid-user-token',
    })
    const operation = vi.fn().mockRejectedValue(error)
    mockGetIdToken.mockRejectedValue(refreshError)

    await expect(withTransientFirebaseAuthRetry(operation, 0)).rejects.toMatchObject({
      code: UNRECOVERABLE_FIREBASE_TOKEN_REFRESH_CODE,
    })

    expect(operation).toHaveBeenCalledTimes(1)
    expect(mockGetIdToken).toHaveBeenCalledTimes(1)
  })

  it('reuses the recent unrecoverable-refresh guard without calling securetoken again', async () => {
    const error = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'firestore/permission-denied',
    })
    const operation = vi.fn().mockRejectedValue(error)
    markUnrecoverableFirebaseTokenRefresh('user-1')

    await expect(withTransientFirebaseAuthRetry(operation, 0)).rejects.toMatchObject({
      code: UNRECOVERABLE_FIREBASE_TOKEN_REFRESH_CODE,
    })

    expect(operation).toHaveBeenCalledTimes(1)
    expect(mockGetIdToken).not.toHaveBeenCalled()
  })
})
