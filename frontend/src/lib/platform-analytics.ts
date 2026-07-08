import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  collectionGroup,
  getDocs,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

import { firestore, firebaseAuth, IS_FIREBASE } from './firebase'
import { isAdminLikeRole } from './admin-role'
import {
  NOTEBOOK_SEARCH_MEMORY_DOC_ID,
  getRefNotebookIdFromSearchMemoryPath,
  getRefUserId,
} from './core/firestore'
import {
  buildCostBreakdown,
  extractAcervoUsageExecutions,
  extractDesignStudioSessionExecutions,
  extractDocumentUsageExecutions,
  extractNotebookUsageExecutions,
  extractThesisSessionExecutions,
  getExecutionStateLabel,
  type CostBreakdown,
  type UsageExecutionRecord,
} from './cost-analytics'
import type {
  AcervoDocumentData,
  DesignStudioSessionData,
  DocumentData,
  PlatformAggregateRow,
  PlatformDailyUsagePoint,
  PlatformExecutionStateDailyPoint,
  PlatformExecutionStateWindowComparisonRow,
  PlatformFunctionCalibrationAction,
  PlatformFunctionCalibrationPriority,
  PlatformFunctionCalibrationRow,
  PlatformFunctionRolloutConfidenceBand,
  PlatformFunctionRolloutGuardrails,
  PlatformFunctionRolloutPolicyPlan,
  PlatformFunctionRolloutPolicyRow,
  PlatformFunctionRolloutRecommendation,
  PlatformFunctionRolloutRiskLevel,
  PlatformFunctionTargetAdherenceDailyPoint,
  PlatformFunctionTargetAdherenceRow,
  PlatformFunctionTargetAdherenceStatus,
  PlatformFunctionWindowComparisonRow,
  PlatformOverviewData,
  ResearchNotebookData,
  ThesisAnalysisSessionData,
  ThesisData,
} from './firestore-types'

const PLATFORM_ANALYTICS_CACHE_TTL_MS = 60_000
const FIREBASE_AUTH_SYNC_TIMEOUT_MS = 8_000
const FIRESTORE_AUTH_RETRY_BACKOFF_MS = [200, 600, 1500] as const
const FIRESTORE_AUTH_MAX_RETRIES = FIRESTORE_AUTH_RETRY_BACKOFF_MS.length

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
  design_studio_sessions: Array<DesignStudioSessionData & { _owner_user_id?: string }>
  notebook_search_memory: PlatformNotebookSearchMemoryRecord[]
  operational_warnings: string[]
}

type ExecutionStateAccumulator = {
  calls: number
  cost_usd: number
  total_duration_ms: number
  retries: number
  fallbacks: number
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

type FunctionDailyAdherenceAccumulator = {
  label: string
  calls: number
  retries: number
  fallbacks: number
  waiting_io: number
}

let platformCollectionsCache: PlatformCollectionsSnapshot | null = null
let authStateSyncPromise: Promise<void> | null = null

function ensurePlatformFirestore() {
  if (!IS_FIREBASE || !firestore) {
    throw new Error('Firestore nao esta configurado')
  }
  return firestore
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'Erro desconhecido'
}

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

async function waitForFirebaseAuthSync(timeoutMs = FIREBASE_AUTH_SYNC_TIMEOUT_MS): Promise<void> {
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
        if (!user && expectHydratedUser) return
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
  const error = new Error('Sessao do Firebase nao sincronizada. Faca login novamente.') as Error & { code?: string }
  error.code = 'firestore/unauthenticated'
  console.warn(`[Firestore Auth Sync] ${contextLabel}: no authenticated Firebase user found after sync wait.`)
  return error
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  if ('code' in error && typeof error.code === 'string') {
    return error.code.replace(/^firestore\//, '')
  }
  return null
}

function isRetryableFirestoreError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error)
  if (!code) return false
  return RETRYABLE_FIRESTORE_CODES.has(code) || AUTH_RETRYABLE_FIRESTORE_CODES.has(code)
}

function isAuthRetryableFirestoreCode(code: string | null): boolean {
  return Boolean(code && AUTH_RETRYABLE_FIRESTORE_CODES.has(code))
}

async function refreshCurrentUserToken(): Promise<void> {
  const currentUser = firebaseAuth?.currentUser
  if (!currentUser) return
  try {
    await currentUser.getIdToken(true)
  } catch (error) {
    console.warn('Firestore token refresh failed:', getErrorMessage(error))
  }
}

