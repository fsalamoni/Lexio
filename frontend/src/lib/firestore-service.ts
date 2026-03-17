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
  collection, getDocs, addDoc, query, orderBy, limit, where,
  serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore'
import { firestore, IS_FIREBASE } from './firebase'
import {
  buildCostBreakdown,
  buildUsageSummary,
  extractDocumentUsageExecutions,
  extractThesisSessionExecutions,
  type CostBreakdown,
  type UsageExecutionRecord,
  type UsageSummary,
} from './cost-analytics'

// ── Type definitions ──────────────────────────────────────────────────────────

export interface ProfileData {
  institution?: string
  position?: string
  jurisdiction?: string
  experience_years?: number | null
  primary_areas?: string[]
  specializations?: string[]
  formality_level?: string
  connective_style?: string
  citation_style?: string
  preferred_expressions?: string[]
  avoided_expressions?: string[]
  paragraph_length?: string
  default_document_type?: string
  default_template?: string
  signature_block?: string
  header_text?: string
  preferred_model?: string
  detail_level?: string
  argument_depth?: string
  include_opposing_view?: boolean
  onboarding_completed?: boolean
}

export interface DocumentData {
  id?: string
  document_type_id: string
  original_request: string
  template_variant?: string | null
  legal_area_ids?: string[] | null
  request_context?: Record<string, unknown> | null
  tema?: string | null
  status: string
  quality_score?: number | null
  texto_completo?: string | null
  created_at: string
  updated_at?: string
  origem?: string
  llm_tokens_in?: number
  llm_tokens_out?: number
  llm_cost_usd?: number
  llm_executions?: UsageExecutionRecord[]
  usage_summary?: UsageSummary
}

export interface ThesisData {
  id?: string
  title: string
  content: string
  summary?: string | null
  legal_area_id: string
  document_type_id?: string | null
  tags?: string[] | null
  category?: string | null
  quality_score?: number | null
  usage_count: number
  source_type: string
  created_at: string
  updated_at?: string
}

export interface AcervoDocumentData {
  id?: string
  filename: string
  content_type: string
  size_bytes: number
  text_content: string
  chunks_count: number
  status: 'indexed' | 'index_empty' | 'index_error'
  created_at: string
  /** Whether this document has been included in a thesis bank analysis run. */
  analyzed_for_theses?: boolean
}

// ── Thesis Analysis Sessions ──────────────────────────────────────────────────

export interface ThesisAnalysisSessionData {
  id?: string
  created_at: string
  total_theses_analyzed: number
  total_docs_analyzed: number
  total_new_docs: number
  suggestions_count: number
  accepted_count: number
  rejected_count: number
  /** Snapshot: summary text produced by the Revisor agent. */
  executive_summary: string
  status: 'completed' | 'partially_applied'
  usage_summary?: UsageSummary
  llm_executions?: UsageExecutionRecord[]
}

export interface WizardData {
  onboarding_completed: boolean
  profile: ProfileData
  onboarding_steps: WizardStep[]
}

export interface WizardStep {
  step: number
  title: string
  description: string
  fields: WizardField[]
}

export interface WizardField {
  key: string
  label: string
  type: string
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string }[]
  default?: unknown
}

// ── Guard ────────────────────────────────────────────────────────────────────

function ensureFirestore() {
  if (!IS_FIREBASE || !firestore) {
    throw new Error('Firestore não está configurado')
  }
  return firestore
}

function round6(value: number) {
  return Number(value.toFixed(6))
}

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
      const limitedItems = opts?.limit ? filteredItems.slice(0, opts.limit) : filteredItems
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
  await updateDoc(ref, { ...data, updated_at: serverTimestamp() })
}

export async function deleteDocument(uid: string, docId: string): Promise<void> {
  const db = ensureFirestore()
  const ref = doc(db, 'users', uid, 'documents', docId)
  await deleteDoc(ref)
}

// ── Stats (computed from Firestore data) ─────────────────────────────────────

export async function getStats(uid: string) {
  const [{ items }, sessions] = await Promise.all([
    listDocuments(uid),
    listThesisAnalysisSessions(uid).catch(() => []),
  ])
  const total_documents = items.length
  const completed_documents = items.filter(d => d.status === 'concluido' || d.status === 'aprovado').length
  const processing_documents = items.filter(d => d.status === 'processando').length
  const pending_review_documents = items.filter(d => d.status === 'em_revisao' || d.status === 'rascunho').length
  const scores = items.map(d => d.quality_score).filter((s): s is number => s != null)
  const average_quality_score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  const costs = items.map(d => d.llm_cost_usd).filter((c): c is number => typeof c === 'number' && c > 0)
  const analysisCosts = sessions
    .map(session => buildUsageSummary(extractThesisSessionExecutions(session)).total_cost_usd)
    .filter(cost => cost > 0)
  const total_cost_usd = round6(costs.reduce((a, b) => a + b, 0))
  const total_analysis_cost_usd = round6(analysisCosts.reduce((a, b) => a + b, 0))

  return {
    total_documents,
    completed_documents,
    processing_documents,
    pending_review_documents,
    average_quality_score,
    total_cost_usd: round6(total_cost_usd + total_analysis_cost_usd),
    average_duration_ms: null,
  }
}

