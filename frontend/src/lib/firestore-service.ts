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
  collection, getDocs, addDoc, query, orderBy, limit, where, startAfter,
  serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { firestore, firebaseAuth, IS_FIREBASE } from './firebase'
import {
  NOTEBOOK_SEARCH_MEMORY_DOC_ID,
  normalizeFirestoreDocumentId,
} from './core/firestore'
import { createAdminTaxonomyRepository } from './modules/admin-taxonomy'
import { createAcervoRepository } from './modules/acervo'
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
  ChatEffortLevel,
  ChatConversationData,
  ChatTurnData,
  ChatSidecarDeviceData,
  ChatWorkspaceRootData,
  ChatWorkspaceBindingData,
  ChatSidecarCommandData,
  ChatApprovalRequestData,
  ChatSidecarAuditEntryData,
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

export type { NotebookSearchMemoryBackfillReport } from './modules/notebook'

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

// ── Chat Orchestrator (page `/chat`) ─────────────────────────────────────────

/**
 * Chat conversation CRUD. Each conversation lives under
 * `/users/{uid}/chat_conversations/{conversationId}`; turns are stored in the
 * `turns` subcollection. The orchestrator runtime (PR2) writes to these
 * collections; PR1 ships only the data layer + UI shell.
 *
 * IMPORTANT: these helpers MUST NOT synthesize session-invalid errors when a
 * Firestore call is rejected with permission-denied or unauthenticated. We
 * propagate the original error to the caller so a transient burst (e.g., a
 * stale token between renews) does not bounce a live user to /login. This
 * mirrors the post-580392b contract for every user-scoped collection.
 */

const CHAT_CONVERSATIONS_COLLECTION = 'chat_conversations'
const CHAT_TURNS_SUBCOLLECTION = 'turns'
const SIDECAR_DEVICES_COLLECTION = 'sidecar_devices'
const CHAT_WORKSPACE_ROOTS_COLLECTION = 'chat_workspace_roots'
const CHAT_WORKSPACE_BINDINGS_SUBCOLLECTION = 'workspace_bindings'
const CHAT_SIDECAR_COMMANDS_SUBCOLLECTION = 'sidecar_commands'
const CHAT_APPROVALS_SUBCOLLECTION = 'approvals'
const CHAT_AUDIT_SUBCOLLECTION = 'audit'
const DEFAULT_CHAT_EFFORT: ChatEffortLevel = 'medio'

function chatConversationCollection(db: ReturnType<typeof ensureFirestore>, uid: string) {
  return collection(db, 'users', uid, CHAT_CONVERSATIONS_COLLECTION)
}

function chatConversationDoc(
  db: ReturnType<typeof ensureFirestore>,
  uid: string,
  conversationId: string,
) {
  return doc(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
  )
}

function chatTurnsCollection(
  db: ReturnType<typeof ensureFirestore>,
  uid: string,
  conversationId: string,
) {
  return collection(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
    CHAT_TURNS_SUBCOLLECTION,
  )
}

function userSubcollection(db: ReturnType<typeof ensureFirestore>, uid: string, name: string) {
  return collection(db, 'users', uid, name)
}

function userSubcollectionDoc(db: ReturnType<typeof ensureFirestore>, uid: string, name: string, documentId: string) {
  return doc(db, 'users', uid, name, normalizeFirestoreDocumentId(documentId))
}

function chatConversationSubcollection(
  db: ReturnType<typeof ensureFirestore>,
  uid: string,
  conversationId: string,
  name: string,
) {
  return collection(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
    name,
  )
}

function chatConversationSubcollectionDoc(
  db: ReturnType<typeof ensureFirestore>,
  uid: string,
  conversationId: string,
  name: string,
  documentId: string,
) {
  return doc(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
    name,
    normalizeFirestoreDocumentId(documentId),
  )
}

function chatTurnDoc(
  db: ReturnType<typeof ensureFirestore>,
  uid: string,
  conversationId: string,
  turnId: string,
) {
  return doc(
    db,
    'users',
    uid,
    CHAT_CONVERSATIONS_COLLECTION,
    normalizeFirestoreDocumentId(conversationId),
    CHAT_TURNS_SUBCOLLECTION,
    normalizeFirestoreDocumentId(turnId),
  )
}

