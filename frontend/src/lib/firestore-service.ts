/**
 * Firestore data service — provides CRUD operations when IS_FIREBASE = true.
 *
 * Collections:
 *   /users/{uid}                  — user profile (auth-service already handles basic fields)
 *   /users/{uid}/profile          — anamnesis/professional profile (subcollection with single doc "data")
 *   /users/{uid}/documents/{docId}— user's documents
 *   /users/{uid}/theses/{thesisId}— user's thesis bank
 *   /users/{uid}/acervo/{docId}   — user's reference documents (acervo)
 *   /users/{uid}/settings/preferences — user-scoped settings and model configuration
 */

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, collectionGroup, getDocs, addDoc, query, orderBy, limit, where, startAfter,
  serverTimestamp,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { firestore, firebaseAuth, IS_FIREBASE } from './firebase'
import { CLASSIFICATION_TIPOS, DEFAULT_AREA_ASSUNTOS } from './classification-data'
import { DEFAULT_DOC_STRUCTURES } from './document-structures'
import {
  textToStructuredJson,
  serializeStructuredJson,
  resolveTextContent,
} from './document-json-converter'
import {
  buildCostBreakdown,
  buildUsageSummary,
  extractDocumentUsageExecutions,
  extractThesisSessionExecutions,
  extractAcervoUsageExecutions,
  extractNotebookUsageExecutions,
  getExecutionStateLabel,
  type CostBreakdown,
  type UsageExecutionRecord,
  type UsageSummary,
} from './cost-analytics'

// ── Type definitions (re-exported from firestore-types.ts) ───────────────────

export type {
  ProfileData,
  UserSettingsData,
  ContextDetailQuestion,
  ContextDetailData,
  DocumentData,
  ThesisData,
  AcervoDocumentData,
  NotebookSourceType,
  NotebookSource,
  NotebookMessage,
  NotebookResearchAuditEntry,
  NotebookSavedSearchEntry,
  StudioArtifactType,
  StudioArtifact,
  ResearchNotebookData,
  ThesisAnalysisSessionData,
  WizardData,
  WizardStep,
  WizardField,
  AdminDocumentType,
  AdminLegalArea,
  AdminClassificationTipos,
  PlatformAggregateRow,
  PlatformUsageRow,
  PlatformOverviewData,
  PlatformDailyUsagePoint,
  PlatformExecutionStateDailyPoint,
  PlatformExecutionStateWindowComparisonRow,
  PlatformFunctionWindowComparisonRow,
  PlatformFunctionCalibrationAction,
  PlatformFunctionCalibrationPriority,
  PlatformFunctionCalibrationRow,
  PlatformFunctionTargetAdherenceStatus,
  PlatformFunctionTargetAdherenceRow,
  PlatformFunctionTargetAdherenceDailyPoint,
  PlatformFunctionRolloutRecommendation,
  PlatformFunctionRolloutRiskLevel,
  PlatformFunctionRolloutConfidenceBand,
  PlatformFunctionRolloutGuardrails,
  PlatformFunctionRolloutPolicyRow,
  PlatformFunctionRolloutPolicyPlan,
} from './firestore-types'
import type {
  ProfileData,
  UserSettingsData,
  ContextDetailData,
  DocumentData,
  ThesisData,
  AcervoDocumentData,
  NotebookSource,
  ResearchNotebookData,
  NotebookResearchAuditEntry,
  NotebookSavedSearchEntry,
  ThesisAnalysisSessionData,
  WizardData,
  WizardStep,
  WizardField,
  AdminDocumentType,
  AdminLegalArea,
  AdminClassificationTipos,
  PlatformAggregateRow,
  PlatformUsageRow,
  PlatformOverviewData,
  PlatformDailyUsagePoint,
  PlatformExecutionStateDailyPoint,
  PlatformExecutionStateWindowComparisonRow,
  PlatformFunctionWindowComparisonRow,
  PlatformFunctionCalibrationAction,
  PlatformFunctionCalibrationPriority,
  PlatformFunctionCalibrationRow,
  PlatformFunctionTargetAdherenceStatus,
  PlatformFunctionTargetAdherenceRow,
  PlatformFunctionTargetAdherenceDailyPoint,
  PlatformFunctionRolloutRecommendation,
  PlatformFunctionRolloutRiskLevel,
  PlatformFunctionRolloutConfidenceBand,
  PlatformFunctionRolloutGuardrails,
  PlatformFunctionRolloutPolicyRow,
  PlatformFunctionRolloutPolicyPlan,
} from './firestore-types'

// Re-export DEFAULT_DOC_STRUCTURES for backward compatibility
export { DEFAULT_DOC_STRUCTURES } from './document-structures'

// ── Guard ────────────────────────────────────────────────────────────────────

function ensureFirestore() {
  if (!IS_FIREBASE || !firestore) {
    throw new Error('Firestore não está configurado')
  }
  return firestore
}

const FIREBASE_AUTH_SYNC_TIMEOUT_MS = 8_000
const FIRESTORE_SESSION_INVALID_CODE = 'firestore/auth-session-invalid'
const FIRESTORE_AUTH_CIRCUIT_COOLDOWN_MS = 6_000

type FirestoreAuthCircuitState = {
  openedAt: number
  openUntil: number
  lastContext: string
}

let authStateSyncPromise: Promise<void> | null = null
const firestoreAuthCircuitByUid = new Map<string, FirestoreAuthCircuitState>()
let lastObservedAuthUid: string | null = null

function hasStoredLexioSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(
      window.localStorage.getItem('lexio_token') ||
      window.localStorage.getItem('lexio_user_id'),
    )
  } catch {
    return false
  }
}

function getCurrentFirebaseAuthUid(): string | null {
  const rawUid = firebaseAuth?.currentUser?.uid
  if (!rawUid) return null
  const uid = rawUid.trim()
  return uid || null
}

function syncAuthCircuitUserBoundary(): void {
  const currentUid = getCurrentFirebaseAuthUid()
  if (currentUid === lastObservedAuthUid) return

  if (!currentUid) {
    firestoreAuthCircuitByUid.clear()
  } else {
    // New session/user boundary: never carry a stale open circuit into the new session.
    firestoreAuthCircuitByUid.delete(currentUid)
  }

  lastObservedAuthUid = currentUid
}

function getAuthCircuitState(uid: string): FirestoreAuthCircuitState | null {
  const state = firestoreAuthCircuitByUid.get(uid)
  if (!state) return null
  if (state.openUntil <= Date.now()) {
    firestoreAuthCircuitByUid.delete(uid)
    return null
  }
  return state
}

function openAuthAccessCircuit(contextLabel: string, reason?: unknown): void {
  const uid = getCurrentFirebaseAuthUid()
  if (!uid) return

  const state = getAuthCircuitState(uid)
  if (state) return

  const now = Date.now()
  const reasonMessage = reason ? ` (${getErrorMessage(reason)})` : ''
  firestoreAuthCircuitByUid.set(uid, {
    openedAt: now,
    openUntil: now + FIRESTORE_AUTH_CIRCUIT_COOLDOWN_MS,
    lastContext: contextLabel,
  })
  console.warn(
    `[Firestore Auth Circuit] ${contextLabel}: opened for uid ${uid} during ${FIRESTORE_AUTH_CIRCUIT_COOLDOWN_MS}ms${reasonMessage}.`,
  )
}

function closeAuthAccessCircuitForCurrentUser(): void {
  const uid = getCurrentFirebaseAuthUid()
  if (!uid) return
  firestoreAuthCircuitByUid.delete(uid)
}

function throwIfAuthAccessCircuitOpen(contextLabel: string): void {
  const uid = getCurrentFirebaseAuthUid()
  if (!uid) return

  const state = getAuthCircuitState(uid)
  if (!state) return

  const waitMs = Math.max(0, state.openUntil - Date.now())
  const waitSecs = Math.max(1, Math.ceil(waitMs / 1000))
  const error = new Error(`Sessão do Firebase inválida. Aguarde ${waitSecs}s e faça login novamente.`) as Error & { code?: string }
  error.code = FIRESTORE_SESSION_INVALID_CODE

  console.warn(
    `[Firestore Auth Circuit] ${contextLabel}: fast-fail while circuit is open (${waitMs}ms remaining from ${state.lastContext}).`,
  )
  throw error
}

export function __resetFirestoreAuthCircuitForTests(): void {
  firestoreAuthCircuitByUid.clear()
  lastObservedAuthUid = getCurrentFirebaseAuthUid()
}

async function waitForFirebaseAuthSync(timeoutMs = FIREBASE_AUTH_SYNC_TIMEOUT_MS): Promise<void> {
  syncAuthCircuitUserBoundary()
  const auth = firebaseAuth
  if (!auth || auth.currentUser) return
  const expectHydratedUser = hasStoredLexioSession()

  const authWithReady = auth as typeof auth & { authStateReady?: () => Promise<void> }
  if (typeof authWithReady.authStateReady === 'function') {
    await Promise.race([
      authWithReady.authStateReady().catch(() => undefined),
      new Promise<void>(resolve => {
        setTimeout(resolve, timeoutMs)
      }),
    ])
    if (auth.currentUser || !expectHydratedUser) return
  }

  if (!authStateSyncPromise) {
    authStateSyncPromise = new Promise<void>((resolve) => {
      let settled = false
      let unsub: (() => void) | null = null

      const finish = () => {
        if (settled) return
        settled = true
        if (unsub) {
          unsub()
          unsub = null
        }
        resolve()
      }

      const timeout = setTimeout(() => {
        finish()
      }, timeoutMs)

      unsub = onAuthStateChanged(auth, (user) => {
        // Keep waiting while a persisted local session is still hydrating.
        if (!user && expectHydratedUser) {
          return
        }
        clearTimeout(timeout)
        finish()
      })
    }).finally(() => {
      authStateSyncPromise = null
    })
  }

  await authStateSyncPromise
}

function createUnauthenticatedFirestoreError(contextLabel: string): Error {
  const error = new Error('Sessão do Firebase não sincronizada. Faça login novamente.') as Error & { code?: string }
  error.code = 'firestore/unauthenticated'
  console.warn(`[Firestore Auth Sync] ${contextLabel}: no authenticated Firebase user found after sync wait.`)
  return error
}

function createInvalidFirebaseSessionError(contextLabel: string, reason?: unknown): Error {
  const reasonMessage = reason ? ` (${getErrorMessage(reason)})` : ''
  const error = new Error('Sessão do Firebase inválida. Faça login novamente.') as Error & { code?: string }
  error.code = FIRESTORE_SESSION_INVALID_CODE
  console.warn(`[Firestore Auth Sync] ${contextLabel}: persistent auth access error after retry${reasonMessage}.`)
  return error
}

async function resolveEffectiveUid(uid: string, contextLabel: string): Promise<string> {
  syncAuthCircuitUserBoundary()
  await waitForFirebaseAuthSync()
  const requestedUid = String(uid || '').trim()
  const authUid = firebaseAuth?.currentUser?.uid?.trim() || ''

  if (authUid && requestedUid && authUid !== requestedUid) {
    console.warn(`[Firestore UID Sync] Using authenticated uid (${authUid}) instead of stale requested uid (${requestedUid}).`)
    return authUid
  }

  if (!authUid) {
    throw createUnauthenticatedFirestoreError(contextLabel)
  }

  return authUid || requestedUid || uid
}

function normalizeFirestoreDocumentId(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return trimmed

  const documentsMarker = '/documents/'
  if (trimmed.includes(documentsMarker)) {
    const [, pathAfterDocuments = ''] = trimmed.split(documentsMarker)
    const segments = pathAfterDocuments.split('/').filter(Boolean)
    return segments.length > 0 ? segments[segments.length - 1] : trimmed
  }

  const segments = trimmed.split('/').filter(Boolean)
  return segments.length > 1 ? segments[segments.length - 1] : trimmed
}

export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem('lexio_user_id')
}

