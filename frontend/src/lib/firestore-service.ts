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
  type QueryConstraint,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { firestore, firebaseAuth, IS_FIREBASE } from './firebase'
import { CLASSIFICATION_TIPOS, DEFAULT_AREA_ASSUNTOS } from './classification-data'
import { DEFAULT_DOC_STRUCTURES } from './document-structures'
import {
  buildCostBreakdown,
  buildUsageSummary,
  extractDocumentUsageExecutions,
  extractThesisSessionExecutions,
  extractAcervoUsageExecutions,
  extractNotebookUsageExecutions,
  type CostBreakdown,
  type UsageExecutionRecord,
  type UsageSummary,
} from './cost-analytics'
import {
  NOTEBOOK_SEARCH_MEMORY_DOC_ID,
  buildNotebookSearchMemoryDocPath,
  buildResearchNotebookDocPath,
  getRefUserId,
  normalizeFirestoreDocumentId,
} from './core/firestore'
import { createAcervoRepository } from './modules/acervo'
import { createDocumentsRepository } from './modules/documents'
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
  DocumentData,
  ThesisData,
  AcervoDocumentData,
  NotebookSource,
  ResearchNotebookData,
  NotebookResearchAuditEntry,
  NotebookSavedSearchEntry,
  NotebookJurisprudenceSemanticMemoryEntry,
  ThesisAnalysisSessionData,
  WizardData,
  WizardStep,
  WizardField,
  AdminDocumentType,
  AdminLegalArea,
  AdminClassificationTipos,
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

// ── Guard ────────────────────────────────────────────────────────────────────

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

async function getLegacySettingsDocData(documentId: string): Promise<Record<string, unknown>> {
  const db = ensureFirestore()
  const snap = await withFirestoreRetry(
    () => getDoc(doc(db, 'settings', documentId)),
    `getLegacySettingsDocData.${documentId}`,
    { recoverAuthAccessErrors: false },
  )
  return snap.exists() ? (snap.data() as Record<string, unknown>) : {}
}

