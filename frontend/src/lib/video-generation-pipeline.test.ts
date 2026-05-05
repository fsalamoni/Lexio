import { beforeEach, describe, expect, it, vi } from 'vitest'

const callLLMMock = vi.fn()
const loadVideoPipelineModelsMock = vi.fn()
const validateScopedAgentModelsMock = vi.fn()
const generateImageViaOpenRouterMock = vi.fn()
const generateTTSViaOpenRouterMock = vi.fn()
const blobToDataUrlMock = vi.fn()

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
  loadFallbackPriorityConfig: async () => ({}),
  buildPipelineFallbackResolver: () => () => [],
}))

vi.mock('./image-generation-client', () => ({
  DEFAULT_IMAGE_MODEL: 'google/gemini-2.5-flash-preview:image-output',
  blobToDataUrl: (...args: unknown[]) => blobToDataUrlMock(...args),
  generateImageViaOpenRouter: (...args: unknown[]) => generateImageViaOpenRouterMock(...args),
}))

vi.mock('./tts-client', () => ({
  DEFAULT_OPENROUTER_TTS_MODEL: 'openai/tts-1-hd',
  generateTTSViaOpenRouter: (...args: unknown[]) => generateTTSViaOpenRouterMock(...args),
}))

import { runVideoGenerationPipeline, type VideoCheckpoint } from './video-generation-pipeline'

