import type { TaskOperationalSummary } from '../contexts/TaskManagerContext'
import type { StudioArtifactType } from './firestore-service'

export const STUDIO_PIPELINE_TOTAL_STEPS = 3

export type NotebookArtifactTaskMetadata = {
  taskKind: 'notebook-artifact'
  notebookId: string
  artifactType: StudioArtifactType
  artifactLabel: string
}

export function getNotebookArtifactTaskMetadata(metadata: Record<string, unknown> | undefined): NotebookArtifactTaskMetadata | null {
  if (!metadata) return null
  if (metadata.taskKind !== 'notebook-artifact') return null
  if (typeof metadata.notebookId !== 'string') return null
  if (typeof metadata.artifactType !== 'string') return null
  if (typeof metadata.artifactLabel !== 'string') return null

  return {
    taskKind: 'notebook-artifact',
    notebookId: metadata.notebookId,
    artifactType: metadata.artifactType as StudioArtifactType,
    artifactLabel: metadata.artifactLabel,
  }
}

export function createEmptyOperationalSummary(): TaskOperationalSummary {
  return {
    totalCostUsd: 0,
    totalDurationMs: 0,
    totalRetryCount: 0,
    fallbackCount: 0,
    degradationReasons: [],
    phaseCounts: {},
  }
}

export function buildOperationalEventKey(update: {
  phase?: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackReason?: string
  fallbackFrom?: string
}): string | null {
  const hasSignal =
    (update.costUsd ?? 0) > 0 ||
    (update.durationMs ?? 0) > 0 ||
    (update.retryCount ?? 0) > 0 ||
    Boolean(update.usedFallback) ||
    Boolean(update.fallbackReason) ||
    Boolean(update.fallbackFrom)

  if (!hasSignal) return null

  return [
    update.phase ?? '',
    update.costUsd ?? 0,
    update.durationMs ?? 0,
    update.retryCount ?? 0,
    update.usedFallback ? 1 : 0,
    update.fallbackReason ?? '',
    update.fallbackFrom ?? '',
  ].join('|')
}

export function accumulateOperationalSummary(
  current: TaskOperationalSummary,
  update: {
    phase?: string
    costUsd?: number
    durationMs?: number
    retryCount?: number
    usedFallback?: boolean
    fallbackReason?: string
    fallbackFrom?: string
  },
): TaskOperationalSummary {
  const degradationReason = update.fallbackReason
    || (update.fallbackFrom ? `Fallback de ${update.fallbackFrom.split('/').pop() || update.fallbackFrom}` : undefined)
    || (update.usedFallback ? 'Fallback ativado' : undefined)

  const degradationReasons = degradationReason
    ? Array.from(new Set([...(current.degradationReasons || []), degradationReason]))
    : (current.degradationReasons || [])

  const phaseCounts = {
    ...(current.phaseCounts || {}),
  }

  if (update.phase) {
    phaseCounts[update.phase] = (phaseCounts[update.phase] || 0) + 1
  }

  return {
    totalCostUsd: Number((current.totalCostUsd + (update.costUsd ?? 0)).toFixed(6)),
    totalDurationMs: current.totalDurationMs + Math.max(0, update.durationMs ?? 0),
    totalRetryCount: current.totalRetryCount + Math.max(0, update.retryCount ?? 0),
    fallbackCount: current.fallbackCount + (update.usedFallback ? 1 : 0),
    degradationReasons,
    phaseCounts,
  }
}