/**
 * Recursively strip keys whose value is `undefined` so that Firestore writes
 * never receive unsupported `undefined` values (Firestore does not set
 * `ignoreUndefinedProperties` by default).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (value === undefined) continue
    if (Array.isArray(value)) {
      result[key] = value.map(item =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? stripUndefined(item)
          : item,
      )
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      result[key] = stripUndefined(value)
    } else {
      result[key] = value
    }
  }
  return result as T
}

function round6(value: number) {
  return Number(value.toFixed(6))
}

const USER_SETTINGS_MIGRATION_FLAG = 'legacy_migrated_at'
const USER_SETTINGS_MODEL_KEYS = [
  'agent_models',
  'thesis_analyst_models',
  'context_detail_models',
  'acervo_classificador_models',
  'acervo_ementa_models',
  'research_notebook_models',
  'notebook_acervo_models',
  'video_pipeline_models',
  'audio_pipeline_models',
  'presentation_pipeline_models',
] as const satisfies ReadonlyArray<keyof UserSettingsData>

const PLATFORM_ANALYTICS_CACHE_TTL_MS = 60_000

type PlatformUserRecord = {
  id: string
  role?: string
  created_at?: string
}

type PlatformNotebookSearchMemoryRecord = {
  id: string
  notebook_id: string
  updated_at?: string
  research_audits?: unknown[]
  saved_searches?: unknown[]
  retention?: {
    audits_dropped?: number
    saved_searches_dropped?: number
  }
}

type PlatformCollectionsSnapshot = {
  fetchedAt: number
  users: PlatformUserRecord[]
  documents: Array<DocumentData & { _owner_user_id?: string }>
  theses: Array<ThesisData & { _owner_user_id?: string }>
  sessions: Array<ThesisAnalysisSessionData & { _owner_user_id?: string }>
  acervo: Array<AcervoDocumentData & { _owner_user_id?: string }>
  notebooks: Array<ResearchNotebookData & { _owner_user_id?: string }>
  notebook_search_memory: PlatformNotebookSearchMemoryRecord[]
  operational_warnings: string[]
}

let platformCollectionsCache: PlatformCollectionsSnapshot | null = null

function matchesDocumentFilters(doc: DocumentData, opts?: {
  status?: string
  document_type_id?: string
}) {
  if (opts?.status && doc.status !== opts.status) return false
  if (opts?.document_type_id && doc.document_type_id !== opts.document_type_id) return false
  return true
}

function getDocumentCreatedAtValue(value: unknown) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis()
  }
  return 0
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Erro desconhecido'
}

const RETRYABLE_FIRESTORE_CODES = new Set([
  'unauthenticated',
  'unavailable',
  'deadline-exceeded',
  'aborted',
  'resource-exhausted',
  'failed-precondition',
])

const AUTH_RETRYABLE_FIRESTORE_CODES = new Set([
  'unauthenticated',
  'permission-denied',
])

const AUTH_ACCESS_FIRESTORE_CODES = new Set([
  'unauthenticated',
  'permission-denied',
  'auth-session-invalid',
])

const FIRESTORE_AUTH_RETRY_DELAY_MS = 350

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  if ('code' in error && typeof error.code === 'string') {
    return error.code.replace(/^firestore\//, '')
  }
  return null
}

export function isFirestoreSessionInvalidError(error: unknown): boolean {
  return getFirebaseErrorCode(error) === 'auth-session-invalid'
}

function isAuthRetryableFirestoreCode(code: string | null): boolean {
  return Boolean(code && AUTH_RETRYABLE_FIRESTORE_CODES.has(code))
}

function isRetryableFirestoreError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error)
  if (!code) return false
  return RETRYABLE_FIRESTORE_CODES.has(code) || AUTH_RETRYABLE_FIRESTORE_CODES.has(code)
}

function isAuthAccessFirestoreError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error)
  return Boolean(code && AUTH_ACCESS_FIRESTORE_CODES.has(code))
}

async function refreshCurrentUserToken(): Promise<boolean> {
  const currentUser = firebaseAuth?.currentUser
  if (!currentUser) return false
  try {
    await currentUser.getIdToken(true)
    return true
  } catch (error) {
    console.warn('Firestore token refresh failed:', getErrorMessage(error))
    return false
  }
}

async function withFirestoreRetry<T>(
  operation: () => Promise<T>,
  contextLabel: string,
): Promise<T> {
  syncAuthCircuitUserBoundary()
  throwIfAuthAccessCircuitOpen(contextLabel)

  try {
    const result = await operation()
    closeAuthAccessCircuitForCurrentUser()
    return result
  } catch (error) {
    if (!isRetryableFirestoreError(error)) {
      if (isAuthAccessFirestoreError(error)) {
        openAuthAccessCircuit(contextLabel, error)
      }
      throw error
    }

    const code = getFirebaseErrorCode(error)
    console.warn(`[Firestore Retry] ${contextLabel}: first attempt failed, retrying (${getErrorMessage(error)})`)
    if (isAuthRetryableFirestoreCode(code)) {
      await waitForFirebaseAuthSync()
      if (!firebaseAuth?.currentUser) {
        throw createUnauthenticatedFirestoreError(contextLabel)
      }
      const tokenRefreshSucceeded = await refreshCurrentUserToken()
      if (!tokenRefreshSucceeded) {
        openAuthAccessCircuit(contextLabel, error)
        throw createInvalidFirebaseSessionError(contextLabel, error)
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, FIRESTORE_AUTH_RETRY_DELAY_MS)
      })
    }

    try {
      const retryResult = await operation()
      closeAuthAccessCircuitForCurrentUser()
      return retryResult
    } catch (retryError) {
      if (isAuthAccessFirestoreError(retryError)) {
        openAuthAccessCircuit(contextLabel, retryError)
        throw createInvalidFirebaseSessionError(contextLabel, retryError)
      }
      throw retryError
    }
  }
}

function getRefUserId(refPath: string): string | null {
  const parts = refPath.split('/')
  if (parts.length >= 2 && parts[0] === 'users') return parts[1]
  return null
}

function getRefNotebookIdFromSearchMemoryPath(refPath: string): string | null {
  const parts = refPath.split('/').filter(Boolean)
  const notebookIndex = parts.findIndex((part, index) => part === 'research_notebooks' && index < parts.length - 1)
  if (notebookIndex === -1) return null
  return parts[notebookIndex + 1] || null
}

function getIsoDateKey(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length >= 10 ? value.slice(0, 10) : null
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString().slice(0, 10)
  }
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return new Date(value.toMillis()).toISOString().slice(0, 10)
  }
  return null
}

function isWithinLastDays(value: unknown, days: number): boolean {
  const day = getIsoDateKey(value)
  if (!day) return false
  const now = Date.now()
  const cutoff = new Date(now - days * 86_400_000).toISOString().slice(0, 10)
  return day >= cutoff
}

function addCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function mapToRows(map: Map<string, number>, labeler?: (key: string) => string): PlatformAggregateRow[] {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, label: labeler ? labeler(key) : key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function artifactTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function resolveExecutionStateKey(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'unknown_execution_state'
  return normalized
}

function resolveFunctionKey(execution: UsageExecutionRecord): string {
  const raw = execution.function_key || execution.function_label || 'unknown_function'
  const normalized = String(raw || '').trim().toLowerCase()
  return normalized || 'unknown_function'
}

function resolveFunctionLabel(execution: UsageExecutionRecord): string {
  const label = String(execution.function_label || execution.function_key || '').trim()
  return label || 'Função não identificada'
}

function safeRatio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0
  return numerator / denominator
}

function safeDeltaPct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 1 : 0
  return (current - previous) / previous
}

function clampRate(value: number, min = 0.03, max = 0.45): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function round4(value: number): number {
  return Number(value.toFixed(4))
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentileValue)))
  return sorted[index]
}

function resolveFunctionCalibrationPriority(input: {
  riskScore: number
  currentRetryRate: number
  currentFallbackRate: number
  currentWaitingIoRate: number
}): PlatformFunctionCalibrationPriority {
  if (input.riskScore >= 0.9 || input.currentRetryRate >= 0.28 || input.currentWaitingIoRate >= 0.3) {
    return 'critical'
  }

  if (input.riskScore >= 0.55 || input.currentFallbackRate >= 0.18 || input.currentRetryRate >= 0.18) {
    return 'warning'
  }

  return 'info'
}

function resolveFunctionCalibrationAction(input: {
  priority: PlatformFunctionCalibrationPriority
  currentCalls: number
  callsDeltaPct: number
  currentRetryRate: number
  currentFallbackRate: number
  currentWaitingIoRate: number
}): PlatformFunctionCalibrationAction {
  if (input.priority === 'critical' || input.priority === 'warning') {
    return 'tighten'
  }

  if (
    input.currentCalls >= 12
    && input.callsDeltaPct <= -0.2
    && input.currentRetryRate <= 0.08
    && input.currentFallbackRate <= 0.08
    && input.currentWaitingIoRate <= 0.1
  ) {
    return 'relax'
  }

  return 'maintain'
}

function computeTargetRate(input: {
  currentRate: number
  previousRate: number
  medianRate: number
  action: PlatformFunctionCalibrationAction
}): number {
  const baseline = input.previousRate > 0
    ? (input.currentRate * 0.7) + (input.previousRate * 0.3)
    : input.currentRate
  const anchoredMedian = input.medianRate > 0 ? input.medianRate : baseline

  if (input.action === 'tighten') {
    return clampRate(Math.min(baseline * 0.88, anchoredMedian * 0.95, input.currentRate * 0.9))
  }

  if (input.action === 'relax') {
    return clampRate(Math.max(input.currentRate * 1.1, anchoredMedian * 1.1, baseline * 1.05))
  }

  return clampRate(Math.min(Math.max(input.currentRate * 0.95, anchoredMedian), baseline))
}

function resolveFunctionTargetAdherenceStatus(input: {
  livePressure: number
  targetPressure: number
}): PlatformFunctionTargetAdherenceStatus {
  if (input.targetPressure <= 0) {
    return input.livePressure >= 0.05 ? 'above_target' : 'aligned'
  }

  if (input.livePressure >= input.targetPressure * 1.15) return 'above_target'
  if (input.livePressure <= input.targetPressure * 0.75) return 'below_target'
  return 'aligned'
}

function computeLinearTrend(values: number[]): number {
  if (values.length < 2) return 0
  const first = values[0]
  const last = values[values.length - 1]
  return (last - first) / (values.length - 1)
}

function computeStreakFromEnd<T>(values: T[], predicate: (value: T) => boolean): number {
  let streak = 0
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (!predicate(values[index])) break
    streak += 1
  }
  return streak
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function resolveFunctionRolloutConfidenceBand(score: number): PlatformFunctionRolloutConfidenceBand {
  if (score >= 0.72) return 'high'
  if (score >= 0.45) return 'medium'
  return 'low'
}

function computeFunctionRolloutConfidence(input: {
  recentCalls: number
  observedDays: number
  expectedDays: number
  priority: PlatformFunctionCalibrationPriority
}): {
  score: number
  band: PlatformFunctionRolloutConfidenceBand
} {
  const callTarget = input.priority === 'critical'
    ? 16
    : input.priority === 'warning'
      ? 10
      : 6
  const callScore = clampUnit(safeRatio(input.recentCalls, callTarget))
  const coverageScore = clampUnit(safeRatio(input.observedDays, Math.max(1, input.expectedDays)))
  const historyScore = input.observedDays >= 5
    ? 1
    : input.observedDays >= 3
      ? 0.72
      : input.observedDays >= 2
        ? 0.5
        : 0.3
  const score = round4((callScore * 0.45) + (coverageScore * 0.35) + (historyScore * 0.2))
  return {
    score,
    band: resolveFunctionRolloutConfidenceBand(score),
  }
}

function resolveFunctionPredictiveThresholds(input: {
  priority: PlatformFunctionCalibrationPriority
  confidenceBand: PlatformFunctionRolloutConfidenceBand
}): {
  pressureGap: number
  retryWaiting: number
} {
  const base = input.priority === 'critical'
    ? { pressureGap: 0.005, retryWaiting: 0.0035 }
    : input.priority === 'warning'
      ? { pressureGap: 0.006, retryWaiting: 0.0045 }
      : { pressureGap: 0.007, retryWaiting: 0.0055 }
  const multiplier = input.confidenceBand === 'low'
    ? 1.35
    : input.confidenceBand === 'medium'
      ? 1.15
      : 1

  return {
    pressureGap: round4(base.pressureGap * multiplier),
    retryWaiting: round4(base.retryWaiting * multiplier),
  }
}

function resolveFunctionRolloutGuardrails(
  priority: PlatformFunctionCalibrationPriority,
  confidenceBand: PlatformFunctionRolloutConfidenceBand,
): PlatformFunctionRolloutGuardrails {
  const base = priority === 'critical'
    ? {
        max_tighten_delta: 0.03,
        max_relax_delta: 0.008,
        require_stable_days_for_relax: 4,
        require_above_days_for_tighten: 2,
      }
    : priority === 'warning'
      ? {
          max_tighten_delta: 0.022,
          max_relax_delta: 0.01,
          require_stable_days_for_relax: 3,
          require_above_days_for_tighten: 2,
        }
      : {
          max_tighten_delta: 0.016,
          max_relax_delta: 0.012,
          require_stable_days_for_relax: 2,
          require_above_days_for_tighten: 3,
        }

  if (confidenceBand === 'low') {
    return {
      max_tighten_delta: round4(base.max_tighten_delta * 0.82),
      max_relax_delta: round4(base.max_relax_delta * 0.9),
      require_stable_days_for_relax: base.require_stable_days_for_relax + 1,
      require_above_days_for_tighten: base.require_above_days_for_tighten + 1,
    }
  }

  if (confidenceBand === 'medium') {
    return {
      max_tighten_delta: round4(base.max_tighten_delta * 0.92),
      max_relax_delta: base.max_relax_delta,
      require_stable_days_for_relax: base.require_stable_days_for_relax,
      require_above_days_for_tighten: base.require_above_days_for_tighten,
    }
  }

  return base
}

function resolveFunctionRolloutRiskLevel(input: {
  latestStatus: PlatformFunctionTargetAdherenceStatus
  latestPressureGap: number
  trendPressureGap: number
  trendRetryWaitingSum: number
  aboveTargetStreak: number
  priority: PlatformFunctionCalibrationPriority
  confidenceScore: number
  confidenceBand: PlatformFunctionRolloutConfidenceBand
}): PlatformFunctionRolloutRiskLevel {
  if (
    input.latestStatus === 'above_target'
    && (
      input.latestPressureGap >= 0.2
      || input.aboveTargetStreak >= 5
    )
  ) {
    return 'critical'
  }

  const confidenceMultiplier = input.confidenceBand === 'low'
    ? 1.28
    : input.confidenceBand === 'medium'
      ? 1.12
      : 1
  const criticalGapThreshold = (input.priority === 'critical' ? 0.105 : 0.12) * confidenceMultiplier
  const criticalTrendPressureThreshold = 0.014 * confidenceMultiplier
  const criticalTrendRetryWaitingThreshold = 0.009 * confidenceMultiplier
  const warningGapThreshold = 0.055 * confidenceMultiplier
  const warningTrendPressureThreshold = 0.007 * confidenceMultiplier
  const warningTrendRetryWaitingThreshold = 0.0045 * confidenceMultiplier
  const requiredCriticalStreak = input.confidenceBand === 'low' ? 4 : 3

  if (
    input.latestStatus === 'above_target'
    && (
      input.latestPressureGap >= criticalGapThreshold
      || input.aboveTargetStreak >= requiredCriticalStreak
      || input.trendPressureGap >= criticalTrendPressureThreshold
      || input.trendRetryWaitingSum >= criticalTrendRetryWaitingThreshold
    )
  ) {
    return 'critical'
  }

  if (
    input.latestStatus === 'above_target'
    || input.latestPressureGap >= warningGapThreshold
    || input.trendPressureGap >= warningTrendPressureThreshold
    || input.trendRetryWaitingSum >= warningTrendRetryWaitingThreshold
    || input.confidenceScore < 0.36
  ) {
    return 'warning'
  }

  return 'stable'
}

function resolveFunctionRolloutRecommendation(input: {
  latestStatus: PlatformFunctionTargetAdherenceStatus
  riskLevel: PlatformFunctionRolloutRiskLevel
  aboveTargetStreak: number
  stableStreak: number
  trendPressureGap: number
  confidenceBand: PlatformFunctionRolloutConfidenceBand
  guardrails: PlatformFunctionRolloutGuardrails
}): PlatformFunctionRolloutRecommendation {
  if (
    input.riskLevel === 'critical'
    && input.aboveTargetStreak >= input.guardrails.require_above_days_for_tighten
    && (
      input.confidenceBand !== 'low'
      || input.trendPressureGap >= 0.012
    )
  ) {
    return 'tighten_now'
  }

  if (input.riskLevel === 'warning' || input.latestStatus === 'above_target') {
    return 'tighten_guarded'
  }

  if (
    input.latestStatus === 'below_target'
    && input.stableStreak >= input.guardrails.require_stable_days_for_relax
    && input.trendPressureGap <= -0.008
    && input.confidenceBand !== 'low'
  ) {
    return 'relax_guarded'
  }

  return 'hold'
}

function buildFunctionRolloutRationale(input: {
  riskLevel: PlatformFunctionRolloutRiskLevel
  latestStatus: PlatformFunctionTargetAdherenceStatus
  aboveTargetStreak: number
  stableStreak: number
  latestPressureGap: number
  trendPressureGap: number
  trendRetryWaitingSum: number
  confidenceScore: number
  confidenceBand: PlatformFunctionRolloutConfidenceBand
  observedDays: number
  expectedDays: number
  isPredictiveAlert: boolean
}): string {
  const gapLabel = `${(input.latestPressureGap * 100).toFixed(1)}%`
  const trendLabel = `${(input.trendPressureGap * 100).toFixed(2)}%/dia`
  const retryWaitingTrendLabel = `${(input.trendRetryWaitingSum * 100).toFixed(2)}%/dia`
  const confidenceLabel = input.confidenceBand === 'high'
    ? 'alta'
    : input.confidenceBand === 'medium'
      ? 'média'
      : 'baixa'
  const confidenceSummary = `Confiança ${confidenceLabel} (${(input.confidenceScore * 100).toFixed(0)}%, ${input.observedDays}/${input.expectedDays} dias).`

  if (input.riskLevel === 'critical') {
    return `${confidenceSummary} Pressão acima do alvo por ${input.aboveTargetStreak} dia(s), gap ${gapLabel} e tendência ${trendLabel}; aplicar contenção imediata.`
  }

  if (input.riskLevel === 'warning') {
    const predictiveLabel = input.isPredictiveAlert ? ' Alerta preditivo ativo.' : ''
    return `${confidenceSummary} Sinal de atenção em ${input.latestStatus} com gap ${gapLabel}, tendência ${trendLabel} e drift retry+waiting ${retryWaitingTrendLabel}; ajustar com guardrail.${predictiveLabel}`
  }

  if (input.latestStatus === 'below_target' && input.stableStreak > 0) {
    return `${confidenceSummary} Estabilidade sustentada por ${input.stableStreak} dia(s) com pressão abaixo do alvo; elegível para relaxamento controlado.`
  }

  return `${confidenceSummary} Função estável na faixa de alvo; manter rollout atual e monitorar tendência diária.`
}

async function getLegacySettingsDocData(documentId: string): Promise<Record<string, unknown>> {
  const db = ensureFirestore()
  const snap = await getDoc(doc(db, 'settings', documentId))
  return snap.exists() ? (snap.data() as Record<string, unknown>) : {}
}

export async function ensureUserSettingsMigrated(uid: string): Promise<UserSettingsData> {
  const current = await getUserSettings(uid)
  if (current[USER_SETTINGS_MIGRATION_FLAG]) return current

  const patch: Partial<UserSettingsData> = {
    [USER_SETTINGS_MIGRATION_FLAG]: new Date().toISOString(),
  }

  try {
    const globalSettings = await getSettings().catch(() => ({} as Record<string, unknown>))
    const mergedApiKeys = { ...((globalSettings.api_keys ?? {}) as Record<string, string>) }

    for (const flatKey of ['openrouter_api_key', 'datajud_api_key'] as const) {
      const flatValue = globalSettings[flatKey]
      if (typeof flatValue === 'string' && flatValue.trim() && !mergedApiKeys[flatKey]) {
        mergedApiKeys[flatKey] = flatValue
      }
    }

    if ((!current.api_keys || Object.keys(current.api_keys).length === 0) && Object.keys(mergedApiKeys).length > 0) {
      patch.api_keys = mergedApiKeys
    }

    if ((!current.model_catalog || current.model_catalog.length === 0) && Array.isArray(globalSettings.model_catalog) && globalSettings.model_catalog.length > 0) {
      patch.model_catalog = globalSettings.model_catalog as UserSettingsData['model_catalog']
    }

    for (const key of USER_SETTINGS_MODEL_KEYS) {
      const existingValue = current[key]
      const legacyValue = globalSettings[key]
      if (
        (!existingValue || Object.keys(existingValue as Record<string, string>).length === 0) &&
        legacyValue && typeof legacyValue === 'object' && !Array.isArray(legacyValue)
      ) {
        patch[key] = legacyValue as UserSettingsData[typeof key]
      }
    }

    if (!current.document_types?.length) {
      const legacyDocTypes = await getLegacySettingsDocData('admin_document_types').catch(() => ({} as Record<string, unknown>))
      if (Array.isArray(legacyDocTypes.items) && legacyDocTypes.items.length > 0) {
        patch.document_types = legacyDocTypes.items as AdminDocumentType[]
      }
    }

    if (!current.legal_areas?.length) {
      const legacyAreas = await getLegacySettingsDocData('admin_legal_areas').catch(() => ({} as Record<string, unknown>))
      if (Array.isArray(legacyAreas.items) && legacyAreas.items.length > 0) {
        patch.legal_areas = legacyAreas.items as AdminLegalArea[]
      }
    }

    if (!current.classification_tipos || Object.keys(current.classification_tipos).length === 0) {
      const legacyTipos = await getLegacySettingsDocData('admin_classification_tipos').catch(() => ({} as Record<string, unknown>))
      if (legacyTipos.tipos && typeof legacyTipos.tipos === 'object' && !Array.isArray(legacyTipos.tipos)) {
        patch.classification_tipos = legacyTipos.tipos as Record<string, Record<string, string[]>>
      }
    }
  } catch {
    // If legacy docs are inaccessible (e.g. non-admin users), mark migration as done
    // so the app falls back to user defaults without leaking platform data.
  }

  await saveUserSettings(uid, patch)
  return { ...current, ...patch }
}

async function loadPlatformCollections(force = false): Promise<PlatformCollectionsSnapshot> {
  if (!force && platformCollectionsCache && Date.now() - platformCollectionsCache.fetchedAt < PLATFORM_ANALYTICS_CACHE_TTL_MS) {
    return platformCollectionsCache
  }

  const db = ensureFirestore()
  const [usersSnap, documentsSnap, thesesSnap, sessionsSnap, acervoSnap, notebooksSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collectionGroup(db, 'documents')),
    getDocs(collectionGroup(db, 'theses')),
    getDocs(collectionGroup(db, 'thesis_analysis_sessions')),
    getDocs(collectionGroup(db, 'acervo')),
    getDocs(collectionGroup(db, 'research_notebooks')),
  ])

  const operationalWarnings: string[] = []
  const notebookSearchMemoryDocs = await getDocs(collectionGroup(db, 'memory'))
    .then(snap => snap.docs)
    .catch(error => {
      const message = getErrorMessage(error)
      console.warn(`[PlatformAnalytics] Notebook search memory indisponível: ${message}`)
      operationalWarnings.push(
        /permission|insufficient|PERMISSION_DENIED/i.test(message)
          ? 'A memória dedicada dos cadernos ficou temporariamente indisponível por permissão do Firestore. O painel foi carregado com métricas parciais.'
          : 'A memória dedicada dos cadernos ficou temporariamente indisponível. O painel foi carregado com métricas parciais.',
      )
      return [] as QueryDocumentSnapshot[]
    })

  const notebookSearchMemory = notebookSearchMemoryDocs
    .filter(d => d.id === NOTEBOOK_SEARCH_MEMORY_DOC_ID)
    .map(d => {
      const notebookId = getRefNotebookIdFromSearchMemoryPath(d.ref.path)
      if (!notebookId) return null
      const data = d.data() as Record<string, unknown>
      return {
        id: d.id,
        notebook_id: notebookId,
        updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
        research_audits: Array.isArray(data.research_audits) ? data.research_audits : [],
        saved_searches: Array.isArray(data.saved_searches) ? data.saved_searches : [],
        retention: data.retention && typeof data.retention === 'object'
          ? {
              audits_dropped: typeof (data.retention as Record<string, unknown>).audits_dropped === 'number'
                ? (data.retention as Record<string, unknown>).audits_dropped as number
                : 0,
              saved_searches_dropped: typeof (data.retention as Record<string, unknown>).saved_searches_dropped === 'number'
                ? (data.retention as Record<string, unknown>).saved_searches_dropped as number
                : 0,
            }
          : undefined,
      } as PlatformNotebookSearchMemoryRecord
    })
    .filter((item): item is PlatformNotebookSearchMemoryRecord => Boolean(item))

  const snapshot: PlatformCollectionsSnapshot = {
    fetchedAt: Date.now(),
    users: usersSnap.docs.map(d => ({ ...(d.data() as PlatformUserRecord), id: d.id })),
    documents: documentsSnap.docs.map(d => ({ ...(d.data() as DocumentData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as DocumentData & { _owner_user_id?: string })),
    theses: thesesSnap.docs.map(d => ({ ...(d.data() as ThesisData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as ThesisData & { _owner_user_id?: string })),
    sessions: sessionsSnap.docs.map(d => ({ ...(d.data() as ThesisAnalysisSessionData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as ThesisAnalysisSessionData & { _owner_user_id?: string })),
    acervo: acervoSnap.docs.map(d => ({ ...(d.data() as AcervoDocumentData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as AcervoDocumentData & { _owner_user_id?: string })),
    notebooks: notebooksSnap.docs.map(d => ({ ...(d.data() as ResearchNotebookData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as ResearchNotebookData & { _owner_user_id?: string })),
    notebook_search_memory: notebookSearchMemory,
    operational_warnings: operationalWarnings,
  }

  platformCollectionsCache = snapshot
  return snapshot
}

export function invalidatePlatformAnalyticsCache(): void {
  platformCollectionsCache = null
}

function sortDocuments(items: DocumentData[], sortDir?: string) {
  const direction = sortDir === 'asc' ? 1 : -1
  return [...items].sort((a, b) =>
    (getDocumentCreatedAtValue(a.created_at) - getDocumentCreatedAtValue(b.created_at)) * direction,
  )
}

// ── Profile (Anamnesis Layer 1) ──────────────────────────────────────────────

export async function getProfile(uid: string): Promise<ProfileData> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'getProfile')
  const ref = doc(db, 'users', effectiveUid, 'profile', 'data')
  const snap = await withFirestoreRetry(() => getDoc(ref), 'getProfile')
  if (!snap.exists()) return {}
  return snap.data() as ProfileData
}

export async function saveProfile(uid: string, data: ProfileData): Promise<void> {
  const db = ensureFirestore()
  const ref = doc(db, 'users', uid, 'profile', 'data')
  await setDoc(ref, { ...data, updated_at: serverTimestamp() }, { merge: true })
}

export async function completeOnboarding(uid: string, data: ProfileData): Promise<void> {
  const db = ensureFirestore()
  const ref = doc(db, 'users', uid, 'profile', 'data')
  await setDoc(ref, {
    ...data,
    onboarding_completed: true,
    updated_at: serverTimestamp(),
  }, { merge: true })
}

// ── Wizard steps (static definition) ────────────────────────────────────────

const ONBOARDING_STEPS: WizardStep[] = [
  {
    step: 1,
    title: 'Perfil Profissional',
    description: 'Informações sobre sua atuação',
    fields: [
      { key: 'institution', label: 'Instituição', type: 'text', placeholder: 'Ex: Ministério Público do Estado do RS' },
      { key: 'position', label: 'Cargo/Função', type: 'text', placeholder: 'Ex: Promotor de Justiça' },
      { key: 'jurisdiction', label: 'Jurisdição/Comarca', type: 'text', placeholder: 'Ex: Comarca de Porto Alegre' },
      { key: 'experience_years', label: 'Anos de experiência', type: 'number', placeholder: 'Ex: 10' },
    ],
  },
  {
    step: 2,
    title: 'Áreas de Atuação',
    description: 'Selecione suas áreas e especializações',
    fields: [
      {
        key: 'primary_areas', label: 'Áreas principais', type: 'multiselect',
        options: [
          { value: 'administrative', label: 'Direito Administrativo' },
          { value: 'constitutional', label: 'Direito Constitucional' },
          { value: 'civil', label: 'Direito Civil' },
          { value: 'tax', label: 'Direito Tributário' },
          { value: 'labor', label: 'Direito do Trabalho' },
          { value: 'criminal', label: 'Direito Penal' },
          { value: 'criminal_procedure', label: 'Processo Penal' },
          { value: 'civil_procedure', label: 'Processo Civil' },
          { value: 'consumer', label: 'Direito do Consumidor' },
          { value: 'environmental', label: 'Direito Ambiental' },
          { value: 'business', label: 'Direito Empresarial' },
          { value: 'family', label: 'Direito de Família' },
          { value: 'inheritance', label: 'Direito das Sucessões' },
          { value: 'social_security', label: 'Direito Previdenciário' },
          { value: 'electoral', label: 'Direito Eleitoral' },
          { value: 'international', label: 'Direito Internacional' },
          { value: 'digital', label: 'Direito Digital' },
        ],
      },
      { key: 'specializations', label: 'Especializações', type: 'tags', placeholder: 'Separe por vírgula: licitações, improbidade...' },
    ],
  },
  {
    step: 3,
    title: 'Preferências de Redação',
    description: 'Como você prefere que seus documentos sejam redigidos',
    fields: [
      {
        key: 'formality_level', label: 'Nível de formalidade', type: 'select',
        options: [
          { value: 'formal', label: 'Formal (linguagem jurídica clássica)' },
          { value: 'semiformal', label: 'Semiformal (claro e objetivo)' },
        ],
      },
      {
        key: 'connective_style', label: 'Estilo de conectivos', type: 'select',
        options: [
          { value: 'classico', label: 'Clássico (destarte, outrossim, mormente)' },
          { value: 'moderno', label: 'Moderno (portanto, além disso)' },
        ],
      },
      {
        key: 'paragraph_length', label: 'Tamanho dos parágrafos', type: 'select',
        options: [
          { value: 'curto', label: 'Curto (3-5 linhas)' },
          { value: 'medio', label: 'Médio (5-10 linhas)' },
          { value: 'longo', label: 'Longo (10+ linhas)' },
        ],
      },
      {
        key: 'citation_style', label: 'Estilo de citações', type: 'select',
        options: [
          { value: 'inline', label: 'Inline (no corpo do texto)' },
          { value: 'footnote', label: 'Notas de rodapé' },
          { value: 'abnt', label: 'ABNT' },
        ],
      },
    ],
  },
  {
    step: 4,
    title: 'Preferências de IA',
    description: 'Configure como a inteligência artificial deve trabalhar para você',
    fields: [
      {
        key: 'detail_level', label: 'Nível de detalhamento', type: 'select',
        options: [
          { value: 'conciso', label: 'Conciso (direto ao ponto)' },
          { value: 'detalhado', label: 'Detalhado (análise completa)' },
          { value: 'exaustivo', label: 'Exaustivo (todas as possibilidades)' },
        ],
      },
      {
        key: 'argument_depth', label: 'Profundidade argumentativa', type: 'select',
        options: [
          { value: 'superficial', label: 'Superficial (principais argumentos)' },
          { value: 'moderado', label: 'Moderado (argumentos e contra-argumentos)' },
          { value: 'profundo', label: 'Profundo (análise exaustiva)' },
        ],
      },
      { key: 'include_opposing_view', label: 'Incluir visão contrária automaticamente', type: 'boolean', default: true },
    ],
  },
]

export async function getWizardData(uid: string): Promise<WizardData> {
  const profile = await getProfile(uid)
  return {
    onboarding_completed: profile.onboarding_completed ?? false,
    profile,
    onboarding_steps: ONBOARDING_STEPS,
  }
}

// ── Documents CRUD ──────────────────────────────────────────────────────────

export async function createDocument(uid: string, input: {
  document_type_id: string
  original_request: string
  template_variant?: string | null
  legal_area_ids?: string[] | null
  request_context?: Record<string, unknown> | null
  context_detail?: ContextDetailData | null
}): Promise<DocumentData> {
  const db = ensureFirestore()
  const colRef = collection(db, 'users', uid, 'documents')
  const now = new Date().toISOString()
  const docData = {
    document_type_id: input.document_type_id,
    original_request: input.original_request,
    template_variant: input.template_variant ?? null,
    legal_area_ids: input.legal_area_ids ?? [],
    request_context: input.request_context ?? null,
    context_detail: input.context_detail ?? null,
    tema: null,
    status: 'rascunho',
    quality_score: null,
    texto_completo: null,
    origem: 'web',
    created_at: now,
    updated_at: now,
  }
  const ref = await addDoc(colRef, docData)
  return { id: ref.id, ...docData }
}

export async function getDocument(uid: string, docId: string): Promise<DocumentData | null> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'getDocument')
  const ref = doc(db, 'users', effectiveUid, 'documents', docId)
  const snap = await withFirestoreRetry(() => getDoc(ref), 'getDocument')
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as DocumentData
}

export async function listDocuments(uid: string, opts?: {
  status?: string
  document_type_id?: string
  limit?: number
  sortBy?: string
  sortDir?: string
}): Promise<{ items: DocumentData[]; total: number }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listDocuments')
  const colRef = collection(db, 'users', effectiveUid, 'documents')

  // Build query constraints
  const constraints: QueryConstraint[] = []

  if (opts?.status) {
    constraints.push(where('status', '==', opts.status))
  }
  if (opts?.document_type_id) {
    constraints.push(where('document_type_id', '==', opts.document_type_id))
  }

  constraints.push(orderBy('created_at', opts?.sortDir === 'asc' ? 'asc' : 'desc'))

  if (opts?.limit) {
    constraints.push(limit(opts.limit))
  }

  const q = query(colRef, ...constraints)
  try {
    const snap = await withFirestoreRetry(() => getDocs(q), 'listDocuments.query')
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentData))
    return { items, total: items.length }
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    try {
      console.warn('Firestore document query failed; using client-side fallback:', getErrorMessage(error))
      const fallbackSnap = await withFirestoreRetry(() => getDocs(colRef), 'listDocuments.fallback')
      const filteredItems = sortDocuments(
        fallbackSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as DocumentData))
          .filter(doc => matchesDocumentFilters(doc, opts)),
        opts?.sortDir,
      )
      const limitedItems = opts?.limit ? filteredItems.slice(0, opts?.limit) : filteredItems
      return { items: limitedItems, total: filteredItems.length }
    } catch (fallbackError) {
      console.warn('Firestore document fallback query also failed:', getErrorMessage(fallbackError))
      throw fallbackError
    }
  }
}

export async function updateDocument(uid: string, docId: string, data: Partial<DocumentData>): Promise<void> {
  const db = ensureFirestore()
  const ref = doc(db, 'users', uid, 'documents', docId)
  await updateDoc(ref, { ...data, updated_at: new Date().toISOString() })
}

export async function deleteDocument(uid: string, docId: string): Promise<void> {
  const db = ensureFirestore()
  const ref = doc(db, 'users', uid, 'documents', docId)
  await deleteDoc(ref)
}

/**
 * Persist a studio artifact of type "documento" from a Research Notebook
 * into the user's Documents collection. This ensures notebook-generated
 * formal documents appear in the Documents page alongside regular documents.
 *
 * @param uid - user ID
 * @param input - artifact content and notebook metadata
 * @returns the created DocumentData (with id assigned by Firestore)
 */
