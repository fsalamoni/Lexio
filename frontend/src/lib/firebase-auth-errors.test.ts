import { describe, expect, it, beforeEach } from 'vitest'

import {
  __resetFirebaseTokenRefreshGuardsForTests,
  classifyFirebaseTokenRefreshError,
  clearUnrecoverableFirebaseTokenRefresh,
  createUnrecoverableFirebaseTokenRefreshError,
  hasRecentUnrecoverableFirebaseTokenRefresh,
  isUnrecoverableFirebaseTokenRefreshError,
  markUnrecoverableFirebaseTokenRefresh,
  UNRECOVERABLE_FIREBASE_TOKEN_REFRESH_CODE,
} from './firebase-auth-errors'

describe('firebase-auth-errors', () => {
  beforeEach(() => {
    __resetFirebaseTokenRefreshGuardsForTests()
  })

  it('classifies invalid refresh token payloads as unrecoverable', () => {
    const error = Object.assign(new Error('Firebase: Error (auth/internal-error).'), {
      code: 'auth/internal-error',
      customData: {
        serverResponse: JSON.stringify({
          error: { message: 'INVALID_REFRESH_TOKEN' },
        }),
      },
    })

    expect(classifyFirebaseTokenRefreshError(error)).toBe('unrecoverable')
    expect(isUnrecoverableFirebaseTokenRefreshError(error)).toBe(true)
  })

  it('classifies invalid API key payloads as configuration failures', () => {
    const error = Object.assign(new Error('API key not valid. Please pass a valid API key.'), {
      code: 'auth/invalid-api-key',
    })

    expect(classifyFirebaseTokenRefreshError(error)).toBe('configuration')
    expect(isUnrecoverableFirebaseTokenRefreshError(error)).toBe(true)
  })

  it('keeps network request failures as transient', () => {
    const error = Object.assign(new Error('Network request failed'), {
      code: 'auth/network-request-failed',
    })

    expect(classifyFirebaseTokenRefreshError(error)).toBe('transient')
    expect(isUnrecoverableFirebaseTokenRefreshError(error)).toBe(false)
  })

  it('creates a stable sentinel error preserving the Firebase code', () => {
    const cause = Object.assign(new Error('Firebase: Error (auth/invalid-user-token).'), {
      code: 'auth/invalid-user-token',
    })
    const error = createUnrecoverableFirebaseTokenRefreshError('test-context', cause)

    expect(error.code).toBe(UNRECOVERABLE_FIREBASE_TOKEN_REFRESH_CODE)
    expect(error.firebaseAuthErrorCode).toBe('auth/invalid-user-token')
    expect(isUnrecoverableFirebaseTokenRefreshError(error)).toBe(true)
  })

  it('guards recent unrecoverable refresh failures per session key', () => {
    expect(hasRecentUnrecoverableFirebaseTokenRefresh('user-1')).toBe(false)
    markUnrecoverableFirebaseTokenRefresh('user-1')
    expect(hasRecentUnrecoverableFirebaseTokenRefresh('user-1')).toBe(true)
    clearUnrecoverableFirebaseTokenRefresh('user-1')
    expect(hasRecentUnrecoverableFirebaseTokenRefresh('user-1')).toBe(false)
  })
})
