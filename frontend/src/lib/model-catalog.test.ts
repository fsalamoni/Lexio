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
import { fetchProviderModels, invalidateCatalogCache, loadModelCatalog, providerEntryToModelOption, saveModelCatalog } from './model-catalog'
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

  it('seeds multimodal defaults with explicit capabilities for image and audio generation', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({})
    saveUserSettingsMock.mockResolvedValue(undefined)

    const result = await loadModelCatalog('user-1')

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'google/gemini-2.5-flash-image',
        capabilities: ['image'],
      }),
      expect.objectContaining({
        id: 'openai/tts-1-hd',
        capabilities: ['audio'],
      }),
      expect.objectContaining({
        id: 'openai/tts-1',
        capabilities: ['audio'],
      }),
    ]))
  })

  it('preserves saved personal models and backfills required multimodal defaults when missing', async () => {
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

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'custom/model' }),
      expect.objectContaining({ id: 'google/gemini-2.5-flash-image', capabilities: ['image'] }),
      expect.objectContaining({ id: 'openai/tts-1-hd', capabilities: ['audio'] }),
    ]))
    expect(saveUserSettingsMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        model_catalog: expect.arrayContaining([
          expect.objectContaining({ id: 'custom/model' }),
          expect.objectContaining({ id: 'google/gemini-2.5-flash-image' }),
          expect.objectContaining({ id: 'openai/tts-1-hd' }),
        ]),
      }),
    )
  })

  it('does not rewrite an existing saved catalog when required multimodal defaults are already present', async () => {
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
          capabilities: ['text'],
        },
        {
          id: 'google/gemini-2.5-flash-image',
          label: 'Gemini 2.5 Flash Image',
          provider: 'Google',
          tier: 'balanced',
          description: 'Imagem',
          contextWindow: 1000000,
          inputCost: 0,
          outputCost: 0,
          isFree: false,
          agentFit: { extraction: 1, synthesis: 9, reasoning: 1, writing: 1 },
          capabilities: ['image'],
        },
        {
          id: 'openai/tts-1-hd',
          label: 'TTS 1 HD',
          provider: 'OpenAI',
          tier: 'premium',
          description: 'Audio',
          contextWindow: 128000,
          inputCost: 0,
          outputCost: 0,
          isFree: false,
          agentFit: { extraction: 1, synthesis: 9, reasoning: 1, writing: 1 },
          capabilities: ['audio'],
        },
      ],
    })

    const result = await loadModelCatalog('user-1')

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'custom/model' }),
      expect.objectContaining({ id: 'google/gemini-2.5-flash-image' }),
      expect.objectContaining({ id: 'openai/tts-1-hd' }),
    ]))
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

  it('does not treat zero-priced NVIDIA catalog entries as free without an explicit free flag', () => {
    const option = providerEntryToModelOption(PROVIDERS.nvidia, {
      id: 'nvidia/llama-3.1-nemotron-70b-instruct',
      label: 'Llama 3.1 Nemotron 70B Instruct',
      pricing: {
        prompt: '0',
        completion: '0',
      },
    })

    expect(option.providerId).toBe('nvidia')
    expect(option.provider).toBe('NVIDIA')
    expect(option.isFree).toBe(false)
    expect(option.rateLimits).toBeUndefined()
  })

  it('uses NVIDIA static models instead of fetching the remote catalog when no API key is configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const result = await fetchProviderModels('nvidia', '')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.map(model => model.id)).toEqual(PROVIDERS.nvidia.staticModels.map(model => model.id))
  })
})
