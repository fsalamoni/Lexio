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

import { runWithConcurrency, DOCUMENT_V3_DEFAULT_PARALLEL_LIMIT } from './runtime-concurrency'

describe('runWithConcurrency', () => {
  it('preserves the order of results regardless of completion order', async () => {
    const tasks = [
      () => new Promise<number>(r => setTimeout(() => r(1), 30)),
      () => new Promise<number>(r => setTimeout(() => r(2), 5)),
      () => new Promise<number>(r => setTimeout(() => r(3), 15)),
    ]
    const results = await runWithConcurrency(tasks, 3)
    expect(results).toEqual([1, 2, 3])
  })

  it('serialises tasks when limit=1 (no overlapping intervals)', async () => {
    const intervals: Array<{ started: number; ended: number }> = []
    const makeTask = () => async () => {
      const started = Date.now()
      await new Promise(r => setTimeout(r, 25))
      intervals.push({ started, ended: Date.now() })
    }
    await runWithConcurrency([makeTask(), makeTask(), makeTask()], 1)
    expect(intervals).toHaveLength(3)
    for (let i = 1; i < intervals.length; i++) {
      // Allow a 2ms timer slack
      expect(intervals[i].started + 2).toBeGreaterThanOrEqual(intervals[i - 1].ended)
    }
  })

  it('runs concurrently when limit >= number of tasks', async () => {
    const startedAt: number[] = []
    const tasks = [0, 0, 0].map(() => async () => {
      startedAt.push(Date.now())
      await new Promise(r => setTimeout(r, 25))
    })
    await runWithConcurrency(tasks, 3)
    const minStart = Math.min(...startedAt)
    const maxStart = Math.max(...startedAt)
    expect(maxStart - minStart).toBeLessThan(15)
  })

  it('returns [] for empty input', async () => {
    expect(await runWithConcurrency([], 3)).toEqual([])
  })

  it('propagates the first rejection', async () => {
    const tasks = [
      () => new Promise<number>(r => setTimeout(() => r(1), 5)),
      () => Promise.reject(new Error('boom')),
      () => new Promise<number>(r => setTimeout(() => r(3), 5)),
    ]
    await expect(runWithConcurrency(tasks, 2)).rejects.toThrow('boom')
  })

  it('exposes the default v3 parallel limit', () => {
    expect(DOCUMENT_V3_DEFAULT_PARALLEL_LIMIT).toBeGreaterThanOrEqual(2)
  })
})
