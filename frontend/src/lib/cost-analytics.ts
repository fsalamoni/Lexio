import { DOCTYPE_LABELS } from './constants'

export type UsageFunctionKey = 'document_generation' | 'thesis_analysis'

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
  by_model: CostBreakdownItem[]
  by_function: CostBreakdownItem[]
  by_phase: CostBreakdownItem[]
  by_agent: CostBreakdownItem[]
  by_document_type: CostBreakdownItem[]
}

export interface UsageDocumentSummary {
  id?: string
  created_at: string
  document_type_id: string
  llm_tokens_in?: number
  llm_tokens_out?: number
  llm_cost_usd?: number
  llm_executions?: UsageExecutionRecord[]
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
  thesis_catalogador: 'Catalogador',
  thesis_analista: 'Analista de Redundâncias',
  thesis_compilador: 'Compilador',
  thesis_curador: 'Curador de Lacunas',
  thesis_revisor: 'Revisor Final',
  document_total: 'Documento (agregado)',
  thesis_analysis_total: 'Sessão de análise (agregada)',
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

  return {
    ...summary,
    total_cost_brl: round2(summary.total_cost_usd * exchangeRateBrl),
    exchange_rate_brl: exchangeRateBrl,
    by_model: aggregateBreakdown(executions, execution => execution.model || 'unknown_model', execution => execution.model_label, exchangeRateBrl),
    by_function: aggregateBreakdown(executions, execution => execution.function_key, execution => execution.function_label, exchangeRateBrl),
    by_phase: aggregateBreakdown(executions, execution => execution.phase, execution => execution.phase_label, exchangeRateBrl),
    by_agent: aggregateBreakdown(executions, execution => execution.agent_name, execution => execution.agent_name, exchangeRateBrl),
    by_document_type: aggregateBreakdown(
      executions.filter(execution => !!execution.document_type_id),
      execution => execution.document_type_id || 'unknown_document_type',
      execution => execution.document_type_label || getDocumentTypeLabel(execution.document_type_id),
      exchangeRateBrl,
    ),
  }
}

export function extractDocumentUsageExecutions(document: UsageDocumentSummary): UsageExecutionRecord[] {
  if (Array.isArray(document.llm_executions) && document.llm_executions.length > 0) {
    return document.llm_executions.map(execution => createUsageExecutionRecord({
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

  const tokensIn = document.llm_tokens_in ?? 0
  const tokensOut = document.llm_tokens_out ?? 0
  const costUsd = document.llm_cost_usd ?? 0

  if (tokensIn <= 0 && tokensOut <= 0 && costUsd <= 0) return []

  return [
    createUsageExecutionRecord({
      source_type: 'document_generation',
      source_id: document.id ?? `document-${document.created_at}`,
      created_at: document.created_at,
      phase: 'document_total',
      agent_name: 'Documento (consolidado)',
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      document_type_id: document.document_type_id,
    }),
  ]
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
