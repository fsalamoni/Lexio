import { describe, expect, it } from 'vitest'
import {
  buildClipExecution,
  buildLiteralClipPrompt,
  getDefaultVideoRenderPresets,
  resolveVideoRenderPreset,
} from './literal-video-production'
import type { DesignGuide, VideoClipAsset, VideoScene } from './video-generation-pipeline'

describe('literal-video-production presets', () => {
  it('returns cloned default presets so callers cannot mutate the shared defaults', () => {
    const first = getDefaultVideoRenderPresets()
    const second = getDefaultVideoRenderPresets()

    expect(first).toHaveLength(3)
    expect(first[0]).not.toBe(second[0])

    first[0].name = 'Mutado localmente'

    expect(second[0].name).not.toBe('Mutado localmente')
  })

  it('resolves the requested preset when available and falls back to the standard 720p preset otherwise', () => {
    const production = {
      renderPresets: [
        {
          id: 'custom-preview',
          name: 'Preview custom',
          description: 'Preset do usuário',
          width: 854,
          height: 480,
          frameRate: 25,
          videoBitsPerSecond: 2_500_000,
        },
      ],
    }

    const chosen = resolveVideoRenderPreset(production as never, 'custom-preview')
    expect(chosen).toEqual({
      id: 'custom-preview',
      name: 'Preview custom',
      description: 'Preset do usuário',
      width: 854,
      height: 480,
      frameRate: 25,
      videoBitsPerSecond: 2_500_000,
    })

    const fallback = resolveVideoRenderPreset(production as never, 'preset-inexistente')
    expect(fallback.id).toBe('render-standard-720p')
    expect(fallback.width).toBe(1280)
    expect(fallback.height).toBe(720)

    const defaultChoice = resolveVideoRenderPreset(undefined, undefined)
    expect(defaultChoice.id).toBe('render-standard-720p')
  })
})

describe('buildLiteralClipPrompt', () => {
  const designGuide: DesignGuide = {
    colorPalette: ['#1a1a2e', '#e94560'],
    fontFamily: 'Inter',
    style: 'Cinemático sóbrio',
    characterDescriptions: [{ name: 'Ana', description: 'advogada de terno azul' }],
    recurringElements: ['logotipo no canto inferior'],
  }
  const scene: VideoScene = {
    number: 1,
    timeStart: '00:00',
    timeEnd: '00:08',
    duration: 8,
    narration: 'Narração da cena',
    visual: 'Visual da cena',
    imagePrompt: 'image prompt',
    videoPrompt: 'Plano aberto do tribunal',
    transition: 'cut',
    soundtrack: '',
    clips: [],
  }

  it('injects the exact design-guide palette and recurring identity into the prompt', () => {
    const prompt = buildLiteralClipPrompt(scene, 1, designGuide, false)
    expect(prompt).toContain('#1a1a2e')
    expect(prompt).toContain('#e94560')
    expect(prompt).toContain('Cinemático sóbrio')
    expect(prompt).toContain('Ana')
    expect(prompt).toContain('logotipo no canto inferior')
  })

  it('adds an explicit continuity clause only when chaining from a previous frame', () => {
    const withFrame = buildLiteralClipPrompt(scene, 1, designGuide, true)
    const withoutFrame = buildLiteralClipPrompt(scene, 1, designGuide, false)
    expect(withFrame).toContain('continuation of the previous clip')
    expect(withoutFrame).not.toContain('continuation of the previous clip')
  })
})

describe('buildClipExecution', () => {
  const baseClip: VideoClipAsset = {
    sceneNumber: 1,
    partNumber: 1,
    startTime: 0,
    endTime: 8,
    duration: 8,
    url: 'blob:clip',
    mimeType: 'video/mp4',
    generatedAt: '2026-05-21T00:00:00.000Z',
  }

  it('attributes a real video cost and the fal provider id to fal clips', () => {
    const execution = buildClipExecution(
      { ...baseClip, generationEngine: 'external-provider', providerName: 'fal' },
      performance.now() - 1000,
    )
    expect(execution.phase).toBe('media_video_clip_generation')
    expect(execution.cost_usd).toBeGreaterThan(0)
    expect(execution.provider_id).toBe('fal')
  })

  it('reports zero cost for browser-rendered fallback clips', () => {
    const execution = buildClipExecution(
      { ...baseClip, generationEngine: 'browser-local', providerName: 'browser-renderer' },
      performance.now(),
    )
    expect(execution.cost_usd).toBe(0)
    expect(execution.provider_id).toBeNull()
  })
})