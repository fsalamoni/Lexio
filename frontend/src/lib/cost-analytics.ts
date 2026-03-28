import { DOCTYPE_LABELS } from './constants'

export type UsageFunctionKey = 'document_generation' | 'thesis_analysis' | 'context_detail' | 'acervo_classificador' | 'acervo_ementa' | 'caderno_pesquisa' | 'notebook_acervo' | 'video_pipeline' | 'audio_pipeline' | 'presentation_pipeline'

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
  tokens_in: number
  tokens_out: number
  total_tokens: number
  cost_usd: number
  duration_ms: number
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
  by_agent: CostBreakdownItem[]
  by_agent_function: CostBreakdownItem[]
  by_document_type: CostBreakdownItem[]
  /** Per-function model breakdown — keys are UsageFunctionKey values. */
  by_model_per_function?: Record<string, CostBreakdownItem[]>
  /** Per-function phase breakdown — keys are UsageFunctionKey values. */
  by_phase_per_function?: Record<string, CostBreakdownItem[]>
  /** Per-function provider breakdown — keys are UsageFunctionKey values. */
  by_provider_per_function?: Record<string, CostBreakdownItem[]>
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
  thesis_analysis: 'Análise de teses',
  context_detail: 'Detalhamento de contexto',
  acervo_classificador: 'Classificador de acervo',
  acervo_ementa: 'Gerador de ementas',
  caderno_pesquisa: 'Caderno de Pesquisa',
  notebook_acervo: 'Analisador de Acervo (Caderno)',
  video_pipeline: 'Pipeline de Vídeo',
  audio_pipeline: 'Pipeline de Áudio',
  presentation_pipeline: 'Pipeline de Apresentação',
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
  context_detail: 'Detalhamento de Contexto',
  thesis_catalogador: 'Catalogador',
  thesis_analista: 'Analista de Redundâncias',
  thesis_compilador: 'Compilador',
  thesis_curador: 'Curador de Lacunas',
  thesis_revisor: 'Revisor Final',
  acervo_buscador: 'Buscador de Acervo',
  acervo_compilador: 'Compilador de Base',
  acervo_revisor: 'Revisor de Base',
  acervo_classificador: 'Classificador de Acervo',
  acervo_ementa: 'Gerador de Ementa',
  notebook_pesquisador: 'Pesquisador de Fontes',
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
  notebook_criador_video_script: 'Estúdio: Roteiro de Vídeo',
  caderno_pesquisa_total: 'Caderno de Pesquisa (agregado)',
  document_total: 'Documento (agregado)',
  thesis_analysis_total: 'Sessão de análise (agregada)',
  // Notebook Acervo pipeline phases
  nb_acervo_triagem: 'Triagem de Acervo (Caderno)',
  nb_acervo_buscador: 'Buscador de Acervo (Caderno)',
  nb_acervo_analista: 'Analista de Acervo (Caderno)',
  nb_acervo_curador: 'Curador de Fontes (Caderno)',
  // Video pipeline phases
  video_planejador: 'Planejador de Vídeo',
  video_roteirista: 'Roteirista de Vídeo',
  video_diretor_cenas: 'Diretor de Cenas',
  video_storyboarder: 'Storyboarder',
  video_diretor_arte: 'Diretor de Arte',
  video_gerador_visual: 'Gerador de Cenas',
  video_editor: 'Editor de Vídeo',
  video_revisor: 'Revisor Final de Vídeo',
  // Audio pipeline phases
  audio_planejador: 'Planejador de Áudio',
  audio_roteirista: 'Roteirista de Áudio',
  audio_diretor_producao: 'Diretor de Produção',
  audio_narrador: 'Narrador / Locutor',
  audio_engenheiro_som: 'Engenheiro de Som',
  audio_revisor: 'Revisor de Áudio',
  // Presentation pipeline phases
  presentation_planejador: 'Planejador de Apresentação',
  presentation_conteudista: 'Conteudista',
  presentation_designer: 'Designer de Slides',
  presentation_ilustrador: 'Ilustrador',
  presentation_revisor: 'Revisor de Apresentação',
}

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
  return model.split('/').pop() ?? model
}

