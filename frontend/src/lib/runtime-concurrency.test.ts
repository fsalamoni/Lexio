import { describe, expect, it } from 'vitest'
import {
  buildRuntimeProfileKey,
  formatAdaptiveConcurrency,
  formatRuntimeHints,
  parsePositiveInt,
  resolveAdaptiveConcurrency,
  resolveAdaptiveConcurrencyWithDiagnostics,
} from './runtime-concurrency'

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

  it('returns diagnostics with active limiters', () => {
    const diagnostics = resolveAdaptiveConcurrencyWithDiagnostics({
      envValue: '6',
      fallback: 3,
      max: 6,
      hints: {
        hardwareConcurrency: 4,
        deviceMemoryGb: 3,
        effectiveConnectionType: '3g',
      },
    })

    expect(diagnostics.preferred).toBe(6)
    expect(diagnostics.runtimeCap).toBe(2)
    expect(diagnostics.resolved).toBe(2)
    expect(diagnostics.limiters).toEqual(expect.arrayContaining(['cpu', 'memory', 'network']))
    expect(diagnostics.preferredSource).toBe('env')
  })

  it('scales auto target up for high-end runtime profiles', () => {
    const diagnostics = resolveAdaptiveConcurrencyWithDiagnostics({
      fallback: 2,
      max: 5,
      hints: {
        hardwareConcurrency: 16,
        deviceMemoryGb: 16,
        effectiveConnectionType: '4g',
      },
    })

    expect(diagnostics.profile).toBe('high_end')
    expect(diagnostics.preferredSource).toBe('auto')
    expect(diagnostics.preferred).toBe(3)
    expect(diagnostics.resolved).toBe(3)
    expect(diagnostics.runtimeCap).toBe(5)
  })

  it('scales auto target down for constrained runtime profiles', () => {
    const diagnostics = resolveAdaptiveConcurrencyWithDiagnostics({
      fallback: 4,
      max: 5,
      hints: {
        hardwareConcurrency: 4,
        deviceMemoryGb: 4,
        effectiveConnectionType: '4g',
      },
    })

    expect(diagnostics.profile).toBe('constrained')
    expect(diagnostics.preferredSource).toBe('auto')
    expect(diagnostics.preferred).toBe(3)
    expect(diagnostics.runtimeCap).toBe(2)
    expect(diagnostics.resolved).toBe(2)
  })

  it('formats diagnostics and runtime profile keys for telemetry', () => {
    const diagnostics = resolveAdaptiveConcurrencyWithDiagnostics({
      fallback: 2,
      max: 4,
      hints: {
        hardwareConcurrency: 8,
        deviceMemoryGb: 4,
        effectiveConnectionType: '4g',
      },
    })

    expect(formatRuntimeHints({
      hardwareConcurrency: 8,
      deviceMemoryGb: 4,
      effectiveConnectionType: '4g',
    })).toBe('cpu 8 | mem 4GB | net 4g')

    expect(formatAdaptiveConcurrency(diagnostics)).toContain('auto 2/2 target 2')
    expect(formatAdaptiveConcurrency(diagnostics)).toContain('profile balanced source auto')
    expect(buildRuntimeProfileKey({
      hardwareConcurrency: 8,
      deviceMemoryGb: 4,
      effectiveConnectionType: '4g',
      saveData: false,
    }, diagnostics)).toContain('profilebalanced')
  })
})