export async function saveNotebookDocumentToDocuments(uid: string, input: {
  topic: string
  content: string
  notebookId: string
  notebookTitle: string
  llm_executions?: DocumentData['llm_executions']
}): Promise<DocumentData> {
  const db = ensureFirestore()
  const colRef = collection(db, 'users', uid, 'documents')
  const now = new Date().toISOString()
  const docData = stripUndefined({
    document_type_id: 'documento_caderno',
    original_request: input.topic,
    template_variant: null,
    legal_area_ids: [],
    request_context: null,
    context_detail: null,
    tema: input.topic,
    status: 'concluido',
    quality_score: null,
    texto_completo: input.content,
    origem: 'caderno' as const,
    notebook_id: input.notebookId,
    notebook_title: input.notebookTitle,
    llm_executions: input.llm_executions ?? [],
    created_at: now,
    updated_at: now,
  })
  const ref = await addDoc(colRef, docData)
  return { id: ref.id, ...docData }
}


// ── Stats (computed from Firestore data) ─────────────────────────────────────

export async function getStats(uid: string) {
  const [{ items }, sessions] = await Promise.all([
    listDocuments(uid),
    listThesisAnalysisSessions(uid).catch(() => []),
  ])
  const executions = [
    ...items.flatMap(doc => extractDocumentUsageExecutions(doc)),
    ...sessions.flatMap(session => extractThesisSessionExecutions(session)),
  ]
  const usageSummary = buildUsageSummary(executions)
  const total_documents = items.length
  const completed_documents = items.filter(d => d.status === 'concluido' || d.status === 'aprovado').length
  const processing_documents = items.filter(d => d.status === 'processando').length
  const pending_review_documents = items.filter(d => d.status === 'em_revisao' || d.status === 'rascunho').length
  const scores = items.map(d => d.quality_score).filter((s): s is number => s != null)
  const average_quality_score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  return {
    total_documents,
    completed_documents,
    processing_documents,
    pending_review_documents,
    average_quality_score,
    total_cost_usd: round6(usageSummary.total_cost_usd),
    average_duration_ms: null,
  }
}

/** Compute daily document counts from real Firestore documents for the last N days. */
export async function getDailyStats(uid: string, days = 30) {
  const [{ items }, sessions] = await Promise.all([
    listDocuments(uid),
    listThesisAnalysisSessions(uid).catch(() => []),
  ])
  const executions = [
    ...items.flatMap(doc => extractDocumentUsageExecutions(doc)),
    ...sessions.flatMap(session => extractThesisSessionExecutions(session)),
  ]
  const now = Date.now()
  const msPerDay = 86_400_000
  const cutoff = new Date(now - days * msPerDay).toISOString().slice(0, 10)

  // Build a day→counts map
  const dayMap = new Map<string, { total: number; concluidos: number; custo: number }>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * msPerDay).toISOString().slice(0, 10)
    dayMap.set(d, { total: 0, concluidos: 0, custo: 0 })
  }

  for (const doc of items) {
    if (!doc.created_at) continue // skip docs without a creation date
    const day = doc.created_at.slice(0, 10)
    if (day >= cutoff) {
      const entry = dayMap.get(day)
      if (entry) {
        entry.total++
        if (doc.status === 'concluido' || doc.status === 'aprovado') entry.concluidos++
        const cost = doc.llm_cost_usd
        if (typeof cost === 'number') entry.custo += cost
      }
    }
  }

  for (const execution of executions) {
    if (!execution.created_at) continue
    const day = execution.created_at.slice(0, 10)
    if (day < cutoff) continue

    const entry = dayMap.get(day)
    if (entry) entry.custo += execution.cost_usd
  }

  return Array.from(dayMap.entries()).map(([dia, v]) => ({
    dia,
    total: v.total,
    concluidos: v.concluidos,
    custo: round6(v.custo),
  }))
}

/** Compute document counts by type from real Firestore documents. */
export async function getByTypeStats(uid: string) {
  const { items } = await listDocuments(uid)
  const typeMap = new Map<string, { total: number; scores: number[] }>()

  for (const doc of items) {
    const t = doc.document_type_id
    if (!t) continue // skip docs without a valid type
    if (!typeMap.has(t)) typeMap.set(t, { total: 0, scores: [] })
    const entry = typeMap.get(t)!
    entry.total++
    if (doc.quality_score != null) entry.scores.push(doc.quality_score)
  }

  return Array.from(typeMap.entries()).map(([document_type_id, v]) => ({
    document_type_id,
    total: v.total,
    avg_score: v.scores.length > 0
      ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length)
      : null,
  }))
}

export async function getRecentDocuments(uid: string, count = 5): Promise<DocumentData[]> {
  const { items } = await listDocuments(uid, { limit: count })
  return items
}

export async function listThesisAnalysisSessions(uid: string): Promise<ThesisAnalysisSessionData[]> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listThesisAnalysisSessions')
  const colRef = collection(db, 'users', effectiveUid, 'thesis_analysis_sessions')
  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, orderBy('created_at', 'desc'))),
      'listThesisAnalysisSessions.query',
    )
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ThesisAnalysisSessionData))
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    console.warn('Firestore thesis analysis query failed; using client-side fallback:', getErrorMessage(error))
    const fallbackSnap = await withFirestoreRetry(
      () => getDocs(colRef),
      'listThesisAnalysisSessions.fallback',
    )
    return fallbackSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as ThesisAnalysisSessionData))
      .sort((a, b) => getDocumentCreatedAtValue(b.created_at) - getDocumentCreatedAtValue(a.created_at))
  }
}

export async function getCostBreakdown(uid: string): Promise<CostBreakdown> {
  const [{ items }, sessions, acervo, notebooks] = await Promise.all([
    listDocuments(uid),
    listThesisAnalysisSessions(uid).catch(() => []),
    listAcervoDocuments(uid).then(r => r.items).catch(() => [] as AcervoDocumentData[]),
    listResearchNotebooks(uid).then(r => r.items).catch(() => [] as ResearchNotebookData[]),
  ])

  const executions = [
    ...items.flatMap(doc => extractDocumentUsageExecutions(doc)),
    ...sessions.flatMap(session => extractThesisSessionExecutions(session)),
    ...acervo.flatMap(acervoDoc => extractAcervoUsageExecutions({
      id: acervoDoc.id,
      filename: acervoDoc.filename,
      created_at: acervoDoc.created_at,
      llm_executions: acervoDoc.llm_executions,
    })),
    ...notebooks.flatMap(nb => extractNotebookUsageExecutions({
      id: nb.id,
      title: nb.title,
      created_at: nb.created_at,
      llm_executions: nb.llm_executions,
      usage_summary: nb.usage_summary,
    })),
  ]

  return buildCostBreakdown(executions)
}

function extractPlatformUsageExecutions(snapshot: PlatformCollectionsSnapshot): UsageExecutionRecord[] {
  return [
    ...snapshot.documents.flatMap(doc => extractDocumentUsageExecutions(doc)),
    ...snapshot.sessions.flatMap(session => extractThesisSessionExecutions(session)),
    ...snapshot.acervo.flatMap(acervoDoc => extractAcervoUsageExecutions({
      id: acervoDoc.id,
      filename: acervoDoc.filename,
      created_at: acervoDoc.created_at,
      llm_executions: acervoDoc.llm_executions,
    })),
    ...snapshot.notebooks.flatMap(nb => extractNotebookUsageExecutions({
      id: nb.id,
      title: nb.title,
      created_at: nb.created_at,
      llm_executions: nb.llm_executions,
      usage_summary: nb.usage_summary,
    })),
  ]
}

export async function getPlatformCostBreakdown(force = false): Promise<CostBreakdown> {
  const snapshot = await loadPlatformCollections(force)
  return buildCostBreakdown(extractPlatformUsageExecutions(snapshot))
}

export async function getPlatformRecentAgentExecutions(maxItems = 40, force = false): Promise<UsageExecutionRecord[]> {
  const snapshot = await loadPlatformCollections(force)
  const safeMaxItems = Math.max(1, Math.min(200, Math.floor(maxItems)))

  return extractPlatformUsageExecutions(snapshot)
    .sort((left, right) => getDocumentCreatedAtValue(right.created_at) - getDocumentCreatedAtValue(left.created_at))
    .slice(0, safeMaxItems)
}

