/**
 * Firestore data service — provides CRUD operations when IS_FIREBASE = true.
 *
 * Collections:
 *   /users/{uid}                  — user profile (auth-service already handles basic fields)
 *   /users/{uid}/profile          — anamnesis/professional profile (subcollection with single doc "data")
 *   /users/{uid}/documents/{docId}— user's documents
 *   /users/{uid}/theses/{thesisId}— user's thesis bank
 *   /users/{uid}/acervo/{docId}   — user's reference documents (acervo)
 *   /settings/{key}               — platform settings (admin-only)
 */

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, collectionGroup, getDocs, addDoc, query, orderBy, limit, where,
  serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore'
import { firestore, IS_FIREBASE } from './firebase'
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

type PlatformCollectionsSnapshot = {
  fetchedAt: number
  users: PlatformUserRecord[]
  documents: Array<DocumentData & { _owner_user_id?: string }>
  theses: Array<ThesisData & { _owner_user_id?: string }>
  sessions: Array<ThesisAnalysisSessionData & { _owner_user_id?: string }>
  acervo: Array<AcervoDocumentData & { _owner_user_id?: string }>
  notebooks: Array<ResearchNotebookData & { _owner_user_id?: string }>
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

function getRefUserId(refPath: string): string | null {
  const parts = refPath.split('/')
  if (parts.length >= 2 && parts[0] === 'users') return parts[1]
  return null
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

  const snapshot: PlatformCollectionsSnapshot = {
    fetchedAt: Date.now(),
    users: usersSnap.docs.map(d => ({ ...(d.data() as PlatformUserRecord), id: d.id })),
    documents: documentsSnap.docs.map(d => ({ ...(d.data() as DocumentData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as DocumentData & { _owner_user_id?: string })),
    theses: thesesSnap.docs.map(d => ({ ...(d.data() as ThesisData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as ThesisData & { _owner_user_id?: string })),
    sessions: sessionsSnap.docs.map(d => ({ ...(d.data() as ThesisAnalysisSessionData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as ThesisAnalysisSessionData & { _owner_user_id?: string })),
    acervo: acervoSnap.docs.map(d => ({ ...(d.data() as AcervoDocumentData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as AcervoDocumentData & { _owner_user_id?: string })),
    notebooks: notebooksSnap.docs.map(d => ({ ...(d.data() as ResearchNotebookData), id: d.id, _owner_user_id: getRefUserId(d.ref.path) ?? undefined } as ResearchNotebookData & { _owner_user_id?: string })),
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
  const ref = doc(db, 'users', uid, 'profile', 'data')
  const snap = await getDoc(ref)
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
  const ref = doc(db, 'users', uid, 'documents', docId)
  const snap = await getDoc(ref)
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
  const colRef = collection(db, 'users', uid, 'documents')

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
    const snap = await getDocs(q)
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentData))
    return { items, total: items.length }
  } catch (error) {
    if (!(opts?.status || opts?.document_type_id)) {
      throw error
    }
    try {
      console.warn('Filtered Firestore document query failed; using client-side fallback:', getErrorMessage(error))
      const fallbackSnap = await getDocs(colRef)
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
  await updateDoc(ref, { ...data, updated_at: serverTimestamp() })
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
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'thesis_analysis_sessions'), orderBy('created_at', 'desc')),
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ThesisAnalysisSessionData))
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

export async function getPlatformCostBreakdown(force = false): Promise<CostBreakdown> {
  const snapshot = await loadPlatformCollections(force)
  const executions = [
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

  return buildCostBreakdown(executions)
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

  const executionGroups = [
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

// ── Admin CRUD for Document Types (Firestore /settings/admin_document_types) ─


/** Merge default structures into loaded document types that don't have a custom one. */
function mergeDefaultStructures(items: AdminDocumentType[]): AdminDocumentType[] {
  return items.map(item => {
    if (!item.structure?.trim() && DEFAULT_DOC_STRUCTURES[item.id]) {
      return { ...item, structure: DEFAULT_DOC_STRUCTURES[item.id] }
    }
    return item
  })
}

export async function loadAdminDocumentTypes(): Promise<AdminDocumentType[]> {
  if (!IS_FIREBASE) return mergeDefaultStructures(DOCUMENT_TYPES.map(dt => ({ ...dt, is_enabled: true })))
  try {
    const resolvedUid = getCurrentUserId()
    if (resolvedUid) {
      const userSettings = await ensureUserSettingsMigrated(resolvedUid)
      if (Array.isArray(userSettings.document_types) && userSettings.document_types.length > 0) {
        return mergeDefaultStructures(userSettings.document_types)
      }
    }
  } catch { /* fallback to defaults */ }
  return mergeDefaultStructures(DOCUMENT_TYPES.map(dt => ({ ...dt, is_enabled: true })))
}

export async function saveAdminDocumentTypes(items: AdminDocumentType[]): Promise<void> {
  const resolvedUid = getCurrentUserId()
  if (IS_FIREBASE && resolvedUid) {
    await saveUserSettings(resolvedUid, { document_types: items })
    return
  }
  throw new Error('Usuário não autenticado.')
}

// ── Admin CRUD for Legal Areas (Firestore /settings/admin_legal_areas) ───────

/** Merge default assuntos into loaded legal areas that don't have custom ones. */
function mergeDefaultAssuntos(items: AdminLegalArea[]): AdminLegalArea[] {
  return items.map(item => {
    if (!item.assuntos?.length && DEFAULT_AREA_ASSUNTOS[item.id]) {
      return { ...item, assuntos: DEFAULT_AREA_ASSUNTOS[item.id] }
    }
    return item
  })
}

export async function loadAdminLegalAreas(): Promise<AdminLegalArea[]> {
  if (!IS_FIREBASE) return mergeDefaultAssuntos(LEGAL_AREAS.map(la => ({ ...la, is_enabled: true })))
  try {
    const resolvedUid = getCurrentUserId()
    if (resolvedUid) {
      const userSettings = await ensureUserSettingsMigrated(resolvedUid)
      if (Array.isArray(userSettings.legal_areas) && userSettings.legal_areas.length > 0) {
        return mergeDefaultAssuntos(userSettings.legal_areas)
      }
    }
  } catch { /* fallback to defaults */ }
  return mergeDefaultAssuntos(LEGAL_AREAS.map(la => ({ ...la, is_enabled: true })))
}

export async function saveAdminLegalAreas(items: AdminLegalArea[]): Promise<void> {
  const resolvedUid = getCurrentUserId()
  if (IS_FIREBASE && resolvedUid) {
    await saveUserSettings(resolvedUid, { legal_areas: items })
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
  // Combining where() on one field with orderBy() on a different field requires a composite
  // Firestore index that may not exist. When filtering by area we skip the server-side orderBy
  // and sort client-side instead.
  const constraints: QueryConstraint[] = opts.legalAreaId
    ? [where('legal_area_id', '==', opts.legalAreaId)]
    : [orderBy('created_at', 'desc')]
  if (!opts.legalAreaId && opts.limit) constraints.push(limit(opts.limit + (opts.skip ?? 0)))
  const snap = await getDocs(query(collection(db, 'users', uid, 'theses'), ...constraints))
  let items = snap.docs.map(d => ({ id: d.id, ...d.data() } as ThesisData))
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
  const ref = doc(db, 'users', uid, 'theses', thesisId)
  const updates = { ...data, updated_at: serverTimestamp() }
  delete updates.id
  await updateDoc(ref, updates)
  const snap = await getDoc(ref)
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
  const snap = await getDocs(query(collection(db, 'users', uid, 'theses'), orderBy('created_at', 'desc')))
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as ThesisData))

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

/**
 * List acervo (reference) documents for a user.
 * Transparently resolves structured JSON format to plain text for consumers.
 */
export async function listAcervoDocuments(
  uid: string,
  opts: { limit?: number } = {},
): Promise<{ items: AcervoDocumentData[]; total: number }> {
  const db = ensureFirestore()
  const constraints: QueryConstraint[] = [orderBy('created_at', 'desc')]
  if (opts.limit) constraints.push(limit(opts.limit))
  const snap = await getDocs(query(collection(db, 'users', uid, 'acervo'), ...constraints))
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
  const now = new Date().toISOString()

  // Remove previous versions with the same filename (last upload wins)
  try {
    const existing = await getDocs(
      query(
        collection(db, 'users', uid, 'acervo'),
        where('filename', '==', data.filename),
      ),
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
  const ref = await addDoc(collection(db, 'users', uid, 'acervo'), acervoDoc)
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
  const db = ensureFirestore()
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'acervo'), where('status', '==', 'indexed'), orderBy('created_at', 'desc')),
  )
  return snap.docs
    .map(d => {
      const data = d.data() as AcervoDocumentData
      return {
        id: d.id,
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
  try {
    const existing = await getDoc(doc(db, 'users', uid, 'acervo', docId))
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
  const db = ensureFirestore()
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'acervo'), where('status', '==', 'indexed'), orderBy('created_at', 'desc')),
  )
  return snap.docs
    .map(d => {
      const data = d.data() as AcervoDocumentData
      return { id: d.id, filename: data.filename, text_content: resolveTextContent(data.text_content || ''), tags_generated: data.tags_generated }
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
  const db = ensureFirestore()
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'acervo'), where('status', '==', 'indexed'), orderBy('created_at', 'desc')),
  )
  return snap.docs
    .map(d => {
      const data = d.data() as AcervoDocumentData
      return { id: d.id, filename: data.filename, text_content: resolveTextContent(data.text_content || ''), ementa: data.ementa }
    })
    .filter(d => d.text_content.length > 0 && !d.ementa)
    .map(({ ementa: _, ...rest }) => rest)
}

/**
 * Get text content from all indexed acervo documents (for generation context).
 * Returns concatenated text excerpts up to `maxChars` total characters.
 */
export async function getAcervoContext(uid: string, maxChars = 8000): Promise<string> {
  const db = ensureFirestore()
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'acervo'), where('status', '==', 'indexed'), orderBy('created_at', 'desc')),
  )
  const parts: string[] = []
  let total = 0
  for (const d of snap.docs) {
    const data = d.data() as AcervoDocumentData
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
  const ref = doc(db, 'users', uid, 'settings', 'preferences')
  const snap = await getDoc(ref)
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
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'acervo'), orderBy('created_at', 'desc')),
  )
  const all = snap.docs.map(d => {
    const raw = d.data() as AcervoDocumentData
    return {
      ...raw,
      id: d.id,
      text_content: resolveTextContent(raw.text_content || ''),
    }
  })
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
  const snap = await getDocs(
    query(
      collection(db, 'users', uid, 'thesis_analysis_sessions'),
      orderBy('created_at', 'desc'),
      limit(1),
    ),
  )
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as ThesisAnalysisSessionData
}

// ── Research Notebook (Caderno de Pesquisa) CRUD ──────────────────────────────

/**
 * List all research notebooks for a user, ordered by creation date (newest first).
 */
export async function listResearchNotebooks(uid: string): Promise<{ items: ResearchNotebookData[] }> {
  const db = ensureFirestore()
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'research_notebooks'), orderBy('created_at', 'desc')),
  )
  return { items: snap.docs.map(d => ({ id: d.id, ...d.data() } as ResearchNotebookData)) }
}

