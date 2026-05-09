import { describe, expect, it } from 'vitest'
import { getDefaultVideoRenderPresets, resolveVideoRenderPreset } from './literal-video-production'

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