export async function getPlatformOverview(force = false): Promise<PlatformOverviewData> {
  const snapshot = await loadPlatformCollections(force)
  const breakdown = await getPlatformCostBreakdown(force)
  const statusMap = new Map<string, number>()
  const originMap = new Map<string, number>()
  const documentTypeMap = new Map<string, number>()
  const artifactTypeMap = new Map<string, number>()
  const activeUsers = new Set<string>()
  const scores = snapshot.documents.map(doc => doc.quality_score).filter((score): score is number => score != null)
  const notebookMemoryNotebookIds = new Set(snapshot.notebook_search_memory.map(item => item.notebook_id))
  const totalSearchMemoryAudits = snapshot.notebook_search_memory.reduce(
    (sum, item) => sum + (Array.isArray(item.research_audits) ? item.research_audits.length : 0),
    0,
  )
  const totalSearchMemorySavedSearches = snapshot.notebook_search_memory.reduce(
    (sum, item) => sum + (Array.isArray(item.saved_searches) ? item.saved_searches.length : 0),
    0,
  )
  const totalSearchMemoryAuditsDropped = snapshot.notebook_search_memory.reduce(
    (sum, item) => sum + (item.retention?.audits_dropped || 0),
    0,
  )
  const totalSearchMemorySavedSearchesDropped = snapshot.notebook_search_memory.reduce(
    (sum, item) => sum + (item.retention?.saved_searches_dropped || 0),
    0,
  )

  for (const user of snapshot.users) {
    if (isWithinLastDays(user.created_at, 30)) activeUsers.add(user.id)
  }

  for (const doc of snapshot.documents) {
    addCount(statusMap, doc.status || 'desconhecido')
    addCount(originMap, doc.origem || 'web')
    addCount(documentTypeMap, doc.document_type_id || 'desconhecido')
    if (isWithinLastDays(doc.created_at, 30)) {
      const ownerId = doc._owner_user_id ?? null
      if (ownerId) activeUsers.add(ownerId)
    }
  }

  for (const thesis of snapshot.theses) {
    if (isWithinLastDays(thesis.created_at, 30) && thesis._owner_user_id) activeUsers.add(thesis._owner_user_id)
  }

  for (const session of snapshot.sessions) {
    if (isWithinLastDays(session.created_at, 30) && session._owner_user_id) activeUsers.add(session._owner_user_id)
  }

  for (const acervoDoc of snapshot.acervo) {
    if (isWithinLastDays(acervoDoc.created_at, 30) && acervoDoc._owner_user_id) activeUsers.add(acervoDoc._owner_user_id)
  }

  for (const notebook of snapshot.notebooks) {
    if (isWithinLastDays(notebook.created_at, 30) && notebook._owner_user_id) activeUsers.add(notebook._owner_user_id)
  }

  for (const notebook of snapshot.notebooks) {
    for (const artifact of notebook.artifacts || []) {
      addCount(artifactTypeMap, artifact.type)
    }
  }

  const newUsers30d = snapshot.users.filter(user => isWithinLastDays(user.created_at, 30)).length

  return {
    total_users: snapshot.users.length,
    admin_users: snapshot.users.filter(user => user.role === 'admin').length,
    standard_users: snapshot.users.filter(user => user.role !== 'admin').length,
    new_users_30d: newUsers30d,
    active_users_30d: activeUsers.size,
    total_documents: snapshot.documents.length,
    completed_documents: snapshot.documents.filter(doc => doc.status === 'concluido' || doc.status === 'aprovado').length,
    processing_documents: snapshot.documents.filter(doc => doc.status === 'processando').length,
    pending_review_documents: snapshot.documents.filter(doc => doc.status === 'em_revisao' || doc.status === 'rascunho').length,
    average_quality_score: scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    total_theses: snapshot.theses.length,
    total_acervo_documents: snapshot.acervo.length,
    total_notebooks: snapshot.notebooks.length,
    notebooks_with_dedicated_search_memory: notebookMemoryNotebookIds.size,
    total_notebook_search_memory_docs: snapshot.notebook_search_memory.length,
    total_search_memory_audits: totalSearchMemoryAudits,
    total_search_memory_saved_searches: totalSearchMemorySavedSearches,
    total_search_memory_audits_dropped: totalSearchMemoryAuditsDropped,
    total_search_memory_saved_searches_dropped: totalSearchMemorySavedSearchesDropped,
    total_artifacts: snapshot.notebooks.reduce((sum, notebook) => sum + (notebook.artifacts?.length ?? 0), 0),
    total_sources: snapshot.notebooks.reduce((sum, notebook) => sum + (notebook.sources?.length ?? 0), 0),
    total_thesis_sessions: snapshot.sessions.length,
    total_cost_usd: breakdown.total_cost_usd,
    total_tokens: breakdown.total_tokens,
    total_calls: breakdown.total_calls,
    documents_by_status: mapToRows(statusMap, key => key.replace(/_/g, ' ')),
    documents_by_origin: mapToRows(originMap, key => key === 'caderno' ? 'Caderno de Pesquisa' : key === 'web' ? 'Web' : key),
    documents_by_type: mapToRows(documentTypeMap),
    artifacts_by_type: mapToRows(artifactTypeMap, artifactTypeLabel),
    functions_by_usage: breakdown.by_function.map(row => ({ ...row, count: row.calls })),
    top_models: breakdown.by_model.slice(0, 10).map(row => ({ ...row, count: row.calls })),
    top_agents: breakdown.by_agent.slice(0, 10).map(row => ({ ...row, count: row.calls })),
    top_providers: breakdown.by_provider.slice(0, 10).map(row => ({ ...row, count: row.calls })),
    operational_warnings: snapshot.operational_warnings,
  }
}

export async function getPlatformDailyUsage(days = 30, force = false): Promise<PlatformDailyUsagePoint[]> {
  const snapshot = await loadPlatformCollections(force)
  const now = Date.now()
  const cutoff = new Date(now - days * 86_400_000).toISOString().slice(0, 10)
  const dayMap = new Map<string, PlatformDailyUsagePoint & { users: Set<string> }>()

  for (let i = days - 1; i >= 0; i--) {
    const dia = new Date(now - i * 86_400_000).toISOString().slice(0, 10)
    dayMap.set(dia, {
      dia,
      usuarios_ativos: 0,
      novos_usuarios: 0,
      documentos: 0,
      cadernos: 0,
      uploads_acervo: 0,
      sessoes_teses: 0,
      memoria_busca_atualizacoes: 0,
      memoria_busca_descartes: 0,
      chamadas_llm: 0,
      tokens: 0,
      custo_usd: 0,
      users: new Set<string>(),
    })
  }

  const markUserDay = (day: string | null, userId: string | null) => {
    if (!day || day < cutoff || !userId) return
    const entry = dayMap.get(day)
    if (!entry) return
    entry.users.add(userId)
  }

  for (const user of snapshot.users) {
    const day = getIsoDateKey(user.created_at)
    if (!day || day < cutoff) continue
    const entry = dayMap.get(day)
    if (entry) entry.novos_usuarios += 1
  }

  for (const doc of snapshot.documents) {
    const day = getIsoDateKey(doc.created_at)
    if (!day || day < cutoff) continue
    const entry = dayMap.get(day)
    if (entry) entry.documentos += 1
  }

  for (const notebook of snapshot.notebooks) {
    const day = getIsoDateKey(notebook.created_at)
    if (!day || day < cutoff) continue
    const entry = dayMap.get(day)
    if (entry) entry.cadernos += 1
  }

  for (const acervoDoc of snapshot.acervo) {
    const day = getIsoDateKey(acervoDoc.created_at)
    if (!day || day < cutoff) continue
    const entry = dayMap.get(day)
    if (entry) entry.uploads_acervo += 1
  }

  for (const session of snapshot.sessions) {
    const day = getIsoDateKey(session.created_at)
    if (!day || day < cutoff) continue
    const entry = dayMap.get(day)
    if (entry) entry.sessoes_teses += 1
  }

  for (const memory of snapshot.notebook_search_memory) {
    const day = getIsoDateKey(memory.updated_at)
    if (!day || day < cutoff) continue
    const entry = dayMap.get(day)
    if (!entry) continue
    entry.memoria_busca_atualizacoes += 1
    entry.memoria_busca_descartes += (memory.retention?.audits_dropped || 0) + (memory.retention?.saved_searches_dropped || 0)
  }

  const executionGroups = extractPlatformUsageExecutions(snapshot)

  for (const execution of executionGroups) {
    const day = getIsoDateKey(execution.created_at)
    if (!day || day < cutoff) continue
    const entry = dayMap.get(day)
    if (!entry) continue
    entry.chamadas_llm += 1
    entry.tokens += execution.total_tokens
    entry.custo_usd = round6(entry.custo_usd + execution.cost_usd)
  }

  return Array.from(dayMap.values()).map(({ users, ...entry }) => ({
    ...entry,
    usuarios_ativos: users.size,
  }))
}

type ExecutionStateAccumulator = {
  calls: number
  cost_usd: number
  total_duration_ms: number
  retries: number
  fallbacks: number
}

function createExecutionStateAccumulator(): ExecutionStateAccumulator {
  return {
    calls: 0,
    cost_usd: 0,
    total_duration_ms: 0,
    retries: 0,
    fallbacks: 0,
  }
}

type FunctionExecutionAccumulator = {
  label: string
  calls: number
  cost_usd: number
  total_duration_ms: number
  retries: number
  fallbacks: number
  waiting_io: number
}

function createFunctionExecutionAccumulator(label: string): FunctionExecutionAccumulator {
  return {
    label,
    calls: 0,
    cost_usd: 0,
    total_duration_ms: 0,
    retries: 0,
    fallbacks: 0,
    waiting_io: 0,
  }
}

type FunctionDailyAdherenceAccumulator = {
  label: string
  calls: number
  retries: number
  fallbacks: number
  waiting_io: number
}

function createFunctionDailyAdherenceAccumulator(label: string): FunctionDailyAdherenceAccumulator {
  return {
    label,
    calls: 0,
    retries: 0,
    fallbacks: 0,
    waiting_io: 0,
  }
}

function aggregateExecutionStateWindow(
  executions: UsageExecutionRecord[],
  startDayInclusive: string,
  endDayExclusive: string,
): Map<string, ExecutionStateAccumulator> {
  const grouped = new Map<string, ExecutionStateAccumulator>()

  for (const execution of executions) {
    const day = getIsoDateKey(execution.created_at)
    if (!day || day < startDayInclusive || day >= endDayExclusive) continue

    const stateKey = resolveExecutionStateKey(execution.execution_state)
    const current = grouped.get(stateKey) ?? createExecutionStateAccumulator()

    current.calls += 1
    current.cost_usd = round6(current.cost_usd + execution.cost_usd)
    current.total_duration_ms += execution.duration_ms
    current.retries += (execution.retry_count ?? 0) > 0 ? 1 : 0
    current.fallbacks += execution.used_fallback ? 1 : 0

    grouped.set(stateKey, current)
  }

  return grouped
}

function aggregateFunctionWindow(
  executions: UsageExecutionRecord[],
  startDayInclusive: string,
  endDayExclusive: string,
): Map<string, FunctionExecutionAccumulator> {
  const grouped = new Map<string, FunctionExecutionAccumulator>()

  for (const execution of executions) {
    const day = getIsoDateKey(execution.created_at)
    if (!day || day < startDayInclusive || day >= endDayExclusive) continue

    const functionKey = resolveFunctionKey(execution)
    const current = grouped.get(functionKey) ?? createFunctionExecutionAccumulator(resolveFunctionLabel(execution))

    // Preserve the most informative label if this key appears with different variants.
    if (!current.label || current.label === 'Função não identificada') {
      current.label = resolveFunctionLabel(execution)
    }

    current.calls += 1
    current.cost_usd = round6(current.cost_usd + execution.cost_usd)
    current.total_duration_ms += execution.duration_ms
    current.retries += (execution.retry_count ?? 0) > 0 ? 1 : 0
    current.fallbacks += execution.used_fallback ? 1 : 0
    current.waiting_io += execution.execution_state === 'waiting_io' ? 1 : 0

    grouped.set(functionKey, current)
  }

  return grouped
}

export async function getPlatformExecutionStateDaily(days = 14, force = false): Promise<PlatformExecutionStateDailyPoint[]> {
  const snapshot = await loadPlatformCollections(force)
  const executions = extractPlatformUsageExecutions(snapshot)
  const safeDays = Math.max(3, Math.min(90, Math.floor(days)))
  const now = Date.now()
  const dayMap = new Map<string, {
    total_calls: number
    total_cost_usd: number
    states: Map<string, ExecutionStateAccumulator>
  }>()

  for (let i = safeDays - 1; i >= 0; i--) {
    const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10)
    dayMap.set(day, {
      total_calls: 0,
      total_cost_usd: 0,
      states: new Map<string, ExecutionStateAccumulator>(),
    })
  }

  for (const execution of executions) {
    const day = getIsoDateKey(execution.created_at)
    if (!day) continue
    const dayEntry = dayMap.get(day)
    if (!dayEntry) continue

    dayEntry.total_calls += 1
    dayEntry.total_cost_usd = round6(dayEntry.total_cost_usd + execution.cost_usd)

    const stateKey = resolveExecutionStateKey(execution.execution_state)
    const stateEntry = dayEntry.states.get(stateKey) ?? createExecutionStateAccumulator()
    stateEntry.calls += 1
    stateEntry.cost_usd = round6(stateEntry.cost_usd + execution.cost_usd)
    stateEntry.total_duration_ms += execution.duration_ms
    stateEntry.retries += (execution.retry_count ?? 0) > 0 ? 1 : 0
    stateEntry.fallbacks += execution.used_fallback ? 1 : 0
    dayEntry.states.set(stateKey, stateEntry)
  }

  return Array.from(dayMap.entries()).map(([dia, entry]) => {
    const states = Array.from(entry.states.entries())
      .map(([key, value]) => ({
        key,
        label: getExecutionStateLabel(key),
        calls: value.calls,
        cost_usd: round6(value.cost_usd),
        avg_duration_ms: value.calls > 0 ? Math.round(value.total_duration_ms / value.calls) : 0,
        call_share: safeRatio(value.calls, entry.total_calls),
        cost_share: safeRatio(value.cost_usd, entry.total_cost_usd),
        retry_rate: safeRatio(value.retries, value.calls),
        fallback_rate: safeRatio(value.fallbacks, value.calls),
      }))
      .sort((left, right) => right.calls - left.calls || right.cost_usd - left.cost_usd)

    return {
      dia,
      total_calls: entry.total_calls,
      total_cost_usd: round6(entry.total_cost_usd),
      states,
    }
  })
}

export async function getPlatformExecutionStateWindowComparison(days = 7, force = false): Promise<PlatformExecutionStateWindowComparisonRow[]> {
  const snapshot = await loadPlatformCollections(force)
  const executions = extractPlatformUsageExecutions(snapshot)
  const safeDays = Math.max(3, Math.min(30, Math.floor(days)))
  const now = Date.now()

  const currentStart = new Date(now - (safeDays - 1) * 86_400_000).toISOString().slice(0, 10)
  const currentEndExclusive = new Date(now + 86_400_000).toISOString().slice(0, 10)
  const previousStart = new Date(now - ((safeDays * 2) - 1) * 86_400_000).toISOString().slice(0, 10)
  const previousEndExclusive = currentStart

  const currentWindow = aggregateExecutionStateWindow(executions, currentStart, currentEndExclusive)
  const previousWindow = aggregateExecutionStateWindow(executions, previousStart, previousEndExclusive)

  const stateKeys = new Set<string>([...currentWindow.keys(), ...previousWindow.keys()])

  return Array.from(stateKeys)
    .map((stateKey) => {
      const current = currentWindow.get(stateKey) ?? createExecutionStateAccumulator()
      const previous = previousWindow.get(stateKey) ?? createExecutionStateAccumulator()

      const currentAvgDuration = current.calls > 0 ? current.total_duration_ms / current.calls : 0
      const previousAvgDuration = previous.calls > 0 ? previous.total_duration_ms / previous.calls : 0
      const currentRetryRate = safeRatio(current.retries, current.calls)
      const previousRetryRate = safeRatio(previous.retries, previous.calls)
      const currentFallbackRate = safeRatio(current.fallbacks, current.calls)
      const previousFallbackRate = safeRatio(previous.fallbacks, previous.calls)

      return {
        key: stateKey,
        label: getExecutionStateLabel(stateKey),
        current_calls: current.calls,
        previous_calls: previous.calls,
        current_cost_usd: round6(current.cost_usd),
        previous_cost_usd: round6(previous.cost_usd),
        current_avg_duration_ms: Math.round(currentAvgDuration),
        previous_avg_duration_ms: Math.round(previousAvgDuration),
        current_retry_rate: currentRetryRate,
        previous_retry_rate: previousRetryRate,
        current_fallback_rate: currentFallbackRate,
        previous_fallback_rate: previousFallbackRate,
        calls_delta_pct: safeDeltaPct(current.calls, previous.calls),
        cost_delta_pct: safeDeltaPct(current.cost_usd, previous.cost_usd),
        duration_delta_pct: safeDeltaPct(currentAvgDuration, previousAvgDuration),
      }
    })
    .filter(item => item.current_calls > 0 || item.previous_calls > 0)
    .sort((left, right) => {
      const leftImpact = Math.abs(left.calls_delta_pct) + Math.abs(left.duration_delta_pct) + Math.abs(left.cost_delta_pct)
      const rightImpact = Math.abs(right.calls_delta_pct) + Math.abs(right.duration_delta_pct) + Math.abs(right.cost_delta_pct)
      return rightImpact - leftImpact || right.current_calls - left.current_calls
    })
}

export async function getPlatformFunctionWindowComparison(days = 7, force = false): Promise<PlatformFunctionWindowComparisonRow[]> {
  const snapshot = await loadPlatformCollections(force)
  const executions = extractPlatformUsageExecutions(snapshot)
  const safeDays = Math.max(3, Math.min(30, Math.floor(days)))
  const now = Date.now()

  const currentStart = new Date(now - (safeDays - 1) * 86_400_000).toISOString().slice(0, 10)
  const currentEndExclusive = new Date(now + 86_400_000).toISOString().slice(0, 10)
  const previousStart = new Date(now - ((safeDays * 2) - 1) * 86_400_000).toISOString().slice(0, 10)
  const previousEndExclusive = currentStart

  const currentWindow = aggregateFunctionWindow(executions, currentStart, currentEndExclusive)
  const previousWindow = aggregateFunctionWindow(executions, previousStart, previousEndExclusive)

  const functionKeys = new Set<string>([...currentWindow.keys(), ...previousWindow.keys()])

  return Array.from(functionKeys)
    .map((functionKey) => {
      const current = currentWindow.get(functionKey)
      const previous = previousWindow.get(functionKey)

      const currentCalls = current?.calls ?? 0
      const previousCalls = previous?.calls ?? 0
      const currentCost = current?.cost_usd ?? 0
      const previousCost = previous?.cost_usd ?? 0
      const currentAvgDuration = currentCalls > 0 ? (current?.total_duration_ms ?? 0) / currentCalls : 0
      const previousAvgDuration = previousCalls > 0 ? (previous?.total_duration_ms ?? 0) / previousCalls : 0
      const currentRetryRate = safeRatio(current?.retries ?? 0, currentCalls)
      const previousRetryRate = safeRatio(previous?.retries ?? 0, previousCalls)
      const currentFallbackRate = safeRatio(current?.fallbacks ?? 0, currentCalls)
      const previousFallbackRate = safeRatio(previous?.fallbacks ?? 0, previousCalls)
      const currentWaitingIoRate = safeRatio(current?.waiting_io ?? 0, currentCalls)
      const previousWaitingIoRate = safeRatio(previous?.waiting_io ?? 0, previousCalls)

      return {
        key: functionKey,
        label: current?.label || previous?.label || functionKey,
        current_calls: currentCalls,
        previous_calls: previousCalls,
        current_cost_usd: round6(currentCost),
        previous_cost_usd: round6(previousCost),
        current_avg_duration_ms: Math.round(currentAvgDuration),
        previous_avg_duration_ms: Math.round(previousAvgDuration),
        current_retry_rate: currentRetryRate,
        previous_retry_rate: previousRetryRate,
        current_fallback_rate: currentFallbackRate,
        previous_fallback_rate: previousFallbackRate,
        current_waiting_io_rate: currentWaitingIoRate,
        previous_waiting_io_rate: previousWaitingIoRate,
        calls_delta_pct: safeDeltaPct(currentCalls, previousCalls),
        cost_delta_pct: safeDeltaPct(currentCost, previousCost),
        duration_delta_pct: safeDeltaPct(currentAvgDuration, previousAvgDuration),
      }
    })
    .filter(item => item.current_calls > 0 || item.previous_calls > 0)
    .sort((left, right) => {
      const leftImpact = Math.abs(left.calls_delta_pct) + Math.abs(left.duration_delta_pct) + Math.abs(left.cost_delta_pct)
      const rightImpact = Math.abs(right.calls_delta_pct) + Math.abs(right.duration_delta_pct) + Math.abs(right.cost_delta_pct)
      const leftRisk = left.current_retry_rate + left.current_fallback_rate + left.current_waiting_io_rate
      const rightRisk = right.current_retry_rate + right.current_fallback_rate + right.current_waiting_io_rate
      return rightImpact - leftImpact || rightRisk - leftRisk || right.current_calls - left.current_calls
    })
}

