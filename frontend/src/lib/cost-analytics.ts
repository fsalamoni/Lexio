import { formatCost } from './currency-utils'
import { DOCTYPE_LABELS } from './constants'
import { PROVIDERS, providerIdFromLabel } from './providers'
import type { PipelineExecutionState } from './pipeline-execution-contract'

export type UsageFunctionKey = 'document_generation' | 'document_generation_v3' | 'thesis_analysis' | 'context_detail' | 'acervo_classificador' | 'acervo_ementa' | 'caderno_pesquisa' | 'notebook_acervo' | 'video_pipeline' | 'audio_pipeline' | 'presentation_pipeline' | 'chat_orchestrator'

export interface UsageExecutionRecord {
  source_type: UsageFunctionKey
  source_id: string
  created_at: string
  function_key: UsageFunctionKey
  function_label: string
  phase: string
  phase_label: string
  agent_name: string
  model: string | null
  model_label: string
  provider_id?: string | null
  provider_label?: string | null
  requested_model?: string | null
  resolved_model?: string | null
  tokens_in: number
  tokens_out: number
  total_tokens: number
  cost_usd: number
  duration_ms: number
  execution_state?: PipelineExecutionState | null
  retry_count?: number | null
  used_fallback?: boolean | null
  fallback_from?: string | null
  runtime_profile?: string | null
  runtime_hints?: string | null
  runtime_concurrency?: number | null
  runtime_cap?: number | null
  document_type_id?: string | null
  document_type_label?: string | null
}

export interface UsageSummary {
  total_cost_usd: number
  total_tokens_in: number
  total_tokens_out: number
  total_tokens: number
  total_calls: number
}

export interface CostBreakdownItem {
  key: string
  label: string
  calls: number
  tokens_in: number
  tokens_out: number
  total_tokens: number
  cost_usd: number
  cost_brl: number
  avg_duration_ms: number | null
}

export interface CostBreakdown extends UsageSummary {
  total_cost_brl: number
  exchange_rate_brl: number
  by_provider: CostBreakdownItem[]
  by_model: CostBreakdownItem[]
  by_function: CostBreakdownItem[]
  by_phase: CostBreakdownItem[]
  by_execution_state?: CostBreakdownItem[]
  by_agent: CostBreakdownItem[]
  by_agent_function: CostBreakdownItem[]
  by_document_type: CostBreakdownItem[]
  /** Per-function model breakdown — keys are UsageFunctionKey values. */
  by_model_per_function?: Record<string, CostBreakdownItem[]>
  /** Per-function phase breakdown — keys are UsageFunctionKey values. */
  by_phase_per_function?: Record<string, CostBreakdownItem[]>
  /** Per-function provider breakdown — keys are UsageFunctionKey values. */
  by_provider_per_function?: Record<string, CostBreakdownItem[]>
  /** Per-function execution-state breakdown — keys are UsageFunctionKey values. */
  by_execution_state_per_function?: Record<string, CostBreakdownItem[]>
}

export interface UsageDocumentSummary {
  id?: string
  created_at: string
  document_type_id: string
  llm_tokens_in?: number
  llm_tokens_out?: number
  llm_cost_usd?: number
  llm_executions?: UsageExecutionRecord[]
  usage_summary?: Partial<UsageSummary>
  /** Context-detail data stored on the document (used when llm_executions is absent). */
  context_detail?: { llm_execution?: UsageExecutionRecord } | null
}

export interface ThesisUsageSessionSummary {
  id?: string
  created_at: string
  llm_executions?: UsageExecutionRecord[]
  usage_summary?: Partial<UsageSummary>
}

export const DEFAULT_BRL_PER_USD = 5.7

const FUNCTION_LABELS: Record<UsageFunctionKey, string> = {
  document_generation: 'Geração de documentos',
  document_generation_v3: 'Novo Documento v3',
  thesis_analysis: 'Análise de teses',
  context_detail: 'Detalhamento de contexto',
  acervo_classificador: 'Classificador de acervo',
  acervo_ementa: 'Gerador de ementas',
  caderno_pesquisa: 'Caderno de Pesquisa',
  notebook_acervo: 'Análise de Acervo (Caderno)',
  video_pipeline: 'Gerador de Vídeo',
  audio_pipeline: 'Pipeline de Áudio',
  presentation_pipeline: 'Pipeline de Apresentação',
  chat_orchestrator: 'Orquestrador (Chat)',
}

