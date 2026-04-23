export type PipelineExecutionState =
  | 'queued'
  | 'running'
  | 'waiting_io'
  | 'retrying'
  | 'persisting'
  | 'completed'
  | 'failed'
  | 'cancelled'

const TERMINAL_EXECUTION_STATES: ReadonlySet<PipelineExecutionState> = new Set([
  'completed',
  'failed',
  'cancelled',
])

function clampPercent(rawPercent: number): number {
  if (!Number.isFinite(rawPercent)) return 0
  return Math.max(0, Math.min(100, rawPercent))
}

function inferExecutionStateFromPhase(phase: string | undefined): PipelineExecutionState {
  const normalizedPhase = (phase || '').toLowerCase()
  if (!normalizedPhase) return 'running'

  if (
    normalizedPhase.includes('salvand')
    || normalizedPhase.includes('persist')
    || normalizedPhase.includes('finalizando')
  ) {
    return 'persisting'
  }

  if (
    normalizedPhase.includes('aguard')
    || normalizedPhase.includes('espera')
    || normalizedPhase.includes('fila')
  ) {
    return 'waiting_io'
  }

  if (
    normalizedPhase.includes('retry')
    || normalizedPhase.includes('tentando')
    || normalizedPhase.includes('repetindo')
  ) {
    return 'retrying'
  }

  return 'running'
}

export function isTerminalExecutionState(state: PipelineExecutionState | undefined): boolean {
  return Boolean(state && TERMINAL_EXECUTION_STATES.has(state))
}

export function normalizeInFlightPercent(rawPercent: number): number {
  return Math.min(99, clampPercent(rawPercent))
}

export function buildStepProgressPercent(
  step: number,
  total: number,
  options?: { allowTerminal100?: boolean },
): number {
  const safeTotal = total > 0 ? total : 1
  const safeStep = Math.max(0, Math.min(step, safeTotal))
  const computed = Math.round((safeStep / safeTotal) * 100)
  if (options?.allowTerminal100) return clampPercent(computed)
  return normalizeInFlightPercent(computed)
}

export function deriveExecutionState(options: {
  progress: number
  phase?: string
  executionState?: PipelineExecutionState
}): PipelineExecutionState {
  if (options.executionState) return options.executionState
  if (options.progress >= 100) return 'persisting'
  return inferExecutionStateFromPhase(options.phase)
}

export function normalizeProgressForExecution(options: {
  progress: number
  executionState: PipelineExecutionState
}): number {
  const normalized = clampPercent(options.progress)
  if (options.executionState === 'completed') return 100
  if (isTerminalExecutionState(options.executionState)) return normalizeInFlightPercent(normalized)
  return normalizeInFlightPercent(normalized)
}