export async function getPlatformFunctionCalibrationPlan(days = 7, force = false): Promise<PlatformFunctionCalibrationRow[]> {
  const comparisonRows = await getPlatformFunctionWindowComparison(days, force)
  if (comparisonRows.length === 0) return []

  const sample = comparisonRows.filter(row => row.current_calls >= 6)
  const retryMedian = percentile(sample.map(row => row.current_retry_rate), 0.5)
  const fallbackMedian = percentile(sample.map(row => row.current_fallback_rate), 0.5)
  const waitingIoMedian = percentile(sample.map(row => row.current_waiting_io_rate), 0.5)

  return comparisonRows
    .map((row) => {
      const reliabilityRisk = (row.current_retry_rate * 1.4) + (row.current_fallback_rate * 1.1) + (row.current_waiting_io_rate * 1.25)
      const driftRisk =
        (Math.max(0, row.calls_delta_pct) * 0.35)
        + (Math.max(0, row.duration_delta_pct) * 0.3)
        + (Math.max(0, row.cost_delta_pct) * 0.2)
      const riskScore = round4(reliabilityRisk + driftRisk)

      const priority = resolveFunctionCalibrationPriority({
        riskScore,
        currentRetryRate: row.current_retry_rate,
        currentFallbackRate: row.current_fallback_rate,
        currentWaitingIoRate: row.current_waiting_io_rate,
      })

      const action = resolveFunctionCalibrationAction({
        priority,
        currentCalls: row.current_calls,
        callsDeltaPct: row.calls_delta_pct,
        currentRetryRate: row.current_retry_rate,
        currentFallbackRate: row.current_fallback_rate,
        currentWaitingIoRate: row.current_waiting_io_rate,
      })

      const targetRetryRate = round4(computeTargetRate({
        currentRate: row.current_retry_rate,
        previousRate: row.previous_retry_rate,
        medianRate: retryMedian,
        action,
      }))
      const targetFallbackRate = round4(computeTargetRate({
        currentRate: row.current_fallback_rate,
        previousRate: row.previous_fallback_rate,
        medianRate: fallbackMedian,
        action,
      }))
      const targetWaitingIoRate = round4(computeTargetRate({
        currentRate: row.current_waiting_io_rate,
        previousRate: row.previous_waiting_io_rate,
        medianRate: waitingIoMedian,
        action,
      }))

      return {
        key: row.key,
        label: row.label,
        current_calls: row.current_calls,
        current_retry_rate: row.current_retry_rate,
        current_fallback_rate: row.current_fallback_rate,
        current_waiting_io_rate: row.current_waiting_io_rate,
        target_retry_rate: targetRetryRate,
        target_fallback_rate: targetFallbackRate,
        target_waiting_io_rate: targetWaitingIoRate,
        retry_gap: round4(row.current_retry_rate - targetRetryRate),
        fallback_gap: round4(row.current_fallback_rate - targetFallbackRate),
        waiting_io_gap: round4(row.current_waiting_io_rate - targetWaitingIoRate),
        calls_delta_pct: row.calls_delta_pct,
        duration_delta_pct: row.duration_delta_pct,
        cost_delta_pct: row.cost_delta_pct,
        risk_score: riskScore,
        action,
        priority,
      }
    })
    .filter(row => row.current_calls > 0)
    .sort((left, right) => {
      const priorityScore = (value: PlatformFunctionCalibrationPriority) => {
        if (value === 'critical') return 3
        if (value === 'warning') return 2
        return 1
      }

      return (
        priorityScore(right.priority) - priorityScore(left.priority)
        || right.risk_score - left.risk_score
        || right.current_calls - left.current_calls
      )
    })
}

export async function getPlatformFunctionTargetAdherenceDaily(
  days = 14,
  calibrationWindowDays = 7,
  force = false,
): Promise<PlatformFunctionTargetAdherenceDailyPoint[]> {
  const snapshot = await loadPlatformCollections(force)
  const executions = extractPlatformUsageExecutions(snapshot)
  const calibrationRows = await getPlatformFunctionCalibrationPlan(calibrationWindowDays, force)
  if (calibrationRows.length === 0) return []

  const safeDays = Math.max(3, Math.min(30, Math.floor(days)))
  const now = Date.now()
  const planByFunction = new Map(calibrationRows.map(row => [row.key, row]))
  const dayMap = new Map<string, {
    observed: Set<string>
    withTarget: Map<string, FunctionDailyAdherenceAccumulator>
  }>()

  for (let i = safeDays - 1; i >= 0; i--) {
    const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10)
    dayMap.set(day, {
      observed: new Set<string>(),
      withTarget: new Map<string, FunctionDailyAdherenceAccumulator>(),
    })
  }

  for (const execution of executions) {
    const day = getIsoDateKey(execution.created_at)
    if (!day) continue

    const dayEntry = dayMap.get(day)
    if (!dayEntry) continue

    const functionKey = resolveFunctionKey(execution)
    dayEntry.observed.add(functionKey)

    const calibration = planByFunction.get(functionKey)
    if (!calibration) continue

    const functionEntry = dayEntry.withTarget.get(functionKey)
      ?? createFunctionDailyAdherenceAccumulator(calibration.label || resolveFunctionLabel(execution))

    functionEntry.calls += 1
    functionEntry.retries += (execution.retry_count ?? 0) > 0 ? 1 : 0
    functionEntry.fallbacks += execution.used_fallback ? 1 : 0
    functionEntry.waiting_io += execution.execution_state === 'waiting_io' ? 1 : 0

    dayEntry.withTarget.set(functionKey, functionEntry)
  }

  return Array.from(dayMap.entries()).map(([dia, entry]) => {
    const rows = Array.from(entry.withTarget.entries())
      .map(([functionKey, value]) => {
        const calibration = planByFunction.get(functionKey)
        if (!calibration || value.calls <= 0) return null

        const liveRetryRate = safeRatio(value.retries, value.calls)
        const liveFallbackRate = safeRatio(value.fallbacks, value.calls)
        const liveWaitingIoRate = safeRatio(value.waiting_io, value.calls)
        const livePressure = round4((liveRetryRate * 1.4) + (liveFallbackRate * 1.1) + (liveWaitingIoRate * 1.25))
        const targetPressure = round4((calibration.target_retry_rate * 1.4) + (calibration.target_fallback_rate * 1.1) + (calibration.target_waiting_io_rate * 1.25))

        return {
          key: functionKey,
          label: value.label || calibration.label,
          calls: value.calls,
          live_retry_rate: liveRetryRate,
          target_retry_rate: calibration.target_retry_rate,
          live_fallback_rate: liveFallbackRate,
          target_fallback_rate: calibration.target_fallback_rate,
          live_waiting_io_rate: liveWaitingIoRate,
          target_waiting_io_rate: calibration.target_waiting_io_rate,
          live_pressure: livePressure,
          target_pressure: targetPressure,
          pressure_gap: round4(livePressure - targetPressure),
          action: calibration.action,
          priority: calibration.priority,
          status: resolveFunctionTargetAdherenceStatus({
            livePressure,
            targetPressure,
          }),
        } satisfies PlatformFunctionTargetAdherenceRow
      })
      .filter((item): item is PlatformFunctionTargetAdherenceRow => Boolean(item))
      .sort((left, right) => {
        const statusScore = (status: PlatformFunctionTargetAdherenceStatus) => {
          if (status === 'above_target') return 3
          if (status === 'aligned') return 2
          return 1
        }
        const priorityScore = (priority: PlatformFunctionCalibrationPriority) => {
          if (priority === 'critical') return 3
          if (priority === 'warning') return 2
          return 1
        }

        return (
          statusScore(right.status) - statusScore(left.status)
          || priorityScore(right.priority) - priorityScore(left.priority)
          || right.pressure_gap - left.pressure_gap
          || right.calls - left.calls
        )
      })

    const aboveTarget = rows.filter(row => row.status === 'above_target').length
    const aligned = rows.filter(row => row.status === 'aligned').length
    const belowTarget = rows.filter(row => row.status === 'below_target').length

    return {
      dia,
      total_functions_observed: entry.observed.size,
      total_functions_with_target: rows.length,
      coverage_rate: safeRatio(rows.length, entry.observed.size),
      above_target: aboveTarget,
      aligned,
      below_target: belowTarget,
      rows,
    }
  })
}

export async function getPlatformFunctionRolloutPolicyPlan(
  days = 14,
  calibrationWindowDays = 7,
  force = false,
): Promise<PlatformFunctionRolloutPolicyPlan | null> {
  const adherenceDaily = await getPlatformFunctionTargetAdherenceDaily(days, calibrationWindowDays, force)
  if (adherenceDaily.length === 0) return null

  const latestPoint = adherenceDaily[adherenceDaily.length - 1]
  const historyByFunction = new Map<string, PlatformFunctionTargetAdherenceRow[]>()

  for (const point of adherenceDaily) {
    for (const row of point.rows) {
      const history = historyByFunction.get(row.key) ?? []
      history.push(row)
      historyByFunction.set(row.key, history)
    }
  }

  const rows = latestPoint.rows
    .map((latestRow) => {
      const history = historyByFunction.get(latestRow.key) ?? [latestRow]
      const observedDays = history.length
      const expectedDays = adherenceDaily.length
      const recentCalls = latestRow.calls
      const statusHistory = history.map(item => item.status)
      const pressureGapHistory = history.map(item => item.pressure_gap)
      const retryWaitingHistory = history.map(item => item.live_retry_rate + item.live_waiting_io_rate)
      const aboveTargetStreak = computeStreakFromEnd(statusHistory, status => status === 'above_target')
      const stableStreak = computeStreakFromEnd(statusHistory, status => status === 'aligned' || status === 'below_target')
      const trendPressureGap = round4(computeLinearTrend(pressureGapHistory))
      const trendRetryWaitingSum = round4(computeLinearTrend(retryWaitingHistory))
      const confidence = computeFunctionRolloutConfidence({
        recentCalls,
        observedDays,
        expectedDays,
        priority: latestRow.priority,
      })
      const predictiveThresholds = resolveFunctionPredictiveThresholds({
        priority: latestRow.priority,
        confidenceBand: confidence.band,
      })
      const isPredictiveAlert = trendPressureGap >= predictiveThresholds.pressureGap
        && trendRetryWaitingSum >= predictiveThresholds.retryWaiting
        && (latestRow.status === 'above_target' || latestRow.status === 'aligned')
      const guardrails = resolveFunctionRolloutGuardrails(latestRow.priority, confidence.band)

      const riskLevel = resolveFunctionRolloutRiskLevel({
        latestStatus: latestRow.status,
        latestPressureGap: latestRow.pressure_gap,
        trendPressureGap,
        trendRetryWaitingSum,
        aboveTargetStreak,
        priority: latestRow.priority,
        confidenceScore: confidence.score,
        confidenceBand: confidence.band,
      })

      const recommendation = resolveFunctionRolloutRecommendation({
        latestStatus: latestRow.status,
        riskLevel,
        aboveTargetStreak,
        stableStreak,
        trendPressureGap,
        confidenceBand: confidence.band,
        guardrails,
      })

      return {
        key: latestRow.key,
        label: latestRow.label,
        priority: latestRow.priority,
        latest_status: latestRow.status,
        observed_days: observedDays,
        expected_days: expectedDays,
        recent_calls: recentCalls,
        confidence_score: confidence.score,
        confidence_band: confidence.band,
        latest_pressure_gap: latestRow.pressure_gap,
        trend_pressure_gap: trendPressureGap,
        latest_retry_waiting_sum: round4(latestRow.live_retry_rate + latestRow.live_waiting_io_rate),
        trend_retry_waiting_sum: trendRetryWaitingSum,
        predictive_pressure_threshold: predictiveThresholds.pressureGap,
        predictive_retry_waiting_threshold: predictiveThresholds.retryWaiting,
        is_predictive_alert: isPredictiveAlert,
        above_target_streak: aboveTargetStreak,
        stable_streak: stableStreak,
        risk_level: riskLevel,
        recommendation,
        guardrails,
        rationale: buildFunctionRolloutRationale({
          riskLevel,
          latestStatus: latestRow.status,
          aboveTargetStreak,
          stableStreak,
          latestPressureGap: latestRow.pressure_gap,
          trendPressureGap,
          trendRetryWaitingSum,
          confidenceScore: confidence.score,
          confidenceBand: confidence.band,
          observedDays,
          expectedDays,
          isPredictiveAlert,
        }),
      } satisfies PlatformFunctionRolloutPolicyRow
    })
    .sort((left, right) => {
      const riskScore = (value: PlatformFunctionRolloutRiskLevel) => {
        if (value === 'critical') return 3
        if (value === 'warning') return 2
        return 1
      }
      const recommendationScore = (value: PlatformFunctionRolloutRecommendation) => {
        if (value === 'tighten_now') return 4
        if (value === 'tighten_guarded') return 3
        if (value === 'hold') return 2
        return 1
      }

      return (
        riskScore(right.risk_level) - riskScore(left.risk_level)
        || recommendationScore(right.recommendation) - recommendationScore(left.recommendation)
        || right.confidence_score - left.confidence_score
        || right.latest_pressure_gap - left.latest_pressure_gap
      )
    })

  const criticalCount = rows.filter(row => row.risk_level === 'critical').length
  const warningCount = rows.filter(row => row.risk_level === 'warning').length
  const stableCount = rows.filter(row => row.risk_level === 'stable').length
  const lowConfidenceCount = rows.filter(row => row.confidence_band === 'low').length
  const mediumConfidenceCount = rows.filter(row => row.confidence_band === 'medium').length
  const highConfidenceCount = rows.filter(row => row.confidence_band === 'high').length
  const predictiveAlertCount = rows.filter(row => row.is_predictive_alert).length
  const tightenNowCount = rows.filter(row => row.recommendation === 'tighten_now').length
  const tightenGuardedCount = rows.filter(row => row.recommendation === 'tighten_guarded').length
  const holdCount = rows.filter(row => row.recommendation === 'hold').length
  const relaxGuardedCount = rows.filter(row => row.recommendation === 'relax_guarded').length

  return {
    days: adherenceDaily.length,
    calibration_window_days: Math.max(3, Math.min(30, Math.floor(calibrationWindowDays))),
    total_functions_observed: latestPoint.total_functions_observed,
    total_functions_with_target: latestPoint.total_functions_with_target,
    coverage_rate: latestPoint.coverage_rate,
    critical_count: criticalCount,
    warning_count: warningCount,
    stable_count: stableCount,
    low_confidence_count: lowConfidenceCount,
    medium_confidence_count: mediumConfidenceCount,
    high_confidence_count: highConfidenceCount,
    predictive_alert_count: predictiveAlertCount,
    tighten_now_count: tightenNowCount,
    tighten_guarded_count: tightenGuardedCount,
    hold_count: holdCount,
    relax_guarded_count: relaxGuardedCount,
    rows,
  }
}

export type NotebookSearchMemoryBackfillReport = {
  scanned: number
  migrated: number
  already_dedicated: number
  empty_legacy: number
  failed: number
  chunks_processed: number
  chunk_size: number
  max_notebooks?: number
  reached_limit: boolean
  dry_run: boolean
}

export async function backfillNotebookSearchMemoryAcrossPlatform(opts?: {
  dryRun?: boolean
  maxNotebooks?: number
  chunkSize?: number
}): Promise<NotebookSearchMemoryBackfillReport> {
  const db = ensureFirestore()
  const dryRun = Boolean(opts?.dryRun)
  const maxNotebooks = opts?.maxNotebooks && opts.maxNotebooks > 0 ? Math.floor(opts.maxNotebooks) : undefined
  const chunkSize = Math.max(50, Math.min(500, Math.floor(opts?.chunkSize ?? 200)))

  const report: NotebookSearchMemoryBackfillReport = {
    scanned: 0,
    migrated: 0,
    already_dedicated: 0,
    empty_legacy: 0,
    failed: 0,
    chunks_processed: 0,
    chunk_size: chunkSize,
    max_notebooks: maxNotebooks,
    reached_limit: false,
    dry_run: dryRun,
  }

  let cursor: DocumentSnapshot | null = null

  while (true) {
    const remaining = maxNotebooks ? maxNotebooks - report.scanned : chunkSize
    if (maxNotebooks && remaining <= 0) {
      report.reached_limit = true
      break
    }

    const pageLimit = Math.max(1, Math.min(chunkSize, remaining))
    const constraints: QueryConstraint[] = [orderBy('created_at', 'desc'), limit(pageLimit)]
    if (cursor) constraints.push(startAfter(cursor))

    const notebooksSnap = await getDocs(query(collectionGroup(db, 'research_notebooks'), ...constraints))
    if (notebooksSnap.empty) break

    report.chunks_processed += 1
    cursor = notebooksSnap.docs[notebooksSnap.docs.length - 1]

    for (const notebookDoc of notebooksSnap.docs) {
      if (maxNotebooks && report.scanned >= maxNotebooks) {
        report.reached_limit = true
        break
      }

      report.scanned += 1

      try {
        const uid = getRefUserId(notebookDoc.ref.path)
        if (!uid) {
          report.failed += 1
          continue
        }

        const memorySnap = await getDoc(getNotebookSearchMemoryDocRef(uid, notebookDoc.id))
        if (memorySnap.exists()) {
          report.already_dedicated += 1
          continue
        }

        const notebook = notebookDoc.data() as ResearchNotebookData
        const legacyAudits = Array.isArray(notebook.research_audits) ? notebook.research_audits : []
        const legacySavedSearches = Array.isArray(notebook.saved_searches) ? notebook.saved_searches : []

        if (legacyAudits.length === 0 && legacySavedSearches.length === 0) {
          report.empty_legacy += 1
          continue
        }

        if (!dryRun) {
          await saveNotebookSearchMemory(uid, notebookDoc.id, {
            research_audits: legacyAudits,
            saved_searches: legacySavedSearches,
            migrated_from_notebook_doc_at: new Date().toISOString(),
          })
        }

        report.migrated += 1
      } catch (error) {
        report.failed += 1
        console.warn('[Lexio] backfillNotebookSearchMemoryAcrossPlatform: failed for notebook', notebookDoc.id, error)
      }
    }

    if (maxNotebooks && report.scanned >= maxNotebooks) {
      report.reached_limit = true
      break
    }
  }

  return report
}

// ── Document types & legal areas (static definitions for Firebase mode) ──────

const DOCUMENT_TYPES = [
  { id: 'parecer', name: 'Parecer Jurídico', description: 'Opinião técnico-jurídica fundamentada sobre questão de direito', templates: ['mprs_caopp', 'generic'] },
  { id: 'peticao_inicial', name: 'Petição Inicial', description: 'Peça inaugural de ação judicial', templates: ['generic'] },
  { id: 'contestacao', name: 'Contestação', description: 'Resposta do réu à petição inicial', templates: ['generic'] },
  { id: 'recurso', name: 'Recurso', description: 'Peça recursal para reforma de decisão judicial', templates: ['generic'] },
  { id: 'acao_civil_publica', name: 'Ação Civil Pública', description: 'Ação para tutela de direitos difusos e coletivos', templates: ['generic'] },
  { id: 'sentenca', name: 'Sentença', description: 'Decisão judicial que resolve o mérito da causa', templates: ['generic'] },
  { id: 'mandado_seguranca', name: 'Mandado de Segurança', description: 'Remédio constitucional contra ato ilegal de autoridade pública', templates: ['generic'] },
  { id: 'habeas_corpus', name: 'Habeas Corpus', description: 'Remédio constitucional contra violação da liberdade de locomoção', templates: ['generic'] },
  { id: 'agravo', name: 'Agravo de Instrumento', description: 'Recurso contra decisões interlocutórias', templates: ['generic'] },
  { id: 'embargos_declaracao', name: 'Embargos de Declaração', description: 'Recurso para sanar omissão, contradição ou obscuridade', templates: ['generic'] },
]