const PHASE_LABELS: Record<string, string> = {
  triagem: 'Triagem',
  pesquisador: 'Pesquisador',
  jurista: 'Jurista',
  advogado_diabo: 'Advogado do Diabo',
  jurista_v2: 'Jurista v2',
  fact_checker: 'Fact-checker',
  moderador: 'Moderador',
  redacao: 'Redação',
  // ── Document v3 phases ──
  v3_intent_classifier: 'V3: Classificador de Intenção',
  v3_request_parser: 'V3: Parser da Solicitação',
  v3_legal_issue_spotter: 'V3: Identificador de Questões Jurídicas',
  v3_prompt_architect: 'V3: Arquiteto de Prompts',
  v3_acervo_retriever: 'V3: Buscador de Acervo',
  v3_thesis_retriever: 'V3: Buscador de Teses',
  v3_thesis_builder: 'V3: Construtor de Teses',
  v3_devil_advocate: 'V3: Advogado do Diabo',
  v3_thesis_refiner: 'V3: Refinador de Teses',
  v3_legislation_researcher: 'V3: Pesquisador de Legislação',
  v3_jurisprudence_researcher: 'V3: Pesquisador de Jurisprudência',
  v3_doctrine_researcher: 'V3: Pesquisador de Doutrina',
  v3_outline_planner: 'V3: Planejador da Estrutura',
  v3_citation_verifier: 'V3: Verificador de Citações',
  v3_writer: 'V3: Redator',
  v3_writer_reviser: 'V3: Revisor de Redação',
  context_detail: 'Detalhamento de Contexto',
  thesis_catalogador: 'Catalogador',
  thesis_analista: 'Analista de Redundâncias',
  thesis_compilador: 'Compilador',
  thesis_curador: 'Curador de Lacunas',
  thesis_revisor: 'Revisor Final',
  thesis_revisor_repair: 'Revisor Final (reparo JSON)',
  acervo_buscador: 'Buscador de Acervo',
  acervo_compilador: 'Compilador de Base',
  acervo_revisor: 'Revisor de Base',
  acervo_classificador: 'Classificador de Acervo',
  acervo_ementa: 'Gerador de Ementa',
  notebook_pesquisador: 'Pesquisador de Fontes',
  notebook_pesquisador_externo: 'Pesquisador Externo',
  notebook_pesquisador_externo_profundo: 'Pesquisador Externo Profundo',
  notebook_pesquisador_jurisprudencia: 'Pesquisador de Jurisprudência (DataJud)',
  notebook_ranqueador_jurisprudencia: 'Ranqueador de Jurisprudência',
  notebook_analista: 'Analista de Conhecimento',
  notebook_assistente: 'Assistente Conversacional',
  notebook_criador: 'Criador de Conteúdo',
  notebook_criador_resumo: 'Estúdio: Resumo',
  notebook_criador_mapa_mental: 'Estúdio: Mapa Mental',
  notebook_criador_cartoes_didaticos: 'Estúdio: Cartões Didáticos',
  notebook_criador_apresentacao: 'Estúdio: Apresentação',
  notebook_criador_relatorio: 'Estúdio: Relatório',
  notebook_criador_tabela_dados: 'Estúdio: Tabela de Dados',
  notebook_criador_teste: 'Estúdio: Teste / Quiz',
  notebook_criador_infografico: 'Estúdio: Infográfico',
  notebook_criador_documento: 'Estúdio: Documento',
  notebook_criador_audio_script: 'Estúdio: Roteiro de Áudio',
  notebook_criador_video_script: 'Estúdio: Gerador de Vídeo',
  caderno_pesquisa_total: 'Caderno de Pesquisa (agregado)',
  document_total: 'Documento (agregado)',
  thesis_analysis_total: 'Sessão de análise (agregada)',
  // ── Notebook Acervo phases ──
  nb_acervo_triagem: 'Triagem de Acervo (Caderno)',
  nb_acervo_buscador: 'Buscador de Acervo (Caderno)',
  nb_acervo_analista: 'Analista de Acervo (Caderno)',
  nb_acervo_curador: 'Curador de Fontes (Caderno)',
  // ── Video pipeline phases ──
  video_planejador: 'Vídeo: Planejador de Produção',
  video_roteirista: 'Vídeo: Roteirista',
  video_diretor_cena: 'Vídeo: Diretor de Cenas',
  video_storyboarder: 'Vídeo: Storyboarder',
  video_designer: 'Vídeo: Designer Visual',
  video_compositor: 'Vídeo: Compositor',
  video_narrador: 'Vídeo: Narrador',
  video_revisor: 'Vídeo: Revisor Final',
  video_clip_planner: 'Vídeo: Planejador de Clips',
  clip_subdivision: 'Vídeo: Subdivisão de Clips',
  media_image_generation: 'Vídeo: Geração de Imagens',
  media_tts_generation: 'Vídeo: Narração TTS',
  media_video_clip_generation: 'Vídeo: Geração de Clipes por Partes',
  media_soundtrack_generation: 'Vídeo: Trilha Sonora',
  media_video_render: 'Vídeo: Renderização Final',
  audio_literal_generation: 'Áudio: Geração Literal Final',
  visual_artifact_render: 'Caderno: Renderização Visual Final',
  // ── Audio pipeline phases ──
  audio_planejador: 'Áudio: Planejador',
  audio_roteirista: 'Áudio: Roteirista',
  audio_diretor: 'Áudio: Diretor',
  audio_produtor_sonoro: 'Áudio: Produtor Sonoro',
  audio_narrador: 'Áudio: Narrador / TTS',
  audio_revisor: 'Áudio: Revisor Final',
  // ── Presentation pipeline phases ──
  pres_planejador: 'Apresentação: Planejador',
  pres_pesquisador: 'Apresentação: Pesquisador',
  pres_redator: 'Apresentação: Redator de Slides',
  pres_designer: 'Apresentação: Designer Visual',
  pres_image_generator: 'Apresentação: Gerador de Imagens',
  pres_revisor: 'Apresentação: Revisor Final',
  // ── Chat orchestrator phases ──
  chat_orchestrator: 'Chat: Orquestrador',
  chat_planner: 'Chat: Planejador',
  chat_clarifier: 'Chat: Esclarecedor',
  chat_legal_researcher: 'Chat: Pesquisador Jurídico',
  chat_code_writer: 'Chat: Programador',
  chat_fs_actor: 'Chat: Operador de Arquivos',
  chat_summarizer: 'Chat: Sumarizador',
  chat_critic: 'Chat: Crítico',
  chat_writer: 'Chat: Redator',
  chat_argument_builder: 'Chat: Fundamentador',
  chat_ethics_auditor: 'Chat: Auditor Ético',
}

