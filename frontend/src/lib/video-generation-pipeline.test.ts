import { beforeEach, describe, expect, it, vi } from 'vitest'

const callLLMMock = vi.fn()
const loadVideoPipelineModelsMock = vi.fn()
const validateScopedAgentModelsMock = vi.fn()
const generateImageViaOpenRouterMock = vi.fn()
const generateTTSViaOpenRouterMock = vi.fn()

vi.mock('./llm-client', () => ({
  callLLM: (...args: unknown[]) => callLLMMock(...args),
  callLLMWithFallback: (...args: unknown[]) => callLLMMock(...args),
  ModelUnavailableError: class ModelUnavailableError extends Error { constructor(msg: string) { super(msg); this.name = 'ModelUnavailableError' } },
  TransientLLMError: class TransientLLMError extends Error { constructor(msg: string) { super(msg); this.name = 'TransientLLMError' } },
}))

vi.mock('./model-config', () => ({
  loadVideoPipelineModels: (...args: unknown[]) => loadVideoPipelineModelsMock(...args),
  validateScopedAgentModels: (...args: unknown[]) => validateScopedAgentModelsMock(...args),
  VIDEO_PIPELINE_AGENT_DEFS: [],
}))

vi.mock('./image-generation-client', () => ({
  DEFAULT_IMAGE_MODEL: 'google/gemini-2.5-flash-preview:image-output',
  blobToDataUrl: vi.fn(),
  generateImageViaOpenRouter: (...args: unknown[]) => generateImageViaOpenRouterMock(...args),
}))

vi.mock('./tts-client', () => ({
  DEFAULT_OPENROUTER_TTS_MODEL: 'openai/tts-1-hd',
  generateTTSViaOpenRouter: (...args: unknown[]) => generateTTSViaOpenRouterMock(...args),
}))

import { runVideoGenerationPipeline } from './video-generation-pipeline'

describe('runVideoGenerationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadVideoPipelineModelsMock.mockResolvedValue({
      video_planejador: 'openai/gpt-4.1-mini',
      video_roteirista: 'openai/gpt-4.1-mini',
      video_diretor_cena: 'openai/gpt-4.1-mini',
      video_storyboarder: 'openai/gpt-4.1-mini',
      video_designer: 'openai/gpt-4.1-mini',
      video_compositor: 'openai/gpt-4.1-mini',
      video_narrador: 'openai/gpt-4.1-mini',
      video_revisor: 'openai/gpt-4.1-mini',
      video_clip_planner: 'openai/gpt-4.1-mini',
      video_image_generator: 'google/gemini-2.5-flash-preview:image-output',
      video_tts: 'openai/tts-1-hd',
    })
    validateScopedAgentModelsMock.mockResolvedValue(undefined)
  })

  it('honors cancellation before starting any video agent', async () => {
    const signal = AbortSignal.abort()

    await expect(runVideoGenerationPipeline({
      apiKey: 'key',
      scriptContent: '{"title":"Teste"}',
      topic: 'Tema',
      sourceId: 'notebook-1',
      generateMedia: false,
    }, undefined, signal)).rejects.toMatchObject({ name: 'AbortError' })

    expect(callLLMMock).not.toHaveBeenCalled()
    expect(generateImageViaOpenRouterMock).not.toHaveBeenCalled()
    expect(generateTTSViaOpenRouterMock).not.toHaveBeenCalled()
  })
})