async function withPlatformFirestoreRetry<T>(
  operation: () => Promise<T>,
  contextLabel: string,
): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= FIRESTORE_AUTH_MAX_RETRIES; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (!isRetryableFirestoreError(error)) {
        throw error
      }

      const code = getFirebaseErrorCode(error)
      const isAuthRetry = isAuthRetryableFirestoreCode(code)
      const isLastAttempt = attempt >= FIRESTORE_AUTH_MAX_RETRIES
      if (isLastAttempt) break

      if (isAuthRetry) {
        await waitForFirebaseAuthSync()
        if (!firebaseAuth?.currentUser) {
          throw createUnauthenticatedFirestoreError(contextLabel)
        }
        await refreshCurrentUserToken()
      }

      console.warn(
        `[Firestore Retry] ${contextLabel}: attempt ${attempt + 1} failed (${getErrorMessage(error)}); retrying.`,
      )

      const backoff = FIRESTORE_AUTH_RETRY_BACKOFF_MS[attempt] ?? FIRESTORE_AUTH_RETRY_BACKOFF_MS[0]
      await new Promise<void>((resolve) => {
        setTimeout(resolve, backoff)
      })
    }
  }

  throw lastError
}

async function loadPlatformCollectionDocs(
  operation: () => Promise<{ docs: QueryDocumentSnapshot[] }>,
  contextLabel: string,
  warningLabel: string,
  operationalWarnings: string[],
): Promise<QueryDocumentSnapshot[]> {
  try {
    const snapshot = await withPlatformFirestoreRetry(operation, contextLabel)
    return snapshot.docs
  } catch (error) {
    const message = getErrorMessage(error)
    console.warn(`[PlatformAnalytics] ${warningLabel} indisponivel: ${message}`)
    operationalWarnings.push(
      /permission|insufficient|PERMISSION_DENIED/i.test(message)
        ? `A leitura agregada de ${warningLabel} ficou temporariamente indisponivel por permissao do Firestore. O painel foi carregado com metricas parciais.`
        : `A leitura agregada de ${warningLabel} ficou temporariamente indisponivel. O painel foi carregado com metricas parciais.`,
    )
    return []
  }
}

