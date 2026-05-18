import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PROVIDERS } from './providers'

const resolveProviderCallMock = vi.fn()
const getCurrentUserIdMock = vi.fn()
const openRouterChatCompletionsUrl = `${PROVIDERS.openrouter.baseUrl}/api/v1/chat/completions`

vi.mock('./provider-credentials', () => ({
  resolveProviderCall: (...args: unknown[]) => resolveProviderCallMock(...args),
}))

vi.mock('./firestore-service', () => ({
  getCurrentUserId: (...args: unknown[]) => getCurrentUserIdMock(...args),
}))

import { DEFAULT_IMAGE_MODEL, generateImage } from './image-generation-client'

describe('image-generation-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentUserIdMock.mockReturnValue('user-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rewrites stale OpenRouter image model IDs before sending the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                {
                  type: 'image_url',
                  image_url: { url: 'data:image/png;base64,AAAA' },
                },
              ],
            },
          },
        ],
        usage: { total_cost: 0.02 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    resolveProviderCallMock.mockRejectedValue(new Error('Chave de API ausente para "Google AI".'))

    const result = await generateImage({
      apiKey: 'sk-or-v1-test',
      prompt: 'Gerar imagem executiva',
      model: 'black-forest-labs/flux-schnell',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe(DEFAULT_IMAGE_MODEL)
    expect(result.model).toBe(DEFAULT_IMAGE_MODEL)
  })

  it('falls back to a safe OpenRouter image model when the preferred model returns 404', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'model not found',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: [
                  {
                    type: 'image_url',
                    image_url: { url: 'data:image/png;base64,AAAA' },
                  },
                ],
              },
            },
          ],
          usage: { total_cost: 0.02 },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    resolveProviderCallMock.mockRejectedValue(new Error('Chave de API ausente para "Google AI".'))

    const result = await generateImage({
      apiKey: 'sk-or-v1-test',
      prompt: 'Gerar imagem executiva',
      model: DEFAULT_IMAGE_MODEL,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(openRouterChatCompletionsUrl)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe(DEFAULT_IMAGE_MODEL)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).model).toBe('google/gemini-3.1-flash-image-preview')
    expect(result.model).toBe('google/gemini-3.1-flash-image-preview')
  })

  it('skips OpenRouter image models that already failed with 404 in the current session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'model not found',
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: [
                  {
                    type: 'image_url',
                    image_url: { url: 'data:image/png;base64,AAAA' },
                  },
                ],
              },
            },
          ],
          usage: { total_cost: 0.02 },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    resolveProviderCallMock.mockRejectedValue(new Error('Chave de API ausente para "Google AI".'))

    await generateImage({
      apiKey: 'sk-or-v1-test',
      prompt: 'Gerar primeira imagem executiva',
      model: 'unavailable/image-model',
    })
    await generateImage({
      apiKey: 'sk-or-v1-test',
      prompt: 'Gerar segunda imagem executiva',
      model: 'unavailable/image-model',
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('unavailable/image-model')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).model).toBe('google/gemini-3.1-flash-image-preview')
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).model).toBe('google/gemini-3.1-flash-image-preview')
  })

  it('keeps direct OpenAI image generation even when the legacy key looks like OpenRouter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: 'BBBB' }],
        usage: { total_cost: 0.11 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    resolveProviderCallMock.mockResolvedValue({
      provider: {
        id: 'openai',
        label: 'OpenAI',
        dialect: 'openai-compatible',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
      },
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
    })

    await generateImage({
      apiKey: 'sk-or-v1-legacy',
      prompt: 'Gerar imagem institucional',
      model: 'openai/gpt-image-1',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/images/generations')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('gpt-image-1')
  })
})
