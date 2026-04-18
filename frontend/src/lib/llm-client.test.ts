import { afterEach, describe, expect, it, vi } from 'vitest'
import { callLLM, ModelUnavailableError } from './llm-client'

describe('llm-client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('classifies provider returned 404 model errors as ModelUnavailableError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: 'Provider returned error',
            code: 404,
            metadata: {
              raw: 'This model does not exist or is no longer available.',
            },
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(
      callLLM('sk-or-test', 'system', 'user', 'openrouter/removed-model'),
    ).rejects.toBeInstanceOf(ModelUnavailableError)
  })

  it('classifies invalid model 400 responses as ModelUnavailableError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('This is not a valid model for this endpoint.', { status: 400 }),
    )

    await expect(
      callLLM('sk-or-test', 'system', 'user', 'openrouter/invalid-model'),
    ).rejects.toBeInstanceOf(ModelUnavailableError)
  })
})