/** Compute daily document counts from real Firestore documents for the last N days. */
export async function getDailyStats(uid: string, days = 30) {
  const [{ items }, sessions] = await Promise.all([
    listDocuments(uid),
    listThesisAnalysisSessions(uid).catch(() => []),
  ])
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

  for (const session of sessions) {
    if (!session.created_at) continue
    const day = session.created_at.slice(0, 10)
    if (day >= cutoff) {
      const entry = dayMap.get(day)
      const cost = buildUsageSummary(extractThesisSessionExecutions(session)).total_cost_usd
      if (entry && cost > 0) entry.custo += cost
    }
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
  const [{ items }, sessions] = await Promise.all([
    listDocuments(uid),
    listThesisAnalysisSessions(uid).catch(() => []),
  ])

  const executions = [
    ...items.flatMap(doc => extractDocumentUsageExecutions(doc)),
    ...sessions.flatMap(session => extractThesisSessionExecutions(session)),
  ]

  return buildCostBreakdown(executions)
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
export function getDocumentTypesForProfile(profile: ProfileData | null): typeof DOCUMENT_TYPES {
  if (!profile?.position) return DOCUMENT_TYPES

  const posLower = profile.position.toLowerCase()
  // Sort keywords longest-first so more specific titles match before generic ones
  const sortedEntries = Object.entries(POSITION_DOCTYPE_MAP)
    .sort(([a], [b]) => b.length - a.length)

  for (const [keyword, allowedIds] of sortedEntries) {
    // Use word-boundary regex to avoid partial substring matches
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    if (regex.test(posLower)) {
      const filtered = DOCUMENT_TYPES.filter(dt => allowedIds.includes(dt.id))
      return filtered.length > 0 ? filtered : DOCUMENT_TYPES
    }
  }
  return DOCUMENT_TYPES
}

/**
 * Returns legal areas sorted so the user's primary areas appear first.
 */
export function getLegalAreasForProfile(profile: ProfileData | null): typeof LEGAL_AREAS {
  if (!profile?.primary_areas || profile.primary_areas.length === 0) return LEGAL_AREAS
  const primarySet = new Set(profile.primary_areas)
  const primary = LEGAL_AREAS.filter(a => primarySet.has(a.id))
  const others = LEGAL_AREAS.filter(a => !primarySet.has(a.id))
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
 */
export async function listAcervoDocuments(
  uid: string,
  opts: { limit?: number } = {},
): Promise<{ items: AcervoDocumentData[]; total: number }> {
  const db = ensureFirestore()
  const constraints: QueryConstraint[] = [orderBy('created_at', 'desc')]
  if (opts.limit) constraints.push(limit(opts.limit))
  const snap = await getDocs(query(collection(db, 'users', uid, 'acervo'), ...constraints))
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as AcervoDocumentData))
  return { items, total: items.length }
}

/**
 * Create an acervo document from uploaded file text content.
 *
 * **Dedup rule**: If a document with the same filename already exists,
 * the older version is deleted so the newest upload always wins.
 */
export async function createAcervoDocument(
  uid: string,
  data: { filename: string; content_type: string; size_bytes: number; text_content: string },
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
  const truncated = raw.length > ACERVO_MAX_TEXT_LENGTH
  if (truncated) {
    console.warn(`Acervo document "${data.filename}" truncated from ${raw.length} to ${ACERVO_MAX_TEXT_LENGTH} chars`)
  }
  const text = raw.slice(0, ACERVO_MAX_TEXT_LENGTH)
  const chunks = text.length > 0 ? Math.ceil(text.length / ACERVO_CHUNK_SIZE) : 0
  const acervoDoc: Omit<AcervoDocumentData, 'id'> = {
    filename: data.filename,
    content_type: data.content_type,
    size_bytes: data.size_bytes,
    text_content: text,
    chunks_count: chunks,
    status: text.length > 0 ? 'indexed' : 'index_empty',
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
    const excerpt = data.text_content.slice(0, ACERVO_MAX_EXCERPT_LENGTH)
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

export async function saveSettings(data: Record<string, unknown>): Promise<void> {
  const db = ensureFirestore()
  const ref = doc(db, 'settings', 'platform')
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
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as AcervoDocumentData))
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
  const ref = await addDoc(collection(db, 'users', uid, 'thesis_analysis_sessions'), {
    ...data,
    created_at: data.created_at ?? new Date().toISOString(),
  })
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

// ── Password change via Firebase Auth ────────────────────────────────────────

export { IS_FIREBASE } from './firebase'
