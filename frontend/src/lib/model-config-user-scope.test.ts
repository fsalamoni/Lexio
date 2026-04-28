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

import {
  DEPRECATED_MODEL_REWRITES,
  loadAgentModels,
  ModelCapabilityMismatchError,
  ModelNotInUserCatalogError,
  resolveFallbackModelsForCategory,
  rewriteDeprecatedModelId,
  saveAgentModels,
  validateScopedAgentModels,
} from './model-config'

const textOnlyModel = {
  id: 'allowed/model',
  label: 'Allowed Model',
  provider: 'Custom',
  tier: 'balanced' as const,
  description: 'Permitido no catálogo pessoal',
  contextWindow: 128000,
  inputCost: 1,
  outputCost: 2,
  isFree: false,
  agentFit: { extraction: 7, synthesis: 7, reasoning: 7, writing: 7 },
  capabilities: ['text'] as const,
}

const imageModel = {
  id: 'allowed/image-model',
  label: 'Image Model',
  provider: 'Custom',
  tier: 'balanced' as const,
  description: 'Modelo com geração de imagem',
  contextWindow: 128000,
  inputCost: 1,
  outputCost: 2,
  isFree: false,
  agentFit: { extraction: 5, synthesis: 5, reasoning: 5, writing: 5 },
  capabilities: ['image'] as const,
}

const audioModel = {
  id: 'allowed/audio-model',
  label: 'Audio Model',
  provider: 'Custom',
  tier: 'balanced' as const,
  description: 'Modelo com geração de áudio',
  contextWindow: 128000,
  inputCost: 1,
  outputCost: 2,
  isFree: false,
  agentFit: { extraction: 5, synthesis: 5, reasoning: 5, writing: 5 },
  capabilities: ['audio'] as const,
}

const personalCatalog = [textOnlyModel]

describe('model-config personal catalog enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUserIdMock.mockReturnValue('user-1')
    saveUserSettingsMock.mockResolvedValue(undefined)
  })

  it('ignores saved agent selections that are not in the user personal catalog', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({
      model_catalog: personalCatalog,
      agent_models: {
        triagem: 'forbidden/model',
        pesquisador: 'allowed/model',
      },
    })

    const result = await loadAgentModels('user-1')

    expect(result.triagem).toBe('')
    expect(result.pesquisador).toBe('allowed/model')
  })

  it('rejects saving an agent model that is outside the user personal catalog', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({ model_catalog: personalCatalog })

    await expect(saveAgentModels({ triagem: 'forbidden/model' } as never, 'user-1')).rejects.toBeInstanceOf(ModelNotInUserCatalogError)
    expect(saveUserSettingsMock).not.toHaveBeenCalled()
  })

  it('rejects runtime validation when a pipeline tries to use a model outside the user catalog', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({ model_catalog: personalCatalog })

    await expect(
      validateScopedAgentModels('agent_models', { triagem: 'forbidden/model' }, 'user-1'),
    ).rejects.toBeInstanceOf(ModelNotInUserCatalogError)
  })
})

