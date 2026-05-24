/**
 * Document v4 pipeline — progress model for the single-agent + tools UI.
 *
 * Unlike v3 (4 phases × multiple agents), v4 is a single agent looping over
 * tools. The progress UI shows: init → iterations → critic → finalize. Each
 * iteration represents one (LLM call + tool execution) round.
 *
 * The contract is intentionally minimal so the UI can be a simple progress
 * panel that lists the current tool + iteration count, plus the last few
 * tool calls in chronological order.
 */
import type { LLMResult } from './llm-client'
import { formatCostBadge } from './currency-utils'
import { normalizeProgressForExecution, type PipelineExecutionState } from './pipeline-execution-contract'

export type DocumentV4PipelinePhase = 'init' | 'loop' | 'critic' | 'finalize' | 'completed' | 'error'

export const DOCUMENT_V4_PIPELINE_COMPLETED_PHASE = 'concluido_v4'

export interface DocumentV4PipelineProgress {
  /** Phase key — 'iteration_N', 'critic', 'finalize', or 'concluido_v4'. */
  phase: string
  message: string
  percent: number
  executionState?: PipelineExecutionState
  modelId?: string
  modelLabel?: string
  stageMeta?: string
  /** Current iteration number (1-based) when phase is an iteration. */
  iteration?: number
  /** Tool name being executed inside the current iteration. */
  tool?: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackFrom?: string
}

export interface DocumentV4PipelineStep {
  key: string
  label: string
  description: string
  status: 'pending' | 'active' | 'completed' | 'error'
  executionState?: PipelineExecutionState
  startedAt?: number
  completedAt?: number
  runtimeMessage?: string
  runtimeModel?: string
  runtimeMeta?: string
  runtimeCostUsd?: number
  runtimeDurationMs?: number
}

const V4_BASE_STEPS: Array<Omit<DocumentV4PipelineStep, 'status' | 'executionState'>> = [
  { key: 'init', label: 'Inicialização', description: 'Carregando configurações, modelo e ferramentas' },
  { key: 'loop', label: 'Loop do Agente', description: 'Agente executando ferramentas iterativamente' },
  { key: 'critic', label: 'Crítico', description: 'Avaliação opcional do rascunho final' },
  { key: 'finalize', label: 'Finalização', description: 'Salvando documento e registros de uso' },
]

export function createDocumentV4PipelineSteps(): DocumentV4PipelineStep[] {
  return V4_BASE_STEPS.map(step => ({
    ...step,
    status: 'pending',
    executionState: 'queued',
  }))
}

export function formatV4ModelLabel(model: string | null | undefined): string {
  if (!model) return '—'
  const normalized = model.toLowerCase()
  if (normalized.includes('haiku')) return 'Haiku'
  if (normalized.includes('sonnet')) return 'Sonnet'
  if (normalized.includes('opus')) return 'Opus'
  if (normalized.includes('gemini')) return 'Gemini'
  if (normalized.includes('gpt-4o')) return 'GPT-4o'
  if (normalized.includes('gpt-4.1')) return 'GPT-4.1'
  return model.split('/').pop()?.replace(/[-_]/g, ' ') || model
}

function formatV4StageMeta(result: LLMResult): string | undefined {
  const parts: string[] = []
  if (result.operational?.fallbackUsed && result.operational.fallbackFrom) {
    parts.push(`Fallback de ${formatV4ModelLabel(result.operational.fallbackFrom)}`)
  }
  if ((result.operational?.totalRetryCount ?? 0) > 0) {
    parts.push(`${result.operational?.totalRetryCount} ${result.operational?.totalRetryCount === 1 ? 'retry' : 'retries'}`)
  }
  if (result.duration_ms > 0) parts.push(`${Math.max(1, Math.round(result.duration_ms / 1000))}s`)
  if (result.cost_usd > 0) parts.push(formatCostBadge(result.cost_usd))
  return parts.length > 0 ? parts.join(' • ') : undefined
}

export function buildDocumentV4PipelineProgress(
  phase: string,
  message: string,
  percent: number,
  options?: {
    executionState?: PipelineExecutionState
    modelId?: string
    stageMeta?: string
    iteration?: number
    tool?: string
    result?: LLMResult
  },
): DocumentV4PipelineProgress {
  const clampedPercent = Math.max(0, Math.min(100, percent))
  const normalizedPercent = options?.executionState
    ? normalizeProgressForExecution({
        progress: clampedPercent,
        executionState: options.executionState,
      })
    : clampedPercent
  const resultMeta = options?.result ? formatV4StageMeta(options.result) : undefined
  return {
    phase,
    message,
    percent: normalizedPercent,
    executionState: options?.executionState ?? 'running',
    modelId: options?.modelId ?? options?.result?.model,
    modelLabel: formatV4ModelLabel(options?.modelId ?? options?.result?.model),
    stageMeta: options?.stageMeta ?? resultMeta,
    iteration: options?.iteration,
    tool: options?.tool,
    costUsd: options?.result?.cost_usd,
    durationMs: options?.result?.duration_ms,
    retryCount: options?.result?.operational?.totalRetryCount,
    usedFallback: options?.result?.operational?.fallbackUsed,
    fallbackFrom: options?.result?.operational?.fallbackFrom,
  }
}

/**
 * Apply a progress update. The v4 pipeline only has 4 conceptual steps and
 * the loop step gets re-entered on every iteration — so we map any phase
 * starting with `iteration` to the `loop` step.
 */
export function applyDocumentV4PipelineProgress(
  steps: DocumentV4PipelineStep[],
  progress: DocumentV4PipelineProgress,
  timers: Record<string, number>,
  now = Date.now(),
): DocumentV4PipelineStep[] {
  if (progress.phase === DOCUMENT_V4_PIPELINE_COMPLETED_PHASE) {
    return steps.map(step => (
      step.status !== 'completed'
        ? { ...step, status: 'completed', executionState: 'completed', completedAt: step.completedAt ?? now }
        : step
    ))
  }
  const stepKey = mapPhaseToStepKey(progress.phase)
  const targetIdx = steps.findIndex(s => s.key === stepKey)
  if (targetIdx === -1) return steps
  return steps.map((step, idx) => {
    if (idx < targetIdx && step.status !== 'completed') {
      return { ...step, status: 'completed', executionState: 'completed', completedAt: step.completedAt ?? now }
    }
    if (step.key === stepKey) {
      if (!timers[step.key]) timers[step.key] = now
      const executionState = progress.executionState ?? step.executionState ?? 'running'
      const isCompleting = executionState === 'completed'
      return {
        ...step,
        status: isCompleting ? 'completed' : 'active',
        executionState,
        startedAt: step.startedAt ?? timers[step.key],
        completedAt: isCompleting ? (step.completedAt ?? now) : step.completedAt,
        runtimeMessage: progress.message,
        runtimeModel: progress.modelLabel ?? step.runtimeModel,
        runtimeMeta: progress.stageMeta ?? step.runtimeMeta,
        runtimeCostUsd: progress.costUsd ?? step.runtimeCostUsd,
        runtimeDurationMs: progress.durationMs ?? step.runtimeDurationMs,
      }
    }
    return step
  })
}

function mapPhaseToStepKey(phase: string): string {
  if (phase.startsWith('iteration') || phase === 'v4_agent_loop' || phase === 'v4_agent' || phase.startsWith('v4_tool_')) return 'loop'
  if (phase === 'v4_critic' || phase === 'critic') return 'critic'
  if (phase === 'finalize' || phase === 'salvando') return 'finalize'
  if (phase === 'init' || phase === 'config') return 'init'
  return phase
}