const LEGAL_AREAS = [
  // ── Áreas clássicas (já implementadas no backend) ─────────────────────────
  { id: 'administrative', name: 'Direito Administrativo', description: 'Licitações, contratos administrativos, improbidade, servidores públicos' },
  { id: 'constitutional', name: 'Direito Constitucional', description: 'Direitos fundamentais, controle de constitucionalidade, organização do Estado' },
  { id: 'civil', name: 'Direito Civil', description: 'Obrigações, contratos, responsabilidade civil, direitos reais, família e sucessões' },
  { id: 'tax', name: 'Direito Tributário', description: 'Tributos, contribuições, isenções, planejamento tributário' },
  { id: 'labor', name: 'Direito do Trabalho', description: 'Relações de trabalho, CLT, direitos trabalhistas, previdência' },
  // ── Novas áreas ───────────────────────────────────────────────────────────
  { id: 'criminal', name: 'Direito Penal', description: 'Crimes, penas, execução penal, legislação penal especial' },
  { id: 'criminal_procedure', name: 'Processo Penal', description: 'Inquérito, ação penal, provas, recursos criminais, execução penal' },
  { id: 'civil_procedure', name: 'Processo Civil', description: 'Procedimentos, recursos, execução, tutelas provisórias, CPC/2015' },
  { id: 'consumer', name: 'Direito do Consumidor', description: 'Relações de consumo, CDC, responsabilidade do fornecedor, práticas abusivas' },
  { id: 'environmental', name: 'Direito Ambiental', description: 'Proteção ambiental, licenciamento, crimes ambientais, responsabilidade ambiental' },
  { id: 'business', name: 'Direito Empresarial', description: 'Sociedades, contratos mercantis, recuperação judicial, falência, propriedade intelectual' },
  { id: 'family', name: 'Direito de Família', description: 'Casamento, divórcio, guarda, alimentos, adoção, união estável' },
  { id: 'inheritance', name: 'Direito das Sucessões', description: 'Herança, testamento, inventário, partilha, sucessão legítima e testamentária' },
  { id: 'social_security', name: 'Direito Previdenciário', description: 'Aposentadoria, benefícios do INSS, auxílios, pensão por morte, BPC/LOAS' },
  { id: 'electoral', name: 'Direito Eleitoral', description: 'Eleições, partidos políticos, propaganda eleitoral, prestação de contas' },
  { id: 'international', name: 'Direito Internacional', description: 'Tratados, direito internacional público e privado, extradição, cooperação jurídica' },
  { id: 'digital', name: 'Direito Digital', description: 'LGPD, Marco Civil, crimes cibernéticos, proteção de dados, e-commerce' },
]

export function getDocumentTypes() { return DOCUMENT_TYPES }
export function getLegalAreas() { return LEGAL_AREAS }

const DEFAULT_DOCUMENT_TYPE_MAP = new Map(DOCUMENT_TYPES.map(item => [item.id, item] as const))
const DEFAULT_LEGAL_AREA_MAP = new Map(LEGAL_AREAS.map(item => [item.id, item] as const))

function getDefaultAdminDocumentTypes(): AdminDocumentType[] {
  return DOCUMENT_TYPES.map(dt => ({ ...dt, is_enabled: true }))
}

function getDefaultAdminLegalAreas(): AdminLegalArea[] {
  return LEGAL_AREAS.map(la => ({ ...la, is_enabled: true }))
}

function sanitizeStringArray(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  return items.flatMap((item): string[] => {
    if (typeof item !== 'string') return []
    const normalized = item.trim()
    return normalized ? [normalized] : []
  })
}

export function sanitizeAdminDocumentTypes(items: unknown): AdminDocumentType[] {
  if (!Array.isArray(items)) return []

  return items.flatMap((item): AdminDocumentType[] => {
    if (!item || typeof item !== 'object') return []

    const source = item as Partial<AdminDocumentType>
    const id = typeof source.id === 'string' ? source.id.trim() : ''
    if (!id) return []

    const defaults = DEFAULT_DOCUMENT_TYPE_MAP.get(id)
    const name = typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : defaults?.name
    if (!name) return []

    const description = typeof source.description === 'string'
      ? source.description.trim()
      : (defaults?.description ?? '')
    const templates = sanitizeStringArray(source.templates)
    const structure = typeof source.structure === 'string' ? source.structure : undefined

    return [{
      id,
      name,
      description,
      templates: templates.length > 0 ? templates : (defaults?.templates ?? ['generic']),
      is_enabled: source.is_enabled !== false,
      ...(structure ? { structure } : {}),
    }]
  })
}

export function sanitizeAdminLegalAreas(items: unknown): AdminLegalArea[] {
  if (!Array.isArray(items)) return []

  return items.flatMap((item): AdminLegalArea[] => {
    if (!item || typeof item !== 'object') return []

    const source = item as Partial<AdminLegalArea>
    const id = typeof source.id === 'string' ? source.id.trim() : ''
    if (!id) return []

    const defaults = DEFAULT_LEGAL_AREA_MAP.get(id)
    const name = typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : defaults?.name
    if (!name) return []

    const description = typeof source.description === 'string'
      ? source.description.trim()
      : (defaults?.description ?? '')
    const assuntos = sanitizeStringArray(source.assuntos)

    return [{
      id,
      name,
      description,
      is_enabled: source.is_enabled !== false,
      ...(assuntos.length ? { assuntos } : {}),
    }]
  })
}

// ── Admin CRUD for Document Types (Firestore /settings/admin_document_types) ─


/** Merge default structures into loaded document types that don't have a custom one. */
function mergeDefaultStructures(items: AdminDocumentType[]): AdminDocumentType[] {
  return sanitizeAdminDocumentTypes(items).map(item => {
    if (!item.structure?.trim() && DEFAULT_DOC_STRUCTURES[item.id]) {
      return { ...item, structure: DEFAULT_DOC_STRUCTURES[item.id] }
    }
    return item
  })
}

export async function loadAdminDocumentTypes(): Promise<AdminDocumentType[]> {
  if (!IS_FIREBASE) return mergeDefaultStructures(getDefaultAdminDocumentTypes())
  try {
    const resolvedUid = getCurrentUserId()
    if (resolvedUid) {
      const userSettings = await ensureUserSettingsMigrated(resolvedUid)
      if (Array.isArray(userSettings.document_types) && userSettings.document_types.length > 0) {
        return mergeDefaultStructures(userSettings.document_types)
      }
    }
  } catch { /* fallback to defaults */ }
  return mergeDefaultStructures(getDefaultAdminDocumentTypes())
}

export async function saveAdminDocumentTypes(items: AdminDocumentType[]): Promise<void> {
  const resolvedUid = getCurrentUserId()
  if (IS_FIREBASE && resolvedUid) {
    await saveUserSettings(resolvedUid, { document_types: sanitizeAdminDocumentTypes(items) })
    return
  }
  throw new Error('Usuário não autenticado.')
}

// ── Admin CRUD for Legal Areas (Firestore /settings/admin_legal_areas) ───────

/** Merge default assuntos into loaded legal areas that don't have custom ones. */
function mergeDefaultAssuntos(items: AdminLegalArea[]): AdminLegalArea[] {
  return sanitizeAdminLegalAreas(items).map(item => {
    if (!item.assuntos?.length && DEFAULT_AREA_ASSUNTOS[item.id]) {
      return { ...item, assuntos: DEFAULT_AREA_ASSUNTOS[item.id] }
    }
    return item
  })
}

export async function loadAdminLegalAreas(): Promise<AdminLegalArea[]> {
  if (!IS_FIREBASE) return mergeDefaultAssuntos(getDefaultAdminLegalAreas())
  try {
    const resolvedUid = getCurrentUserId()
    if (resolvedUid) {
      const userSettings = await ensureUserSettingsMigrated(resolvedUid)
      if (Array.isArray(userSettings.legal_areas) && userSettings.legal_areas.length > 0) {
        return mergeDefaultAssuntos(userSettings.legal_areas)
      }
    }
  } catch { /* fallback to defaults */ }
  return mergeDefaultAssuntos(getDefaultAdminLegalAreas())
}

export async function saveAdminLegalAreas(items: AdminLegalArea[]): Promise<void> {
  const resolvedUid = getCurrentUserId()
  if (IS_FIREBASE && resolvedUid) {
    await saveUserSettings(resolvedUid, { legal_areas: sanitizeAdminLegalAreas(items) })
    return
  }
  throw new Error('Usuário não autenticado.')
}

// ── Admin CRUD for Classification Tipos (Firestore /settings/admin_classification_tipos) ─

export async function loadAdminClassificationTipos(): Promise<AdminClassificationTipos> {
  const defaultTipos = CLASSIFICATION_TIPOS as Record<string, Record<string, string[]>>
  if (!IS_FIREBASE) return { tipos: defaultTipos }
  try {
    const resolvedUid = getCurrentUserId()
    if (resolvedUid) {
      const userSettings = await ensureUserSettingsMigrated(resolvedUid)
      if (userSettings.classification_tipos && typeof userSettings.classification_tipos === 'object') {
        return { tipos: userSettings.classification_tipos }
      }
    }
  } catch { /* fallback to defaults */ }
  return { tipos: defaultTipos }
}

export async function saveAdminClassificationTipos(tipos: Record<string, Record<string, string[]>>): Promise<void> {
  const resolvedUid = getCurrentUserId()
  if (IS_FIREBASE && resolvedUid) {
    await saveUserSettings(resolvedUid, { classification_tipos: tipos })
    return
  }
  throw new Error('Usuário não autenticado.')
}

// ── Profile-based filtering ─────────────────────────────────────────────────

/**
 * Maps user positions/roles to the document types most relevant to them.
 * When a position keyword is detected, only those doc types are shown.
 * If no match is found, all document types are returned.
 */
const POSITION_DOCTYPE_MAP: Record<string, string[]> = {
  // Judges / Magistrates → produce judgments, not petitions
  juiz: ['sentenca', 'embargos_declaracao'],
  juiza: ['sentenca', 'embargos_declaracao'],
  magistrado: ['sentenca', 'embargos_declaracao'],
  magistrada: ['sentenca', 'embargos_declaracao'],
  desembargador: ['sentenca', 'embargos_declaracao', 'recurso'],
  desembargadora: ['sentenca', 'embargos_declaracao', 'recurso'],
  // Prosecutors / MP → opinions, public civil actions, HC
  promotor: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  promotora: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  procurador: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'contestacao', 'agravo', 'embargos_declaracao'],
  procuradora: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'contestacao', 'agravo', 'embargos_declaracao'],
  assessor: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  assessora: ['parecer', 'acao_civil_publica', 'recurso', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  // Defenders → petitions, HC, defenses
  defensor: ['peticao_inicial', 'contestacao', 'recurso', 'habeas_corpus', 'mandado_seguranca', 'agravo', 'embargos_declaracao'],
  defensora: ['peticao_inicial', 'contestacao', 'recurso', 'habeas_corpus', 'mandado_seguranca', 'agravo', 'embargos_declaracao'],
  // Lawyers → broad set, but excluding sentenca
  advogado: ['peticao_inicial', 'contestacao', 'recurso', 'acao_civil_publica', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
  advogada: ['peticao_inicial', 'contestacao', 'recurso', 'acao_civil_publica', 'mandado_seguranca', 'habeas_corpus', 'agravo', 'embargos_declaracao'],
}

/**
 * Returns document types filtered by the user's professional position.
 * Uses word-boundary matching to avoid false positives (e.g., "assessor"
 * inside "Assessor Jurídico" should match, but partial matches inside
 * other words should not).
 * Falls back to the full list when no profile or position match is found.
 */
export function getDocumentTypesForProfile(profile: ProfileData | null, source: typeof DOCUMENT_TYPES = DOCUMENT_TYPES): typeof DOCUMENT_TYPES {
  if (!profile?.position) return source

  const posLower = profile.position.toLowerCase()
  // Sort keywords longest-first so more specific titles match before generic ones
  const sortedEntries = Object.entries(POSITION_DOCTYPE_MAP)
    .sort(([a], [b]) => b.length - a.length)

  for (const [keyword, allowedIds] of sortedEntries) {
    // Use word-boundary regex to avoid partial substring matches
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    if (regex.test(posLower)) {
      const filtered = source.filter(dt => allowedIds.includes(dt.id))
      return filtered.length > 0 ? filtered : source
    }
  }
  return source
}

/**
 * Returns legal areas sorted so the user's primary areas appear first.
 */
export function getLegalAreasForProfile(profile: ProfileData | null, source: typeof LEGAL_AREAS = LEGAL_AREAS): typeof LEGAL_AREAS {
  if (!profile?.primary_areas || profile.primary_areas.length === 0) return source
  const primarySet = new Set(profile.primary_areas)
  const primary = source.filter(a => primarySet.has(a.id))
  const others = source.filter(a => !primarySet.has(a.id))
  return [...primary, ...others]
}

// ── Request context fields (per document type, static definitions) ───────────

const REQUEST_FIELDS: Record<string, WizardField[]> = {
  parecer: [
    { key: 'consulente', label: 'Consulente', type: 'text', placeholder: 'Quem solicitou o parecer' },
    { key: 'objeto', label: 'Objeto da consulta', type: 'textarea', placeholder: 'Descreva o objeto da consulta', required: true },
    { key: 'fatos', label: 'Fatos relevantes', type: 'textarea', placeholder: 'Relate os fatos pertinentes' },
    { key: 'legislacao', label: 'Legislação aplicável', type: 'text', placeholder: 'Leis, decretos, normas...' },
  ],
  peticao_inicial: [
    { key: 'autor', label: 'Autor', type: 'text', placeholder: 'Nome do(a) autor(a)', required: true },
    { key: 'reu', label: 'Réu', type: 'text', placeholder: 'Nome do(a) réu(ré)', required: true },
    { key: 'fatos', label: 'Fatos', type: 'textarea', placeholder: 'Narração dos fatos', required: true },
    { key: 'fundamentos', label: 'Fundamentos jurídicos', type: 'textarea', placeholder: 'Base legal e jurisprudencial' },
    { key: 'pedidos', label: 'Pedidos', type: 'textarea', placeholder: 'O que se pede ao juízo' },
    { key: 'valor_causa', label: 'Valor da causa', type: 'text', placeholder: 'R$ 0,00' },
  ],
  contestacao: [
    { key: 'autor', label: 'Autor', type: 'text', placeholder: 'Nome do(a) autor(a)' },
    { key: 'reu', label: 'Réu (cliente)', type: 'text', placeholder: 'Nome do(a) réu(ré)', required: true },
    { key: 'fatos_contestados', label: 'Fatos a contestar', type: 'textarea', placeholder: 'Pontos da inicial a serem contestados', required: true },
    { key: 'preliminares', label: 'Preliminares', type: 'textarea', placeholder: 'Matérias preliminares (se houver)' },
    { key: 'merito', label: 'Mérito da defesa', type: 'textarea', placeholder: 'Argumentos de mérito' },
  ],
  recurso: [
    { key: 'recorrente', label: 'Recorrente', type: 'text', placeholder: 'Nome do recorrente', required: true },
    { key: 'recorrido', label: 'Recorrido', type: 'text', placeholder: 'Nome do recorrido' },
    { key: 'decisao_recorrida', label: 'Decisão recorrida', type: 'textarea', placeholder: 'Resuma a decisão que se pretende reformar', required: true },
    { key: 'razoes', label: 'Razões do recurso', type: 'textarea', placeholder: 'Fundamentos para reforma' },
    { key: 'pedido', label: 'Pedido recursal', type: 'textarea', placeholder: 'O que se espera do tribunal' },
  ],
  acao_civil_publica: [
    { key: 'legitimado', label: 'Legitimado ativo', type: 'text', placeholder: 'MP, Defensoria, associação...' },
    { key: 'reu', label: 'Réu', type: 'text', placeholder: 'Nome do réu', required: true },
    { key: 'direito_tutelado', label: 'Direito tutelado', type: 'select', options: [
      { value: 'meio_ambiente', label: 'Meio Ambiente' },
      { value: 'consumidor', label: 'Direito do Consumidor' },
      { value: 'patrimonio_publico', label: 'Patrimônio Público' },
      { value: 'ordem_urbanistica', label: 'Ordem Urbanística' },
      { value: 'outro', label: 'Outro' },
    ]},
    { key: 'fatos', label: 'Fatos', type: 'textarea', placeholder: 'Descrição da lesão ao direito coletivo', required: true },
    { key: 'pedidos', label: 'Pedidos', type: 'textarea', placeholder: 'Obrigações de fazer/não fazer, indenização...' },
  ],
  sentenca: [
    { key: 'autor', label: 'Autor', type: 'text', placeholder: 'Nome do(a) autor(a)' },
    { key: 'reu', label: 'Réu', type: 'text', placeholder: 'Nome do(a) réu(ré)' },
    { key: 'tipo_acao', label: 'Tipo de ação', type: 'text', placeholder: 'Ex: Ação de indenização' },
    { key: 'resumo_fatos', label: 'Resumo dos fatos', type: 'textarea', placeholder: 'Síntese fática para fundamentação', required: true },
    { key: 'dispositivo', label: 'Dispositivo pretendido', type: 'select', options: [
      { value: 'procedente', label: 'Procedente' },
      { value: 'improcedente', label: 'Improcedente' },
      { value: 'parcialmente_procedente', label: 'Parcialmente procedente' },
    ]},
  ],
  mandado_seguranca: [
    { key: 'impetrante', label: 'Impetrante', type: 'text', placeholder: 'Nome do impetrante', required: true },
    { key: 'autoridade_coatora', label: 'Autoridade coatora', type: 'text', placeholder: 'Autoridade que praticou o ato', required: true },
    { key: 'ato_impugnado', label: 'Ato impugnado', type: 'textarea', placeholder: 'Descreva o ato ilegal ou abusivo', required: true },
    { key: 'direito_liquido_certo', label: 'Direito líquido e certo', type: 'textarea', placeholder: 'Fundamente o direito líquido e certo violado' },
    { key: 'pedido_liminar', label: 'Pedido liminar', type: 'boolean', default: true },
  ],
  habeas_corpus: [
    { key: 'paciente', label: 'Paciente', type: 'text', placeholder: 'Nome do paciente (pessoa presa/ameaçada)', required: true },
    { key: 'autoridade_coatora', label: 'Autoridade coatora', type: 'text', placeholder: 'Juiz, delegado ou autoridade responsável', required: true },
    { key: 'tipo_constrangimento', label: 'Tipo de constrangimento', type: 'select', options: [
      { value: 'prisao_ilegal', label: 'Prisão ilegal' },
      { value: 'excesso_prazo', label: 'Excesso de prazo' },
      { value: 'falta_fundamentacao', label: 'Falta de fundamentação' },
      { value: 'constrangimento_iminente', label: 'Constrangimento iminente' },
      { value: 'outro', label: 'Outro' },
    ]},
    { key: 'fatos', label: 'Fatos', type: 'textarea', placeholder: 'Descreva a situação de constrangimento ilegal', required: true },
    { key: 'pedido_liminar', label: 'Pedido liminar', type: 'boolean', default: true },
  ],
  agravo: [
    { key: 'agravante', label: 'Agravante', type: 'text', placeholder: 'Nome do agravante', required: true },
    { key: 'agravado', label: 'Agravado', type: 'text', placeholder: 'Nome do agravado' },
    { key: 'decisao_agravada', label: 'Decisão agravada', type: 'textarea', placeholder: 'Resuma a decisão interlocutória impugnada', required: true },
    { key: 'razoes', label: 'Razões do agravo', type: 'textarea', placeholder: 'Fundamentos para reforma da decisão' },
    { key: 'pedido_efeito_suspensivo', label: 'Pedido de efeito suspensivo', type: 'boolean', default: false },
  ],
  embargos_declaracao: [
    { key: 'embargante', label: 'Embargante', type: 'text', placeholder: 'Nome do embargante', required: true },
    { key: 'vicio', label: 'Vício apontado', type: 'select', options: [
      { value: 'omissao', label: 'Omissão' },
      { value: 'contradicao', label: 'Contradição' },
      { value: 'obscuridade', label: 'Obscuridade' },
      { value: 'erro_material', label: 'Erro material' },
    ], required: true },
    { key: 'ponto_omisso', label: 'Ponto omisso/contraditório/obscuro', type: 'textarea', placeholder: 'Descreva o vício na decisão', required: true },
    { key: 'efeitos_infringentes', label: 'Efeitos infringentes (modificativos)', type: 'boolean', default: false },
  ],
}

export function getRequestFields(documentTypeId: string): { fields: WizardField[] } {
  return { fields: REQUEST_FIELDS[documentTypeId] ?? [] }
}

// ── Theses (Firestore /users/{uid}/theses subcollection) ────────────────────

export async function listTheses(
  uid: string,
  opts: { q?: string; legalAreaId?: string; limit?: number; skip?: number } = {},
): Promise<{ items: ThesisData[]; total: number }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listTheses')
  // Combining where() on one field with orderBy() on a different field requires a composite
  // Firestore index that may not exist. When filtering by area we skip the server-side orderBy
  // and sort client-side instead.
  const constraints: QueryConstraint[] = opts.legalAreaId
    ? [where('legal_area_id', '==', opts.legalAreaId)]
    : [orderBy('created_at', 'desc')]
  if (!opts.legalAreaId && opts.limit) constraints.push(limit(opts.limit + (opts.skip ?? 0)))
  const colRef = collection(db, 'users', effectiveUid, 'theses')

  let items: ThesisData[]
  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, ...constraints)),
      'listTheses.query',
    )
    items = snap.docs.map(d => ({ id: d.id, ...d.data() } as ThesisData))
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    console.warn('Firestore thesis query failed; using client-side fallback:', getErrorMessage(error))
    const fallbackSnap = await withFirestoreRetry(() => getDocs(colRef), 'listTheses.fallback')
    items = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() } as ThesisData))
  }

  // When area filter is active, sort client-side (avoids composite index requirement)
  if (opts.legalAreaId) {
    items.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }
  // Client-side text search
  if (opts.q) {
    const q = opts.q.toLowerCase()
    items = items.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.content.toLowerCase().includes(q) ||
      (t.summary?.toLowerCase().includes(q) ?? false)
    )
  }
  const total = items.length
  if (opts.skip) items = items.slice(opts.skip)
  if (opts.limit) items = items.slice(0, opts.limit)
  return { items, total }
}