// ── Firestore notebook size safety ────────────────────────────────────────────

/**
 * Firestore has a 1 MiB (1,048,576 bytes) document size limit.
 * We target 950 KB to leave headroom for field names & UTF-8 overhead.
 */
const NOTEBOOK_MAX_DOC_BYTES = 950_000
/** Minimum chars preserved per source when trimming to fit Firestore limits */
const MIN_SOURCE_TEXT_CHARS = 100

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

/**
 * Get a single research notebook by ID.
 */
export async function getResearchNotebook(uid: string, notebookId: string): Promise<ResearchNotebookData | null> {
  const db = ensureFirestore()
  const ref = doc(db, 'users', uid, 'research_notebooks', notebookId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as ResearchNotebookData
}

/**
 * Create a new research notebook.
 */
export async function createResearchNotebook(uid: string, data: Omit<ResearchNotebookData, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
  const db = ensureFirestore()
  const now = new Date().toISOString()

  // Build preliminary payload WITHOUT sources to estimate non-source overhead
  const baseMeta = stripUndefined({
    title: data.title,
    topic: data.topic,
    description: data.description ?? '',
    sources: [] as NotebookSource[],
    messages: data.messages ?? [],
    artifacts: data.artifacts ?? [],
    status: data.status ?? 'active',
    llm_executions: data.llm_executions ?? [],
    created_at: now,
    updated_at: now,
  })
  const otherBytes = estimateJsonBytes(baseMeta)
  const { sources } = fitSourcesToFirestoreLimit(data.sources ?? [], otherBytes)

  const sanitized = { ...baseMeta, sources }
  const docRef = await addDoc(collection(db, 'users', uid, 'research_notebooks'), sanitized)
  return docRef.id
}

/**
 * Update an existing research notebook (partial update).
 */
export async function updateResearchNotebook(uid: string, notebookId: string, data: Partial<ResearchNotebookData>): Promise<void> {
  const db = ensureFirestore()
  const ref = doc(db, 'users', uid, 'research_notebooks', notebookId)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = data

  // When the update includes sources, ensure total estimated size is safe.
  // We fetch the current document so we can account for existing fields.
  if (rest.sources) {
    const snap = await getDoc(ref)
    const existing = snap.exists() ? snap.data() : {}
    const merged = { ...existing, ...stripUndefined(rest), updated_at: new Date().toISOString() }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sources: _src, ...mergedMeta } = merged
    const otherBytes = estimateJsonBytes(mergedMeta)
    const { sources } = fitSourcesToFirestoreLimit(rest.sources, otherBytes)
    const sanitized = stripUndefined({ ...rest, sources, updated_at: new Date().toISOString() })
    await updateDoc(ref, sanitized)
  } else {
    const sanitized = stripUndefined({ ...rest, updated_at: new Date().toISOString() })
    await updateDoc(ref, sanitized)
  }
}

/**
 * Delete a research notebook.
 */
export async function deleteResearchNotebook(uid: string, notebookId: string): Promise<void> {
  const db = ensureFirestore()
  await deleteDoc(doc(db, 'users', uid, 'research_notebooks', notebookId))
}

// ── Password change via Firebase Auth ────────────────────────────────────────

export { IS_FIREBASE } from './firebase'
