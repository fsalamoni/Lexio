import { beforeEach, describe, expect, it, vi } from 'vitest'

const callLLMMock = vi.fn()
const loadAudioPipelineModelsMock = vi.fn()
const validateScopedAgentModelsMock = vi.fn()
const synthesizeAudioFromScriptMock = vi.fn()

vi.mock('./llm-client', () => ({
  callLLM: (...args: unknown[]) => callLLMMock(...args),
  callLLMWithFallback: (...args: unknown[]) => callLLMMock(...args),
}))

vi.mock('./model-config', () => ({
  loadAudioPipelineModels: (...args: unknown[]) => loadAudioPipelineModelsMock(...args),
  validateScopedAgentModels: (...args: unknown[]) => validateScopedAgentModelsMock(...args),
}))

vi.mock('./notebook-audio-pipeline', () => ({
  synthesizeAudioFromScript: (...args: unknown[]) => synthesizeAudioFromScriptMock(...args),
}))

import { generateAudioLiteralMedia, runAudioGenerationPipeline } from './audio-generation-pipeline'

describe('runAudioGenerationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadAudioPipelineModelsMock.mockResolvedValue({
      audio_planejador: 'openai/gpt-4.1-mini',
      audio_roteirista: 'anthropic/claude-sonnet-4',
      audio_diretor: 'google/gemini-2.5-flash-preview',
      audio_produtor_sonoro: 'deepseek/deepseek-chat-v3-0324',
      audio_revisor: 'openai/gpt-4o',
      audio_narrador: 'openai/tts-1-hd',
    })
    validateScopedAgentModelsMock.mockResolvedValue(undefined)
    synthesizeAudioFromScriptMock.mockResolvedValue({
      audioBlob: new Blob(['fake-audio'], { type: 'audio/mpeg' }),
      mimeType: 'audio/mpeg',
      chunkCount: 1,
      segmentCount: 2,
    })

    callLLMMock
      .mockResolvedValueOnce({ content: '{"title":"Plano de áudio"}', model: 'openai/gpt-4.1-mini', tokens_in: 100, tokens_out: 50, cost_usd: 0.001, duration_ms: 100 })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: 'Resumo em Áudio — Tema de Teste',
          duration: '10 minutos',
          segments: [
            { time: '00:00', type: 'vinheta', speaker: 'Host A', text: 'Abertura do episódio.', notes: 'Entrada breve' },
            { time: '00:20', type: 'narracao', speaker: 'Host A', text: 'Explicação inicial com base nas fontes.', notes: 'Tom seguro' },
          ],
          productionNotes: ['Trilha discreta'],
        }),
        model: 'anthropic/claude-sonnet-4', tokens_in: 120, tokens_out: 200, cost_usd: 0.002, duration_ms: 120,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: 'Resumo em Áudio — Tema de Teste',
          duration: '10 minutos',
          segments: [
            { time: '00:00', type: 'vinheta', speaker: 'Host A', text: 'Abertura do episódio.', notes: 'Entrada breve' },
            { time: '00:20', type: 'narracao', speaker: 'Host A', text: 'Explicação inicial com base nas fontes.', notes: 'Tom seguro e ritmo contínuo' },
          ],
          productionNotes: ['Trilha discreta'],
        }),
        model: 'google/gemini-2.5-flash-preview', tokens_in: 130, tokens_out: 210, cost_usd: 0.003, duration_ms: 140,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: 'Resumo em Áudio — Tema de Teste',
          duration: '10 minutos',
          segments: [
            { time: '00:00', type: 'vinheta', speaker: 'Host A', text: 'Abertura do episódio.', notes: 'Entrada breve' },
            { time: '00:20', type: 'narracao', speaker: 'Host A', text: 'Explicação inicial com base nas fontes.', notes: 'Tom seguro e ritmo contínuo' },
          ],
          productionNotes: ['Trilha discreta', 'Compressão leve'],
        }),
        model: 'deepseek/deepseek-chat-v3-0324', tokens_in: 90, tokens_out: 180, cost_usd: 0.0015, duration_ms: 90,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: 'Resumo em Áudio — Tema de Teste',
          duration: '10 minutos',
          segments: [
            { time: '00:00', type: 'vinheta', speaker: 'Host A', text: 'Abertura do episódio.', notes: 'Entrada breve' },
            { time: '00:20', type: 'narracao', speaker: 'Host A', text: 'Explicação inicial com base nas fontes.', notes: 'Tom seguro e ritmo contínuo' },
          ],
          productionNotes: ['Trilha discreta', 'Compressão leve'],
        }),
        model: 'openai/gpt-4o', tokens_in: 80, tokens_out: 160, cost_usd: 0.0022, duration_ms: 110,
      })
  })

  it('runs the five tracked audio stages and returns normalized audio-script JSON', async () => {
    const result = await runAudioGenerationPipeline({
      apiKey: 'key',
      topic: 'Tema de Teste',
      description: 'Descrição',
      sourceContext: 'Fonte A; Fonte B',
      conversationContext: 'user: detalhe',
      artifactType: 'audio_script',
      artifactLabel: 'Resumo em Áudio',
    })

    const parsed = JSON.parse(result.content)
    expect(parsed.title).toBe('Resumo em Áudio — Tema de Teste')
    expect(parsed.segments).toHaveLength(2)
    expect(result.executions.map(item => item.phase)).toEqual([
      'audio_planejador',
      'audio_roteirista',
      'audio_diretor',
      'audio_produtor_sonoro',
      'audio_revisor',
    ])
    expect(validateScopedAgentModelsMock).toHaveBeenCalledWith('audio_pipeline_models', expect.any(Object))
  })

  it('generates literal audio inside the audio pipeline module', async () => {
    const result = await generateAudioLiteralMedia({
      apiKey: 'key',
      rawScriptContent: '{"title":"Teste"}',
    })

    expect(result.mimeType).toBe('audio/mpeg')
    expect(result.execution.phase).toBe('audio_literal_generation')
    expect(result.execution.agent_name).toBe('Narrador / TTS')
    expect(synthesizeAudioFromScriptMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a helpful error when an audio stage returns invalid JSON', async () => {
    callLLMMock.mockReset()
    callLLMMock
      .mockResolvedValueOnce({ content: '{"title":"Plano de áudio"}', model: 'openai/gpt-4.1-mini', tokens_in: 100, tokens_out: 50, cost_usd: 0.001, duration_ms: 100 })
      .mockResolvedValueOnce({ content: 'resposta inválida', model: 'anthropic/claude-sonnet-4', tokens_in: 120, tokens_out: 200, cost_usd: 0.002, duration_ms: 120 })

    await expect(runAudioGenerationPipeline({
      apiKey: 'key',
      topic: 'Tema de Teste',
      sourceContext: 'Fonte A',
      conversationContext: '',
      artifactType: 'audio_script',
      artifactLabel: 'Resumo em Áudio',
    })).rejects.toThrow('O roteirista de áudio retornou um roteiro inválido.')
  })
})
