import { describe, expect, it } from 'vitest'
import { buildVideoPipelineProgress } from './video-pipeline-progress'

describe('buildVideoPipelineProgress executionState', () => {
  it('defaults to running for llm phases', () => {
    const progress = buildVideoPipelineProgress(1, 11, 'video_planejador', 'Planejador de Producao')
    expect(progress.executionState).toBe('running')
  })

  it('uses waiting_io for media phases when no explicit state is provided', () => {
    const progress = buildVideoPipelineProgress(10, 11, 'media_image_generation', 'Gerador de Imagens')
    expect(progress.executionState).toBe('waiting_io')
  })

  it('elevates to retrying when retry metadata is present', () => {
    const progress = buildVideoPipelineProgress(5, 11, 'video_designer', 'Designer Visual', {
      retryCount: 2,
    })
    expect(progress.executionState).toBe('retrying')
  })

  it('honors explicit executionState from metadata', () => {
    const progress = buildVideoPipelineProgress(11, 11, 'media_video_render', 'Renderizador de Video', {
      executionState: 'persisting',
    })
    expect(progress.executionState).toBe('persisting')
  })
})
