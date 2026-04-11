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
  loadAgentModels,
  ModelNotInUserCatalogError,
  saveAgentModels,
  validateScopedAgentModels,
} from './model-config'

const personalCatalog = [
  {
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
  },
]

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