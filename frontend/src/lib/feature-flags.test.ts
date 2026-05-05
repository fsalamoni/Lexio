import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearRuntimeFeatureFlags,
  getFlagState,
  getNonRuntimeFlagState,
  isTruthyFlag,
  isEnabled,
  setRuntimeFeatureFlags,
} from './feature-flags'

afterEach(() => {
  clearRuntimeFeatureFlags()
  try {
    sessionStorage.clear()
  } catch {
    // Ignore environments without sessionStorage.
  }
  vi.unstubAllGlobals()
})

describe('feature-flags', () => {
  it('treats common truthy values as enabled', () => {
    expect(isTruthyFlag('true')).toBe(true)
    expect(isTruthyFlag(' Enabled ')).toBe(true)
    expect(isTruthyFlag('0')).toBe(false)
    expect(isTruthyFlag(undefined)).toBe(false)
  })

  it('uses runtime overrides before env/default values', () => {
    setRuntimeFeatureFlags({ FF_DOC_REDATOR_10K: true })

    expect(isEnabled('FF_DOC_REDATOR_10K')).toBe(true)
    expect(getFlagState('FF_DOC_REDATOR_10K')).toEqual({ enabled: true, source: 'runtime' })
  })

  it('keeps session overrides above runtime overrides', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
      clear: () => {
        storage.clear()
      },
    })

    setRuntimeFeatureFlags({ FF_HANDOFF_STATE_MACHINE: false })
    sessionStorage.setItem('lexio:ff:FF_HANDOFF_STATE_MACHINE', 'true')

    expect(isEnabled('FF_HANDOFF_STATE_MACHINE')).toBe(true)
    expect(getFlagState('FF_HANDOFF_STATE_MACHINE')).toEqual({ enabled: true, source: 'sessionStorage' })
  })

  it('can resolve inherited state without runtime overrides', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
      clear: () => {
        storage.clear()
      },
    })

    setRuntimeFeatureFlags({ FF_HANDOFF_STATE_MACHINE: false, FF_DOC_REDATOR_10K: true })
    sessionStorage.setItem('lexio:ff:FF_HANDOFF_STATE_MACHINE', 'true')

    expect(getNonRuntimeFlagState('FF_HANDOFF_STATE_MACHINE')).toEqual({ enabled: true, source: 'sessionStorage' })
    expect(getNonRuntimeFlagState('FF_DOC_REDATOR_10K')).toEqual({ enabled: false, source: 'default' })
  })
})