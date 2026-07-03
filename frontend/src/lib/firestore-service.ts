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

import { onAuthStateChanged } from 'firebase/auth'
import { firestore, firebaseAuth, IS_FIREBASE } from './firebase'
import { createAdminTaxonomyRepository } from './modules/admin-taxonomy'
import { createAcervoRepository } from './modules/acervo'
import { createChatRepository } from './modules/chat'
import { createDashboardRepository } from './modules/dashboard/repository'
import { createDocumentsRepository } from './modules/documents'
import { createResearchNotebookRepository } from './modules/notebook'
import { createProfileRepository } from './modules/profile'
import { createSettingsRepository } from './modules/settings'
import { createThesesRepository } from './modules/theses'

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
  NotebookJurisprudenceSemanticMemoryEntry,
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
  ChatEffortLevel,
  ChatAgentWorkPackage,
  ChatArtifactData,
  ChatArtifactVersionData,
  ChatArtifactExportData,
  ChatTurnStatus,
  ChatTrailEvent,
  ChatConversationData,
  ChatTurnData,
  ChatSidecarDeviceData,
  ChatWorkspaceRootData,
  ChatWorkspaceBindingData,
  ChatSidecarCommandData,
  ChatApprovalRequestData,
  ChatSidecarAuditEntryData,
} from './firestore-types'
import type {
  ProfileData,
  UserSettingsData,
  ContextDetailData,
  ThesisData,
  PlatformUsageRow,
} from './firestore-types'

// Re-export DEFAULT_DOC_STRUCTURES for backward compatibility
export { DEFAULT_DOC_STRUCTURES } from './document-structures'

export {
  invalidatePlatformAnalyticsCache,
  getPlatformCostBreakdown,
  getPlatformRecentAgentExecutions,
  getPlatformOverview,
  getPlatformDailyUsage,
  getPlatformExecutionStateDaily,
  getPlatformExecutionStateWindowComparison,
  getPlatformFunctionWindowComparison,
  getPlatformFunctionCalibrationPlan,
  getPlatformFunctionTargetAdherenceDaily,
  getPlatformFunctionRolloutPolicyPlan,
} from './platform-analytics'

// ── Guard ───────────────────────────────────────────────────────────────────

function ensureFirestore() {
  if (!IS_FIREBASE || !firestore) {
    throw new Error('Firestore não está configurado')
  }
  return firestore
}

const FIREBASE_AUTH_SYNC_TIMEOUT_MS = 8_000

let authStateSyncPromise: Promise<void> | null = null

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

// Test-only no-op (kept exported because tests import this name).
export function __resetFirestoreAuthCircuitForTests(): void {
  // Auth-access circuit, PD-burst tracker, and unrecoverable-refresh memo were
  // removed because they were synthesizing `auth-session-invalid` from
  // ordinary Firestore errors and bouncing live users to /login. Firebase Auth
  // is the sole source of session truth via onAuthStateChanged.
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

async function resolveEffectiveUid(uid: string, contextLabel: string): Promise<string> {
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

export async function writeUserScoped<T>(
  uid: string,
  contextLabel: string,
  operation: (db: ReturnType<typeof ensureFirestore>, effectiveUid: string) => Promise<T>,
): Promise<T> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, contextLabel)
  return withFirestoreRetry(() => operation(db, effectiveUid), contextLabel)
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

const AUTH_RELATED_FIRESTORE_CODES = new Set([
  'permission-denied',
  'unauthenticated',
  'auth-session-invalid',
])

// Kept for callers that opt out of the recovery path (e.g. legacy settings
// reads that should fail fast without retrying token refresh). The cross-call
// kill-switch behavior was removed; this option is now effectively a no-op
// but the shape is preserved for backwards compatibility.
type FirestoreRetryOptions = {
  recoverAuthAccessErrors?: boolean
}

// Per-call retry only. We never escalate a Firestore failure into a
// "session invalid" signal that would log the user out — the Firebase Auth
// SDK is the sole source of session truth (onAuthStateChanged). Transient
// permission-denied during token rotation is normal; we just retry with a
// forced token refresh and let the SDK propagate fresh credentials.
const FIRESTORE_AUTH_RETRY_BACKOFF_MS = [200, 600, 1500] as const
const FIRESTORE_AUTH_MAX_RETRIES = FIRESTORE_AUTH_RETRY_BACKOFF_MS.length

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  if ('code' in error && typeof error.code === 'string') {
    return error.code.replace(/^firestore\//, '')
  }
  return null
}

// Kept for compatibility with callers (DocumentList, dashboard, notebook):
// since we no longer synthesize this error code, this just returns false in
// practice — callers' "skip toast on session-invalid" branch becomes inert.
export function isFirestoreSessionInvalidError(error: unknown): boolean {
  return getFirebaseErrorCode(error) === 'auth-session-invalid'
}

function isRetryableFirestoreError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error)
  if (!code) return false
  return RETRYABLE_FIRESTORE_CODES.has(code) || AUTH_RETRYABLE_FIRESTORE_CODES.has(code)
}

