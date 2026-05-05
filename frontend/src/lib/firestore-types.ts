/**
 * Firestore data types — all type/interface definitions used by the Firestore
 * data layer and consumed throughout the application.
 */
import type { CostBreakdownItem, UsageExecutionRecord, UsageSummary } from './cost-analytics'
import type { ModelOption } from './model-config'

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

// ── Fallback Priorities ──────────────────────────────────────────────────────

/**
 * Ordered list of user-chosen fallback models for a given agent category.
 * Each slot is an optional model ID (empty string means "no model picked at
 * this priority"). The list is consulted in order: priority 0 first, then
 * priority 1, then priority 2. The currently failing model is automatically
 * skipped, so the user can safely list it among the priorities without losing
 * a slot.
 */
export type FallbackPriorityList = [string, string, string]

/**
 * User-defined fallback priorities for every agent category. Categories match
 * `AgentCategory` from `model-config`: extraction, synthesis, reasoning,
 * writing.
 */
export interface FallbackPriorityConfig {
  extraction?: FallbackPriorityList
  synthesis?: FallbackPriorityList
  reasoning?: FallbackPriorityList
  writing?: FallbackPriorityList
}

/**
 * Per-provider settings (multi-provider support).
 *
 * Each entry describes whether the user has enabled a provider, plus optional
 * provider-specific overrides like custom base URLs (Ollama / self-hosted) and
 * the persisted catalog of models the user added from that provider.
 */
export interface ProviderSettingEntry {
  enabled: boolean
  /** Override base URL for self-hosted gateways (Ollama, OpenAI-compatible proxies). */
  base_url?: string
  /** Persisted models the user picked from the provider's own catalog. */
  saved_models?: ModelOption[]
  /** Last time the model list was refreshed from the provider. */
  last_synced_at?: string
}

export type ProviderSettingsMap = Record<string, ProviderSettingEntry>

export interface UserSettingsData {
  legacy_migrated_at?: string
  api_keys?: Record<string, string>
  /** User-scoped runtime overrides for canary/frontend feature flags. */
  feature_flags?: Record<string, boolean>
  /**
   * Multi-provider configuration. Holds enabled state + per-provider catalog
   * for Anthropic, OpenAI, DeepSeek, Kimi, Qwen, ElevenLabs, Groq, Ollama and
   * any other provider declared in `lib/providers.ts`. Absent means the user
   * has only OpenRouter configured (legacy default).
   */
  provider_settings?: ProviderSettingsMap
  last_jurisprudence_tribunal_aliases?: string[]
  model_catalog?: ModelOption[]
  agent_models?: Record<string, string>
  thesis_analyst_models?: Record<string, string>
  context_detail_models?: Record<string, string>
  acervo_classificador_models?: Record<string, string>
  acervo_ementa_models?: Record<string, string>
  research_notebook_models?: Record<string, string>
  notebook_acervo_models?: Record<string, string>
  video_pipeline_models?: Record<string, string>
  audio_pipeline_models?: Record<string, string>
  presentation_pipeline_models?: Record<string, string>
  document_v3_models?: Record<string, string>
  chat_orchestrator_models?: Record<string, string>
  /** Default effort level used by the Chat orchestrator when the user opens a new conversation. */
  chat_effort_default?: ChatEffortLevel
  /** Timestamp of the last successful pairing handshake with the @lexio/desktop sidecar (no token persisted). */
  chat_sidecar_paired_at?: string
  /**
   * User-defined fallback model priorities per agent category.
   * When a primary model fails (transient/upstream error or unavailable),
   * the system walks this list in order and tries the next user-chosen
   * model. The platform never falls back to a model the user did not
   * explicitly select.
   */
  fallback_priorities?: FallbackPriorityConfig
  document_types?: AdminDocumentType[]
  legal_areas?: AdminLegalArea[]
  /** Active platform skin/theme ID */
  platform_skin?: string
  /** Preferred currency for UI values and reports. */
  currency_preference?: 'BRL' | 'USD' | 'EUR'
  /** Preferred locale for date/number rendering. */
  locale_preference?: 'pt-BR' | 'en-US' | 'es-ES'
  /** Preferred date format shown across workspace surfaces. */
  date_format_preference?: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'
  /** Number notation preference for large numeric values. */
  compact_numbers?: boolean
  classification_tipos?: Record<string, Record<string, string[]>>
  platform_admin_alert_thresholds?: PlatformAdminAlertThresholds
  platform_admin_alert_profile?: PlatformAdminAlertProfile
  platform_admin_alert_recommendation_policy?: PlatformAdminAlertRecommendationPolicy
  platform_admin_alert_recommendation_history?: PlatformAdminAlertRecommendationHistoryEntry[]
  token_budget?: TokenBudgetConfig
}