function llmResult(content: string, model: string) {
  return {
    content,
    model,
    tokens_in: 10,
    tokens_out: 20,
    cost_usd: 0.001,
    duration_ms: 100,
  }
}

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
    blobToDataUrlMock.mockResolvedValue('data:audio/mpeg;base64,AAAB')
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

  it('persists runtime telemetry for media batches', async () => {
    callLLMMock
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        title: 'Video teste',
        totalDuration: 8,
        designGuide: {
          colorPalette: ['#111111', '#222222', '#333333', '#444444', '#555555'],
          fontFamily: 'Inter',
          style: 'flat',
          characterDescriptions: [],
          recurringElements: [],
        },
        productionNotes: [],
      }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        scenes: [
          {
            number: 1,
            timeStart: '00:00',
            timeEnd: '00:08',
            duration: 8,
            narration: 'Narracao da cena',
            visual: 'Cena inicial',
            transition: 'corte',
            soundtrack: 'trilha base',
          },
        ],
      }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        scenes: [
          {
            number: 1,
            timeStart: '00:00',
            timeEnd: '00:08',
            duration: 8,
            narration: 'Narracao da cena',
            visual: 'Cena inicial',
            transition: 'corte',
            soundtrack: 'trilha base',
          },
        ],
      }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({ scenes: [] }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        imagePrompts: [
          { sceneNumber: 1, prompt: 'main image prompt', style: 'flat', aspectRatio: '16:9' },
        ],
        videoPrompts: [
          { sceneNumber: 1, prompt: 'main video prompt', duration: 8 },
        ],
      }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({ tracks: [] }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        narrationSegments: [
          {
            sceneNumber: 1,
            text: 'Texto de narracao',
            voiceStyle: 'formal',
            timeStart: '00:00',
            timeEnd: '00:08',
          },
        ],
      }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        approved: true,
        report: 'ok',
        productionNotes: [],
      }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        clips: [
          {
            clipNumber: 1,
            timestamp: 0,
            duration: 8,
            description: 'Clip unico',
            imagePrompt: 'clip image prompt',
            motionDescription: 'static',
            transition: 'crossfade',
          },
        ],
      }), 'openai/gpt-4.1-mini'))

    generateImageViaOpenRouterMock.mockResolvedValue({
      imageDataUrl: 'data:image/png;base64,AAA',
      model: 'google/gemini-2.5-flash-preview:image-output',
      cost_usd: 0.002,
    })
    generateTTSViaOpenRouterMock.mockResolvedValue({
      audioBlob: new Blob(['audio']),
    })

    const progressStageMeta: string[] = []
    const result = await runVideoGenerationPipeline({
      apiKey: 'key',
      scriptContent: '{"title":"Teste"}',
      topic: 'Tema',
      sourceId: 'notebook-1',
      generateMedia: true,
      clipDurationSeconds: 8,
    }, (_step, _total, _phase, _agent, meta) => {
      if (meta?.stageMeta) progressStageMeta.push(meta.stageMeta)
    })

    const mediaImageExecutions = result.executions.filter((execution) => execution.phase === 'media_image_generation')
    const mediaTtsExecutions = result.executions.filter((execution) => execution.phase === 'media_tts_generation')

    expect(mediaImageExecutions.length).toBeGreaterThan(0)
    expect(mediaTtsExecutions.length).toBeGreaterThan(0)

    for (const execution of [...mediaImageExecutions, ...mediaTtsExecutions]) {
      expect(typeof execution.runtime_profile).toBe('string')
      expect(typeof execution.runtime_hints).toBe('string')
      expect(typeof execution.runtime_concurrency).toBe('number')
      expect(typeof execution.runtime_cap).toBe('number')
    }

    expect(progressStageMeta.some((meta) => meta.includes('auto'))).toBe(true)
  })

  it('resumes after a planning checkpoint without rerunning earlier agents', async () => {
    const checkpoint: VideoCheckpoint = {
      completedStep: 4,
      totalSteps: 8,
      planData: {
        title: 'Video teste',
        totalDuration: 8,
        designGuide: {
          colorPalette: ['#111111', '#222222', '#333333', '#444444', '#555555'],
          fontFamily: 'Inter',
          style: 'flat',
          characterDescriptions: [],
          recurringElements: [],
        },
        productionNotes: [],
      },
      scriptData: {
        scenes: [
          {
            number: 1,
            timeStart: '00:00',
            timeEnd: '00:08',
            duration: 8,
            narration: 'Narracao da cena',
            visual: 'Cena inicial',
            transition: 'corte',
            soundtrack: 'trilha base',
          },
        ],
      },
      directedScenes: {
        scenes: [
          {
            number: 1,
            timeStart: '00:00',
            timeEnd: '00:08',
            duration: 8,
            narration: 'Narracao da cena',
            visual: 'Cena inicial dirigida',
            transition: 'corte',
            soundtrack: 'trilha base',
          },
        ],
      },
      storyboardData: { scenes: [] },
      executions: [],
      mediaErrors: [],
      imagesGenerated: 0,
      ttsGenerated: 0,
      clipsDone: 0,
    }

    callLLMMock
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        imagePrompts: [
          { sceneNumber: 1, prompt: 'main image prompt', style: 'flat', aspectRatio: '16:9' },
        ],
        videoPrompts: [
          { sceneNumber: 1, prompt: 'main video prompt', duration: 8 },
        ],
      }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({ tracks: [] }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        narrationSegments: [
          {
            sceneNumber: 1,
            text: 'Texto de narracao',
            voiceStyle: 'formal',
            timeStart: '00:00',
            timeEnd: '00:08',
          },
        ],
      }), 'openai/gpt-4.1-mini'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        approved: true,
        report: 'ok',
        productionNotes: [],
      }), 'openai/gpt-4.1-mini'))

    const result = await runVideoGenerationPipeline({
      apiKey: 'key',
      scriptContent: '{"title":"Teste"}',
      topic: 'Tema',
      sourceId: 'notebook-1',
      generateMedia: false,
      checkpoint,
    })

    expect(callLLMMock).toHaveBeenCalledTimes(4)
    expect(result.package.scenes).toHaveLength(1)
    expect(result.checkpoint?.completedStep).toBe(8)
  })

  it('resumes media generation from a checkpoint without regenerating completed images', async () => {
    const checkpoint: VideoCheckpoint = {
      completedStep: 10,
      totalSteps: 11,
      executions: [],
      mediaErrors: [],
      imagesGenerated: 1,
      ttsGenerated: 0,
      clipsDone: 1,
      assembledPackage: {
        title: 'Video teste',
        totalDuration: 8,
        scenes: [
          {
            number: 1,
            timeStart: '00:00',
            timeEnd: '00:08',
            duration: 8,
            narration: 'Narracao da cena',
            visual: 'Cena inicial',
            imagePrompt: 'clip image prompt',
            videoPrompt: 'clip video prompt',
            transition: 'corte',
            soundtrack: 'trilha base',
            clips: [
              {
                clipNumber: 1,
                sceneNumber: 1,
                timestamp: 0,
                duration: 8,
                description: 'Clip unico',
                imagePrompt: 'clip image prompt',
                motionDescription: 'static',
                transition: 'crossfade',
                generatedImageUrl: 'data:image/png;base64,AAA',
              },
            ],
            generatedImageUrl: 'data:image/png;base64,AAA',
          },
        ],
        narration: [
          {
            sceneNumber: 1,
            text: 'Texto de narracao',
            voiceStyle: 'formal',
            timeStart: '00:00',
            timeEnd: '00:08',
          },
        ],
        tracks: [
          {
            type: 'video',
            label: 'Video',
            segments: [],
          },
          {
            type: 'narration',
            label: 'Narracao',
            segments: [
              {
                id: 'seg-1',
                startTime: 0,
                endTime: 8,
                label: 'Narracao Cena 1',
                content: 'Texto de narracao',
                sceneNumber: 1,
              },
            ],
          },
        ],
        designGuide: {
          colorPalette: ['#111111', '#222222', '#333333', '#444444', '#555555'],
          fontFamily: 'Inter',
          style: 'flat',
          characterDescriptions: [],
          recurringElements: [],
        },
        qualityReport: 'ok',
        productionNotes: [],
      },
    }

    generateTTSViaOpenRouterMock.mockResolvedValue({
      audioBlob: new Blob(['audio']),
    })

    const result = await runVideoGenerationPipeline({
      apiKey: 'key',
      scriptContent: '{"title":"Teste"}',
      topic: 'Tema',
      sourceId: 'notebook-1',
      generateMedia: true,
      checkpoint,
    })

    expect(callLLMMock).not.toHaveBeenCalled()
    expect(generateImageViaOpenRouterMock).not.toHaveBeenCalled()
    expect(generateTTSViaOpenRouterMock).toHaveBeenCalledTimes(1)
    expect(result.package.narration[0].generatedAudioUrl).toBe('data:audio/mpeg;base64,AAAB')
    expect(result.checkpoint?.completedStep).toBe(11)
  })
})