function isAuthRetryableFirestoreCode(code: string | null): boolean {
  return Boolean(code && AUTH_RETRYABLE_FIRESTORE_CODES.has(code))
}

function isAuthAccessFirestoreError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error)
  return Boolean(code && AUTH_RELATED_FIRESTORE_CODES.has(code))
}

async function refreshCurrentUserToken(): Promise<void> {
  const currentUser = firebaseAuth?.currentUser
  if (!currentUser) return
  try {
    await currentUser.getIdToken(true)
  } catch (error) {
    // Best-effort. Token refresh can fail transiently; the next retry
    // attempt will try again. We never destroy the session here.
    console.warn('Firestore token refresh failed:', getErrorMessage(error))
  }
}

async function withFirestoreRetry<T>(
  operation: () => Promise<T>,
  contextLabel: string,
  options: FirestoreRetryOptions = {},
): Promise<T> {
  const recoverAuthAccessErrors = options.recoverAuthAccessErrors !== false
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

      if (isAuthRetry && !recoverAuthAccessErrors) {
        // Caller opted out of the auth-access recovery path; surface
        // immediately so it can decide what to do.
        throw error
      }

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

  // All retries exhausted: surface the original error to the caller. NEVER
  // synthesize a session-invalid error here — that was the cross-call
  // kill-switch that bounced live users to /login.
  throw lastError
}

const settingsRepository = createSettingsRepository({
  ensureFirestore,
  resolveEffectiveUid,
  writeUserScoped,
  withFirestoreRetry,
  stripUndefined,
})

export const getSettings = settingsRepository.getSettings
export const saveSettings = settingsRepository.saveSettings
export const getUserSettings = settingsRepository.getUserSettings
export const saveUserSettings = settingsRepository.saveUserSettings
export const ensureUserSettingsMigrated = settingsRepository.ensureUserSettingsMigrated

// ── Profile (Anamnesis Layer 1) ──────────────────────────────────────────────

const profileRepository = createProfileRepository({
  ensureFirestore,
  resolveEffectiveUid,
  writeUserScoped,
  withFirestoreRetry,
})

export const getProfile = profileRepository.getProfile
export const saveProfile = profileRepository.saveProfile
export const completeOnboarding = profileRepository.completeOnboarding
export const getWizardData = profileRepository.getWizardData

// ── Documents CRUD ──────────────────────────────────────────────────────────

const documentsRepository = createDocumentsRepository({
  ensureFirestore,
  resolveEffectiveUid,
  writeUserScoped,
  withFirestoreRetry,
  isAuthAccessFirestoreError,
  getErrorMessage,
  stripUndefined,
})

export const createDocument = documentsRepository.createDocument
export const getDocument = documentsRepository.getDocument
export const listDocuments = documentsRepository.listDocuments
export const updateDocument = documentsRepository.updateDocument
export const deleteDocument = documentsRepository.deleteDocument
export const saveNotebookDocumentToDocuments = documentsRepository.saveNotebookDocumentToDocuments

// ── Research Notebook (Caderno de Pesquisa) repository facade ────────────────

export type { NotebookContentBackfillReport, NotebookSearchMemoryBackfillReport } from './modules/notebook'

