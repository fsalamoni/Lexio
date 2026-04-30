import { beforeEach, describe, expect, it, vi } from 'vitest'

const ensureUserSettingsMigratedMock = vi.fn()
const getCurrentUserIdMock = vi.fn()
const saveUserSettingsMock = vi.fn()

vi.mock('./firebase', () => ({
  IS_FIREBASE: true,
}))

vi.mock('./firestore-service', () => ({
  ensureUserSettingsMigrated: (...args: unknown[]) => ensureUserSettingsMigratedMock(...args),
  getCurrentUserId: (...args: unknown[]) => getCurrentUserIdMock(...args),
  saveUserSettings: (...args: unknown[]) => saveUserSettingsMock(...args),
}))

import { AVAILABLE_MODELS } from './model-config'
import { invalidateCatalogCache, loadModelCatalog, providerEntryToModelOption, saveModelCatalog } from './model-catalog'
import { PROVIDERS } from './providers'

describe('model-catalog user persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUserIdMock.mockReturnValue('user-1')
    invalidateCatalogCache('user-1')
  })

  it('seeds and persists a personal catalog when the user has none saved', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({})
    saveUserSettingsMock.mockResolvedValue(undefined)

    const result = await loadModelCatalog('user-1')

    expect(result.map(model => model.id)).toEqual(AVAILABLE_MODELS.map(model => model.id))
    expect(saveUserSettingsMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        model_catalog: expect.arrayContaining([
          expect.objectContaining({ id: AVAILABLE_MODELS[0].id }),
        ]),
      }),
    )
  })

  it('returns the saved personal catalog without reseeding when already present', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({
      model_catalog: [
        {
          id: 'custom/model',
          label: 'Custom Model',
          provider: 'Custom',
          tier: 'balanced',
          description: 'Personalizado',
          contextWindow: 123000,
          inputCost: 1,
          outputCost: 2,
          isFree: false,
          agentFit: { extraction: 6, synthesis: 7, reasoning: 8, writing: 7 },
        },
      ],
    })

    const result = await loadModelCatalog('user-1')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('custom/model')
    expect(saveUserSettingsMock).not.toHaveBeenCalled()
  })

  it('rejects saving an empty personal catalog', async () => {
    await expect(saveModelCatalog([], 'user-1')).rejects.toThrow('O catálogo pessoal deve conter pelo menos um modelo.')
  })

  it('does not mark provider models as free when pricing metadata is missing', () => {
    const option = providerEntryToModelOption(PROVIDERS.groq, {
      id: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B Versatile',
    })

    expect(option.isFree).toBe(false)
    expect(option.inputCost).toBe(0)
    expect(option.outputCost).toBe(0)
    expect(option.rateLimits).toBeUndefined()
  })

  it('adds free-tier rate limit metadata for free OpenRouter models', () => {
    const option = providerEntryToModelOption(PROVIDERS.openrouter, {
      id: 'google/gemini-2.5-flash-lite:free',
      label: 'Gemini 2.5 Flash Lite Free',
      pricing: {
        prompt: '0',
        completion: '0',
      },
    })

    expect(option.isFree).toBe(true)
    expect(option.rateLimits).toMatchObject({ rpm: 20, rpd: 200 })
  })
})