/**
 * List every chat conversation for the current user, newest-first.
 * Falls back to a client-side sort if the indexed query is rejected (e.g.,
 * the collection is brand-new and Firestore has not built the index yet).
 */
export async function listChatConversations(
  uid: string,
  opts?: { startAfter?: string; limit?: number },
): Promise<{ items: ChatConversationData[]; hasMore?: boolean }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listChatConversations')
  const colRef = chatConversationCollection(db, effectiveUid)
  const pageLimit = Math.max(1, Math.min(50, opts?.limit ?? 50))
  const constraints: QueryConstraint[] = [orderBy('updated_at', 'desc'), limit(pageLimit + 1)]
  if (opts?.startAfter) {
    const cursorRef = chatConversationDoc(db, effectiveUid, opts.startAfter)
    const cursorSnap = await withFirestoreRetry(() => getDoc(cursorRef), 'listChatConversations.cursor')
    if (cursorSnap.exists()) {
      constraints.push(startAfter(cursorSnap))
    }
  }
  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, ...constraints)),
      'listChatConversations.query',
    )
    const docs = snap.docs
    const hasMore = docs.length > pageLimit
    const items = docs.slice(0, pageLimit).map(d => ({ id: d.id, ...d.data() } as ChatConversationData))
    return { items, hasMore }
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) {
      throw error
    }
    console.warn(
      'Firestore chat conversations query failed; using client-side fallback:',
      getErrorMessage(error),
    )
    const fallbackSnap = await withFirestoreRetry(
      () => getDocs(colRef),
      'listChatConversations.fallback',
    )
    const allItems = fallbackSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as ChatConversationData))
      .sort((a, b) => getDocumentCreatedAtValue(b.updated_at ?? b.created_at)
        - getDocumentCreatedAtValue(a.updated_at ?? a.created_at))
    // Client-side pagination for fallback
    const startIdx = opts?.startAfter
      ? allItems.findIndex(item => item.id === opts.startAfter)
      : 0
    const slice = startIdx >= 0 ? allItems.slice(startIdx + 1, startIdx + 1 + pageLimit + 1) : allItems.slice(0, pageLimit + 1)
    const hasMore = slice.length > pageLimit
    return { items: slice.slice(0, pageLimit), hasMore }
  }
}

export async function getChatConversation(
  uid: string,
  conversationId: string,
): Promise<ChatConversationData | null> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'getChatConversation')
  const ref = chatConversationDoc(db, effectiveUid, conversationId)
  const snap = await withFirestoreRetry(() => getDoc(ref), 'getChatConversation')
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as ChatConversationData
}

/**
 * Create a chat conversation. The document only stores metadata (title,
 * effort knob, last preview). Returns the freshly minted Firestore ID.
 */
export async function createChatConversation(
  uid: string,
  data: Partial<Pick<ChatConversationData, 'title' | 'effort' | 'sidecar_root_path' | 'last_preview'>> = {},
): Promise<string> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'createChatConversation')
  const now = new Date().toISOString()
  const sanitized = stripUndefined({
    title: data.title?.trim() || 'Nova conversa',
    effort: (data.effort ?? DEFAULT_CHAT_EFFORT) as ChatEffortLevel,
    sidecar_root_path: data.sidecar_root_path,
    last_preview: data.last_preview ?? '',
    created_at: now,
    updated_at: now,
  })
  const ref = await withFirestoreRetry(
    () => addDoc(chatConversationCollection(db, effectiveUid), sanitized),
    'createChatConversation.write',
  )
  return ref.id
}

/**
 * Ensure a conversation document exists before writing child turn documents.
 * Firestore allows subcollections below a missing parent; without this guard
 * a turn can be persisted but the sidebar cannot list the conversation after
 * a refresh. This helper is intentionally idempotent and preserves existing
 * metadata whenever the parent already exists.
 */
