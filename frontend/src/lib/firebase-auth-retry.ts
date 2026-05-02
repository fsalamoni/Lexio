import { firebaseAuth } from './firebase'
import {
  clearUnrecoverableFirebaseTokenRefresh,
  createUnrecoverableFirebaseTokenRefreshError,
  hasRecentUnrecoverableFirebaseTokenRefresh,
  isUnrecoverableFirebaseTokenRefreshError,
  markUnrecoverableFirebaseTokenRefresh,
} from './firebase-auth-errors'

function dispatchSessionRecoveryNeeded() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lexio:session-recovery-needed'))
  }
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  if ('code' in error && typeof error.code === 'string') {
    return error.code.replace(/^firestore\//, '')
  }
  return null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return ''
}

export function shouldRetryTransientFirebaseAuthError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error)
  if (code === 'unauthenticated') return true

  // Intentionally do not retry permission-denied here. Firestore service
  // already exhausts its own permission/token refresh loop before surfacing the
  // error, so repeating the whole page-level operation only multiplies failed
  // calls and can trip the auth circuit for an otherwise still-live session.
  const message = getErrorMessage(error)
  return /sessão do firebase não sincronizada/i.test(message)
}

/**
 * `permission-denied` is treated separately from other transient codes:
 * the inner `withFirestoreRetry` already attempts up to 3 token refreshes
 * before surfacing it. At the page level we still give it ONE more chance
 * after forcing a fresh ID token and waiting for the SDK to propagate it,
 * which covers the common case where the auth circuit briefly opened
 * during a burst of concurrent reads at mount time. We never retry more
 * than once at this layer to avoid amplifying load against an account that
 * truly cannot read its own data.
 */
function shouldRetryPermissionDeniedAfterRefresh(error: unknown): boolean {
  return getFirebaseErrorCode(error) === 'permission-denied'
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

type TokenRefreshResult =
  | { status: 'refreshed' }
  | { status: 'transient-failure' }
  | { status: 'unrecoverable-failure'; error: Error }

async function refreshIdTokenSafely(contextLabel: string): Promise<TokenRefreshResult> {
  const current = firebaseAuth?.currentUser
  if (!current) return { status: 'transient-failure' }
  if (hasRecentUnrecoverableFirebaseTokenRefresh(current.uid)) {
    return {
      status: 'unrecoverable-failure',
      error: createUnrecoverableFirebaseTokenRefreshError(contextLabel, new Error('Recent unrecoverable Firebase token refresh failure.')),
    }
  }

  try {
    await current.getIdToken(true)
    clearUnrecoverableFirebaseTokenRefresh(current.uid)
    return { status: 'refreshed' }
  } catch (error) {
    if (isUnrecoverableFirebaseTokenRefreshError(error)) {
      markUnrecoverableFirebaseTokenRefresh(current.uid)
      return {
        status: 'unrecoverable-failure',
        error: createUnrecoverableFirebaseTokenRefreshError(contextLabel, error),
      }
    }
    return { status: 'transient-failure' }
  }
}

export async function withTransientFirebaseAuthRetry<T>(
  operation: () => Promise<T>,
  delayMs = 700,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (shouldRetryTransientFirebaseAuthError(error)) {
      await wait(delayMs)
      return operation()
    }

    if (shouldRetryPermissionDeniedAfterRefresh(error)) {
      // Force-refresh the ID token, give the Firestore SDK a moment to
      // pick up the new credential, and try once more. If it still fails
      // we let the original error propagate so the caller can show a
      // proper retry UI instead of looping.
      const refresh = await refreshIdTokenSafely('withTransientFirebaseAuthRetry')

      if (refresh.status === 'refreshed') {
        await wait(600)
        return operation()
      }

      // Local token refresh didn't help — ask AuthContext to try a
      // centralized session recovery before giving up.
      dispatchSessionRecoveryNeeded()
      // Wait long enough for AuthContext to run getIdToken(true)
      await wait(1500)
      return operation()
    }

    throw error
  }
}
