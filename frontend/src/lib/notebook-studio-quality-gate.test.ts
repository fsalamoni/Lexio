import { describe, expect, it } from 'vitest'
import { parseStudioCriticVerdict, studioCriticThreshold } from './notebook-studio-pipeline'

describe('studioCriticThreshold', () => {
  it('is stricter for legal/long-form artifacts and falls back to 75', () => {
    expect(studioCriticThreshold('documento')).toBe(82)
    expect(studioCriticThreshold('relatorio')).toBe(80)
    expect(studioCriticThreshold('apresentacao_v2')).toBe(82)
    expect(studioCriticThreshold('mapa_mental')).toBe(75) // default
    expect(studioCriticThreshold('teste')).toBe(75)
  })
})

describe('parseStudioCriticVerdict', () => {
  it('parses a clean JSON verdict and clamps the score', () => {
    const v = parseStudioCriticVerdict('{"score": 88, "reasons": ["ok"], "should_stop": true}')
    expect(v).toEqual({ score: 88, reasons: ['ok'], should_stop: true })
  })

  it('strips code fences and extracts JSON embedded in prose', () => {
    const fenced = parseStudioCriticVerdict('```json\n{"score": 60, "reasons": ["faltou X"], "should_stop": false}\n```')
    expect(fenced.score).toBe(60)
    expect(fenced.should_stop).toBe(false)

    const prose = parseStudioCriticVerdict('Veredito: {"score": 120, "reasons": [], "should_stop": true} fim')
    expect(prose.score).toBe(100) // clamped to 0-100
  })

  it('does not block delivery when the verdict is unparseable (flags for revision)', () => {
    const v = parseStudioCriticVerdict('não é json')
    expect(v.score).toBe(0)
    expect(v.should_stop).toBe(false)
    expect(v.reasons.length).toBeGreaterThan(0)
  })
})
