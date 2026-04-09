import { describe, expect, it } from 'vitest'

import { buildCostBreakdown, createUsageExecutionRecord, getPhaseLabel } from './cost-analytics'

describe('cost analytics coverage', () => {
  it('formats dynamic studio phases with human-friendly labels', () => {
    expect(getPhaseLabel('studio_visual_apresentacao')).toBe('Estúdio: Designer Visual · Apresentação')
    expect(getPhaseLabel('studio_roteirista_audio_script')).toBe('Estúdio: Roteirista · Resumo em Áudio')
    expect(getPhaseLabel('redacao')).toBe('Redação')
  })

  it('aggregates video, audio and presentation executions into the proper function breakdowns', () => {
    const executions = [
      createUsageExecutionRecord({ source_type: 'video_pipeline', source_id: 'nb-1', phase: 'media_image_generation', agent_name: 'Gerador de Imagens', model: 'google/gemini-2.5-flash-preview:image-output', cost_usd: 0.02 }),
      createUsageExecutionRecord({ source_type: 'video_pipeline', source_id: 'nb-1', phase: 'media_video_render', agent_name: 'Renderizador de Vídeo', model: 'browser/video-webm', cost_usd: 0 }),
      createUsageExecutionRecord({ source_type: 'audio_pipeline', source_id: 'nb-1', phase: 'audio_literal_generation', agent_name: 'Narrador / TTS', model: 'openai/tts-1-hd', cost_usd: 0.015 }),
      createUsageExecutionRecord({ source_type: 'presentation_pipeline', source_id: 'nb-1', phase: 'pres_planejador', agent_name: 'Planejador de Apresentação', model: 'openai/gpt-4.1-mini', cost_usd: 0.004 }),
      createUsageExecutionRecord({ source_type: 'presentation_pipeline', source_id: 'nb-1', phase: 'visual_artifact_render', agent_name: 'Renderizador Visual de Apresentação', model: 'browser/svg-render', cost_usd: 0 }),
    ]

    const breakdown = buildCostBreakdown(executions)

    expect(breakdown.by_function.map(item => item.key)).toEqual(expect.arrayContaining([
      'video_pipeline',
      'audio_pipeline',
      'presentation_pipeline',
    ]))
    expect(breakdown.by_phase.find(item => item.key === 'audio_literal_generation')?.label).toBe('Áudio: Geração Literal Final')
    expect(breakdown.by_phase.find(item => item.key === 'visual_artifact_render')?.label).toBe('Caderno: Renderização Visual Final')
    expect(breakdown.by_agent.map(item => item.label)).toEqual(expect.arrayContaining([
      'Gerador de Imagens',
      'Narrador / TTS',
      'Renderizador Visual de Apresentação',
    ]))
  })
})