export function getProviderKey(model?: string | null): string {
  if (!model) return 'unknown_provider'
  const [provider] = model.split('/')
  return provider?.trim().toLowerCase() || 'unknown_provider'
}

export function getProviderLabel(model?: string | null): string {
  const providerKey = getProviderKey(model)
  if (providerKey === 'anthropic') return 'Anthropic'
  if (providerKey === 'openai') return 'OpenAI'
  if (providerKey === 'google') return 'Google'
  if (providerKey === 'meta') return 'Meta'
  if (providerKey === 'unknown_provider') return 'Não identificado'
  return providerKey.charAt(0).toUpperCase() + providerKey.slice(1)
}

export function createUsageExecutionRecord(input: {
  source_type: UsageFunctionKey
  source_id: string
  created_at?: string
  phase: string
  agent_name: string
  model?: string | null
  tokens_in?: number
  tokens_out?: number
  cost_usd?: number
  duration_ms?: number
  document_type_id?: string | null
}): UsageExecutionRecord {
  const tokensIn = Math.max(0, input.tokens_in ?? 0)
  const tokensOut = Math.max(0, input.tokens_out ?? 0)
  const createdAt = input.created_at ?? new Date().toISOString()

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
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    total_tokens: tokensIn + tokensOut,
    cost_usd: round6(input.cost_usd ?? 0),
    duration_ms: Math.max(0, input.duration_ms ?? 0),
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

  for (const [funcKey, funcExecs] of execsByFunction.entries()) {
    by_model_per_function[funcKey] = aggregateBreakdown(funcExecs, e => e.model || 'unknown_model', e => e.model_label, exchangeRateBrl)
    by_phase_per_function[funcKey] = aggregateBreakdown(funcExecs, e => e.phase, e => e.phase_label, exchangeRateBrl)
    by_provider_per_function[funcKey] = aggregateBreakdown(funcExecs, e => getProviderKey(e.model), e => getProviderLabel(e.model), exchangeRateBrl)
  }

  return {
    ...summary,
    total_cost_brl: round2(summary.total_cost_usd * exchangeRateBrl),
    exchange_rate_brl: exchangeRateBrl,
    by_provider: aggregateBreakdown(executions, execution => getProviderKey(execution.model), execution => getProviderLabel(execution.model), exchangeRateBrl),
    by_model: aggregateBreakdown(executions, execution => execution.model || 'unknown_model', execution => execution.model_label, exchangeRateBrl),
    by_function: aggregateBreakdown(executions, execution => execution.function_key, execution => execution.function_label, exchangeRateBrl),
    by_phase: aggregateBreakdown(executions, execution => execution.phase, execution => execution.phase_label, exchangeRateBrl),
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
        tokens_in: execution.tokens_in,
        tokens_out: execution.tokens_out,
        cost_usd: execution.cost_usd,
        duration_ms: execution.duration_ms,
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
        tokens_in: exec.tokens_in,
        tokens_out: exec.tokens_out,
        cost_usd: exec.cost_usd,
        duration_ms: exec.duration_ms,
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
      tokens_in: exec.tokens_in,
      tokens_out: exec.tokens_out,
      cost_usd: exec.cost_usd,
      duration_ms: exec.duration_ms,
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
      tokens_in: execution.tokens_in,
      tokens_out: execution.tokens_out,
      cost_usd: execution.cost_usd,
      duration_ms: execution.duration_ms,
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
    tokens_in: execution.tokens_in,
    tokens_out: execution.tokens_out,
    cost_usd: execution.cost_usd,
    duration_ms: execution.duration_ms,
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
      tokens_in: execution.tokens_in,
      tokens_out: execution.tokens_out,
      cost_usd: execution.cost_usd,
      duration_ms: execution.duration_ms,
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
