export const UNRECOVERABLE_FIREBASE_TOKEN_REFRESH_CODE = 'auth/unrecoverable-token-refresh'

const RECENT_UNRECOVERABLE_REFRESH_WINDOW_MS = 60_000

const UNRECOVERABLE_AUTH_CODES = new Set([
  'invalid-refresh-token',
  'invalid-user-token',
  'token-expired',
  'unrecoverable-token-refresh',
  'user-disabled',
  'user-not-found',
  'user-token-expired',
])

const CONFIGURATION_AUTH_CODES = new Set([
  'api-key-not-valid',
  'app-deleted',
  'configuration-not-found',
  'invalid-api-key',
  'invalid-tenant-id',
  'project-not-found',
])

const TRANSIENT_AUTH_CODES = new Set([
  'internal-error',
  'network-request-failed',
  'timeout',
  'too-many-requests',
])

const UNRECOVERABLE_TEXT_PATTERNS = [
  /CREDENTIAL_TOO_OLD_LOGIN_AGAIN/i,
  /INVALID_GRANT/i,
  /INVALID_REFRESH_TOKEN/i,
  /TOKEN_EXPIRED/i,
  /USER_DISABLED/i,
  /USER_NOT_FOUND/i,
  /USER_TOKEN_EXPIRED/i,
]

const CONFIGURATION_TEXT_PATTERNS = [
  /API[_ -]?KEY[_ -]?INVALID/i,
  /API key not valid/i,
  /CONFIGURATION_NOT_FOUND/i,
  /PROJECT_NOT_FOUND/i,
  /project.*not.*found/i,
]

type FirebaseTokenRefreshErrorKind = 'configuration' | 'transient' | 'unknown' | 'unrecoverable'

type FirebaseTokenRefreshError = Error & {
  code?: string
  cause?: unknown
  firebaseAuthErrorCode?: string | null
  firebaseAuthErrorKind?: FirebaseTokenRefreshErrorKind
}

const recentUnrecoverableRefreshByKey = new Map<string, number>()

function normalizeAuthCode(code: string | null): string | null {
  if (!code) return null
  return code.trim().toLowerCase().replace(/^auth\//, '').replace(/^firestore\//, '')
}

export function getFirebaseAuthErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.trim() ? code.trim() : null
}

function collectErrorStrings(value: unknown, seen = new Set<unknown>(), depth = 0): string[] {
  if (depth > 3 || value == null) return []
  if (typeof value === 'string') return [value]
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  if (typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  const parts: string[] = []
  const maybeError = value as { code?: unknown; message?: unknown; name?: unknown }
  for (const key of ['name', 'code', 'message'] as const) {
    const entry = maybeError[key]
    if (typeof entry === 'string') parts.push(entry)
  }

  for (const entry of Object.values(value as Record<string, unknown>)) {
    parts.push(...collectErrorStrings(entry, seen, depth + 1))
  }

  return parts
}

export function classifyFirebaseTokenRefreshError(error: unknown): FirebaseTokenRefreshErrorKind {
  const normalizedCode = normalizeAuthCode(getFirebaseAuthErrorCode(error))
  if (normalizedCode && CONFIGURATION_AUTH_CODES.has(normalizedCode)) return 'configuration'
  if (normalizedCode && UNRECOVERABLE_AUTH_CODES.has(normalizedCode)) return 'unrecoverable'

  const joined = collectErrorStrings(error).join('\n')
  if (CONFIGURATION_TEXT_PATTERNS.some(pattern => pattern.test(joined))) return 'configuration'
  if (UNRECOVERABLE_TEXT_PATTERNS.some(pattern => pattern.test(joined))) return 'unrecoverable'

  if (normalizedCode && TRANSIENT_AUTH_CODES.has(normalizedCode)) return 'transient'
  return 'unknown'
}

export function isUnrecoverableFirebaseTokenRefreshError(error: unknown): boolean {
  const normalizedCode = normalizeAuthCode(getFirebaseAuthErrorCode(error))
  if (normalizedCode === 'unrecoverable-token-refresh') return true
  const kind = classifyFirebaseTokenRefreshError(error)
  return kind === 'configuration' || kind === 'unrecoverable'
}

export function createUnrecoverableFirebaseTokenRefreshError(
  contextLabel: string,
  cause: unknown,
): FirebaseTokenRefreshError {
  const kind = classifyFirebaseTokenRefreshError(cause)
  const causeCode = getFirebaseAuthErrorCode(cause)
  const error = new Error(`Sessão Firebase expirada ou inválida durante ${contextLabel}. Faça login novamente.`) as FirebaseTokenRefreshError
  error.code = UNRECOVERABLE_FIREBASE_TOKEN_REFRESH_CODE
  error.cause = cause
  error.firebaseAuthErrorCode = causeCode
  error.firebaseAuthErrorKind = kind
  return error
}

function normalizeRefreshGuardKey(key: string | null | undefined): string | null {
  const normalized = String(key || '').trim()
  return normalized || null
}

export function markUnrecoverableFirebaseTokenRefresh(key: string | null | undefined): void {
  const normalized = normalizeRefreshGuardKey(key)
  if (!normalized) return
  recentUnrecoverableRefreshByKey.set(normalized, Date.now())
}

export function clearUnrecoverableFirebaseTokenRefresh(key: string | null | undefined): void {
  const normalized = normalizeRefreshGuardKey(key)
  if (!normalized) return
  recentUnrecoverableRefreshByKey.delete(normalized)
}

export function hasRecentUnrecoverableFirebaseTokenRefresh(
  key: string | null | undefined,
  windowMs = RECENT_UNRECOVERABLE_REFRESH_WINDOW_MS,
): boolean {
  const normalized = normalizeRefreshGuardKey(key)
  if (!normalized) return false
  const lastAt = recentUnrecoverableRefreshByKey.get(normalized)
  if (!lastAt) return false
  if (Date.now() - lastAt > windowMs) {
    recentUnrecoverableRefreshByKey.delete(normalized)
    return false
  }
  return true
}

export function __resetFirebaseTokenRefreshGuardsForTests(): void {
  recentUnrecoverableRefreshByKey.clear()
}