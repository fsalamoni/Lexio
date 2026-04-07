/**
 * Firestore data types — all type/interface definitions used by the Firestore
 * data layer and consumed throughout the application.
 */
import type { UsageExecutionRecord, UsageSummary } from './cost-analytics'

// ── Profile ──────────────────────────────────────────────────────────────────

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

export interface ContextDetailQuestion {
  id: string
  question: string
  answer: string
}

export interface ContextDetailData {
  analysis_summary: string
  questions: ContextDetailQuestion[]
  llm_execution?: UsageExecutionRecord
}

// ── Documents ────────────────────────────────────────────────────────────────

export interface DocumentData {
  id?: string
  document_type_id: string
  original_request: string
  template_variant?: string | null
  legal_area_ids?: string[] | null
  request_context?: Record<string, unknown> | null
  context_detail?: ContextDetailData | null
  tema?: string | null
  status: string
  quality_score?: number | null
  texto_completo?: string | null
  created_at: string
  updated_at?: string
  /** Origin of the document: 'web' = created via NewDocument page; 'caderno' = generated in Research Notebook studio */
  origem?: 'web' | 'caderno' | string
  /** ID of the Research Notebook that originated this document (when origem = 'caderno') */
  notebook_id?: string | null
  /** Title of the notebook that originated this document */
  notebook_title?: string | null
  llm_tokens_in?: number
  llm_tokens_out?: number
  llm_cost_usd?: number
  llm_executions?: UsageExecutionRecord[]
  usage_summary?: UsageSummary
}

// ── Theses ───────────────────────────────────────────────────────────────────

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

export interface ThesisAnalysisSessionData {
  id?: string
  created_at: string
  total_theses_analyzed: number
  total_docs_analyzed: number
  total_new_docs: number
  suggestions_count: number
  accepted_count: number
  rejected_count: number
  executive_summary: string
  status: 'completed' | 'partially_applied'
  usage_summary?: UsageSummary
  llm_executions?: UsageExecutionRecord[]
}

// ── Acervo ───────────────────────────────────────────────────────────────────

export interface AcervoDocumentData {
  id?: string
  filename: string
  content_type: string
  size_bytes: number
  text_content: string
  chunks_count: number
  status: 'indexed' | 'index_empty' | 'index_error'
  created_at: string
  /**
   * Storage format of `text_content`:
   *  - `'json'` — Structured JSON (v1 schema from document-json-converter)
   *  - `'text'` or `undefined` — Legacy plain text
   */
  storage_format?: 'json' | 'text'
  analyzed_for_theses?: boolean
  ementa?: string
  ementa_keywords?: string[]
  natureza?: 'consultivo' | 'executorio' | 'transacional' | 'negocial' | 'doutrinario' | 'decisorio'
  area_direito?: string[]
  assuntos?: string[]
  tipo_documento?: string
  contexto?: string[]
  tags_generated?: boolean
  llm_executions?: UsageExecutionRecord[]
}

// ── Research Notebook ────────────────────────────────────────────────────────

export type NotebookSourceType = 'acervo' | 'upload' | 'link' | 'external' | 'external_deep' | 'jurisprudencia'

export interface NotebookSource {
  id: string
  type: NotebookSourceType
  name: string
  reference: string
  content_type?: string
  size_bytes?: number
  text_content?: string
  /** JSON-serialized DataJudResult[] — stored when type === 'jurisprudencia' */
  results_raw?: string
  status: 'pending' | 'processing' | 'indexed' | 'error'
  added_at: string
}

export interface NotebookMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  agent?: string
  model?: string
  created_at: string
}

export type StudioArtifactType =
  | 'resumo'
  | 'apresentacao'
  | 'mapa_mental'
  | 'cartoes_didaticos'
  | 'infografico'
  | 'teste'
  | 'relatorio'
  | 'tabela_dados'
  | 'documento'
  | 'audio_script'
  | 'video_script'
  | 'guia_estruturado'
  | 'outro'

export interface StudioArtifact {
  id: string
  type: StudioArtifactType
  title: string
  content: string
  format: 'markdown' | 'json' | 'html'
  created_at: string
}

export interface ResearchNotebookData {
  id?: string
  title: string
  description?: string
  topic: string
  sources: NotebookSource[]
  messages: NotebookMessage[]
  artifacts: StudioArtifact[]
  status: 'active' | 'archived'
  created_at: string
  updated_at?: string
  llm_executions?: UsageExecutionRecord[]
  usage_summary?: UsageSummary
}

// ── Onboarding Wizard ────────────────────────────────────────────────────────

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

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdminDocumentType {
  id: string
  name: string
  description: string
  templates: string[]
  is_enabled: boolean
  structure?: string
}

export interface AdminLegalArea {
  id: string
  name: string
  description: string
  is_enabled: boolean
  assuntos?: string[]
}

export interface AdminClassificationTipos {
  tipos: Record<string, Record<string, string[]>>
}