export async function ensureUserSettingsMigrated(uid: string): Promise<UserSettingsData> {
  const current = await getUserSettings(uid)
  if (current[USER_SETTINGS_MIGRATION_FLAG]) return current

  const patch: Partial<UserSettingsData> = {
    [USER_SETTINGS_MIGRATION_FLAG]: new Date().toISOString(),
  }

  try {
    const globalSettings = await getSettings({ recoverAuthAccessErrors: false }).catch(() => ({} as Record<string, unknown>))
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
  await writeUserScoped(uid, 'saveProfile', async (db, effectiveUid) => {
    const ref = doc(db, 'users', effectiveUid, 'profile', 'data')
    await setDoc(ref, { ...data, updated_at: serverTimestamp() }, { merge: true })
  })
}

export async function completeOnboarding(uid: string, data: ProfileData): Promise<void> {
  await writeUserScoped(uid, 'completeOnboarding', async (db, effectiveUid) => {
    const ref = doc(db, 'users', effectiveUid, 'profile', 'data')
    await setDoc(ref, {
      ...data,
      onboarding_completed: true,
      updated_at: serverTimestamp(),
    }, { merge: true })
  })
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

export async function getDashboardSnapshot(uid: string): Promise<{
  documents: DocumentData[]
  thesisSessions: ThesisAnalysisSessionData[]
}> {
  const [{ items }, thesisSessions] = await Promise.all([
    listDocuments(uid),
    listThesisAnalysisSessions(uid).catch(() => []),
  ])

  return {
    documents: items,
    thesisSessions,
  }
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

    const notebooksSnap = await withFirestoreRetry(
      () => getDocs(query(collectionGroup(db, 'research_notebooks'), ...constraints)),
      'backfillNotebookSearchMemoryAcrossPlatform.notebooks',
    )
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

        const memorySnap = await withFirestoreRetry(
          () => getDoc(getNotebookSearchMemoryDocRef(uid, notebookDoc.id)),
          `backfillNotebookSearchMemoryAcrossPlatform.memory.${notebookDoc.id}`,
        )
        if (memorySnap.exists()) {
          report.already_dedicated += 1
          continue
        }

        const notebook = notebookDoc.data() as ResearchNotebookData
        const legacyAudits = Array.isArray(notebook.research_audits) ? notebook.research_audits : []
        const legacySavedSearches = Array.isArray(notebook.saved_searches) ? notebook.saved_searches : []
        const legacySemanticMemory = Array.isArray(notebook.jurisprudence_semantic_memory) ? notebook.jurisprudence_semantic_memory : []

        if (legacyAudits.length === 0 && legacySavedSearches.length === 0 && legacySemanticMemory.length === 0) {
          report.empty_legacy += 1
          continue
        }

        if (!dryRun) {
          await saveNotebookSearchMemory(uid, notebookDoc.id, {
            research_audits: legacyAudits,
            saved_searches: legacySavedSearches,
            jurisprudence_semantic_memory: legacySemanticMemory,
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

const thesesRepository = createThesesRepository({
  ensureFirestore,
  resolveEffectiveUid,
  writeUserScoped,
  withFirestoreRetry,
  isAuthAccessFirestoreError,
  getErrorMessage,
})

export const listTheses = thesesRepository.listTheses
export const createThesis = thesesRepository.createThesis
export const updateThesis = thesesRepository.updateThesis
export const deleteThesis = thesesRepository.deleteThesis
export const getThesisStats = thesesRepository.getThesisStats

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

// ── Admin settings (Firestore /settings collection) ──────────────────────────

export async function getSettings(options: FirestoreRetryOptions = {}): Promise<Record<string, unknown>> {
  const db = ensureFirestore()
  const ref = doc(db, 'settings', 'platform')
  const snap = await withFirestoreRetry(
    () => getDoc(ref),
    'getSettings',
    options,
  )
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
  await writeUserScoped(uid, 'saveUserSettings', async (db, effectiveUid) => {
    const ref = doc(db, 'users', effectiveUid, 'settings', 'preferences')
    const sanitized = stripUndefined(data as Record<string, unknown>)
    await setDoc(ref, { ...sanitized, updated_at: serverTimestamp() }, { merge: true })
  })
}

// ── Acervo analysis tracking ──────────────────────────────────────────────────

export const markAcervoDocumentsAnalyzed = acervoRepository.markAcervoDocumentsAnalyzed
export const getAcervoAnalysisStatus = acervoRepository.getAcervoAnalysisStatus

// ── Thesis Analysis Session persistence ──────────────────────────────────────

/**
 * Save a thesis analysis session record (for display on next visit).
 */
export async function saveThesisAnalysisSession(
  uid: string,
  data: Omit<ThesisAnalysisSessionData, 'id'>,
): Promise<string> {
  return writeUserScoped(uid, 'saveThesisAnalysisSession', async (db, effectiveUid) => {
    const ref = await addDoc(collection(db, 'users', effectiveUid, 'thesis_analysis_sessions'), stripUndefined({
      ...data,
      created_at: data.created_at ?? new Date().toISOString(),
    }))
    return ref.id
  })
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
const NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS = 45
const NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS = 60
const NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES = 120
const NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES = 24

type NotebookSearchMemoryRetentionMeta = {
  audits_before?: number
  audits_after?: number
  audits_dropped?: number
  saved_searches_before?: number
  saved_searches_after?: number
  saved_searches_dropped?: number
  jurisprudence_semantic_before?: number
  jurisprudence_semantic_after?: number
  jurisprudence_semantic_dropped?: number
  audit_ttl_days: number
  max_audits: number
  max_saved_searches: number
  max_jurisprudence_semantic_entries?: number
  applied_at: string
}

type NotebookSearchMemoryData = {
  research_audits?: NotebookResearchAuditEntry[]
  saved_searches?: NotebookSavedSearchEntry[]
  jurisprudence_semantic_memory?: NotebookJurisprudenceSemanticMemoryEntry[]
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
  return doc(db, ...buildNotebookSearchMemoryDocPath(uid, notebookId))
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function getSavedSearchSortMs(item: NotebookSavedSearchEntry): number {
  return parseIsoMs(item.updated_at) ?? parseIsoMs(item.created_at) ?? 0
}

function getJurisprudenceSemanticMemorySortMs(item: NotebookJurisprudenceSemanticMemoryEntry): number {
  return parseIsoMs(item.updated_at) ?? parseIsoMs(item.created_at) ?? 0
}

function applyNotebookSearchMemoryRetention(
  payload: Partial<NotebookSearchMemoryData>,
): {
  sanitized: Partial<NotebookSearchMemoryData>
  droppedAudits: number
  droppedSavedSearches: number
  droppedSemanticEntries: number
} {
  const nowIso = new Date().toISOString()
  const next: Partial<NotebookSearchMemoryData> = { ...payload }
  let droppedAudits = 0
  let droppedSavedSearches = 0
  let droppedSemanticEntries = 0

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
        max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
        applied_at: nowIso,
      }),
      audits_before: sortedAudits.length,
      audits_after: retainedAudits.length,
      audits_dropped: droppedAudits,
      audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
      max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
      max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
      max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
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
        max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
        applied_at: nowIso,
      }),
      saved_searches_before: sortedSaved.length,
      saved_searches_after: retainedSaved.length,
      saved_searches_dropped: droppedSavedSearches,
      audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
      max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
      max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
      max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
      applied_at: nowIso,
    }
  }

  if (payload.jurisprudence_semantic_memory !== undefined) {
    const sortedSemanticEntries = [...payload.jurisprudence_semantic_memory]
      .filter(entry => Array.isArray(entry.query_embedding) && entry.query_embedding.length > 0 && Boolean(entry.source_id?.trim()) && Boolean(entry.query?.trim()))
      .sort((a, b) => getJurisprudenceSemanticMemorySortMs(b) - getJurisprudenceSemanticMemorySortMs(a))

    const retainedSemanticEntries = sortedSemanticEntries.slice(0, NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES)
    droppedSemanticEntries = Math.max(sortedSemanticEntries.length - retainedSemanticEntries.length, 0)
    next.jurisprudence_semantic_memory = retainedSemanticEntries

    next.retention = {
      ...(next.retention || {
        audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
        max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
        max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
        max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
        applied_at: nowIso,
      }),
      jurisprudence_semantic_before: sortedSemanticEntries.length,
      jurisprudence_semantic_after: retainedSemanticEntries.length,
      jurisprudence_semantic_dropped: droppedSemanticEntries,
      audit_ttl_days: NOTEBOOK_SEARCH_MEMORY_AUDIT_TTL_DAYS,
      max_audits: NOTEBOOK_SEARCH_MEMORY_MAX_AUDITS,
      max_saved_searches: NOTEBOOK_SEARCH_MEMORY_MAX_SAVED_SEARCHES,
      max_jurisprudence_semantic_entries: NOTEBOOK_SEARCH_MEMORY_MAX_JURISPRUDENCE_SEMANTIC_ENTRIES,
      applied_at: nowIso,
    }
  }

  return { sanitized: next, droppedAudits, droppedSavedSearches, droppedSemanticEntries }
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
  const { sanitized, droppedAudits, droppedSavedSearches, droppedSemanticEntries } = applyNotebookSearchMemoryRetention(payload)
  await withFirestoreRetry(
    () => setDoc(ref, stripUndefined({ ...sanitized, updated_at: new Date().toISOString() }), { merge: true }),
    'saveNotebookSearchMemory',
  )
  if (droppedAudits > 0 || droppedSavedSearches > 0 || droppedSemanticEntries > 0) {
    console.info(
      `[Lexio] saveNotebookSearchMemory: retention applied for notebook ${normalizeFirestoreDocumentId(notebookId)} ` +
      `(audits dropped: ${droppedAudits}, saved searches dropped: ${droppedSavedSearches}, semantic entries dropped: ${droppedSemanticEntries}).`,
    )
  }
}

/**
 * Get a single research notebook by ID.
 */
export async function getResearchNotebook(uid: string, notebookId: string): Promise<ResearchNotebookData | null> {
  const db = ensureFirestore()
  const effectiveUid = await resolveEffectiveUid(uid, 'getResearchNotebook')
  const ref = doc(db, ...buildResearchNotebookDocPath(effectiveUid, notebookId))
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
        jurisprudence_semantic_memory: memory.jurisprudence_semantic_memory ?? notebook.jurisprudence_semantic_memory,
      }
    }

    // Opportunistic backfill: first read migrates existing in-doc arrays into
    // dedicated notebook memory storage without changing current API contracts.
    if ((notebook.research_audits && notebook.research_audits.length > 0)
      || (notebook.saved_searches && notebook.saved_searches.length > 0)
      || (notebook.jurisprudence_semantic_memory && notebook.jurisprudence_semantic_memory.length > 0)) {
      await saveNotebookSearchMemory(effectiveUid, snap.id, {
        research_audits: notebook.research_audits ?? [],
        saved_searches: notebook.saved_searches ?? [],
        jurisprudence_semantic_memory: notebook.jurisprudence_semantic_memory ?? [],
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
    jurisprudence_semantic_memory: data.jurisprudence_semantic_memory ?? [],
    status: data.status ?? 'active',
    llm_executions: data.llm_executions ?? [],
    created_at: now,
    updated_at: now,
  })
  const otherBytes = estimateJsonBytes(baseMeta)
  const { sources } = fitSourcesToFirestoreLimit(data.sources ?? [], otherBytes)

  const sanitized = { ...baseMeta, sources }
  const docRef = await withFirestoreRetry(
    () => addDoc(collection(db, 'users', effectiveUid, 'research_notebooks'), sanitized),
    'createResearchNotebook.write',
  )

  try {
    await saveNotebookSearchMemory(effectiveUid, docRef.id, {
      research_audits: sanitized.research_audits,
      saved_searches: sanitized.saved_searches,
      jurisprudence_semantic_memory: sanitized.jurisprudence_semantic_memory,
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
  const ref = doc(db, ...buildResearchNotebookDocPath(effectiveUid, notebookId))
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = data
  const shouldSyncSearchMemory = rest.research_audits !== undefined || rest.saved_searches !== undefined || rest.jurisprudence_semantic_memory !== undefined
  const rootPayload = shouldSyncSearchMemory
    ? {
        ...rest,
        ...(rest.research_audits !== undefined ? { research_audits: [] as NotebookResearchAuditEntry[] } : {}),
        ...(rest.saved_searches !== undefined ? { saved_searches: [] as NotebookSavedSearchEntry[] } : {}),
        ...(rest.jurisprudence_semantic_memory !== undefined ? { jurisprudence_semantic_memory: [] as NotebookJurisprudenceSemanticMemoryEntry[] } : {}),
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
        ...(rest.jurisprudence_semantic_memory !== undefined ? { jurisprudence_semantic_memory: rest.jurisprudence_semantic_memory } : {}),
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
  await withFirestoreRetry(
    () => deleteDoc(doc(db, 'users', effectiveUid, 'research_notebooks', normalizedNotebookId)),
    'deleteResearchNotebook',
  )
  try {
    await withFirestoreRetry(
      () => deleteDoc(getNotebookSearchMemoryDocRef(effectiveUid, normalizedNotebookId)),
      'deleteResearchNotebook.memory',
    )
  } catch {
    // Ignore missing/forbidden dedicated memory doc; notebook deletion is the source of truth.
  }
}

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
