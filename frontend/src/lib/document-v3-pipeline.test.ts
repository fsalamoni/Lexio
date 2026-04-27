import { describe, expect, it } from 'vitest'
import {
  applyDocumentV3PipelineProgress,
  buildDocumentV3PipelineProgress,
  createDocumentV3PipelineSteps,
  DOCUMENT_V3_PIPELINE_COMPLETED_PHASE,
  DOCUMENT_V3_PIPELINE_STAGES,
  DOCUMENT_V3_PHASES,
  formatV3PipelineModelLabel,
  getDocumentV3PipelineStage,
} from './document-v3-pipeline'

describe('document-v3-pipeline', () => {
  it('exposes ordered v3 stages covering the four phases plus operational steps', () => {
    const phases = new Set(DOCUMENT_V3_PIPELINE_STAGES.map(s => s.phase))
    expect(phases).toEqual(new Set(['config', 'compreensao', 'analise', 'pesquisa', 'redacao', 'qualidade', 'salvando']))
    // Phase order list must match grouping
    expect(DOCUMENT_V3_PHASES.map(p => p.key)).toEqual([
      'config', 'compreensao', 'analise', 'pesquisa', 'redacao', 'qualidade', 'salvando',
    ])
  })

  it('createDocumentV3PipelineSteps initialises every stage as pending', () => {
    const steps = createDocumentV3PipelineSteps()
    expect(steps).toHaveLength(DOCUMENT_V3_PIPELINE_STAGES.length)
    expect(steps.every(s => s.status === 'pending')).toBe(true)
  })

  it('getDocumentV3PipelineStage returns the matching stage definition', () => {
    expect(getDocumentV3PipelineStage('v3_writer')?.label).toBe('Redator')
    expect(getDocumentV3PipelineStage('does-not-exist')).toBeUndefined()
  })

  it('formatV3PipelineModelLabel shortens common provider model names', () => {
    expect(formatV3PipelineModelLabel('anthropic/claude-3.5-haiku')).toBe('Haiku')
    expect(formatV3PipelineModelLabel('anthropic/claude-sonnet-4')).toBe('Sonnet')
    expect(formatV3PipelineModelLabel('google/gemini-2.0-flash')).toBe('Gemini')
    expect(formatV3PipelineModelLabel(null)).toBe('—')
  })

  it('buildDocumentV3PipelineProgress wires stage metadata and step index', () => {
    const progress = buildDocumentV3PipelineProgress('v3_writer', 'Escrevendo', 80, {
      executionState: 'running',
      modelId: 'anthropic/claude-sonnet-4',
      costUsd: 0.012,
      durationMs: 2000,
    })
    expect(progress.stageLabel).toBe('Redator')
    expect(progress.stagePhase).toBe('redacao')
    expect(progress.modelLabel).toBe('Sonnet')
    expect(progress.percent).toBeLessThanOrEqual(99)
    expect(progress.totalSteps).toBe(DOCUMENT_V3_PIPELINE_STAGES.length)
  })

  it('applyDocumentV3PipelineProgress marks reported step as active and previous-phase steps as completed', () => {
    const steps = createDocumentV3PipelineSteps()
    const timers: Record<string, number> = {}
    const progressOne = buildDocumentV3PipelineProgress('v3_intent_classifier', 'Iniciando', 5, {
      executionState: 'running',
    })
    const afterOne = applyDocumentV3PipelineProgress(steps, progressOne, timers, 1000)
    expect(afterOne.find(s => s.key === 'v3_intent_classifier')?.status).toBe('active')

    const progressTwo = buildDocumentV3PipelineProgress('v3_writer', 'Escrevendo', 80, {
      executionState: 'running',
    })
    const afterTwo = applyDocumentV3PipelineProgress(afterOne, progressTwo, timers, 2000)
    // The earlier-phase active step must auto-complete
    expect(afterTwo.find(s => s.key === 'v3_intent_classifier')?.status).toBe('completed')
    expect(afterTwo.find(s => s.key === 'v3_writer')?.status).toBe('active')
  })

  it('applyDocumentV3PipelineProgress with completed phase marks all steps as completed', () => {
    const steps = createDocumentV3PipelineSteps()
    const timers: Record<string, number> = {}
    const progress = buildDocumentV3PipelineProgress(DOCUMENT_V3_PIPELINE_COMPLETED_PHASE, 'OK', 100, {
      executionState: 'completed',
    })
    const after = applyDocumentV3PipelineProgress(steps, progress, timers, 5000)
    expect(after.every(s => s.status === 'completed')).toBe(true)
  })

  it('applyDocumentV3PipelineProgress preserves parallel siblings — does not overwrite a previously-completed sibling when another sibling reports', () => {
    const steps = createDocumentV3PipelineSteps()
    const timers: Record<string, number> = {}

    // intent_classifier finishes first
    const intentDone = applyDocumentV3PipelineProgress(
      steps,
      buildDocumentV3PipelineProgress('v3_intent_classifier', 'OK', 8, { executionState: 'completed' }),
      timers,
      1000,
    )
    expect(intentDone.find(s => s.key === 'v3_intent_classifier')?.status).toBe('completed')

    // request_parser still running in same phase
    const parserActive = applyDocumentV3PipelineProgress(
      intentDone,
      buildDocumentV3PipelineProgress('v3_request_parser', 'Processando', 10, { executionState: 'running' }),
      timers,
      1500,
    )
    // intent_classifier should remain completed even though it's in the same phase
    expect(parserActive.find(s => s.key === 'v3_intent_classifier')?.status).toBe('completed')
    expect(parserActive.find(s => s.key === 'v3_request_parser')?.status).toBe('active')
  })
})
