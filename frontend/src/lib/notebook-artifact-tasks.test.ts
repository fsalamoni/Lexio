import { describe, expect, it } from 'vitest'
import {
  accumulateOperationalSummary,
  buildOperationalEventKey,
  createEmptyOperationalSummary,
  getNotebookArtifactTaskMetadata,
  STUDIO_PIPELINE_TOTAL_STEPS,
} from './notebook-artifact-tasks'

describe('notebook-artifact-tasks', () => {
  it('parses only valid notebook artifact task metadata', () => {
    expect(getNotebookArtifactTaskMetadata({
      taskKind: 'notebook-artifact',
      notebookId: 'nb-1',
      artifactType: 'resumo',
      artifactLabel: 'Resumo Executivo',
    })).toEqual({
      taskKind: 'notebook-artifact',
      notebookId: 'nb-1',
      artifactType: 'resumo',
      artifactLabel: 'Resumo Executivo',
    })

    expect(getNotebookArtifactTaskMetadata({ taskKind: 'other-task' })).toBeNull()
    expect(getNotebookArtifactTaskMetadata(undefined)).toBeNull()
  })

  it('returns null event keys when no operational signal exists', () => {
    expect(buildOperationalEventKey({ phase: 'noop' })).toBeNull()
    expect(STUDIO_PIPELINE_TOTAL_STEPS).toBe(3)
  })

  it('accumulates operational summary and de-duplicates degradation reasons', () => {
    const first = accumulateOperationalSummary(createEmptyOperationalSummary(), {
      phase: 'studio_pesquisador',
      costUsd: 0.0123,
      durationMs: 1200,
      retryCount: 1,
      usedFallback: true,
      fallbackFrom: 'openrouter/model-a',
    })

    const second = accumulateOperationalSummary(first, {
      phase: 'studio_pesquisador',
      costUsd: 0.01,
      durationMs: 300,
      retryCount: 0,
      usedFallback: true,
      fallbackFrom: 'openrouter/model-a',
    })

    expect(second.totalCostUsd).toBe(0.0223)
    expect(second.totalDurationMs).toBe(1500)
    expect(second.totalRetryCount).toBe(1)
    expect(second.fallbackCount).toBe(2)
    expect(second.degradationReasons).toEqual(['Fallback de model-a'])
    expect(second.phaseCounts).toEqual({ studio_pesquisador: 2 })
  })
})