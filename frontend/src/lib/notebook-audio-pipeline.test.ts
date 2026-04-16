import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateTTSViaOpenRouterMock = vi.fn()

vi.mock('./llm-client', () => ({
  callLLM: vi.fn(),
  callLLMWithFallback: vi.fn(),
}))

vi.mock('./model-config', () => ({
  loadResearchNotebookModels: vi.fn(),
  validateScopedAgentModels: vi.fn(),
}))

vi.mock('./tts-client', () => ({
  generateTTSViaOpenRouter: (...args: unknown[]) => generateTTSViaOpenRouterMock(...args),
}))

import { synthesizeAudioFromScript } from './notebook-audio-pipeline'

describe('synthesizeAudioFromScript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateTTSViaOpenRouterMock.mockResolvedValue({
      audioBlob: new Blob(['fake-audio'], { type: 'audio/mpeg' }),
    })
  })

  it('uses the provided TTS model when synthesizing final audio', async () => {
    const script = JSON.stringify({
      title: 'Resumo em Áudio',
      duration: '5 minutos',
      segments: [
        { time: '00:00', type: 'narracao', speaker: 'Host A', text: 'Primeiro bloco do resumo com conteúdo suficiente para síntese.' },
        { time: '00:20', type: 'narracao', speaker: 'Host B', text: 'Segundo bloco do resumo com informações complementares e encadeamento lógico.' },
      ],
    })

    const result = await synthesizeAudioFromScript({
      apiKey: 'key',
      rawScriptContent: script,
      model: 'openai/tts-1-hd',
    })

    expect(result.chunkCount).toBe(1)
    expect(generateTTSViaOpenRouterMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'openai/tts-1-hd',
    }))
  })
})