function round6(value: number) {
  return Number(value.toFixed(6))
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

function getCreatedAtValue(value: unknown) {
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
  return label || 'Funcao nao identificada'
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
      ? 'media'
      : 'baixa'
  const confidenceSummary = `Confianca ${confidenceLabel} (${(input.confidenceScore * 100).toFixed(0)}%, ${input.observedDays}/${input.expectedDays} dias).`

  if (input.riskLevel === 'critical') {
    return `${confidenceSummary} Pressao acima do alvo por ${input.aboveTargetStreak} dia(s), gap ${gapLabel} e tendencia ${trendLabel}; aplicar contencao imediata.`
  }

  if (input.riskLevel === 'warning') {
    const predictiveLabel = input.isPredictiveAlert ? ' Alerta preditivo ativo.' : ''
    return `${confidenceSummary} Sinal de atencao em ${input.latestStatus} com gap ${gapLabel}, tendencia ${trendLabel} e drift retry+waiting ${retryWaitingTrendLabel}; ajustar com guardrail.${predictiveLabel}`
  }

  if (input.latestStatus === 'below_target' && input.stableStreak > 0) {
    return `${confidenceSummary} Estabilidade sustentada por ${input.stableStreak} dia(s) com pressao abaixo do alvo; elegivel para relaxamento controlado.`
  }

  return `${confidenceSummary} Funcao estavel na faixa de alvo; manter rollout atual e monitorar tendencia diaria.`
}

async function loadPlatformCollections(force = false): Promise<PlatformCollectionsSnapshot> {
  if (!force && platformCollectionsCache && Date.now() - platformCollectionsCache.fetchedAt < PLATFORM_ANALYTICS_CACHE_TTL_MS) {
    return platformCollectionsCache
  }

  const db = ensurePlatformFirestore()
  const operationalWarnings: string[] = []
  const [usersDocs, documentsDocs, thesesDocs, sessionsDocs, acervoDocs, notebooksDocs, designStudioSessionsDocs] = await Promise.all([
    loadPlatformCollectionDocs(
      () => getDocs(collection(db, 'users')),
      'loadPlatformCollections.users',
      'perfis de usuarios',
      operationalWarnings,
    ),
    loadPlatformCollectionDocs(
      () => getDocs(collectionGroup(db, 'documents')),
      'loadPlatformCollections.documents',
      'documentos',
      operationalWarnings,
    ),
    loadPlatformCollectionDocs(
      () => getDocs(collectionGroup(db, 'theses')),
      'loadPlatformCollections.theses',
      'teses',
      operationalWarnings,
    ),
    loadPlatformCollectionDocs(
      () => getDocs(collectionGroup(db, 'thesis_analysis_sessions')),
      'loadPlatformCollections.thesisAnalysisSessions',
      'sessoes de analise de teses',
      operationalWarnings,
    ),
    loadPlatformCollectionDocs(
      () => getDocs(collectionGroup(db, 'acervo')),
      'loadPlatformCollections.acervo',
      'documentos do acervo',
      operationalWarnings,
    ),
    loadPlatformCollectionDocs(
      () => getDocs(collectionGroup(db, 'research_notebooks')),
      'loadPlatformCollections.researchNotebooks',
      'cadernos de pesquisa',
      operationalWarnings,
    ),
    loadPlatformCollectionDocs(
      () => getDocs(collectionGroup(db, 'design_studio_sessions')),
      'loadPlatformCollections.designStudioSessions',
      'sessoes do Design Studio v2',
      operationalWarnings,
    ),
  ])

  const notebookSearchMemoryDocs = await withPlatformFirestoreRetry(
    () => getDocs(collectionGroup(db, 'memory')),
    'loadPlatformCollections.notebookSearchMemory',
  )
    .then(snap => snap.docs)
    .catch(error => {
      const message = getErrorMessage(error)
      console.warn(`[PlatformAnalytics] Notebook search memory indisponivel: ${message}`)
      operationalWarnings.push(
        /permission|insufficient|PERMISSION_DENIED/i.test(message)
          ? 'A memoria dedicada dos cadernos ficou temporariamente indisponivel por permissao do Firestore. O painel foi carregado com metricas parciais.'
          : 'A memoria dedicada dos cadernos ficou temporariamente indisponivel. O painel foi carregado com metricas parciais.',
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
    users: usersDocs.map(d => ({ ...(d.data() as PlatformUserRecord), id: d.id })),
    documents: documentsDocs.map(d => ({ ...(d.data() as DocumentData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as DocumentData & { _owner_user_id?: string })),
    theses: thesesDocs.map(d => ({ ...(d.data() as ThesisData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as ThesisData & { _owner_user_id?: string })),
    sessions: sessionsDocs.map(d => ({ ...(d.data() as ThesisAnalysisSessionData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as ThesisAnalysisSessionData & { _owner_user_id?: string })),
    acervo: acervoDocs.map(d => ({ ...(d.data() as AcervoDocumentData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as AcervoDocumentData & { _owner_user_id?: string })),
    notebooks: notebooksDocs.map(d => ({ ...(d.data() as ResearchNotebookData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as ResearchNotebookData & { _owner_user_id?: string })),
    design_studio_sessions: designStudioSessionsDocs.map(d => ({ ...(d.data() as DesignStudioSessionData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as DesignStudioSessionData & { _owner_user_id?: string })),
    notebook_search_memory: notebookSearchMemory,
    operational_warnings: operationalWarnings,
  }

  platformCollectionsCache = snapshot
  return snapshot
}

export function invalidatePlatformAnalyticsCache(): void {
  platformCollectionsCache = null
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
    ...snapshot.design_studio_sessions.flatMap(session => extractDesignStudioSessionExecutions({
      id: session.id,
      title: session.title,
      created_at: session.created_at,
      llm_executions: session.llm_executions,
      usage_summary: session.usage_summary,
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
    .sort((left, right) => getCreatedAtValue(right.created_at) - getCreatedAtValue(left.created_at))
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
    admin_users: snapshot.users.filter(user => isAdminLikeRole(user.role)).length,
    standard_users: snapshot.users.filter(user => !isAdminLikeRole(user.role)).length,
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

function createExecutionStateAccumulator(): ExecutionStateAccumulator {
  return {
    calls: 0,
    cost_usd: 0,
    total_duration_ms: 0,
    retries: 0,
    fallbacks: 0,
  }
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

    if (!current.label || current.label === 'Funcao nao identificada') {
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
