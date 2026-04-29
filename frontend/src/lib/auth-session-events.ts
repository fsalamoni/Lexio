export const FIRESTORE_AUTH_SESSION_INVALID_EVENT = 'lexio:firestore-auth-session-invalid'
export const FIRESTORE_AUTH_ACCESS_DEGRADED_EVENT = 'lexio:firestore-auth-access-degraded'

export type FirestoreAuthSessionInvalidEventDetail = {
  contextLabel: string
  authUid: string | null
  sessionFingerprint: string
  occurredAt: number
  routePath: string
  appVersion: string
}

export type FirestoreAuthAccessDegradedEventDetail = {
  contextLabel: string
  authUid: string | null
  sessionFingerprint: string
  occurredAt: number
  routePath: string
  appVersion: string
  errorCode: string | null
  burstCount: number
  uniqueContexts: number
}

function getRoutePath(): string {
  if (typeof window === 'undefined') return 'no-window'
  try {
    return window.location?.pathname || '/'
  } catch {
    return 'route-unavailable'
  }
}

function getAppVersion(): string {
  return String(import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_GIT_SHA || 'dev')
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
    routePath: getRoutePath(),
    appVersion: getAppVersion(),
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

export function emitFirestoreAuthAccessDegraded(payload: {
  contextLabel: string
  authUid: string | null
  errorCode: string | null
  burstCount: number
  uniqueContexts: number
}): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return

  const detail: FirestoreAuthAccessDegradedEventDetail = {
    contextLabel: payload.contextLabel,
    authUid: payload.authUid,
    sessionFingerprint: getSessionFingerprint(payload.authUid),
    occurredAt: Date.now(),
    routePath: getRoutePath(),
    appVersion: getAppVersion(),
    errorCode: payload.errorCode,
    burstCount: payload.burstCount,
    uniqueContexts: payload.uniqueContexts,
  }

  try {
    window.dispatchEvent(new CustomEvent<FirestoreAuthAccessDegradedEventDetail>(
      FIRESTORE_AUTH_ACCESS_DEGRADED_EVENT,
      { detail },
    ))
  } catch {
    // Never fail request flow because of diagnostics signaling.
  }
}