const researchNotebookRepository = createResearchNotebookRepository({
  ensureFirestore,
  resolveEffectiveUid,
  withFirestoreRetry,
  isAuthAccessFirestoreError,
  getErrorMessage,
  getCreatedAtValue: getDocumentCreatedAtValue,
  stripUndefined,
})

export const backfillNotebookSearchMemoryAcrossPlatform = researchNotebookRepository.backfillNotebookSearchMemoryAcrossPlatform
export const backfillNotebookContentAcrossPlatform = researchNotebookRepository.backfillNotebookContentAcrossPlatform
export const listResearchNotebooks = researchNotebookRepository.listResearchNotebooks
export const getResearchNotebook = researchNotebookRepository.getResearchNotebook
export const createResearchNotebook = researchNotebookRepository.createResearchNotebook
export const updateResearchNotebook = researchNotebookRepository.updateResearchNotebook
export const deleteResearchNotebook = researchNotebookRepository.deleteResearchNotebook

// ── Admin taxonomy repository facade ────────────────────────────────────────

const adminTaxonomyRepository = createAdminTaxonomyRepository({
  isFirebase: IS_FIREBASE,
  getCurrentUserId,
  ensureUserSettingsMigrated: settingsRepository.ensureUserSettingsMigrated,
  saveUserSettings: settingsRepository.saveUserSettings,
})

export const getDocumentTypes = adminTaxonomyRepository.getDocumentTypes
export const getLegalAreas = adminTaxonomyRepository.getLegalAreas
export const sanitizeAdminDocumentTypes = adminTaxonomyRepository.sanitizeAdminDocumentTypes
export const sanitizeAdminLegalAreas = adminTaxonomyRepository.sanitizeAdminLegalAreas
export const loadAdminDocumentTypes = adminTaxonomyRepository.loadAdminDocumentTypes
export const saveAdminDocumentTypes = adminTaxonomyRepository.saveAdminDocumentTypes
export const loadAdminLegalAreas = adminTaxonomyRepository.loadAdminLegalAreas
export const saveAdminLegalAreas = adminTaxonomyRepository.saveAdminLegalAreas
export const loadAdminClassificationTipos = adminTaxonomyRepository.loadAdminClassificationTipos
export const saveAdminClassificationTipos = adminTaxonomyRepository.saveAdminClassificationTipos
export const getDocumentTypesForProfile = adminTaxonomyRepository.getDocumentTypesForProfile
export const getLegalAreasForProfile = adminTaxonomyRepository.getLegalAreasForProfile
export const getRequestFields = adminTaxonomyRepository.getRequestFields

// ── Theses (Firestore /users/{uid}/theses subcollection) ────────────────────

const thesesRepository = createThesesRepository({
  ensureFirestore,
  resolveEffectiveUid,
  writeUserScoped,
  withFirestoreRetry,
  isAuthAccessFirestoreError,
  getErrorMessage,
  getCreatedAtValue: getDocumentCreatedAtValue,
  stripUndefined,
})

export const listTheses = thesesRepository.listTheses
export const createThesis = thesesRepository.createThesis
export const updateThesis = thesesRepository.updateThesis
export const deleteThesis = thesesRepository.deleteThesis
export const getThesisStats = thesesRepository.getThesisStats
export const listThesisAnalysisSessions = thesesRepository.listThesisAnalysisSessions
export const saveThesisAnalysisSession = thesesRepository.saveThesisAnalysisSession
export const getLastThesisAnalysisSession = thesesRepository.getLastThesisAnalysisSession

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

const acervoRepository = createAcervoRepository({
  ensureFirestore,
  resolveEffectiveUid,
  writeUserScoped,
  withFirestoreRetry,
  isAuthAccessFirestoreError,
  getErrorMessage,
  getCreatedAtValue: getDocumentCreatedAtValue,
})

export const listAcervoDocuments = acervoRepository.listAcervoDocuments
export const createAcervoDocument = acervoRepository.createAcervoDocument
export const deleteAcervoDocument = acervoRepository.deleteAcervoDocument
export const getAllAcervoDocumentsForSearch = acervoRepository.getAllAcervoDocumentsForSearch
export const updateAcervoEmenta = acervoRepository.updateAcervoEmenta
export const updateAcervoTags = acervoRepository.updateAcervoTags
export const updateAcervoTextContent = acervoRepository.updateAcervoTextContent
export const convertAcervoToJson = acervoRepository.convertAcervoToJson
export const getAcervoDocsWithoutTags = acervoRepository.getAcervoDocsWithoutTags
export const getAcervoDocsWithoutEmenta = acervoRepository.getAcervoDocsWithoutEmenta
export const getAcervoContext = acervoRepository.getAcervoContext

