import { beforeEach, describe, expect, it, vi } from 'vitest'

const callLLMMock = vi.fn()
const loadPresentationPipelineModelsMock = vi.fn()
const validateScopedAgentModelsMock = vi.fn()

vi.mock('./llm-client', () => ({
  callLLM: (...args: unknown[]) => callLLMMock(...args),
}))

vi.mock('./model-config', () => ({
  loadPresentationPipelineModels: (...args: unknown[]) => loadPresentationPipelineModelsMock(...args),
  validateScopedAgentModels: (...args: unknown[]) => validateScopedAgentModelsMock(...args),
}))

import { runPresentationGenerationPipeline } from './presentation-generation-pipeline'

describe('runPresentationGenerationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadPresentationPipelineModelsMock.mockResolvedValue({
      pres_planejador: 'openai/gpt-4.1-mini',
      pres_pesquisador: 'google/gemini-2.0-flash-001',
      pres_redator: 'anthropic/claude-sonnet-4',
      pres_designer: 'deepseek/deepseek-chat-v3-0324',
      pres_image_generator: 'google/gemini-2.5-flash-preview:image-output',
      pres_revisor: 'openai/gpt-4o',
    })
    validateScopedAgentModelsMock.mockResolvedValue(undefined)

    const presentationJson = JSON.stringify({
      title: 'Apresentação de Teste',
      slides: [
        { number: 1, title: 'Introdução', bullets: ['Ponto 1', 'Ponto 2'], speakerNotes: 'Abra com contexto.', visualSuggestion: 'Plano institucional com contraste elegante.' },
        { number: 2, title: 'Conclusão', bullets: ['Síntese', 'Encaminhamento'], speakerNotes: 'Feche com recomendação.', visualSuggestion: 'Slide final com síntese visual.' },
      ],
    })

    callLLMMock
      .mockResolvedValueOnce({ content: '{"title":"Plano"}', model: 'openai/gpt-4.1-mini', tokens_in: 100, tokens_out: 50, cost_usd: 0.001, duration_ms: 100 })
      .mockResolvedValueOnce({ content: '{"claims":["A"]}', model: 'google/gemini-2.0-flash-001', tokens_in: 100, tokens_out: 50, cost_usd: 0.001, duration_ms: 90 })
      .mockResolvedValueOnce({ content: presentationJson, model: 'anthropic/claude-sonnet-4', tokens_in: 150, tokens_out: 260, cost_usd: 0.003, duration_ms: 130 })
      .mockResolvedValueOnce({ content: presentationJson, model: 'deepseek/deepseek-chat-v3-0324', tokens_in: 120, tokens_out: 200, cost_usd: 0.0015, duration_ms: 110 })
      .mockResolvedValueOnce({ content: presentationJson, model: 'openai/gpt-4o', tokens_in: 90, tokens_out: 160, cost_usd: 0.002, duration_ms: 105 })
  })

  it('runs the five presentation stages and returns normalized presentation JSON', async () => {
    const result = await runPresentationGenerationPipeline({
      apiKey: 'key',
      topic: 'Tema de Teste',
      description: 'Descrição',
      sourceContext: 'Fonte A; Fonte B',
      conversationContext: 'user: detalhe',
      artifactType: 'apresentacao',
      artifactLabel: 'Apresentação',
    })

    const parsed = JSON.parse(result.content)
    expect(parsed.title).toBe('Apresentação de Teste')
    expect(parsed.slides).toHaveLength(2)
    expect(result.executions.map(item => item.phase)).toEqual([
      'pres_planejador',
      'pres_pesquisador',
      'pres_redator',
      'pres_designer',
      'pres_revisor',
    ])
    expect(validateScopedAgentModelsMock).toHaveBeenCalledWith('presentation_pipeline_models', expect.any(Object))
  })
})