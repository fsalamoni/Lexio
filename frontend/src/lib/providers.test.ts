import { describe, expect, it } from 'vitest'

import {
  PROVIDERS,
  PROVIDER_ORDER,
  apiKeyFieldForProvider,
  providerIdFromLabel,
} from './providers'

describe('provider registry', () => {
  it('registers NVIDIA as an OpenAI-compatible provider with catalog support', () => {
    expect(PROVIDER_ORDER).toContain('nvidia')
    expect(PROVIDERS.nvidia).toMatchObject({
      id: 'nvidia',
      label: 'NVIDIA',
      dialect: 'openai-compatible',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      modelsListUrl: 'https://integrate.api.nvidia.com/v1/models',
      modelsListShape: 'openai',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
      supportsBaseUrlOverride: true,
    })
    expect(PROVIDERS.nvidia.staticModels.length).toBeGreaterThan(0)
  })

  it('uses stable NVIDIA settings keys and label resolution', () => {
    expect(apiKeyFieldForProvider('nvidia')).toBe('nvidia_api_key')
    expect(providerIdFromLabel('NVIDIA')).toBe('nvidia')
  })
})