export async function ensureChatConversation(
  uid: string,
  conversationId: string,
  data: Partial<Pick<ChatConversationData, 'title' | 'effort' | 'sidecar_root_path' | 'last_preview'>> = {},
): Promise<ChatConversationData> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'ensureChatConversation')
  const normalizedConversationId = normalizeFirestoreDocumentId(conversationId)
  const ref = chatConversationDoc(db, effectiveUid, normalizedConversationId)
  const now = new Date().toISOString()
  const snap = await withFirestoreRetry(() => getDoc(ref), 'ensureChatConversation.read')

  if (snap.exists()) {
    const existing = { id: snap.id, ...snap.data() } as ChatConversationData
    const patch = stripUndefined({
      ...(existing.title ? {} : { title: data.title?.trim() || 'Nova conversa' }),
      ...(existing.effort ? {} : { effort: data.effort ?? DEFAULT_CHAT_EFFORT }),
      ...(existing.created_at ? {} : { created_at: now }),
      ...(existing.updated_at ? {} : { updated_at: now }),
      ...(existing.last_preview !== undefined || data.last_preview === undefined ? {} : { last_preview: data.last_preview }),
      ...(existing.sidecar_root_path !== undefined || data.sidecar_root_path === undefined ? {} : { sidecar_root_path: data.sidecar_root_path }),
    })
    if (Object.keys(patch).length > 0) {
      await withFirestoreRetry(() => setDoc(ref, patch, { merge: true }), 'ensureChatConversation.repair')
    }
    return { ...existing, ...patch }
  }

  const created = stripUndefined({
    title: data.title?.trim() || 'Nova conversa',
    effort: data.effort ?? DEFAULT_CHAT_EFFORT,
    sidecar_root_path: data.sidecar_root_path,
    last_preview: data.last_preview ?? '',
    created_at: now,
    updated_at: now,
  }) as Omit<ChatConversationData, 'id'>
  await withFirestoreRetry(() => setDoc(ref, created, { merge: true }), 'ensureChatConversation.create')
  return { id: normalizedConversationId, ...created }
}

export async function renameChatConversation(
  uid: string,
  conversationId: string,
  title: string,
): Promise<void> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'renameChatConversation')
  const ref = chatConversationDoc(db, effectiveUid, conversationId)
  const trimmed = title.trim() || 'Nova conversa'
  await withFirestoreRetry(
    () => updateDoc(ref, { title: trimmed, updated_at: new Date().toISOString() }),
    'renameChatConversation.update',
  )
}

export async function updateChatConversationEffort(
  uid: string,
  conversationId: string,
  effort: ChatEffortLevel,
): Promise<void> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'updateChatConversationEffort')
  const ref = chatConversationDoc(db, effectiveUid, conversationId)
  await withFirestoreRetry(
    () => updateDoc(ref, { effort, updated_at: new Date().toISOString() }),
    'updateChatConversationEffort.update',
  )
}

export async function updateChatConversationPreview(
  uid: string,
  conversationId: string,
  preview: string,
): Promise<void> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'updateChatConversationPreview')
  const ref = chatConversationDoc(db, effectiveUid, conversationId)
  const trimmed = preview.length > 240 ? `${preview.slice(0, 237)}…` : preview
  await ensureChatConversation(effectiveUid, conversationId, { last_preview: trimmed })
  await withFirestoreRetry(
    () => updateDoc(ref, { last_preview: trimmed, updated_at: new Date().toISOString() }),
    'updateChatConversationPreview.update',
  )
}

/**
 * Delete a chat conversation. Firestore does NOT cascade child documents, so
 * we explicitly delete every turn in the `turns` subcollection first. Failure
 * to delete a child is logged but does not block the parent removal — orphaned
 * turns are invisible to the UI once the parent is gone.
 */
export async function deleteChatConversation(
  uid: string,
  conversationId: string,
): Promise<void> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'deleteChatConversation')
  const turnsRef = chatTurnsCollection(db, effectiveUid, conversationId)
  try {
    const turnsSnap = await withFirestoreRetry(() => getDocs(turnsRef), 'deleteChatConversation.listTurns')
    await Promise.all(
      turnsSnap.docs.map(d =>
        withFirestoreRetry(() => deleteDoc(d.ref), 'deleteChatConversation.deleteTurn').catch(err => {
          console.warn('Chat: failed to delete turn during conversation cleanup:', getErrorMessage(err))
        }),
      ),
    )
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) throw error
    console.warn('Chat: failed to enumerate turns during conversation cleanup:', getErrorMessage(error))
  }
  await withFirestoreRetry(
    () => deleteDoc(chatConversationDoc(db, effectiveUid, conversationId)),
    'deleteChatConversation.delete',
  )
}