describe('media agent capability validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUserIdMock.mockReturnValue('user-1')
    saveUserSettingsMock.mockResolvedValue(undefined)
  })

  it('rejects video pipeline when video_image_generator lacks image capability', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({
      model_catalog: [textOnlyModel, audioModel],
    })

    await expect(
      validateScopedAgentModels('video_pipeline_models', {
        video_planejador: 'allowed/model',
        video_roteirista: 'allowed/model',
        video_diretor_cena: 'allowed/model',
        video_storyboarder: 'allowed/model',
        video_designer: 'allowed/model',
        video_compositor: 'allowed/model',
        video_narrador: 'allowed/model',
        video_revisor: 'allowed/model',
        video_clip_planner: 'allowed/model',
        video_image_generator: 'allowed/model',
        video_tts: 'allowed/audio-model',
      }, 'user-1'),
    ).rejects.toBeInstanceOf(ModelCapabilityMismatchError)
  })

  it('rejects video pipeline when video_tts lacks audio capability', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({
      model_catalog: [textOnlyModel, imageModel],
    })

    await expect(
      validateScopedAgentModels('video_pipeline_models', {
        video_planejador: 'allowed/model',
        video_roteirista: 'allowed/model',
        video_diretor_cena: 'allowed/model',
        video_storyboarder: 'allowed/model',
        video_designer: 'allowed/model',
        video_compositor: 'allowed/model',
        video_narrador: 'allowed/model',
        video_revisor: 'allowed/model',
        video_clip_planner: 'allowed/model',
        video_image_generator: 'allowed/image-model',
        video_tts: 'allowed/model',
      }, 'user-1'),
    ).rejects.toBeInstanceOf(ModelCapabilityMismatchError)
  })

  it('rejects audio pipeline when audio_narrador lacks audio capability', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({
      model_catalog: [textOnlyModel],
    })

    await expect(
      validateScopedAgentModels('audio_pipeline_models', {
        audio_planejador: 'allowed/model',
        audio_roteirista: 'allowed/model',
        audio_diretor: 'allowed/model',
        audio_produtor_sonoro: 'allowed/model',
        audio_narrador: 'allowed/model',
        audio_revisor: 'allowed/model',
      }, 'user-1'),
    ).rejects.toBeInstanceOf(ModelCapabilityMismatchError)
  })

  it('rejects presentation pipeline when pres_image_generator lacks image capability', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({
      model_catalog: [textOnlyModel],
    })

    await expect(
      validateScopedAgentModels('presentation_pipeline_models', {
        pres_planejador: 'allowed/model',
        pres_pesquisador: 'allowed/model',
        pres_redator: 'allowed/model',
        pres_designer: 'allowed/model',
        pres_image_generator: 'allowed/model',
        pres_revisor: 'allowed/model',
      }, 'user-1'),
    ).rejects.toBeInstanceOf(ModelCapabilityMismatchError)
  })

  it('accepts video pipeline when all media agents have correct capabilities', async () => {
    ensureUserSettingsMigratedMock.mockResolvedValue({
      model_catalog: [textOnlyModel, imageModel, audioModel],
    })

    await expect(
      validateScopedAgentModels('video_pipeline_models', {
        video_planejador: 'allowed/model',
        video_roteirista: 'allowed/model',
        video_diretor_cena: 'allowed/model',
        video_storyboarder: 'allowed/model',
        video_designer: 'allowed/model',
        video_compositor: 'allowed/model',
        video_narrador: 'allowed/model',
        video_revisor: 'allowed/model',
        video_clip_planner: 'allowed/model',
        video_image_generator: 'allowed/image-model',
        video_tts: 'allowed/audio-model',
      }, 'user-1'),
    ).resolves.toBeUndefined()
  })
})

describe('deprecated model ID rewrites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUserIdMock.mockReturnValue('user-1')
    saveUserSettingsMock.mockResolvedValue(undefined)
  })

  it('exposes the gemini 2.0 → 2.5 deprecation map', () => {
    // Sanity check on the rewrite map so a future refactor doesn't silently
    // drop the migration that keeps users with stale settings working.
    expect(DEPRECATED_MODEL_REWRITES['google/gemini-2.0-flash-001']).toBe('google/gemini-2.5-flash')
    expect(DEPRECATED_MODEL_REWRITES['google/gemini-2.0-flash-lite-001']).toBe('google/gemini-2.5-flash-lite')
    expect(rewriteDeprecatedModelId('google/gemini-2.0-flash-001')).toBe('google/gemini-2.5-flash')
    expect(rewriteDeprecatedModelId('anthropic/claude-sonnet-4')).toBe('anthropic/claude-sonnet-4')
    expect(rewriteDeprecatedModelId(undefined)).toBe('')
  })

  it('auto-promotes deprecated agent model overrides to their replacement at load time', async () => {
    // User saved the legacy gemini-2.0-flash-001 ID before Google deprecated
    // it. The catalog now only contains the 2.5 replacement, so the load
    // helper should rewrite the saved ID and apply it as the active model.
    const replacementCatalog = [{
      id: 'google/gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      provider: 'Google',
      tier: 'fast' as const,
      description: 'replacement',
      contextWindow: 1_000_000,
      inputCost: 0.30,
      outputCost: 2.50,
      isFree: false,
      agentFit: { extraction: 9, synthesis: 6, reasoning: 6, writing: 6 },
      capabilities: ['text'] as const,
    }]
    ensureUserSettingsMigratedMock.mockResolvedValue({
      model_catalog: replacementCatalog,
      agent_models: {
        triagem: 'google/gemini-2.0-flash-001',
      },
    })

    const result = await loadAgentModels('user-1')

    expect(result.triagem).toBe('google/gemini-2.5-flash')
  })

  it('rewrites deprecated IDs and de-duplicates them in the fallback priority chain', () => {
    const fallback = resolveFallbackModelsForCategory(
      'google/gemini-2.5-flash',
      'extraction',
      {
        extraction: [
          'google/gemini-2.0-flash-001', // → google/gemini-2.5-flash (== primary, dropped)
          'google/gemini-2.0-flash-lite-001', // → google/gemini-2.5-flash-lite
          'google/gemini-2.5-flash-lite', // duplicate after rewrite, dropped
        ],
      },
    )

    expect(fallback).toEqual(['google/gemini-2.5-flash-lite'])
  })
})