// ── Dashboard Stats/Cost repository facade ─────────────────────────────────

const dashboardRepository = createDashboardRepository({
  listDocuments: documentsRepository.listDocuments,
  listThesisAnalysisSessions: thesesRepository.listThesisAnalysisSessions,
  listAcervoDocuments: acervoRepository.listAcervoDocuments,
  listResearchNotebooks: researchNotebookRepository.listResearchNotebooks,
  // Lazily reference chatRepository (declared further down) so the cost
  // breakdown can fan out into chat conversation turns.
  listChatConversations: (uid, opts) => chatRepository.listChatConversations(uid, opts),
  listChatTurns: (uid, conversationId) => chatRepository.listChatTurns(uid, conversationId),
})

export const getStats = dashboardRepository.getStats
export const getDailyStats = dashboardRepository.getDailyStats
export const getByTypeStats = dashboardRepository.getByTypeStats
export const getRecentDocuments = dashboardRepository.getRecentDocuments
export const getDashboardSnapshot = dashboardRepository.getDashboardSnapshot
export const getCostBreakdown = dashboardRepository.getCostBreakdown

// ── Acervo analysis tracking ──────────────────────────────────────────────────

export const markAcervoDocumentsAnalyzed = acervoRepository.markAcervoDocumentsAnalyzed
export const getAcervoAnalysisStatus = acervoRepository.getAcervoAnalysisStatus

// ── Chat Orchestrator repository facade ─────────────────────────────────────

const chatRepository = createChatRepository({
  ensureFirestore,
  resolveEffectiveUid,
  withFirestoreRetry,
  isAuthAccessFirestoreError,
  getErrorMessage,
  getCreatedAtValue: getDocumentCreatedAtValue,
  stripUndefined,
})

export const listChatConversations = chatRepository.listChatConversations
export const getChatConversation = chatRepository.getChatConversation
export const createChatConversation = chatRepository.createChatConversation
export const ensureChatConversation = chatRepository.ensureChatConversation
export const renameChatConversation = chatRepository.renameChatConversation
export const updateChatConversationEffort = chatRepository.updateChatConversationEffort
export const updateChatConversationAgentMode = chatRepository.updateChatConversationAgentMode
export const updateChatConversationPreview = chatRepository.updateChatConversationPreview
export const setChatConversationPinned = chatRepository.setChatConversationPinned
export const deleteChatConversation = chatRepository.deleteChatConversation
export const listChatTurns = chatRepository.listChatTurns
export const appendChatTurn = chatRepository.appendChatTurn
export const updateChatTurn = chatRepository.updateChatTurn
export const persistChatAgentWorkPackage = chatRepository.persistChatAgentWorkPackage
export const saveChatSidecarDevice = chatRepository.saveChatSidecarDevice
export const listChatSidecarDevices = chatRepository.listChatSidecarDevices
export const saveChatWorkspaceRoot = chatRepository.saveChatWorkspaceRoot
export const listChatWorkspaceRoots = chatRepository.listChatWorkspaceRoots
export const bindChatWorkspaceRoot = chatRepository.bindChatWorkspaceRoot
export const listChatWorkspaceBindings = chatRepository.listChatWorkspaceBindings
export const createChatSidecarCommand = chatRepository.createChatSidecarCommand
export const updateChatSidecarCommand = chatRepository.updateChatSidecarCommand
export const createChatApprovalRequest = chatRepository.createChatApprovalRequest
export const updateChatApprovalRequest = chatRepository.updateChatApprovalRequest
export const appendChatSidecarAuditEntry = chatRepository.appendChatSidecarAuditEntry
export const listChatSidecarAuditEntries = chatRepository.listChatSidecarAuditEntries

// ── Password change via Firebase Auth ────────────────────────────────────────

export { IS_FIREBASE } from './firebase'