/** Token/cost budget configuration for spending controls */
export interface TokenBudgetConfig {
  /** Monthly spending limit in USD (0 = unlimited) */
  monthly_limit_usd?: number
  /** Daily spending limit in USD (0 = unlimited) */
  daily_limit_usd?: number
  /** Per-pipeline spending limit in USD (0 = unlimited) */
  per_pipeline_limit_usd?: number
  /** Warning threshold as percentage of limit (0-100, default 80) */
  warning_threshold_pct?: number
  /** Whether to hard-block calls when budget is exceeded */
  hard_block?: boolean
  /** Whether budget alerts are enabled */
  alerts_enabled?: boolean
}

export type PlatformAdminAlertProfile = 'conservative' | 'balanced' | 'aggressive' | 'custom'

export interface PlatformAdminAlertThresholds {
  memory_discard_total_7d_critical?: number
  memory_discard_trend_multiplier_warning?: number
  memory_coverage_warning_min?: number
  memory_no_updates_days_info?: number
}

export interface PlatformAdminAlertRecommendationPolicy {
  recommendation_window_days?: number
  rollout_mode?: 'manual' | 'assisted'
}

export interface PlatformAdminAlertRecommendationHistoryEntry {
  id: string
  created_at: string
  action: 'recommendation_applied' | 'thresholds_saved'
  rollout_mode: 'manual' | 'assisted'
  recommendation_window_days: number
  scale_profile: 'small' | 'medium' | 'large'
  recommended_thresholds?: PlatformAdminAlertThresholds
  applied_thresholds: PlatformAdminAlertThresholds
  impact_current?: {
    critical?: number
    warning?: number
    info?: number
  }
  impact_projected?: {
    critical?: number
    warning?: number
    info?: number
  }
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
  pipeline_meta?: {
    pipeline_version?: string
    phase_durations_ms?: Record<string, number>
    total_agent_duration_ms?: number
    wall_clock_ms?: number
    parallel_savings_ms?: number
    parallel_limit?: number
    compilador_parallel_limit?: number
    runtime_profile?: string | null
    runtime_hints?: string | null
    runtime_cap?: number
    runtime_detail?: string | null
    compilador_runtime_detail?: string | null
    runtime_diagnostics?: Record<string, unknown>
  }
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
  /** JSON-serialised DataJudResult[] (top-10); stored only for jurisprudencia sources.
   *  Dropped by fitSourcesToFirestoreLimit when the notebook approaches the 1 MiB limit. */
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

export interface NotebookResearchAuditEntry {
  variant: 'external' | 'deep' | 'jurisprudencia'
  mode: 'preview' | 'executed'
  query: string
  queryChars: number
  tribunalCount?: number
  tribunalAliases?: string[]
  resultCount?: number
  selectedCount?: number
  extractedCount?: number
  compiledChars?: number
  usedSnippetFallback?: boolean
  legalArea?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  graus?: string[]
  maxPerTribunal?: number
  dateRangeLabel?: string | null
  sourceKindLabel?: string
  totalContextChars: number
  created_at: string
}

export interface NotebookSavedSearchEntry extends Omit<NotebookResearchAuditEntry, 'created_at'> {
  id: string
  title: string
  pinned?: boolean
  tags?: string[]
  created_at: string
  updated_at: string
}

export interface NotebookJurisprudenceSemanticMemoryEntry {
  source_id: string
  query: string
  legal_area?: string | null
  tribunal_aliases?: string[]
  query_embedding: number[]
  embedding_model: string
  result_count?: number
  created_at: string
  updated_at: string
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
  | 'video_production'
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
  research_audits?: NotebookResearchAuditEntry[]
  saved_searches?: NotebookSavedSearchEntry[]
  jurisprudence_semantic_memory?: NotebookJurisprudenceSemanticMemoryEntry[]
  status: 'active' | 'archived'
  created_at: string
  updated_at?: string
  llm_executions?: UsageExecutionRecord[]
  usage_summary?: UsageSummary
}

// ── Chat Sidecar / External Workspace Sync ──────────────────────────────────

export type ChatSidecarProvider = 'local_folder' | 'github' | 'dropbox' | 'google_drive' | 'gmail' | 'onedrive' | 'whatsapp' | 'discord' | 'telegram' | 'custom'
export type ChatSidecarPermission = 'read' | 'write' | 'delete' | 'rename' | 'execute' | 'network'
export type ChatSidecarApprovalPolicy = 'always' | 'per_command' | 'batch' | 'trusted_readonly'
export type ChatSidecarDeviceStatus = 'online' | 'offline' | 'revoked'

export interface ChatSidecarDeviceData {
  id?: string
  label: string
  device_fingerprint: string
  status: ChatSidecarDeviceStatus
  capabilities: ChatSidecarPermission[]
  app_version?: string
  platform?: string
  paired_at: string
  last_seen_at?: string
  revoked_at?: string
}

export interface ChatWorkspaceRootData {
  id?: string
  provider: ChatSidecarProvider
  label: string
  device_id?: string
  display_path?: string
  remote_url?: string
  external_account_label?: string
  permissions: ChatSidecarPermission[]
  approval_policy: ChatSidecarApprovalPolicy
  allowed_globs?: string[]
  blocked_globs?: string[]
  max_file_bytes?: number
  sync_enabled: boolean
  last_sync_at?: string
  created_at: string
  updated_at: string
  revoked_at?: string
}

export interface ChatWorkspaceBindingData {
  id?: string
  conversation_id: string
  root_id: string
  provider: ChatSidecarProvider
  label: string
  permissions: ChatSidecarPermission[]
  approval_policy: ChatSidecarApprovalPolicy
  created_at: string
  updated_at: string
  disabled_at?: string
}

export type ChatSidecarCommandStatus = 'queued' | 'waiting_approval' | 'approved' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ChatSidecarCommandOperation = 'list' | 'read' | 'write' | 'patch' | 'rename' | 'delete' | 'move' | 'git_status' | 'git_diff' | 'git_commit' | 'git_pull' | 'git_push' | 'sync_pull' | 'sync_push' | 'shell'

export interface ChatSidecarCommandData {
  id?: string
  conversation_id: string
  turn_id?: string
  root_id: string
  operation: ChatSidecarCommandOperation
  status: ChatSidecarCommandStatus
  path?: string
  target_path?: string
  args?: Record<string, unknown>
  diff_preview?: string
  risk_level?: 'low' | 'medium' | 'high'
  approval_id?: string
  result_summary?: string
  error_message?: string
  created_at: string
  updated_at: string
  completed_at?: string
}

export type ChatApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'

export interface ChatApprovalRequestData {
  id?: string
  conversation_id: string
  command_ids: string[]
  status: ChatApprovalStatus
  title: string
  summary: string
  risk_level: 'low' | 'medium' | 'high'
  requested_permissions: ChatSidecarPermission[]
  expires_at?: string
  decided_at?: string
  decided_by?: string
  created_at: string
  updated_at: string
}

export interface ChatSidecarAuditEntryData {
  id?: string
  conversation_id: string
  command_id?: string
  approval_id?: string
  root_id?: string
  operation: string
  actor: 'user' | 'orchestrator' | 'sidecar' | 'connector'
  status: 'proposed' | 'approved' | 'executed' | 'rejected' | 'failed'
  resource_path?: string
  content_hash_before?: string
  content_hash_after?: string
  message?: string
  created_at: string
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

export interface PlatformAggregateRow {
  key: string
  label: string
  count: number
}

export interface PlatformUsageRow extends CostBreakdownItem {
  count: number
}

export interface PlatformOverviewData {
  total_users: number
  admin_users: number
  standard_users: number
  new_users_30d: number
  active_users_30d: number
  total_documents: number
  completed_documents: number
  processing_documents: number
  pending_review_documents: number
  average_quality_score: number | null
  total_theses: number
  total_acervo_documents: number
  total_notebooks: number
  notebooks_with_dedicated_search_memory: number
  total_notebook_search_memory_docs: number
  total_search_memory_audits: number
  total_search_memory_saved_searches: number
  total_search_memory_audits_dropped: number
  total_search_memory_saved_searches_dropped: number
  total_artifacts: number
  total_sources: number
  total_thesis_sessions: number
  total_cost_usd: number
  total_tokens: number
  total_calls: number
  documents_by_status: PlatformAggregateRow[]
  documents_by_origin: PlatformAggregateRow[]
  documents_by_type: PlatformAggregateRow[]
  artifacts_by_type: PlatformAggregateRow[]
  functions_by_usage: PlatformUsageRow[]
  top_models: PlatformUsageRow[]
  top_agents: PlatformUsageRow[]
  top_providers: PlatformUsageRow[]
  operational_warnings?: string[]
}

export interface PlatformDailyUsagePoint {
  dia: string
  usuarios_ativos: number
  novos_usuarios: number
  documentos: number
  cadernos: number
  uploads_acervo: number
  sessoes_teses: number
  memoria_busca_atualizacoes: number
  memoria_busca_descartes: number
  chamadas_llm: number
  tokens: number
  custo_usd: number
}

export interface PlatformExecutionStateDailyRow {
  key: string
  label: string
  calls: number
  cost_usd: number
  avg_duration_ms: number
  call_share: number
  cost_share: number
  retry_rate: number
  fallback_rate: number
}

export interface PlatformExecutionStateDailyPoint {
  dia: string
  total_calls: number
  total_cost_usd: number
  states: PlatformExecutionStateDailyRow[]
}

export interface PlatformExecutionStateWindowComparisonRow {
  key: string
  label: string
  current_calls: number
  previous_calls: number
  current_cost_usd: number
  previous_cost_usd: number
  current_avg_duration_ms: number
  previous_avg_duration_ms: number
  current_retry_rate: number
  previous_retry_rate: number
  current_fallback_rate: number
  previous_fallback_rate: number
  calls_delta_pct: number
  cost_delta_pct: number
  duration_delta_pct: number
}

export interface PlatformFunctionWindowComparisonRow {
  key: string
  label: string
  current_calls: number
  previous_calls: number
  current_cost_usd: number
  previous_cost_usd: number
  current_avg_duration_ms: number
  previous_avg_duration_ms: number
  current_retry_rate: number
  previous_retry_rate: number
  current_fallback_rate: number
  previous_fallback_rate: number
  current_waiting_io_rate: number
  previous_waiting_io_rate: number
  calls_delta_pct: number
  cost_delta_pct: number
  duration_delta_pct: number
}

export type PlatformFunctionCalibrationAction = 'tighten' | 'maintain' | 'relax'

export type PlatformFunctionCalibrationPriority = 'critical' | 'warning' | 'info'

export type PlatformFunctionTargetAdherenceStatus = 'above_target' | 'aligned' | 'below_target'

export type PlatformFunctionRolloutRecommendation = 'tighten_now' | 'tighten_guarded' | 'hold' | 'relax_guarded'

export type PlatformFunctionRolloutRiskLevel = 'critical' | 'warning' | 'stable'

export type PlatformFunctionRolloutConfidenceBand = 'low' | 'medium' | 'high'

export interface PlatformFunctionCalibrationRow {
  key: string
  label: string
  current_calls: number
  current_retry_rate: number
  current_fallback_rate: number
  current_waiting_io_rate: number
  target_retry_rate: number
  target_fallback_rate: number
  target_waiting_io_rate: number
  retry_gap: number
  fallback_gap: number
  waiting_io_gap: number
  calls_delta_pct: number
  duration_delta_pct: number
  cost_delta_pct: number
  risk_score: number
  action: PlatformFunctionCalibrationAction
  priority: PlatformFunctionCalibrationPriority
}

export interface PlatformFunctionTargetAdherenceRow {
  key: string
  label: string
  calls: number
  live_retry_rate: number
  target_retry_rate: number
  live_fallback_rate: number
  target_fallback_rate: number
  live_waiting_io_rate: number
  target_waiting_io_rate: number
  live_pressure: number
  target_pressure: number
  pressure_gap: number
  action: PlatformFunctionCalibrationAction
  priority: PlatformFunctionCalibrationPriority
  status: PlatformFunctionTargetAdherenceStatus
}

export interface PlatformFunctionTargetAdherenceDailyPoint {
  dia: string
  total_functions_observed: number
  total_functions_with_target: number
  coverage_rate: number
  above_target: number
  aligned: number
  below_target: number
  rows: PlatformFunctionTargetAdherenceRow[]
}

export interface PlatformFunctionRolloutGuardrails {
  max_tighten_delta: number
  max_relax_delta: number
  require_stable_days_for_relax: number
  require_above_days_for_tighten: number
}

export interface PlatformFunctionRolloutPolicyRow {
  key: string
  label: string
  priority: PlatformFunctionCalibrationPriority
  latest_status: PlatformFunctionTargetAdherenceStatus
  observed_days: number
  expected_days: number
  recent_calls: number
  confidence_score: number
  confidence_band: PlatformFunctionRolloutConfidenceBand
  latest_pressure_gap: number
  trend_pressure_gap: number
  latest_retry_waiting_sum: number
  trend_retry_waiting_sum: number
  predictive_pressure_threshold: number
  predictive_retry_waiting_threshold: number
  is_predictive_alert: boolean
  above_target_streak: number
  stable_streak: number
  risk_level: PlatformFunctionRolloutRiskLevel
  recommendation: PlatformFunctionRolloutRecommendation
  guardrails: PlatformFunctionRolloutGuardrails
  rationale: string
}

export interface PlatformFunctionRolloutPolicyPlan {
  days: number
  calibration_window_days: number
  total_functions_observed: number
  total_functions_with_target: number
  coverage_rate: number
  critical_count: number
  warning_count: number
  stable_count: number
  low_confidence_count: number
  medium_confidence_count: number
  high_confidence_count: number
  predictive_alert_count: number
  tighten_now_count: number
  tighten_guarded_count: number
  hold_count: number
  relax_guarded_count: number
  rows: PlatformFunctionRolloutPolicyRow[]
}

// ── Chat Orchestrator (page `/chat`) ─────────────────────────────────────────

/**
 * Effort knob exposed to the user in the chat header. Maps to numerical
 * presets (max iterations, fan-out, token budget) inside the orchestrator
 * runtime; the value persisted on the conversation is the raw label.
 */
export type ChatEffortLevel = 'rapido' | 'medio' | 'profundo' | 'deep_research'

/**
 * Discriminated trail event emitted by the orchestrator while a turn is
 * running. UI cards render each variant inline in the conversation stream
 * (see PR3). Persisted as part of `ChatTurn.trail`.
 */
export type ChatTrailEvent =
  | { type: 'iteration_start'; i: number; ts: string; elapsed_ms?: number; budget_used_ratio?: number }
  | {
      type: 'orchestrator_thought'
      /** Partial / cumulative raw output from the orchestrator LLM as it streams. */
      delta: string
      /** Full accumulated text so far for this decision. */
      total: string
      ts: string
    }
  | { type: 'decision'; tool: string; rationale?: string; ts: string }
  | { type: 'agent_call'; agent_key: string; task: string; ts: string }
  | {
      type: 'agent_response'
      agent_key: string
      output: string
      usage?: UsageExecutionRecord
      ts: string
    }
  | {
      type: 'parallel_agents'
      calls: Array<{ agent_key: string; task: string }>
      ts: string
    }
  | {
      type: 'super_skill_call'
      skill: string
      args_summary?: string
      result_summary?: string
      usage?: UsageExecutionRecord[]
      ts: string
    }
  | { type: 'fs_action'; op: string; path: string; result?: string; ts: string }
  | {
      type: 'shell_action'
      cmd: string
      exit_code: number
      stdout_tail?: string
      stderr_tail?: string
      duration_ms?: number
      ts: string
    }
  | {
      type: 'critic'
      score: number
      reasons: string[]
      should_stop: boolean
      ts: string
    }
  | {
      type: 'clarification_request'
      question: string
      options?: string[]
      ts: string
    }
  | {
      type: 'agent_token'
      agent_key: string
      delta: string
      total: string
      ts: string
    }
  | { type: 'final_answer'; ts: string; elapsed_ms?: number; iterations?: number; budget_used_ratio?: number }
  | { type: 'budget_hit'; reason: string; ts: string; elapsed_ms?: number }
  | { type: 'error'; message: string; ts: string }

/** Lifecycle status of a single turn (one user input + assistant response). */
export type ChatTurnStatus =
  | 'running'
  | 'awaiting_user'
  | 'done'
  | 'error'
  | 'cancelled'

/**
 * Chat conversation document.
 * Path: `/users/{uid}/chat_conversations/{conversationId}`.
 * Turns live in the `turns` subcollection; the conversation document only
 * stores metadata (title, effort knob, last preview).
 */
export interface ChatConversationData {
  id?: string
  title: string
  effort: ChatEffortLevel
  /** Display-only path the sidecar is rooted at, set when the user pairs the helper. */
  sidecar_root_path?: string
  /** Short preview of the latest assistant answer (used in the sidebar list). */
  last_preview?: string
  created_at: string
  updated_at: string
}

/**
 * Single turn inside a conversation.
 * Path: `/users/{uid}/chat_conversations/{conversationId}/turns/{turnId}`.
 * `trail` accumulates orchestration events as the turn progresses; the final
 * markdown lands in `assistant_markdown` once the orchestrator emits
 * `submit_final_answer` (or hits a hard stop).
 */
export interface ChatTurnData {
  id?: string
  conversation_id: string
  user_input: string
  trail: ChatTrailEvent[]
  assistant_markdown: string | null
  status: ChatTurnStatus
  /** Pending question raised by the orchestrator while waiting for user input. */
  pending_question?: { text: string; options?: string[] } | null
  usage_summary?: Partial<UsageSummary>
  /** Detailed per-call execution records (mirrors `documents/{id}.llm_executions`). */
  llm_executions?: UsageExecutionRecord[]
  created_at: string
  completed_at?: string
}
