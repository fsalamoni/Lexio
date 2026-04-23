import { describe, expect, it } from 'vitest'
import { parsePositiveInt, resolveAdaptiveConcurrency } from './runtime-concurrency'

describe('runtime-concurrency', () => {
  it('parses only positive integers from env-like strings', () => {
    expect(parsePositiveInt('3')).toBe(3)
    expect(parsePositiveInt('003')).toBe(3)
    expect(parsePositiveInt('0')).toBeNull()
    expect(parsePositiveInt('-1')).toBeNull()
    expect(parsePositiveInt('abc')).toBeNull()
    expect(parsePositiveInt(undefined)).toBeNull()
  })

  it('uses fallback when env value is invalid', () => {
    const resolved = resolveAdaptiveConcurrency({
      envValue: 'abc',
      fallback: 3,
      max: 6,
      hints: { hardwareConcurrency: 16 },
    })

    expect(resolved).toBe(3)
  })

  it('caps requested env concurrency by runtime hardware budget', () => {
    const resolved = resolveAdaptiveConcurrency({
      envValue: '6',
      fallback: 2,
      max: 6,
      hints: { hardwareConcurrency: 4 },
    })

    expect(resolved).toBe(2)
  })

  it('applies memory and network caps before final clamp', () => {
    const resolved = resolveAdaptiveConcurrency({
      envValue: '5',
      fallback: 3,
      max: 6,
      hints: {
        hardwareConcurrency: 12,
        deviceMemoryGb: 3,
        effectiveConnectionType: '3g',
      },
    })

    expect(resolved).toBe(2)
  })

  it('forces single-worker mode when save-data is enabled', () => {
    const resolved = resolveAdaptiveConcurrency({
      envValue: '4',
      fallback: 3,
      max: 6,
      hints: {
        hardwareConcurrency: 12,
        deviceMemoryGb: 8,
        saveData: true,
      },
    })

    expect(resolved).toBe(1)
  })
})