export async function listChatTurns(
  uid: string,
  conversationId: string,
): Promise<{ items: ChatTurnData[] }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listChatTurns')
  const colRef = chatTurnsCollection(db, effectiveUid, conversationId)
  try {
    const snap = await withFirestoreRetry(
      () => getDocs(query(colRef, orderBy('created_at', 'asc'))),
      'listChatTurns.query',
    )
    return {
      items: snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatTurnData)),
    }
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) throw error
    console.warn('Firestore chat turns query failed; using client-side fallback:', getErrorMessage(error))
    const fallbackSnap = await withFirestoreRetry(() => getDocs(colRef), 'listChatTurns.fallback')
    const items = fallbackSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as ChatTurnData))
      .sort((a, b) => getDocumentCreatedAtValue(a.created_at) - getDocumentCreatedAtValue(b.created_at))
    return { items }
  }
}

/**
 * Append a new turn to a conversation. Returns the freshly minted Firestore
 * ID for the turn document.
 */
export async function appendChatTurn(
  uid: string,
  conversationId: string,
  data: Omit<ChatTurnData, 'id' | 'created_at'> & { created_at?: string },
): Promise<string> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'appendChatTurn')
  const now = data.created_at ?? new Date().toISOString()
  await ensureChatConversation(effectiveUid, conversationId, {
    title: data.user_input ? data.user_input.slice(0, 80) : 'Nova conversa',
  })
  const sanitized = stripUndefined({
    ...data,
    conversation_id: conversationId,
    trail: data.trail ?? [],
    assistant_markdown: data.assistant_markdown ?? null,
    status: data.status,
    created_at: now,
  })
  const ref = await withFirestoreRetry(
    () => addDoc(chatTurnsCollection(db, effectiveUid, conversationId), sanitized),
    'appendChatTurn.write',
  )
  // Bump the parent conversation's updated_at so the sidebar list re-orders.
  try {
    await withFirestoreRetry(
      () => updateDoc(chatConversationDoc(db, effectiveUid, conversationId), { updated_at: now }),
      'appendChatTurn.bumpConversation',
    )
  } catch (error) {
    if (isAuthAccessFirestoreError(error)) throw error
    console.warn('Chat: failed to bump conversation updated_at; repairing parent document:', getErrorMessage(error))
    await ensureChatConversation(effectiveUid, conversationId, {
      title: data.user_input ? data.user_input.slice(0, 80) : 'Nova conversa',
    })
  }
  return ref.id
}

/**
 * Update a turn (status changes, append trail events, store final markdown).
 * Caller is responsible for merging trail arrays — this helper does a
 * straight `updateDoc` because partial array merges in Firestore are not
 * possible without a transaction.
 */
export async function updateChatTurn(
  uid: string,
  conversationId: string,
  turnId: string,
  data: Partial<ChatTurnData>,
): Promise<void> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'updateChatTurn')
  const ref = chatTurnDoc(db, effectiveUid, conversationId, turnId)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, conversation_id, ...rest } = data
  const sanitized = stripUndefined({ ...rest })
  await withFirestoreRetry(() => updateDoc(ref, sanitized), 'updateChatTurn.update')
  if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
    try {
      await withFirestoreRetry(
        () =>
          updateDoc(chatConversationDoc(db, effectiveUid, conversationId), {
            updated_at: new Date().toISOString(),
          }),
        'updateChatTurn.bumpConversation',
      )
    } catch (error) {
      if (isAuthAccessFirestoreError(error)) throw error
      console.warn('Chat: failed to bump conversation after turn finalisation; repairing parent document:', getErrorMessage(error))
      await ensureChatConversation(effectiveUid, conversationId)
    }
  }
}