export async function createThesis(uid: string, data: Partial<ThesisData>): Promise<ThesisData> {
  const db = ensureFirestore()
  const now = new Date().toISOString()
  const thesis: Omit<ThesisData, 'id'> = {
    title: data.title || '',
    content: data.content || '',
    summary: data.summary ?? null,
    legal_area_id: data.legal_area_id || 'civil',
    document_type_id: data.document_type_id ?? null,
    tags: data.tags ?? null,
    category: data.category ?? null,
    quality_score: data.quality_score ?? null,
    usage_count: 0,
    source_type: data.source_type || 'manual',
    created_at: now,
    updated_at: now,
  }
  const ref = await addDoc(collection(db, 'users', uid, 'theses'), thesis)
  return { id: ref.id, ...thesis }
}

export async function updateThesis(uid: string, thesisId: string, data: Partial<ThesisData>): Promise<ThesisData> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'updateThesis')
  const ref = doc(db, 'users', effectiveUid, 'theses', thesisId)
  const updates = { ...data, updated_at: serverTimestamp() }
  delete updates.id
  await updateDoc(ref, updates)
  const snap = await withFirestoreRetry(() => getDoc(ref), 'updateThesis.read')
  return { id: snap.id, ...snap.data() } as ThesisData
}

export async function deleteThesis(uid: string, thesisId: string): Promise<void> {
  const db = ensureFirestore()
  await deleteDoc(doc(db, 'users', uid, 'theses', thesisId))
}

export async function getThesisStats(uid: string): Promise<{
  total_theses: number
  by_area: Record<string, number>
  average_quality_score: number | null
  most_used: { id: string; title: string; usage_count: number }[]
}> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'getThesisStats')
  const colRef = collection(db, 'users', effectiveUid, 'theses')

  let items: ThesisData[]
  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, orderBy('created_at', 'desc'))),
      'getThesisStats.query',
    )
    items = snap.docs.map(d => ({ id: d.id, ...d.data() } as ThesisData))
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    console.warn('Firestore thesis stats query failed; using client-side fallback:', getErrorMessage(error))
    const fallbackSnap = await withFirestoreRetry(() => getDocs(colRef), 'getThesisStats.fallback')
    items = fallbackSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as ThesisData))
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  }

  const by_area: Record<string, number> = {}
  let scoreSum = 0
  let scoreCount = 0
  for (const t of items) {
    by_area[t.legal_area_id] = (by_area[t.legal_area_id] ?? 0) + 1
    if (t.quality_score != null) { scoreSum += t.quality_score; scoreCount++ }
  }

  const sorted = [...items].sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0))
  return {
    total_theses: items.length,
    by_area,
    average_quality_score: scoreCount ? Math.round(scoreSum / scoreCount) : null,
    most_used: sorted.slice(0, 5).map(t => ({ id: t.id!, title: t.title, usage_count: t.usage_count })),
  }
}

/**
 * Seed the thesis bank with imported theses from the vectorized legal corpus.
 * Idempotent: skips theses whose title already exists.
 * Returns the number of theses created.
 */
export async function seedThesesIfEmpty(uid: string): Promise<number> {
  const { items } = await listTheses(uid, { limit: 1 })
  if (items.length > 0) return 0                 // already has data

  const { SEED_THESES } = await import('../data/seed-theses')
  let created = 0
  for (const t of SEED_THESES) {
    await createThesis(uid, t)
    created++
  }
  return created
}

// ── Acervo Documents (Firestore /users/{uid}/acervo subcollection) ───────────

const ACERVO_CHUNK_SIZE = 500
const ACERVO_MAX_EXCERPT_LENGTH = 2000
/**
 * Firestore has a 1 MiB (1,048,576 bytes) document size limit.
 * ~900 KB of text leaves headroom for metadata fields, field names,
 * and multi-byte UTF-8 characters that expand beyond their char count.
 */
const ACERVO_MAX_TEXT_LENGTH = 900_000

async function getIndexedAcervoDocs(
  uid: string,
  contextLabel: string,
): Promise<Array<{ id: string; data: AcervoDocumentData }>> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, contextLabel)
  const colRef = collection(db, 'users', effectiveUid, 'acervo')

  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, where('status', '==', 'indexed'), orderBy('created_at', 'desc'))),
      `${contextLabel}.query`,
    )
    return snap.docs.map(d => ({ id: d.id, data: d.data() as AcervoDocumentData }))
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    console.warn('Firestore indexed acervo query failed; using client-side fallback:', getErrorMessage(error))
    const fallbackSnap = await withFirestoreRetry(() => getDocs(colRef), `${contextLabel}.fallback`)
    return fallbackSnap.docs
      .map(d => ({ id: d.id, data: d.data() as AcervoDocumentData }))
      .filter(entry => entry.data.status === 'indexed')
      .sort((a, b) => getDocumentCreatedAtValue(b.data.created_at) - getDocumentCreatedAtValue(a.data.created_at))
  }
}

/**
 * List acervo (reference) documents for a user.
 * Transparently resolves structured JSON format to plain text for consumers.
 */
export async function listAcervoDocuments(
  uid: string,
  opts: { limit?: number } = {},
): Promise<{ items: AcervoDocumentData[]; total: number }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listAcervoDocuments')
  const constraints: QueryConstraint[] = [orderBy('created_at', 'desc')]
  if (opts.limit) constraints.push(limit(opts.limit))
  const colRef = collection(db, 'users', effectiveUid, 'acervo')
  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, ...constraints)),
      'listAcervoDocuments.query',
    )
    const items = snap.docs.map(d => {
      const raw = d.data() as AcervoDocumentData
      return {
        ...raw,
        id: d.id,
        // Resolve structured JSON to plain text for consumers that expect plain text
        text_content: resolveTextContent(raw.text_content || ''),
      }
    })
    return { items, total: items.length }
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    console.warn('Firestore acervo query failed; using client-side fallback:', getErrorMessage(error))
    const fallbackSnap = await withFirestoreRetry(() => getDocs(colRef), 'listAcervoDocuments.fallback')
    let items = fallbackSnap.docs.map(d => {
      const raw = d.data() as AcervoDocumentData
      return {
        ...raw,
        id: d.id,
        text_content: resolveTextContent(raw.text_content || ''),
      }
    })
    items = items.sort((a, b) => getDocumentCreatedAtValue(b.created_at) - getDocumentCreatedAtValue(a.created_at))
    if (opts.limit) items = items.slice(0, opts.limit)
    return { items, total: items.length }
  }
}

/**
 * Create an acervo document from uploaded file text content.
 *
 * **Conversion**: Text is converted to a compact structured JSON format (v1)
 * before storage — this reduces Firestore document size by 30-60% while
 * maintaining full searchability via the `full_text` field.
 *
 * **Dedup rule**: If a document with the same filename already exists,
 * the older version is deleted so the newest upload always wins.
 */
export async function createAcervoDocument(
  uid: string,
  data: { filename: string; content_type: string; size_bytes: number; text_content: string; pageCount?: number },
): Promise<AcervoDocumentData & { truncated?: boolean }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'createAcervoDocument')
  const now = new Date().toISOString()

  // Remove previous versions with the same filename (last upload wins)
  try {
    const existing = await withFirestoreRetry(
      () => getDocs(query(collection(db, 'users', effectiveUid, 'acervo'), where('filename', '==', data.filename))),
      'createAcervoDocument.dedup',
    )
    for (const snap of existing.docs) {
      await deleteDoc(snap.ref)
    }
  } catch (err) {
    console.warn('Acervo dedup check failed (non-fatal):', err)
  }

  const raw = data.text_content.trim()

  // Convert to structured JSON for compact storage (pass pageCount for PDF metadata)
  const structured = textToStructuredJson(raw, data.filename, data.pageCount)
  const jsonStr = serializeStructuredJson(structured)

  // Check if the JSON serialization fits within Firestore limits
  const truncated = jsonStr.length > ACERVO_MAX_TEXT_LENGTH
  const textToStore = truncated ? jsonStr.slice(0, ACERVO_MAX_TEXT_LENGTH) : jsonStr
  if (truncated) {
    console.warn(
      `Acervo document "${data.filename}" JSON truncated from ${jsonStr.length} to ${ACERVO_MAX_TEXT_LENGTH} chars ` +
      `(original text: ${raw.length} chars, compression: ${(structured.meta.compression_ratio * 100).toFixed(1)}%)`,
    )
  }

  const chunks = structured.full_text.length > 0
    ? Math.ceil(structured.full_text.length / ACERVO_CHUNK_SIZE)
    : 0

  const acervoDoc: Omit<AcervoDocumentData, 'id'> = {
    filename: data.filename,
    content_type: data.content_type,
    size_bytes: data.size_bytes,
    text_content: textToStore,
    chunks_count: chunks,
    status: structured.full_text.length > 0 ? 'indexed' : 'index_empty',
    storage_format: 'json',
    created_at: now,
  }
  const ref = await addDoc(collection(db, 'users', effectiveUid, 'acervo'), acervoDoc)
  return { id: ref.id, ...acervoDoc, truncated }
}

/**
 * Delete an acervo document.
 */
export async function deleteAcervoDocument(uid: string, docId: string): Promise<void> {
  const db = ensureFirestore()
  await deleteDoc(doc(db, 'users', uid, 'acervo', docId))
}

/**
 * Get ALL indexed acervo documents with full text content (for acervo-based generation).
 * Transparently resolves structured JSON format to plain text via resolveTextContent().
 * Returns an array of { id, filename, text_content, created_at } for the buscador agent.
 */
export async function getAllAcervoDocumentsForSearch(
  uid: string,
): Promise<Array<{ id: string; filename: string; text_content: string; created_at: string; ementa?: string; ementa_keywords?: string[]; natureza?: AcervoDocumentData['natureza']; area_direito?: string[]; assuntos?: string[]; tipo_documento?: string; contexto?: string[] }>> {
  const docs = await getIndexedAcervoDocs(uid, 'getAllAcervoDocumentsForSearch')
  return docs
    .map(({ id, data }) => {
      return {
        id,
        filename: data.filename,
        text_content: resolveTextContent(data.text_content || ''),
        created_at: data.created_at,
        ementa: data.ementa,
        ementa_keywords: data.ementa_keywords,
        natureza: data.natureza,
        area_direito: data.area_direito,
        assuntos: data.assuntos,
        tipo_documento: data.tipo_documento,
        contexto: data.contexto,
      }
    })
    .filter(d => d.text_content.length > 0)
}

/**
 * Merge new LLM execution records with any existing ones on an acervo document.
 */
async function mergeAcervoExecutions(
  uid: string,
  docId: string,
  executions: UsageExecutionRecord[],
): Promise<UsageExecutionRecord[]> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'mergeAcervoExecutions')
  try {
    const existing = await withFirestoreRetry(
      () => getDoc(doc(db, 'users', effectiveUid, 'acervo', docId)),
      'mergeAcervoExecutions',
    )
    const existingExecs = (existing.data()?.llm_executions ?? []) as UsageExecutionRecord[]
    return [...existingExecs, ...executions]
  } catch {
    return executions
  }
}

/**
 * Update the ementa and keywords for an acervo document.
 * Optionally appends LLM execution records for cost tracking.
 */
export async function updateAcervoEmenta(
  uid: string,
  docId: string,
  ementa: string,
  keywords: string[],
  executions?: UsageExecutionRecord[],
): Promise<void> {
  const db = ensureFirestore()
  const updateData: Record<string, unknown> = {
    ementa,
    ementa_keywords: keywords,
  }
  if (executions && executions.length > 0) {
    updateData.llm_executions = await mergeAcervoExecutions(uid, docId, executions)
  }
  await updateDoc(doc(db, 'users', uid, 'acervo', docId), updateData)
}

/**
 * Update classification tags for an acervo document.
 * Optionally appends LLM execution records for cost tracking.
 */
export async function updateAcervoTags(
  uid: string,
  docId: string,
  tags: {
    natureza?: AcervoDocumentData['natureza']
    area_direito?: string[]
    assuntos?: string[]
    tipo_documento?: string
    contexto?: string[]
  },
  executions?: UsageExecutionRecord[],
): Promise<void> {
  const db = ensureFirestore()
  const updateData: Record<string, unknown> = {
    ...tags,
    tags_generated: true,
  }
  if (executions && executions.length > 0) {
    updateData.llm_executions = await mergeAcervoExecutions(uid, docId, executions)
  }
  await updateDoc(doc(db, 'users', uid, 'acervo', docId), updateData)
}

/**
 * Update text content for an acervo document.
 * Re-converts the provided plain text to structured JSON before saving.
 */
export async function updateAcervoTextContent(
  uid: string,
  docId: string,
  textContent: string,
  filename?: string,
): Promise<void> {
  const db = ensureFirestore()
  // Reconvert to structured JSON format
  const structured = textToStructuredJson(textContent, filename || 'document')
  const jsonStr = serializeStructuredJson(structured)
  const textToStore = jsonStr.length > ACERVO_MAX_TEXT_LENGTH
    ? jsonStr.slice(0, ACERVO_MAX_TEXT_LENGTH)
    : jsonStr
  await updateDoc(doc(db, 'users', uid, 'acervo', docId), {
    text_content: textToStore,
    storage_format: 'json',
    chunks_count: structured.full_text.length > 0
      ? Math.ceil(structured.full_text.length / ACERVO_CHUNK_SIZE)
      : 0,
  })
}

/**
 * Re-convert a legacy plain-text acervo document to structured JSON format.
 * Reads the current text_content (which listAcervoDocuments already resolved),
 * reconverts it to JSON, and stores it back. Returns the updated storage_format.
 */
export async function convertAcervoToJson(
  uid: string,
  docId: string,
  resolvedTextContent: string,
  filename: string,
): Promise<void> {
  await updateAcervoTextContent(uid, docId, resolvedTextContent, filename)
}

/**
 * Get acervo documents that do NOT have classification tags yet.
 */
export async function getAcervoDocsWithoutTags(
  uid: string,
): Promise<Array<{ id: string; filename: string; text_content: string }>> {
  const docs = await getIndexedAcervoDocs(uid, 'getAcervoDocsWithoutTags')
  return docs
    .map(({ id, data }) => {
      return { id, filename: data.filename, text_content: resolveTextContent(data.text_content || ''), tags_generated: data.tags_generated }
    })
    .filter(d => d.text_content.length > 0 && !d.tags_generated)
    .map(({ tags_generated: _, ...rest }) => rest)
}

/**
 * Get acervo documents that do NOT have ementas yet.
 */
export async function getAcervoDocsWithoutEmenta(
  uid: string,
): Promise<Array<{ id: string; filename: string; text_content: string }>> {
  const docs = await getIndexedAcervoDocs(uid, 'getAcervoDocsWithoutEmenta')
  return docs
    .map(({ id, data }) => {
      return { id, filename: data.filename, text_content: resolveTextContent(data.text_content || ''), ementa: data.ementa }
    })
    .filter(d => d.text_content.length > 0 && !d.ementa)
    .map(({ ementa: _, ...rest }) => rest)
}

/**
 * Get text content from all indexed acervo documents (for generation context).
 * Returns concatenated text excerpts up to `maxChars` total characters.
 */
export async function getAcervoContext(uid: string, maxChars = 8000): Promise<string> {
  const docs = await getIndexedAcervoDocs(uid, 'getAcervoContext')
  const parts: string[] = []
  let total = 0
  for (const { data } of docs) {
    if (!data.text_content) continue
    const text = resolveTextContent(data.text_content)
    const excerpt = text.slice(0, ACERVO_MAX_EXCERPT_LENGTH)
    if (total + excerpt.length > maxChars) break
    parts.push(`[${data.filename}]\n${excerpt}`)
    total += excerpt.length
  }
  return parts.join('\n\n---\n\n')
}

// ── Admin settings (Firestore /settings collection) ──────────────────────────

export async function getSettings(): Promise<Record<string, unknown>> {
  const db = ensureFirestore()
  const ref = doc(db, 'settings', 'platform')
  const snap = await getDoc(ref)
  if (!snap.exists()) return {}
  return snap.data() as Record<string, unknown>
}

export async function getUserSettings(uid: string): Promise<UserSettingsData> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'getUserSettings')
  const ref = doc(db, 'users', effectiveUid, 'settings', 'preferences')
  const snap = await withFirestoreRetry(() => getDoc(ref), 'getUserSettings')
  if (!snap.exists()) return {}
  return snap.data() as UserSettingsData
}

export async function saveSettings(data: Record<string, unknown>): Promise<void> {
  const db = ensureFirestore()
  const ref = doc(db, 'settings', 'platform')
  await setDoc(ref, { ...data, updated_at: serverTimestamp() }, { merge: true })
}

