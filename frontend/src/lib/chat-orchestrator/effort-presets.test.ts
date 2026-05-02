import { describe, expect, it } from 'vitest'
import { EFFORT_PRESETS } from './effort-presets'

describe('chat-orchestrator effort presets', () => {
  it('keeps every effort level under sane invariants', () => {
    for (const [level, preset] of Object.entries(EFFORT_PRESETS)) {
      expect(preset.maxFanOut, `${level} fan-out`).toBeLessThanOrEqual(preset.maxIterations)
      expect(preset.perCallTokenCap, `${level} per-call cap`).toBeLessThan(preset.maxTokens)
      expect(preset.summarizeAt, `${level} summarize ratio`).toBeGreaterThan(0)
      expect(preset.summarizeAt).toBeLessThan(1)
      expect(preset.criticInterval).toBeGreaterThan(0)
    }
  })

  it('makes profundo strictly more generous than rapido', () => {
    expect(EFFORT_PRESETS.profundo.maxIterations).toBeGreaterThan(EFFORT_PRESETS.rapido.maxIterations)
    expect(EFFORT_PRESETS.profundo.maxTokens).toBeGreaterThan(EFFORT_PRESETS.rapido.maxTokens)
    expect(EFFORT_PRESETS.profundo.maxFanOut).toBeGreaterThanOrEqual(EFFORT_PRESETS.rapido.maxFanOut)
  })
})
