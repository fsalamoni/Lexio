import { describe, expect, it } from 'vitest'
import { applyDocumentPipelineProgress, createDocumentPipelineSteps } from './document-pipeline'
import { applyDocumentV3PipelineProgress, createDocumentV3PipelineSteps } from './document-v3-pipeline'
import { buildAcervoTrailSteps, buildStudioTrailSteps } from './notebook-pipeline-progress'

describe('pipeline step execution states', () => {
  it('stores executionState on document v2 steps', () => {
    const timers: Record<string, number> = {}
    const steps = applyDocumentPipelineProgress(
      createDocumentPipelineSteps(),
      {
        phase: 'triagem',
        message: 'Aguardando resposta do modelo...',
        percent: 12,
        step: 2,
        totalSteps: 14,
        executionState: 'waiting_io',
      },
      timers,
      1000,
    )

    expect(steps.find(step => step.key === 'triagem')?.executionState).toBe('waiting_io')
  })

  it('stores executionState on document v3 steps', () => {
    const timers: Record<string, number> = {}
    const steps = applyDocumentV3PipelineProgress(
      createDocumentV3PipelineSteps(),
      {
        phase: 'v3_intent_classifier',
        message: 'Persistindo respostas intermediárias...',
        percent: 18,
        step: 2,
        totalSteps: 12,
        executionState: 'persisting',
      },
      timers,
      1000,
    )

    expect(steps.find(step => step.key === 'v3_intent_classifier')?.executionState).toBe('persisting')
  })

  it('preserves waiting_io on notebook acervo active step', () => {
    const steps = buildAcervoTrailSteps({
      phase: 'nb_acervo_buscador',
      message: 'Consultando o buscador...',
      loading: true,
      executionState: 'waiting_io',
    })

    expect(steps.find(step => step.key === 'nb_acervo_buscador')).toMatchObject({
      status: 'active',
      executionState: 'waiting_io',
    })
  })

  it('preserves waiting_io on notebook studio active step', () => {
    const steps = buildStudioTrailSteps({
      id: 'task-1',
      name: 'Studio',
      status: 'running',
      executionState: 'waiting_io',
      progress: 42,
      phase: 'Aguardando resposta do especialista',
      startedAt: 100,
      currentStep: 2,
      totalSteps: 3,
    }, 'audio_script')

    expect(steps.find(step => step.key === 'studio_specialist')).toMatchObject({
      status: 'active',
      executionState: 'waiting_io',
    })
  })
})