export async function saveUserSettings(uid: string, data: Partial<UserSettingsData>): Promise<void> {
  const db = ensureFirestore()
  const ref = doc(db, 'users', uid, 'settings', 'preferences')
  await setDoc(ref, { ...data, updated_at: serverTimestamp() }, { merge: true })
}

// ── Acervo analysis tracking ──────────────────────────────────────────────────

/**
 * Mark a set of acervo documents as analyzed for theses.
 * Called after a successful thesis analysis run.
 */
export async function markAcervoDocumentsAnalyzed(
  uid: string,
  docIds: string[],
): Promise<void> {
  const db = ensureFirestore()
  for (const docId of docIds) {
    try {
      await updateDoc(doc(db, 'users', uid, 'acervo', docId), {
        analyzed_for_theses: true,
      })
    } catch {
      // Non-fatal: if a doc no longer exists, skip silently
    }
  }
}

/**
 * Get acervo documents grouped by analysis status.
 * Returns { analyzed, unanalyzed } counts and the unanalyzed document list.
 */
export async function getAcervoAnalysisStatus(uid: string): Promise<{
  analyzed_count: number
  unanalyzed_count: number
  unanalyzed_docs: AcervoDocumentData[]
}> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'getAcervoAnalysisStatus')
  const colRef = collection(db, 'users', effectiveUid, 'acervo')

  let all: AcervoDocumentData[]
  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, orderBy('created_at', 'desc'))),
      'getAcervoAnalysisStatus.query',
    )
    all = snap.docs.map(d => {
      const raw = d.data() as AcervoDocumentData
      return {
        ...raw,
        id: d.id,
        text_content: resolveTextContent(raw.text_content || ''),
      }
    })
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    console.warn('Firestore acervo analysis query failed; using client-side fallback:', getErrorMessage(error))
    const fallbackSnap = await withFirestoreRetry(() => getDocs(colRef), 'getAcervoAnalysisStatus.fallback')
    all = fallbackSnap.docs
      .map(d => {
        const raw = d.data() as AcervoDocumentData
        return {
          ...raw,
          id: d.id,
          text_content: resolveTextContent(raw.text_content || ''),
        }
      })
      .sort((a, b) => getDocumentCreatedAtValue(b.created_at) - getDocumentCreatedAtValue(a.created_at))
  }

  const analyzed = all.filter(d => d.analyzed_for_theses === true)
  const unanalyzed = all.filter(d => d.analyzed_for_theses !== true && d.status === 'indexed' && d.text_content?.length > 0)
  return {
    analyzed_count: analyzed.length,
    unanalyzed_count: unanalyzed.length,
    unanalyzed_docs: unanalyzed,
  }
}

// ── Thesis Analysis Session persistence ──────────────────────────────────────

/**
 * Save a thesis analysis session record (for display on next visit).
 */
export async function saveThesisAnalysisSession(
  uid: string,
  data: Omit<ThesisAnalysisSessionData, 'id'>,
): Promise<string> {
  const db = ensureFirestore()
  const ref = await addDoc(collection(db, 'users', uid, 'thesis_analysis_sessions'), stripUndefined({
    ...data,
    created_at: data.created_at ?? new Date().toISOString(),
  }))
  return ref.id
}

/**
 * Get the most recent thesis analysis session.
 */
export async function getLastThesisAnalysisSession(
  uid: string,
): Promise<ThesisAnalysisSessionData | null> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'getLastThesisAnalysisSession')
  const colRef = collection(db, 'users', effectiveUid, 'thesis_analysis_sessions')
  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, orderBy('created_at', 'desc'), limit(1))),
      'getLastThesisAnalysisSession.query',
    )
    if (snap.empty) return null
    const d = snap.docs[0]
    return { id: d.id, ...d.data() } as ThesisAnalysisSessionData
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    console.warn('Firestore last thesis analysis query failed; using client-side fallback:', getErrorMessage(error))
    const fallbackSnap = await withFirestoreRetry(
      () => getDocs(colRef),
      'getLastThesisAnalysisSession.fallback',
    )
    if (fallbackSnap.empty) return null
    const [latest] = fallbackSnap.docs.sort((a, b) => {
      return getDocumentCreatedAtValue(b.data()?.created_at) - getDocumentCreatedAtValue(a.data()?.created_at)
    })
    return latest ? ({ id: latest.id, ...latest.data() } as ThesisAnalysisSessionData) : null
  }
}

// ── Research Notebook (Caderno de Pesquisa) CRUD ──────────────────────────────

/**
 * List all research notebooks for a user, ordered by creation date (newest first).
 */
export async function listResearchNotebooks(uid: string): Promise<{ items: ResearchNotebookData[] }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listResearchNotebooks')
  const colRef = collection(db, 'users', effectiveUid, 'research_notebooks')
  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, orderBy('created_at', 'desc'))),
      'listResearchNotebooks.query',
    )
    return { items: snap.docs.map(d => ({ id: d.id, ...d.data() } as ResearchNotebookData)) }
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    console.warn('Firestore notebook query failed; using client-side fallback:', getErrorMessage(error))
    const fallbackSnap = await withFirestoreRetry(() => getDocs(colRef), 'listResearchNotebooks.fallback')
    const items = fallbackSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as ResearchNotebookData))
      .sort((a, b) => getDocumentCreatedAtValue(b.created_at) - getDocumentCreatedAtValue(a.created_at))
    return { items }
  }
}

// ── Firestore notebook size safety ────────────────────────────────────────────

/**
 * Firestore has a 1 MiB (1,048,576 bytes) document size limit.
 * We target 950 KB to leave headroom for field names & UTF-8 overhead.
 */
const NOTEBOOK_MAX_DOC_BYTES = 950_000
/** Minimum chars preserved per source when trimming to fit Firestore limits */
const MIN_SOURCE_TEXT_CHARS = 100
const NOTEBOOK_SEARCH_MEMORY_DOC_ID = 'search_memory'
const NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS = 45
const NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS = 60
const NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES = 120

type NotebookSearchMemoryRetentionMeta = {
  audits_before?: number
  audits_after?: number
  audits_dropped?: number
  saved_searches_before?: number
  saved_searches_after?: number
  saved_searches_dropped?: number
  audit_ttl_days: number
  max_audits: number
  max_saved_searches: number
  applied_at: string
}

type NotebookSearchMemoryData = {
  research_audits?: NotebookResearchAuditEntry[]
  saved_searches?: NotebookSavedSearchEntry[]
  retention?: NotebookSearchMemoryRetentionMeta
  updated_at?: string
  migrated_from_notebook_doc_at?: string
}

/**
 * Estimate the byte size of a value when serialised to JSON.
 * Adds a 10 % margin for multi-byte UTF-8 characters (common in Portuguese).
 */
function estimateJsonBytes(value: unknown): number {
  try {
    const len = JSON.stringify(value).length
    return len + Math.ceil(len * 0.1)
  } catch (err) {
    console.warn('[Lexio] estimateJsonBytes: JSON.stringify failed', err)
    return 0
  }
}

/**
 * If the sources array would push the notebook document past the Firestore
 * size limit, first strip `results_raw` from jurisprudência sources (cheapest
 * trade-off), then trim the longest `text_content` fields proportionally so
 * everything fits.  Returns `{ sources, truncated }`.
 */
function fitSourcesToFirestoreLimit(
  sources: NotebookSource[],
  otherDataEstimateBytes: number,
): { sources: NotebookSource[]; truncated: boolean } {
  const totalBytes = estimateJsonBytes(sources) + otherDataEstimateBytes
  if (totalBytes <= NOTEBOOK_MAX_DOC_BYTES) return { sources, truncated: false }

  // Pass 1: drop results_raw from jurisprudência sources — this is typically
  // the largest payload and has the least impact on analysis quality.
  const withoutRaw: NotebookSource[] = sources.map(src => {
    if (src.type !== 'jurisprudencia' || !src.results_raw) return src
    const { results_raw: _dropped, ...rest } = src
    return rest
  })
  if (estimateJsonBytes(withoutRaw) + otherDataEstimateBytes <= NOTEBOOK_MAX_DOC_BYTES) {
    console.warn('[Lexio] Notebook sources: results_raw stripped to fit Firestore 1 MB limit')
    return { sources: withoutRaw, truncated: true }
  }

  const budget = Math.max(NOTEBOOK_MAX_DOC_BYTES - otherDataEstimateBytes, 0)

  // Pass 2: trim text_content proportionally
  const totalTextChars = withoutRaw.reduce((s, src) => s + (src.text_content?.length ?? 0), 0)
  if (totalTextChars === 0) return { sources: withoutRaw, truncated: true }

  // Overhead per source (metadata fields, JSON syntax) — estimate once
  const metaOverhead = estimateJsonBytes(withoutRaw) - Math.ceil(totalTextChars * 1.1)
  const availableForText = Math.max(budget - metaOverhead, 0)

  // Scale each source's text proportionally to fit
  const ratio = availableForText / Math.ceil(totalTextChars * 1.1)

  const trimmed: NotebookSource[] = withoutRaw.map(src => {
    const text = src.text_content ?? ''
    if (text.length === 0 || ratio >= 1) return src
    const maxChars = Math.max(Math.floor(text.length * ratio), MIN_SOURCE_TEXT_CHARS)
    if (maxChars >= text.length) return src
    return { ...src, text_content: text.slice(0, maxChars) }
  })

  console.warn(
    `[Lexio] Notebook sources trimmed to fit Firestore 1 MB limit ` +
    `(estimated ${(totalBytes / 1024).toFixed(0)} KiB → budget ${(NOTEBOOK_MAX_DOC_BYTES / 1024).toFixed(0)} KiB)`,
  )

  return { sources: trimmed, truncated: true }
}

function getNotebookSearchMemoryDocRef(uid: string, notebookId: string) {
  const db = ensureFirestore()
  const normalizedNotebookId = normalizeFirestoreDocumentId(notebookId)
  return doc(db, 'users', uid, 'research_notebooks', normalizedNotebookId, 'memory', NOTEBOOK_SEARCH_MEMORY_DOC_ID)
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function getSavedSearchSortMs(item: NotebookSavedSearchEntry): number {
  return parseIsoMs(item.updated_at) ?? parseIsoMs(item.created_at) ?? 0
}

function applyNotebookSearchMemoryRetention(
  payload: Partial<NotebookSearchMemoryData>,
): { sanitized: Partial<NotebookSearchMemoryData>; droppedAudits: number; droppedSavedSearches: number } {
  const nowIso = new Date().toISOString()
  const next: Partial<NotebookSearchMemoryData> = { ...payload }
  let droppedAudits = 0
  let droppedSavedSearches = 0

  if (payload.research_audits !== undefined) {
    const cutoffMs = Date.now() - NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS * 86_400_000
    const sortedAudits = [...payload.research_audits].sort((a, b) =>
      (parseIsoMs(b.created_at) ?? 0) - (parseIsoMs(a.created_at) ?? 0),
    )
    const ttlFiltered = sortedAudits.filter(audit => {
      const ts = parseIsoMs(audit.created_at)
      return ts !== null && ts >= cutoffMs
    })

    // Preserve at least one latest audit for continuity, even if all are expired.
    const continuityBase = ttlFiltered.length > 0 ? ttlFiltered : sortedAudits.slice(0, 1)
    const retainedAudits = continuityBase.slice(0, NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS)
    droppedAudits = Math.max(sortedAudits.length - retainedAudits.length, 0)
    next.research_audits = retainedAudits

    next.retention = {
      ...(next.retention || {
        audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
        max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
        max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
        applied_at: nowIso,
      }),
      audits_before: sortedAudits.length,
      audits_after: retainedAudits.length,
      audits_dropped: droppedAudits,
      audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
      max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
      max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
      applied_at: nowIso,
    }
  }

  if (payload.saved_searches !== undefined) {
    const sortedSaved = [...payload.saved_searches].sort((a, b) => getSavedSearchSortMs(b) - getSavedSearchSortMs(a))
    const retainedSaved = sortedSaved.slice(0, NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES)
    droppedSavedSearches = Math.max(sortedSaved.length - retainedSaved.length, 0)
    next.saved_searches = retainedSaved

    next.retention = {
      ...(next.retention || {
        audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
        max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
        max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
        applied_at: nowIso,
      }),
      saved_searches_before: sortedSaved.length,
      saved_searches_after: retainedSaved.length,
      saved_searches_dropped: droppedSavedSearches,
      audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
      max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
      max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
      applied_at: nowIso,
    }
  }

  return { sanitized: next, droppedAudits, droppedSavedSearches }
}

async function getNotebookSearchMemory(uid: string, notebookId: string): Promise<NotebookSearchMemoryData | null> {
  const ref = getNotebookSearchMemoryDocRef(uid, notebookId)
  const snap = await withFirestoreRetry(() => getDoc(ref), 'getNotebookSearchMemory')
  if (!snap.exists()) return null
  return snap.data() as NotebookSearchMemoryData
}

async function saveNotebookSearchMemory(
  uid: string,
  notebookId: string,
  payload: Partial<NotebookSearchMemoryData>,
): Promise<void> {
  const ref = getNotebookSearchMemoryDocRef(uid, notebookId)
  const { sanitized, droppedAudits, droppedSavedSearches } = applyNotebookSearchMemoryRetention(payload)
  await setDoc(ref, stripUndefined({ ...sanitized, updated_at: new Date().toISOString() }), { merge: true })
  if (droppedAudits > 0 || droppedSavedSearches > 0) {
    console.info(
      `[Lexio] saveNotebookSearchMemory: retention applied for notebook ${normalizeFirestoreDocumentId(notebookId)} ` +
      `(audits dropped: ${droppedAudits}, saved searches dropped: ${droppedSavedSearches}).`,
    )
  }
}

/**
 * Get a single research notebook by ID.
 */
export async function getResearchNotebook(uid: string, notebookId: string): Promise<ResearchNotebookData | null> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'getResearchNotebook')
  const ref = doc(db, 'users', effectiveUid, 'research_notebooks', normalizeFirestoreDocumentId(notebookId))
  const snap = await withFirestoreRetry(() => getDoc(ref), 'getResearchNotebook')
  if (!snap.exists()) return null
  const notebook = { id: snap.id, ...snap.data() } as ResearchNotebookData

  try {
    const memory = await getNotebookSearchMemory(effectiveUid, snap.id)
    if (memory) {
      return {
        ...notebook,
        research_audits: memory.research_audits ?? notebook.research_audits,
        saved_searches: memory.saved_searches ?? notebook.saved_searches,
      }
    }

    // Opportunistic backfill: first read migrates existing in-doc arrays into
    // dedicated notebook memory storage without changing current API contracts.
    if ((notebook.research_audits && notebook.research_audits.length > 0)
      || (notebook.saved_searches && notebook.saved_searches.length > 0)) {
      await saveNotebookSearchMemory(effectiveUid, snap.id, {
        research_audits: notebook.research_audits ?? [],
        saved_searches: notebook.saved_searches ?? [],
        migrated_from_notebook_doc_at: new Date().toISOString(),
      })
    }
  } catch (error) {
    console.warn('[Lexio] getResearchNotebook: dedicated search memory unavailable, using notebook document fields.', error)
  }

  return notebook
}

/**
 * Create a new research notebook.
 */
export async function createResearchNotebook(uid: string, data: Omit<ResearchNotebookData, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'createResearchNotebook')
  const now = new Date().toISOString()

  // Build preliminary payload WITHOUT sources to estimate non-source overhead
  const baseMeta = stripUndefined({
    title: data.title,
    topic: data.topic,
    description: data.description ?? '',
    sources: [] as NotebookSource[],
    messages: data.messages ?? [],
    artifacts: data.artifacts ?? [],
    research_audits: data.research_audits ?? [],
    saved_searches: data.saved_searches ?? [],
    status: data.status ?? 'active',
    llm_executions: data.llm_executions ?? [],
    created_at: now,
    updated_at: now,
  })
  const otherBytes = estimateJsonBytes(baseMeta)
  const { sources } = fitSourcesToFirestoreLimit(data.sources ?? [], otherBytes)

  const sanitized = { ...baseMeta, sources }
  const docRef = await addDoc(collection(db, 'users', effectiveUid, 'research_notebooks'), sanitized)

  try {
    await saveNotebookSearchMemory(effectiveUid, docRef.id, {
      research_audits: sanitized.research_audits,
      saved_searches: sanitized.saved_searches,
      migrated_from_notebook_doc_at: now,
    })
  } catch (error) {
    console.warn('[Lexio] createResearchNotebook: failed to seed dedicated search memory store.', error)
  }

  return docRef.id
}

/**
 * Update an existing research notebook (partial update).
 */
export async function updateResearchNotebook(uid: string, notebookId: string, data: Partial<ResearchNotebookData>): Promise<void> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'updateResearchNotebook')
  const ref = doc(db, 'users', effectiveUid, 'research_notebooks', normalizeFirestoreDocumentId(notebookId))
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = data
  const shouldSyncSearchMemory = rest.research_audits !== undefined || rest.saved_searches !== undefined
  const rootPayload = shouldSyncSearchMemory
    ? {
        ...rest,
        ...(rest.research_audits !== undefined ? { research_audits: [] as NotebookResearchAuditEntry[] } : {}),
        ...(rest.saved_searches !== undefined ? { saved_searches: [] as NotebookSavedSearchEntry[] } : {}),
      }
    : rest

  // When the update includes sources, ensure total estimated size is safe.
  // We fetch the current document so we can account for existing fields.
  if (rootPayload.sources) {
    const snap = await withFirestoreRetry(() => getDoc(ref), 'updateResearchNotebook.read')
    const existing = snap.exists() ? snap.data() : {}
    const merged = { ...existing, ...stripUndefined(rootPayload), updated_at: new Date().toISOString() }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sources: _src, ...mergedMeta } = merged
    const otherBytes = estimateJsonBytes(mergedMeta)
    const { sources } = fitSourcesToFirestoreLimit(rootPayload.sources, otherBytes)
    const sanitized = stripUndefined({ ...rootPayload, sources, updated_at: new Date().toISOString() })
    await withFirestoreRetry(() => updateDoc(ref, sanitized), 'updateResearchNotebook.updateWithSources')
  } else {
    const sanitized = stripUndefined({ ...rootPayload, updated_at: new Date().toISOString() })
    await withFirestoreRetry(() => updateDoc(ref, sanitized), 'updateResearchNotebook.update')
  }

  if (shouldSyncSearchMemory) {
    try {
      await saveNotebookSearchMemory(effectiveUid, normalizeFirestoreDocumentId(notebookId), {
        ...(rest.research_audits !== undefined ? { research_audits: rest.research_audits } : {}),
        ...(rest.saved_searches !== undefined ? { saved_searches: rest.saved_searches } : {}),
      })
    } catch (error) {
      console.warn('[Lexio] updateResearchNotebook: failed to sync dedicated search memory store.', error)
    }
  }
}

/**
 * Delete a research notebook.
 */
export async function deleteResearchNotebook(uid: string, notebookId: string): Promise<void> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'deleteResearchNotebook')
  const normalizedNotebookId = normalizeFirestoreDocumentId(notebookId)
  await deleteDoc(doc(db, 'users', effectiveUid, 'research_notebooks', normalizedNotebookId))
  try {
    await deleteDoc(getNotebookSearchMemoryDocRef(effectiveUid, normalizedNotebookId))
  } catch {
    // Ignore missing/forbidden dedicated memory doc; notebook deletion is the source of truth.
  }
}

// ── Password change via Firebase Auth ────────────────────────────────────────

export { IS_FIREBASE } from './firebase'
