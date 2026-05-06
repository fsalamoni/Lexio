import { describe, expect, it } from 'vitest'

import { buildCostBreakdown, createUsageExecutionRecord, getPhaseLabel } from './cost-analytics'

describe('cost analytics coverage', () => {
  it('formats dynamic studio phases with human-friendly labels', () => {
    expect(getPhaseLabel('studio_visual_apresentacao')).toBe('Estúdio: Designer Visual · Apresentação')
    expect(getPhaseLabel('studio_roteirista_audio_script')).toBe('Estúdio: Roteirista · Resumo em Áudio')
    expect(getPhaseLabel('redacao')).toBe('Redação')
    expect(getPhaseLabel('v3_pipeline_orchestrator')).toBe('V3: Orquestrador do Pipeline')
    expect(getPhaseLabel('pres_image_generator')).toBe('Apresentação: Gerador de Imagens')
    expect(getPhaseLabel('media_video_clip_generation')).toBe('Vídeo: Geração de Clipes por Partes')
  })

  it('aggregates video, audio and presentation executions into the proper function breakdowns', () => {
    const executions = [
      createUsageExecutionRecord({ source_type: 'video_pipeline', source_id: 'nb-1', phase: 'media_image_generation', agent_name: 'Gerador de Imagens', model: 'google/gemini-2.5-flash-preview:image-output', cost_usd: 0.02 }),
      createUsageExecutionRecord({ source_type: 'video_pipeline', source_id: 'nb-1', phase: 'media_video_clip_generation', agent_name: 'Gerador de Clipes', model: 'external-provider/video', cost_usd: 0.07 }),
      createUsageExecutionRecord({ source_type: 'video_pipeline', source_id: 'nb-1', phase: 'media_video_render', agent_name: 'Renderizador de Vídeo', model: 'browser/video-webm', cost_usd: 0 }),
      createUsageExecutionRecord({ source_type: 'audio_pipeline', source_id: 'nb-1', phase: 'audio_literal_generation', agent_name: 'Narrador / TTS', model: 'openai/tts-1-hd', cost_usd: 0.015 }),
      createUsageExecutionRecord({ source_type: 'presentation_pipeline', source_id: 'nb-1', phase: 'pres_planejador', agent_name: 'Planejador de Apresentação', model: 'openai/gpt-4.1-mini', cost_usd: 0.004 }),
      createUsageExecutionRecord({ source_type: 'presentation_pipeline', source_id: 'nb-1', phase: 'pres_image_generator', agent_name: 'Gerador de Imagens de Slides', model: 'google/gemini-2.5-flash-preview:image-output', cost_usd: 0.03 }),
      createUsageExecutionRecord({ source_type: 'presentation_pipeline', source_id: 'nb-1', phase: 'visual_artifact_render', agent_name: 'Renderizador Visual de Apresentação', model: 'browser/svg-render', cost_usd: 0 }),
    ]

    const breakdown = buildCostBreakdown(executions)

    expect(breakdown.by_function.map(item => item.key)).toEqual(expect.arrayContaining([
      'video_pipeline',
      'audio_pipeline',
      'presentation_pipeline',
    ]))
    expect(breakdown.by_phase.find(item => item.key === 'audio_literal_generation')?.label).toBe('Áudio: Geração Literal Final')
    expect(breakdown.by_phase.find(item => item.key === 'pres_image_generator')?.label).toBe('Apresentação: Gerador de Imagens')
    expect(breakdown.by_phase.find(item => item.key === 'media_video_clip_generation')?.label).toBe('Vídeo: Geração de Clipes por Partes')
    expect(breakdown.by_phase.find(item => item.key === 'visual_artifact_render')?.label).toBe('Caderno: Renderização Visual Final')
    expect(breakdown.by_agent.map(item => item.label)).toEqual(expect.arrayContaining([
      'Gerador de Imagens',
      'Gerador de Imagens de Slides',
      'Gerador de Clipes',
      'Narrador / TTS',
      'Renderizador Visual de Apresentação',
    ]))
  })

  it('surfaces the v3 pipeline orchestrator as zero-cost operational usage', () => {
    const executions = [
      createUsageExecutionRecord({
        source_type: 'document_generation_v3',
        source_id: 'doc-v3-1',
        phase: 'v3_pipeline_orchestrator',
        agent_name: 'Orquestrador do Pipeline',
        model: 'anthropic/claude-opus-4.5',
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        execution_state: 'retrying',
        retry_count: 2,
      }),
    ]

    const breakdown = buildCostBreakdown(executions)

    expect(breakdown.by_function.find(item => item.key === 'document_generation_v3')?.label).toBe('Novo Documento v3')
    expect(breakdown.by_phase.find(item => item.key === 'v3_pipeline_orchestrator')?.label).toBe('V3: Orquestrador do Pipeline')
    expect(breakdown.by_agent.find(item => item.label === 'Orquestrador do Pipeline')?.cost_usd).toBe(0)
    expect(breakdown.by_agent_function.find(item => item.key === 'document_generation_v3::Orquestrador do Pipeline')).toBeDefined()
  })
})
