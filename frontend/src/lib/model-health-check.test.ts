import { beforeEach, describe, expect, it, vi } from 'vitest'

const ensureUserSettingsMigratedMock = vi.fn()
const getCurrentUserIdMock = vi.fn()
const saveUserSettingsMock = vi.fn()

const loadModelCatalogMock = vi.fn()
const saveModelCatalogMock = vi.fn()
const fetchProviderModelsMock = vi.fn()
const emitCatalogUpdatedMock = vi.fn()

const resolveProviderForModelMock = vi.fn()
const sanitizeModelCapabilitiesAgainstDefsMock = vi.fn((...args: unknown[]) => (args[1] ?? {}) as Record<string, string>)

vi.mock('./firebase', () => ({
  IS_FIREBASE: true,
}))

vi.mock('./firestore-service', () => ({
  ensureUserSettingsMigrated: (...args: unknown[]) => ensureUserSettingsMigratedMock(...args),
  getCurrentUserId: (...args: unknown[]) => getCurrentUserIdMock(...args),
  saveUserSettings: (...args: unknown[]) => saveUserSettingsMock(...args),
}))

vi.mock('./model-catalog', () => ({
  loadModelCatalog: (...args: unknown[]) => loadModelCatalogMock(...args),
  saveModelCatalog: (...args: unknown[]) => saveModelCatalogMock(...args),
  fetchProviderModels: (...args: unknown[]) => fetchProviderModelsMock(...args),
  emitCatalogUpdated: (...args: unknown[]) => emitCatalogUpdatedMock(...args),
}))

vi.mock('./provider-credentials', () => ({
  resolveProviderForModel: (...args: unknown[]) => resolveProviderForModelMock(...args),
}))

vi.mock('./model-config', async () => {
  const actual = await vi.importActual<typeof import('./model-config')>('./model-config')
  return {
    ...actual,
    sanitizeModelCapabilitiesAgainstDefs: (
      defs: unknown,
      modelMap: Record<string, string>,
      catalog: unknown,
    ) => sanitizeModelCapabilitiesAgainstDefsMock(defs, modelMap, catalog),
  }
})

import { runModelHealthCheck } from './model-health-check'

function mkCatalogModel(id: string, label: string, providerId: string) {
  return {
    id,
    label,
    provider: providerId,
    providerId,
    tier: 'balanced' as const,
    description: 'desc',
    contextWindow: 128_000,
    inputCost: 1,
    outputCost: 1,
    isFree: false,
    agentFit: {
      extraction: 7,
      synthesis: 7,
      reasoning: 7,
      writing: 7,
    },
  }
}

describe('runModelHealthCheck (provider-aware)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    getCurrentUserIdMock.mockReturnValue('user-1')
    ensureUserSettingsMigratedMock.mockResolvedValue({
      api_keys: {
        groq_api_key: 'gsk_test',
      },
      provider_settings: {
        groq: { enabled: true },
      },
      agent_models: {},
    })

    resolveProviderForModelMock.mockReturnValue('groq')
    loadModelCatalogMock.mockResolvedValue([
      mkCatalogModel('llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', 'groq'),
    ])
    saveModelCatalogMock.mockResolvedValue(undefined)
    saveUserSettingsMock.mockResolvedValue(undefined)
  })

  it('does not remove a model when it exists in its own provider catalog', async () => {
    fetchProviderModelsMock.mockResolvedValue([
      mkCatalogModel('llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', 'groq'),
    ])

    const result = await runModelHealthCheck(true)

    expect(result.removedModels).toEqual([])
    expect(result.checkedProviders).toEqual(['groq'])
    expect(result.skippedProviders).toEqual([])
    expect(saveModelCatalogMock).not.toHaveBeenCalled()
  })

  it('skips provider cleanup when provider listing cannot be fetched', async () => {
    fetchProviderModelsMock.mockRejectedValue(new Error('provider unavailable'))

    const result = await runModelHealthCheck(true)

    expect(result.removedModels).toEqual([])
    expect(result.checkedProviders).toEqual([])
    expect(result.skippedProviders).toEqual(['groq'])
    expect(saveModelCatalogMock).not.toHaveBeenCalled()
  })

  it('removes model when provider check succeeds and model is unavailable', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({
      api_keys: {
        groq_api_key: 'gsk_test',
      },
      provider_settings: {
        groq: { enabled: true },
      },
      agent_models: {
        triagem: 'llama-3.3-70b-versatile',
      },
    })
    loadModelCatalogMock.mockResolvedValue([
      mkCatalogModel('llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile', 'groq'),
      mkCatalogModel('llama-3.1-8b-instant', 'Llama 3.1 8B Instant', 'groq'),
    ])
    fetchProviderModelsMock.mockResolvedValue([
      mkCatalogModel('llama-3.1-8b-instant', 'Llama 3.1 8B Instant', 'groq'),
    ])

    const result = await runModelHealthCheck(true)

    expect(result.removedModels).toEqual([
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
    ])
    expect(result.clearedAgents).toEqual([
      {
        configKey: 'agent_models',
        agentKey: 'triagem',
        modelId: 'llama-3.3-70b-versatile',
      },
    ])
    expect(saveModelCatalogMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'llama-3.1-8b-instant' }),
    ])
  })
})