const STUDIO_ARTIFACT_LABELS: Record<string, string> = {
  resumo: 'Resumo',
  apresentacao: 'Apresentação',
  mapa_mental: 'Mapa Mental',
  cartoes_didaticos: 'Cartões Didáticos',
  infografico: 'Infográfico',
  teste: 'Teste',
  relatorio: 'Relatório',
  tabela_dados: 'Tabela de Dados',
  documento: 'Documento',
  audio_script: 'Resumo em Áudio',
  video_script: 'Vídeo',
  guia_estruturado: 'Guia Estruturado',
  outro: 'Outro',
}

const EXECUTION_STATE_LABELS: Record<PipelineExecutionState, string> = {
  queued: 'Em fila',
  running: 'Executando',
  waiting_io: 'Aguardando I/O',
  retrying: 'Reprocessando',
  persisting: 'Persistindo',
  completed: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado',
}

const EXECUTION_STATE_VALUES: ReadonlySet<PipelineExecutionState> = new Set([
  'queued',
  'running',
  'waiting_io',
  'retrying',
  'persisting',
  'completed',
  'failed',
  'cancelled',
])

function round6(value: number) {
  return Number(value.toFixed(6))
}

function round2(value: number) {
  return Number(value.toFixed(2))
}

export function getFunctionLabel(functionKey: UsageFunctionKey): string {
  return FUNCTION_LABELS[functionKey]
}

export function getPhaseLabel(phase: string): string {
  const studioMatch = phase.match(/^(studio_pesquisador|studio_escritor|studio_roteirista|studio_visual|studio_revisor)_(.+)$/)
  if (studioMatch) {
    const [, role, artifactType] = studioMatch
    const artifactLabel = STUDIO_ARTIFACT_LABELS[artifactType] ?? artifactType.replace(/_/g, ' ')
    const roleLabel = {
      studio_pesquisador: 'Estúdio: Pesquisador',
      studio_escritor: 'Estúdio: Escritor',
      studio_roteirista: 'Estúdio: Roteirista',
      studio_visual: 'Estúdio: Designer Visual',
      studio_revisor: 'Estúdio: Revisor',
    }[role]
    if (roleLabel) return `${roleLabel} · ${artifactLabel}`
  }
  return PHASE_LABELS[phase] ?? phase.replace(/_/g, ' ')
}

export function getDocumentTypeLabel(documentTypeId?: string | null): string {
  if (!documentTypeId) return 'Não informado'
  return DOCTYPE_LABELS[documentTypeId] ?? documentTypeId
}

export function getModelLabel(model?: string | null): string {
  if (!model) return 'Não identificado'
  const normalized = model.toLowerCase()
  if (normalized.includes('haiku')) return 'Claude Haiku'
  if (normalized.includes('sonnet')) return 'Claude Sonnet'
  if (normalized.includes('opus')) return 'Claude Opus'
  if (normalized.includes('gpt')) return 'GPT'
  if (normalized.includes('gemini')) return 'Gemini'
  if (normalized.includes('llama')) return 'Llama'
  if (normalized.includes('nemotron')) return 'Nemotron'
  return model.split('/').pop() ?? model
}

const EXTRA_PROVIDER_LABELS: Record<string, string> = {
  browser: 'Browser',
  'external-provider': 'Provedor Externo',
  unknown_provider: 'Não identificado',
}

function normalizeProviderKey(provider?: string | null): string | null {
  if (!provider) return null
  const normalized = provider.trim().toLowerCase()
  if (!normalized) return null
  if (normalized in PROVIDERS) return normalized
  if (normalized in EXTRA_PROVIDER_LABELS) return normalized
  return normalized
}

function inferProviderKeyFromModel(model?: string | null): string {
  if (!model) return 'unknown_provider'
  const normalized = model.trim().toLowerCase()
  if (!normalized) return 'unknown_provider'

  const prefixed = normalized.split('/')[0]
  if (prefixed in PROVIDERS) return prefixed
  if (prefixed in EXTRA_PROVIDER_LABELS) return prefixed

  if (normalized.startsWith('gpt-') || normalized.startsWith('o1') || normalized.startsWith('o3') || normalized.startsWith('o4')) {
    return 'openai'
  }
  if (normalized.startsWith('claude')) return 'anthropic'
  if (normalized.startsWith('gemini')) return 'google'
  if (normalized.startsWith('grok')) return 'xai'
  if (normalized.startsWith('qwen')) return 'qwen'
  if (normalized.startsWith('moonshot') || normalized.startsWith('kimi')) return 'kimi'
  if (normalized.startsWith('deepseek')) return 'deepseek'
  if (normalized.startsWith('nemotron') || normalized.startsWith('nvidia')) return 'nvidia'
  if (normalized.startsWith('mistral')) return 'mistral'
  if (normalized.startsWith('command-r')) return 'cohere'
  if (normalized.startsWith('eleven_')) return 'elevenlabs'
  if (normalized.startsWith('meta-llama')) return 'openrouter'

  return prefixed || 'unknown_provider'
}

