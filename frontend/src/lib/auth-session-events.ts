export const FIRESTORE_AUTH_SESSION_INVALID_EVENT = 'lexio:firestore-auth-session-invalid'

export type FirestoreAuthSessionInvalidEventDetail = {
  contextLabel: string
  authUid: string | null
  sessionFingerprint: string
  occurredAt: number
}

function getStoredTokenSuffix(): string {
  if (typeof window === 'undefined') return 'no-window'
  try {
    const token = window.localStorage.getItem('lexio_token') || ''
    return token ? token.slice(-16) : 'no-token'
  } catch {
    return 'token-unavailable'
  }
}

export function getSessionFingerprint(authUid?: string | null): string {
  const uid = String(authUid || '').trim()
  return `${uid}|${getStoredTokenSuffix()}`
}

export function emitFirestoreAuthSessionInvalid(payload: {
  contextLabel: string
  authUid: string | null
}): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return

  const detail: FirestoreAuthSessionInvalidEventDetail = {
    contextLabel: payload.contextLabel,
    authUid: payload.authUid,
    sessionFingerprint: getSessionFingerprint(payload.authUid),
    occurredAt: Date.now(),
  }

  try {
    window.dispatchEvent(new CustomEvent<FirestoreAuthSessionInvalidEventDetail>(
      FIRESTORE_AUTH_SESSION_INVALID_EVENT,
      { detail },
    ))
  } catch {
    // Never fail request flow because of diagnostics signaling.
  }
}