export async function saveChatSidecarDevice(
  uid: string,
  data: Omit<ChatSidecarDeviceData, 'paired_at'> & { paired_at?: string },
): Promise<string> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'saveChatSidecarDevice')
  const now = new Date().toISOString()
  const { id, ...rest } = data
  const sanitized = stripUndefined({
    ...rest,
    label: rest.label?.trim() || 'Lexio Sidecar',
    capabilities: rest.capabilities ?? ['read'],
    status: rest.status ?? 'offline',
    paired_at: rest.paired_at ?? now,
    last_seen_at: rest.last_seen_at ?? now,
  })

  if (id) {
    const normalizedId = normalizeFirestoreDocumentId(id)
    await withFirestoreRetry(
      () => setDoc(userSubcollectionDoc(db, effectiveUid, SIDECAR_DEVICES_COLLECTION, normalizedId), sanitized, { merge: true }),
      'saveChatSidecarDevice.set',
    )
    return normalizedId
  }

  const ref = await withFirestoreRetry(
    () => addDoc(userSubcollection(db, effectiveUid, SIDECAR_DEVICES_COLLECTION), sanitized),
    'saveChatSidecarDevice.add',
  )
  return ref.id
}

export async function listChatSidecarDevices(uid: string): Promise<{ items: ChatSidecarDeviceData[] }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listChatSidecarDevices')
  const colRef = userSubcollection(db, effectiveUid, SIDECAR_DEVICES_COLLECTION)
  const snap = await withFirestoreRetry(
    () => getDocs(query(colRef, orderBy('last_seen_at', 'desc'))),
    'listChatSidecarDevices.query',
  )
  return { items: snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatSidecarDeviceData)) }
}

export async function saveChatWorkspaceRoot(
  uid: string,
  data: Omit<ChatWorkspaceRootData, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string },
): Promise<string> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'saveChatWorkspaceRoot')
  const now = new Date().toISOString()
  const { id, ...rest } = data
  const sanitized = stripUndefined({
    ...rest,
    label: rest.label?.trim() || 'Workspace',
    permissions: rest.permissions ?? ['read'],
    approval_policy: rest.approval_policy ?? 'always',
    sync_enabled: rest.sync_enabled ?? true,
    created_at: rest.created_at ?? now,
    updated_at: now,
  })

  if (id) {
    const normalizedId = normalizeFirestoreDocumentId(id)
    await withFirestoreRetry(
      () => setDoc(userSubcollectionDoc(db, effectiveUid, CHAT_WORKSPACE_ROOTS_COLLECTION, normalizedId), sanitized, { merge: true }),
      'saveChatWorkspaceRoot.set',
    )
    return normalizedId
  }

  const ref = await withFirestoreRetry(
    () => addDoc(userSubcollection(db, effectiveUid, CHAT_WORKSPACE_ROOTS_COLLECTION), sanitized),
    'saveChatWorkspaceRoot.add',
  )
  return ref.id
}

export async function listChatWorkspaceRoots(uid: string): Promise<{ items: ChatWorkspaceRootData[] }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listChatWorkspaceRoots')
  const colRef = userSubcollection(db, effectiveUid, CHAT_WORKSPACE_ROOTS_COLLECTION)
  const snap = await withFirestoreRetry(
    () => getDocs(query(colRef, orderBy('updated_at', 'desc'))),
    'listChatWorkspaceRoots.query',
  )
  return { items: snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatWorkspaceRootData)) }
}

export async function bindChatWorkspaceRoot(
  uid: string,
  conversationId: string,
  root: Pick<ChatWorkspaceBindingData, 'root_id' | 'provider' | 'label' | 'permissions' | 'approval_policy'>,
): Promise<string> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'bindChatWorkspaceRoot')
  const now = new Date().toISOString()
  await ensureChatConversation(effectiveUid, conversationId)
  const bindingId = normalizeFirestoreDocumentId(root.root_id)
  const sanitized = stripUndefined({
    conversation_id: normalizeFirestoreDocumentId(conversationId),
    root_id: bindingId,
    provider: root.provider,
    label: root.label?.trim() || root.provider,
    permissions: root.permissions,
    approval_policy: root.approval_policy,
    created_at: now,
    updated_at: now,
  })
  await withFirestoreRetry(
    () => setDoc(chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_WORKSPACE_BINDINGS_SUBCOLLECTION, bindingId), sanitized, { merge: true }),
    'bindChatWorkspaceRoot.set',
  )
  return bindingId
}

