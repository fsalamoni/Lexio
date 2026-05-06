import { createUsageExecutionRecord, type UsageExecutionRecord, type UsageFunctionKey } from './cost-analytics'

export interface OrchestratorExecutionInput {
  sourceType: UsageFunctionKey
  sourceId: string
  phase: string
  agentName: string
  model?: string | null
  startedAt?: number
  createdAt?: string
  runtimeProfile?: string | null
  runtimeHints?: string | null
  runtimeConcurrency?: number | null
  runtimeCap?: number | null
  documentTypeId?: string | null
}

export function createOrchestratorUsageExecution(input: OrchestratorExecutionInput): UsageExecutionRecord {
  return createUsageExecutionRecord({
    source_type: input.sourceType,
    source_id: input.sourceId,
    created_at: input.createdAt,
    phase: input.phase,
    agent_name: input.agentName,
    model: input.model ?? null,
    provider_id: input.model ? undefined : 'unknown_provider',
    provider_label: input.model ? undefined : 'Não identificado',
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    duration_ms: input.startedAt ? Date.now() - input.startedAt : 0,
    execution_state: 'completed',
    retry_count: 0,
    used_fallback: false,
    fallback_from: null,
    runtime_profile: input.runtimeProfile ?? null,
    runtime_hints: input.runtimeHints ?? null,
    runtime_concurrency: input.runtimeConcurrency ?? null,
    runtime_cap: input.runtimeCap ?? null,
    document_type_id: input.documentTypeId ?? null,
  })
}

export function resolveOrchestratorModel(
  models: Record<string, string>,
  orchestratorKey: string,
  fallbackKeys: string[] = [],
): string | null {
  return models[orchestratorKey] || fallbackKeys.map(key => models[key]).find(Boolean) || null
}