function getProviderLabelFromKey(providerKey?: string | null): string {
  const normalized = normalizeProviderKey(providerKey) ?? 'unknown_provider'
  if (normalized in PROVIDERS) {
    return PROVIDERS[normalized as keyof typeof PROVIDERS].label
  }
  if (normalized in EXTRA_PROVIDER_LABELS) {
    return EXTRA_PROVIDER_LABELS[normalized]
  }
  if (normalized === 'meta') return 'Meta'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function getProviderKey(model?: string | null): string {
  return inferProviderKeyFromModel(model)
}

export function getProviderLabel(model?: string | null): string {
  return getProviderLabelFromKey(getProviderKey(model))
}

function getExecutionProviderKey(execution: UsageExecutionRecord): string {
  const explicit = normalizeProviderKey(execution.provider_id)
  if (explicit) return explicit

  const byLabel = providerIdFromLabel(execution.provider_label ?? '')
  if (byLabel) return byLabel

  return inferProviderKeyFromModel(execution.model)
}

function getExecutionProviderLabel(execution: UsageExecutionRecord): string {
  const explicitLabel = typeof execution.provider_label === 'string' && execution.provider_label.trim().length > 0
    ? execution.provider_label.trim()
    : null
  if (explicitLabel) return explicitLabel
  return getProviderLabelFromKey(getExecutionProviderKey(execution))
}

function normalizeExecutionState(state?: PipelineExecutionState | string | null): PipelineExecutionState | null {
  if (!state) return null
  const normalized = String(state).trim().toLowerCase() as PipelineExecutionState
  if (!EXECUTION_STATE_VALUES.has(normalized)) return null
  return normalized
}

function inferExecutionStateFromPhase(phase: string): PipelineExecutionState {
  const normalizedPhase = phase.toLowerCase()
  if (!normalizedPhase) return 'running'

  if (
    normalizedPhase === 'concluido'
    || normalizedPhase.endsWith('_total')
    || normalizedPhase.includes('finalizado')
  ) {
    return 'completed'
  }

  if (
    normalizedPhase.includes('falh')
    || normalizedPhase.includes('erro')
  ) {
    return 'failed'
  }

  if (
    normalizedPhase.includes('cancel')
    || normalizedPhase.includes('abort')
  ) {
    return 'cancelled'
  }

  if (
    normalizedPhase.includes('salvand')
    || normalizedPhase.includes('persist')
  ) {
    return 'persisting'
  }

  if (
    normalizedPhase.includes('media_')
    || normalizedPhase.includes('literal')
    || normalizedPhase.includes('render')
    || normalizedPhase.includes('image_generation')
    || normalizedPhase.includes('tts_generation')
    || normalizedPhase.includes('soundtrack_generation')
    || normalizedPhase.includes('video_clip_generation')
  ) {
    return 'waiting_io'
  }

  if (
    normalizedPhase.includes('retry')
    || normalizedPhase.includes('rollback')
  ) {
    return 'retrying'
  }

  return 'running'
}

export function getExecutionStateLabel(state?: PipelineExecutionState | string | null): string {
  const normalized = normalizeExecutionState(state)
  return normalized ? EXECUTION_STATE_LABELS[normalized] : 'Não informado'
}

export function createUsageExecutionRecord(input: {
  source_type: UsageFunctionKey
  source_id: string
  created_at?: string
  phase: string
  agent_name: string
  model?: string | null
  provider_id?: string | null
  provider_label?: string | null
  requested_model?: string | null
  resolved_model?: string | null
  tokens_in?: number
  tokens_out?: number
  cost_usd?: number
  duration_ms?: number
  execution_state?: PipelineExecutionState | string | null
  retry_count?: number | null
  used_fallback?: boolean | null
  fallback_from?: string | null
  runtime_profile?: string | null
  runtime_hints?: string | null
  runtime_concurrency?: number | null
  runtime_cap?: number | null
  document_type_id?: string | null
}): UsageExecutionRecord {
  const tokensIn = Math.max(0, input.tokens_in ?? 0)
  const tokensOut = Math.max(0, input.tokens_out ?? 0)
  const createdAt = input.created_at ?? new Date().toISOString()
  const runtimeProfile = typeof input.runtime_profile === 'string' && input.runtime_profile.trim().length > 0
    ? input.runtime_profile.trim()
    : null
  const runtimeHints = typeof input.runtime_hints === 'string' && input.runtime_hints.trim().length > 0
    ? input.runtime_hints.trim()
    : null
  const runtimeConcurrency = Number.isFinite(input.runtime_concurrency)
    ? Math.max(1, Math.round(input.runtime_concurrency as number))
    : null
  const runtimeCap = Number.isFinite(input.runtime_cap)
    ? Math.max(1, Math.round(input.runtime_cap as number))
    : null
  const retryCount = Number.isFinite(input.retry_count)
    ? Math.max(0, Math.round(input.retry_count as number))
    : null
  const explicitExecutionState = normalizeExecutionState(input.execution_state)
  const inferredExecutionState = explicitExecutionState
    || ((retryCount ?? 0) > 0 ? 'retrying' : inferExecutionStateFromPhase(input.phase))
  const fallbackFrom = typeof input.fallback_from === 'string' && input.fallback_from.trim().length > 0
    ? input.fallback_from.trim()
    : null
  const usedFallback = input.used_fallback == null
    ? (fallbackFrom ? true : null)
    : Boolean(input.used_fallback)
  const normalizedProviderId = normalizeProviderKey(input.provider_id)
    ?? providerIdFromLabel(input.provider_label ?? '')
    ?? inferProviderKeyFromModel(input.model)
  const providerLabel = typeof input.provider_label === 'string' && input.provider_label.trim().length > 0
    ? input.provider_label.trim()
    : getProviderLabelFromKey(normalizedProviderId)

  return {
    source_type: input.source_type,
    source_id: input.source_id,
    created_at: createdAt,
    function_key: input.source_type,
    function_label: getFunctionLabel(input.source_type),
    phase: input.phase,
    phase_label: getPhaseLabel(input.phase),
    agent_name: input.agent_name,
    model: input.model ?? null,
    model_label: getModelLabel(input.model),
    provider_id: normalizedProviderId === 'unknown_provider' ? null : normalizedProviderId,
    provider_label: providerLabel,
    requested_model: input.requested_model ?? null,
    resolved_model: input.resolved_model ?? null,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    total_tokens: tokensIn + tokensOut,
    cost_usd: round6(input.cost_usd ?? 0),
    duration_ms: Math.max(0, input.duration_ms ?? 0),
    execution_state: inferredExecutionState,
    retry_count: retryCount,
    used_fallback: usedFallback,
    fallback_from: fallbackFrom,
    runtime_profile: runtimeProfile,
    runtime_hints: runtimeHints,
    runtime_concurrency: runtimeConcurrency,
    runtime_cap: runtimeCap,
    document_type_id: input.document_type_id ?? null,
    document_type_label: input.document_type_id ? getDocumentTypeLabel(input.document_type_id) : null,
  }
}

export function buildUsageSummary(executions: UsageExecutionRecord[]): UsageSummary {
  return executions.reduce<UsageSummary>((acc, execution) => ({
    total_cost_usd: round6(acc.total_cost_usd + execution.cost_usd),
    total_tokens_in: acc.total_tokens_in + execution.tokens_in,
    total_tokens_out: acc.total_tokens_out + execution.tokens_out,
    total_tokens: acc.total_tokens + execution.total_tokens,
    total_calls: acc.total_calls + 1,
  }), {
    total_cost_usd: 0,
    total_tokens_in: 0,
    total_tokens_out: 0,
    total_tokens: 0,
    total_calls: 0,
  })
}

function aggregateBreakdown(
  executions: UsageExecutionRecord[],
  getKey: (execution: UsageExecutionRecord) => string,
  getLabel: (execution: UsageExecutionRecord) => string,
  exchangeRateBrl: number,
): CostBreakdownItem[] {
  const grouped = new Map<string, CostBreakdownItem & { total_duration_ms: number }>()

  for (const execution of executions) {
    const key = getKey(execution)
    const existing = grouped.get(key) ?? {
      key,
      label: getLabel(execution),
      calls: 0,
      tokens_in: 0,
      tokens_out: 0,
      total_tokens: 0,
      cost_usd: 0,
      cost_brl: 0,
      avg_duration_ms: null,
      total_duration_ms: 0,
    }

    existing.calls += 1
    existing.tokens_in += execution.tokens_in
    existing.tokens_out += execution.tokens_out
    existing.total_tokens += execution.total_tokens
    existing.cost_usd = round6(existing.cost_usd + execution.cost_usd)
    existing.cost_brl = round2(existing.cost_usd * exchangeRateBrl)
    existing.total_duration_ms += execution.duration_ms
    existing.avg_duration_ms = existing.calls > 0
      ? Math.round(existing.total_duration_ms / existing.calls)
      : null

    grouped.set(key, existing)
  }

  return Array.from(grouped.values())
    .map(({ total_duration_ms, ...row }) => row)
    .sort((a, b) => b.cost_usd - a.cost_usd || b.total_tokens - a.total_tokens || a.label.localeCompare(b.label))
}

export function buildCostBreakdown(
  executions: UsageExecutionRecord[],
  exchangeRateBrl = DEFAULT_BRL_PER_USD,
): CostBreakdown {
  const summary = buildUsageSummary(executions)

  // Group executions by function key for per-function sub-breakdowns
  const execsByFunction = new Map<string, UsageExecutionRecord[]>()
  for (const execution of executions) {
    const key = execution.function_key
    const group = execsByFunction.get(key) ?? []
    group.push(execution)
    execsByFunction.set(key, group)
  }

  const by_model_per_function: Record<string, CostBreakdownItem[]> = {}
  const by_phase_per_function: Record<string, CostBreakdownItem[]> = {}
  const by_provider_per_function: Record<string, CostBreakdownItem[]> = {}
  const by_execution_state_per_function: Record<string, CostBreakdownItem[]> = {}

  for (const [funcKey, funcExecs] of execsByFunction.entries()) {
    by_model_per_function[funcKey] = aggregateBreakdown(funcExecs, e => e.model || 'unknown_model', e => e.model_label, exchangeRateBrl)
    by_phase_per_function[funcKey] = aggregateBreakdown(funcExecs, e => e.phase, e => e.phase_label, exchangeRateBrl)
    by_provider_per_function[funcKey] = aggregateBreakdown(funcExecs, e => getExecutionProviderKey(e), e => getExecutionProviderLabel(e), exchangeRateBrl)
    by_execution_state_per_function[funcKey] = aggregateBreakdown(
      funcExecs,
      e => e.execution_state || 'unknown_execution_state',
      e => getExecutionStateLabel(e.execution_state),
      exchangeRateBrl,
    )
  }

  return {
    ...summary,
    total_cost_brl: round2(summary.total_cost_usd * exchangeRateBrl),
    exchange_rate_brl: exchangeRateBrl,
    by_provider: aggregateBreakdown(executions, execution => getExecutionProviderKey(execution), execution => getExecutionProviderLabel(execution), exchangeRateBrl),
    by_model: aggregateBreakdown(executions, execution => execution.model || 'unknown_model', execution => execution.model_label, exchangeRateBrl),
    by_function: aggregateBreakdown(executions, execution => execution.function_key, execution => execution.function_label, exchangeRateBrl),
    by_phase: aggregateBreakdown(executions, execution => execution.phase, execution => execution.phase_label, exchangeRateBrl),
    by_execution_state: aggregateBreakdown(
      executions,
      execution => execution.execution_state || 'unknown_execution_state',
      execution => getExecutionStateLabel(execution.execution_state),
      exchangeRateBrl,
    ),
    by_agent: aggregateBreakdown(executions, execution => execution.agent_name, execution => execution.agent_name, exchangeRateBrl),
    by_agent_function: aggregateBreakdown(
      executions,
      execution => `${execution.function_key}::${execution.agent_name || 'unknown_agent'}`,
      execution => `${execution.function_label} · ${execution.agent_name || 'Não informado'}`,
      exchangeRateBrl,
    ),
    by_document_type: aggregateBreakdown(
      executions.filter(execution => !!execution.document_type_id),
      execution => execution.document_type_id || 'unknown_document_type',
      execution => execution.document_type_label || getDocumentTypeLabel(execution.document_type_id),
      exchangeRateBrl,
    ),
    by_model_per_function,
    by_phase_per_function,
    by_provider_per_function,
    by_execution_state_per_function,
  }
}

export function extractDocumentUsageExecutions(document: UsageDocumentSummary): UsageExecutionRecord[] {
  const results: UsageExecutionRecord[] = []

  if (Array.isArray(document.llm_executions) && document.llm_executions.length > 0) {
    for (const execution of document.llm_executions) {
      results.push(createUsageExecutionRecord({
        source_type: execution.function_key ?? 'document_generation',
        source_id: execution.source_id ?? document.id ?? `document-${document.created_at}`,
        created_at: execution.created_at ?? document.created_at,
        phase: execution.phase ?? 'document_total',
        agent_name: execution.agent_name ?? 'Documento (consolidado)',
        model: execution.model,
        provider_id: execution.provider_id,
        provider_label: execution.provider_label,
        requested_model: execution.requested_model,
        resolved_model: execution.resolved_model,
        tokens_in: execution.tokens_in,
        tokens_out: execution.tokens_out,
        cost_usd: execution.cost_usd,
        duration_ms: execution.duration_ms,
        execution_state: execution.execution_state,
        retry_count: execution.retry_count,
        used_fallback: execution.used_fallback,
        fallback_from: execution.fallback_from,
        runtime_profile: execution.runtime_profile,
        runtime_hints: execution.runtime_hints,
        runtime_concurrency: execution.runtime_concurrency,
        runtime_cap: execution.runtime_cap,
        document_type_id: execution.document_type_id ?? document.document_type_id,
      }))
    }

    // If context_detail was used but its execution is not yet in llm_executions
    // (e.g. document generation failed before the full save), include it now.
    const hasContextDetail = document.llm_executions.some(
      e => (e.function_key ?? e.source_type) === 'context_detail',
    )
    if (!hasContextDetail && document.context_detail?.llm_execution) {
      const exec = document.context_detail.llm_execution
      results.push(createUsageExecutionRecord({
        source_type: 'context_detail',
        source_id: document.id ?? `document-${document.created_at}`,
        created_at: exec.created_at ?? document.created_at,
        phase: exec.phase ?? 'context_detail',
        agent_name: exec.agent_name ?? 'Detalhamento de Contexto',
        model: exec.model,
        provider_id: exec.provider_id,
        provider_label: exec.provider_label,
        requested_model: exec.requested_model,
        resolved_model: exec.resolved_model,
        tokens_in: exec.tokens_in,
        tokens_out: exec.tokens_out,
        cost_usd: exec.cost_usd,
        duration_ms: exec.duration_ms,
        execution_state: exec.execution_state,
        retry_count: exec.retry_count,
        used_fallback: exec.used_fallback,
        fallback_from: exec.fallback_from,
        runtime_profile: exec.runtime_profile,
        runtime_hints: exec.runtime_hints,
        runtime_concurrency: exec.runtime_concurrency,
        runtime_cap: exec.runtime_cap,
        document_type_id: exec.document_type_id ?? document.document_type_id,
      }))
    }

    return results
  }

  // Fallback path: document predates per-execution tracking.
  // Only skip if there are truly no tokens recorded (avoids polluting data with
  // draft documents that never had generation run).
  const tokensIn = document.usage_summary?.total_tokens_in ?? document.llm_tokens_in ?? 0
  const tokensOut = document.usage_summary?.total_tokens_out ?? document.llm_tokens_out ?? 0
  const costUsd = document.usage_summary?.total_cost_usd ?? document.llm_cost_usd ?? 0

  if (tokensIn > 0 || tokensOut > 0 || costUsd > 0) {
    results.push(createUsageExecutionRecord({
      source_type: 'document_generation',
      source_id: document.id ?? `document-${document.created_at}`,
      created_at: document.created_at,
      phase: 'document_total',
      agent_name: 'Documento (consolidado)',
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      document_type_id: document.document_type_id,
    }))
  }

  // Always extract context_detail execution when present — even if the document
  // never completed generation (status: 'rascunho' / 'erro').
  if (document.context_detail?.llm_execution) {
    const exec = document.context_detail.llm_execution
    results.push(createUsageExecutionRecord({
      source_type: 'context_detail',
      source_id: document.id ?? `document-${document.created_at}`,
      created_at: exec.created_at ?? document.created_at,
      phase: exec.phase ?? 'context_detail',
      agent_name: exec.agent_name ?? 'Detalhamento de Contexto',
      model: exec.model,
      provider_id: exec.provider_id,
      provider_label: exec.provider_label,
      requested_model: exec.requested_model,
      resolved_model: exec.resolved_model,
      tokens_in: exec.tokens_in,
      tokens_out: exec.tokens_out,
      cost_usd: exec.cost_usd,
      duration_ms: exec.duration_ms,
      execution_state: exec.execution_state,
      retry_count: exec.retry_count,
      used_fallback: exec.used_fallback,
      fallback_from: exec.fallback_from,
      runtime_profile: exec.runtime_profile,
      runtime_hints: exec.runtime_hints,
      runtime_concurrency: exec.runtime_concurrency,
      runtime_cap: exec.runtime_cap,
      document_type_id: exec.document_type_id ?? document.document_type_id,
    }))
  }

  return results
}

export function extractThesisSessionExecutions(session: ThesisUsageSessionSummary): UsageExecutionRecord[] {
  if (Array.isArray(session.llm_executions) && session.llm_executions.length > 0) {
    return session.llm_executions.map(execution => createUsageExecutionRecord({
      source_type: execution.function_key ?? 'thesis_analysis',
      source_id: execution.source_id ?? session.id ?? `thesis-session-${session.created_at}`,
      created_at: execution.created_at ?? session.created_at,
      phase: execution.phase ?? 'thesis_analysis_total',
      agent_name: execution.agent_name ?? 'Análise de teses (consolidada)',
      model: execution.model,
      provider_id: execution.provider_id,
      provider_label: execution.provider_label,
      requested_model: execution.requested_model,
      resolved_model: execution.resolved_model,
      tokens_in: execution.tokens_in,
      tokens_out: execution.tokens_out,
      cost_usd: execution.cost_usd,
      duration_ms: execution.duration_ms,
      execution_state: execution.execution_state,
      retry_count: execution.retry_count,
      used_fallback: execution.used_fallback,
      fallback_from: execution.fallback_from,
      runtime_profile: execution.runtime_profile,
      runtime_hints: execution.runtime_hints,
      runtime_concurrency: execution.runtime_concurrency,
      runtime_cap: execution.runtime_cap,
      document_type_id: execution.document_type_id,
    }))
  }

  const tokensIn = session.usage_summary?.total_tokens_in ?? 0
  const tokensOut = session.usage_summary?.total_tokens_out ?? 0
  const costUsd = session.usage_summary?.total_cost_usd ?? 0

  // Only skip if there are truly no tokens AND no cost (free-model sessions with
  // tokens but $0 cost must still be shown).
  if (tokensIn <= 0 && tokensOut <= 0 && costUsd <= 0) return []

  return [
    createUsageExecutionRecord({
      source_type: 'thesis_analysis',
      source_id: session.id ?? `thesis-session-${session.created_at}`,
      created_at: session.created_at,
      phase: 'thesis_analysis_total',
      agent_name: 'Análise de teses (consolidada)',
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
    }),
  ]
}

export interface AcervoUsageSummary {
  id?: string
  filename: string
  created_at: string
  llm_executions?: UsageExecutionRecord[]
}

export function extractAcervoUsageExecutions(acervoDoc: AcervoUsageSummary): UsageExecutionRecord[] {
  if (!Array.isArray(acervoDoc.llm_executions) || acervoDoc.llm_executions.length === 0) return []
  return acervoDoc.llm_executions.map(execution => createUsageExecutionRecord({
    source_type: execution.function_key ?? 'acervo_ementa',
    source_id: execution.source_id ?? acervoDoc.id ?? `acervo-${acervoDoc.created_at}`,
    created_at: execution.created_at ?? acervoDoc.created_at,
    phase: execution.phase ?? 'acervo_ementa',
    agent_name: execution.agent_name ?? 'Acervo (consolidado)',
    model: execution.model,
    provider_id: execution.provider_id,
    provider_label: execution.provider_label,
    requested_model: execution.requested_model,
    resolved_model: execution.resolved_model,
    tokens_in: execution.tokens_in,
    tokens_out: execution.tokens_out,
    cost_usd: execution.cost_usd,
    duration_ms: execution.duration_ms,
    execution_state: execution.execution_state,
    retry_count: execution.retry_count,
    used_fallback: execution.used_fallback,
    fallback_from: execution.fallback_from,
    runtime_profile: execution.runtime_profile,
    runtime_hints: execution.runtime_hints,
    runtime_concurrency: execution.runtime_concurrency,
    runtime_cap: execution.runtime_cap,
  }))
}

// ── Research Notebook (Caderno de Pesquisa) usage extraction ──────────────────

export interface NotebookUsageSummary {
  id?: string
  title: string
  created_at: string
  llm_executions?: UsageExecutionRecord[]
  usage_summary?: Partial<UsageSummary>
}

export function extractNotebookUsageExecutions(notebook: NotebookUsageSummary): UsageExecutionRecord[] {
  if (Array.isArray(notebook.llm_executions) && notebook.llm_executions.length > 0) {
    return notebook.llm_executions.map(execution => createUsageExecutionRecord({
      source_type: execution.function_key ?? 'caderno_pesquisa',
      source_id: execution.source_id ?? notebook.id ?? `notebook-${notebook.created_at}`,
      created_at: execution.created_at ?? notebook.created_at,
      phase: execution.phase ?? 'caderno_pesquisa_total',
      agent_name: execution.agent_name ?? 'Caderno de Pesquisa (consolidado)',
      model: execution.model,
      provider_id: execution.provider_id,
      provider_label: execution.provider_label,
      requested_model: execution.requested_model,
      resolved_model: execution.resolved_model,
      tokens_in: execution.tokens_in,
      tokens_out: execution.tokens_out,
      cost_usd: execution.cost_usd,
      duration_ms: execution.duration_ms,
      execution_state: execution.execution_state,
      retry_count: execution.retry_count,
      used_fallback: execution.used_fallback,
      fallback_from: execution.fallback_from,
      runtime_profile: execution.runtime_profile,
      runtime_hints: execution.runtime_hints,
      runtime_concurrency: execution.runtime_concurrency,
      runtime_cap: execution.runtime_cap,
    }))
  }

  const tokensIn = notebook.usage_summary?.total_tokens_in ?? 0
  const tokensOut = notebook.usage_summary?.total_tokens_out ?? 0
  const costUsd = notebook.usage_summary?.total_cost_usd ?? 0

  if (tokensIn <= 0 && tokensOut <= 0 && costUsd <= 0) return []

  return [
    createUsageExecutionRecord({
      source_type: 'caderno_pesquisa',
      source_id: notebook.id ?? `notebook-${notebook.created_at}`,
      created_at: notebook.created_at,
      phase: 'caderno_pesquisa_total',
      agent_name: 'Caderno de Pesquisa (consolidado)',
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
    }),
  ]
}

// ── Token Budget Checking ────────────────────────────────────────────────────

import type { TokenBudgetConfig } from './firestore-types'

export type BudgetStatus = 'ok' | 'warning' | 'exceeded'

export interface BudgetCheckResult {
  status: BudgetStatus
  /** Current spending in USD for the checked period */
  currentSpendUsd: number
  /** Limit in USD that applies */
  limitUsd: number
  /** Percentage of limit consumed (0-100+) */
  percentUsed: number
  /** Human-readable message */
  message: string
}

/**
 * Check whether the user's spending is within budget for a given period.
 * Returns the most restrictive result across daily/monthly/per-pipeline checks.
 */
export function checkBudget(
  executions: UsageExecutionRecord[],
  config: TokenBudgetConfig | undefined,
  pipelineKey?: UsageFunctionKey,
): BudgetCheckResult {
  if (!config) return { status: 'ok', currentSpendUsd: 0, limitUsd: 0, percentUsed: 0, message: '' }

  const warningPct = config.warning_threshold_pct ?? 80
  const now = new Date()

  const results: BudgetCheckResult[] = []

  // Monthly check
  if (config.monthly_limit_usd && config.monthly_limit_usd > 0) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthlySpend = executions
      .filter(e => e.created_at >= monthStart)
      .reduce((sum, e) => sum + e.cost_usd, 0)
    const pct = (monthlySpend / config.monthly_limit_usd) * 100
    results.push({
      status: pct >= 100 ? 'exceeded' : pct >= warningPct ? 'warning' : 'ok',
      currentSpendUsd: monthlySpend,
      limitUsd: config.monthly_limit_usd,
      percentUsed: pct,
      message: pct >= 100
        ? `Orçamento mensal excedido: ${formatCost(monthlySpend)} / ${formatCost(config.monthly_limit_usd)}`
        : pct >= warningPct
          ? `Orçamento mensal em alerta: ${formatCost(monthlySpend)} / ${formatCost(config.monthly_limit_usd)} (${Math.round(pct)}%)`
          : '',
    })
  }

  // Daily check
  if (config.daily_limit_usd && config.daily_limit_usd > 0) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const dailySpend = executions
      .filter(e => e.created_at >= dayStart)
      .reduce((sum, e) => sum + e.cost_usd, 0)
    const pct = (dailySpend / config.daily_limit_usd) * 100
    results.push({
      status: pct >= 100 ? 'exceeded' : pct >= warningPct ? 'warning' : 'ok',
      currentSpendUsd: dailySpend,
      limitUsd: config.daily_limit_usd,
      percentUsed: pct,
      message: pct >= 100
        ? `Orçamento diário excedido: ${formatCost(dailySpend)} / ${formatCost(config.daily_limit_usd)}`
        : pct >= warningPct
          ? `Orçamento diário em alerta: ${formatCost(dailySpend)} / ${formatCost(config.daily_limit_usd)} (${Math.round(pct)}%)`
          : '',
    })
  }

  // Per-pipeline check
  if (config.per_pipeline_limit_usd && config.per_pipeline_limit_usd > 0 && pipelineKey) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const pipelineSpend = executions
      .filter(e => e.created_at >= monthStart && e.function_key === pipelineKey)
      .reduce((sum, e) => sum + e.cost_usd, 0)
    const pct = (pipelineSpend / config.per_pipeline_limit_usd) * 100
    results.push({
      status: pct >= 100 ? 'exceeded' : pct >= warningPct ? 'warning' : 'ok',
      currentSpendUsd: pipelineSpend,
      limitUsd: config.per_pipeline_limit_usd,
      percentUsed: pct,
      message: pct >= 100
        ? `Orçamento do pipeline excedido: ${formatCost(pipelineSpend)} / ${formatCost(config.per_pipeline_limit_usd)}`
        : pct >= warningPct
          ? `Orçamento do pipeline em alerta: ${formatCost(pipelineSpend)} / ${formatCost(config.per_pipeline_limit_usd)} (${Math.round(pct)}%)`
          : '',
    })
  }

  if (results.length === 0) return { status: 'ok', currentSpendUsd: 0, limitUsd: 0, percentUsed: 0, message: '' }

  // Return the most restrictive result
  const exceeded = results.find(r => r.status === 'exceeded')
  if (exceeded) return exceeded
  const warning = results.find(r => r.status === 'warning')
  if (warning) return warning
  return results[0]
}

/** Summarize spending in the current month from execution records */
export function getCurrentMonthSpend(executions: UsageExecutionRecord[]): number {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  return executions.filter(e => e.created_at >= monthStart).reduce((sum, e) => sum + e.cost_usd, 0)
}

/** Summarize spending today from execution records */
export function getTodaySpend(executions: UsageExecutionRecord[]): number {
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  return executions.filter(e => e.created_at >= dayStart).reduce((sum, e) => sum + e.cost_usd, 0)
}