export async function listChatWorkspaceBindings(
  uid: string,
  conversationId: string,
): Promise<{ items: ChatWorkspaceBindingData[] }> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'listChatWorkspaceBindings')
  const colRef = chatConversationSubcollection(db, effectiveUid, conversationId, CHAT_WORKSPACE_BINDINGS_SUBCOLLECTION)
  const snap = await withFirestoreRetry(
    () => getDocs(query(colRef, orderBy('updated_at', 'desc'))),
    'listChatWorkspaceBindings.query',
  )
  return { items: snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatWorkspaceBindingData)) }
}

export async function createChatSidecarCommand(
  uid: string,
  conversationId: string,
  data: Omit<ChatSidecarCommandData, 'id' | 'conversation_id' | 'created_at' | 'updated_at' | 'status'> & { status?: ChatSidecarCommandData['status'] },
): Promise<string> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'createChatSidecarCommand')
  const now = new Date().toISOString()
  await ensureChatConversation(effectiveUid, conversationId)
  const sanitized = stripUndefined({
    ...data,
    conversation_id: normalizeFirestoreDocumentId(conversationId),
    status: data.status ?? 'waiting_approval',
    created_at: now,
    updated_at: now,
  })
  const ref = await withFirestoreRetry(
    () => addDoc(chatConversationSubcollection(db, effectiveUid, conversationId, CHAT_SIDECAR_COMMANDS_SUBCOLLECTION), sanitized),
    'createChatSidecarCommand.add',
  )
  return ref.id
}

export async function updateChatSidecarCommand(
  uid: string,
  conversationId: string,
  commandId: string,
  data: Partial<ChatSidecarCommandData>,
): Promise<void> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'updateChatSidecarCommand')
  const { id, conversation_id, created_at, ...rest } = data
  await withFirestoreRetry(
    () => updateDoc(
      chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_SIDECAR_COMMANDS_SUBCOLLECTION, commandId),
      stripUndefined({ ...rest, updated_at: new Date().toISOString() }),
    ),
    'updateChatSidecarCommand.update',
  )
}

export async function createChatApprovalRequest(
  uid: string,
  conversationId: string,
  data: Omit<ChatApprovalRequestData, 'id' | 'conversation_id' | 'created_at' | 'updated_at' | 'status'> & { status?: ChatApprovalRequestData['status'] },
): Promise<string> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'createChatApprovalRequest')
  const now = new Date().toISOString()
  await ensureChatConversation(effectiveUid, conversationId)
  const sanitized = stripUndefined({
    ...data,
    conversation_id: normalizeFirestoreDocumentId(conversationId),
    status: data.status ?? 'pending',
    created_at: now,
    updated_at: now,
  })
  const ref = await withFirestoreRetry(
    () => addDoc(chatConversationSubcollection(db, effectiveUid, conversationId, CHAT_APPROVALS_SUBCOLLECTION), sanitized),
    'createChatApprovalRequest.add',
  )
  return ref.id
}

export async function updateChatApprovalRequest(
  uid: string,
  conversationId: string,
  approvalId: string,
  data: Partial<ChatApprovalRequestData>,
): Promise<void> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'updateChatApprovalRequest')
  const { id, conversation_id, created_at, ...rest } = data
  await withFirestoreRetry(
    () => updateDoc(
      chatConversationSubcollectionDoc(db, effectiveUid, conversationId, CHAT_APPROVALS_SUBCOLLECTION, approvalId),
      stripUndefined({ ...rest, updated_at: new Date().toISOString() }),
    ),
    'updateChatApprovalRequest.update',
  )
}

export async function appendChatSidecarAuditEntry(
  uid: string,
  conversationId: string,
  data: Omit<ChatSidecarAuditEntryData, 'id' | 'conversation_id' | 'created_at'> & { created_at?: string },
): Promise<string> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'appendChatSidecarAuditEntry')
  await ensureChatConversation(effectiveUid, conversationId)
  const sanitized = stripUndefined({
    ...data,
    conversation_id: normalizeFirestoreDocumentId(conversationId),
    created_at: data.created_at ?? new Date().toISOString(),
  })
  const ref = await withFirestoreRetry(
    () => addDoc(chatConversationSubcollection(db, effectiveUid, conversationId, CHAT_AUDIT_SUBCOLLECTION), sanitized),
    'appendChatSidecarAuditEntry.add',
  )
  return ref.id
}

// ── Password change via Firebase Auth ────────────────────────────────────────

export { IS_FIREBASE } from './firebase'
