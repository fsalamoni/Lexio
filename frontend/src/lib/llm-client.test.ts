import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callLLM,
  callLLMWithFallback,
  callLLMWithMessagesFallback,
  ModelUnavailableError,
  RELIABLE_TEXT_FALLBACK_MODEL,
  TransientLLMError,
} from './llm-client'

function unavailableModelResponse() {
  return new Response(
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
  )
}

function gatewayTimeoutResponse() {
  return new Response(
    JSON.stringify({
      error: {
        message: 'The operation was aborted',
        code: 504,
        metadata: { provider_name: 'upstream' },
      },
    }),
    { status: 504, headers: { 'Content-Type': 'application/json' } },
  )
}

function successResponse(content: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 22,
        cost: 0.0001,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

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

  it('classifies upstream 504 gateway timeouts as TransientLLMError so the user-chosen fallback can take over', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(gatewayTimeoutResponse())

    await expect(
      callLLM('sk-or-test', 'system', 'user', 'slow/model'),
    ).rejects.toBeInstanceOf(TransientLLMError)
  })

  it('classifies upstream 502/503/429 responses as TransientLLMError', async () => {
    for (const status of [429, 502, 503]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Service unavailable', { status }),
      )
      await expect(
        callLLM('sk-or-test', 'system', 'user', 'flaky/model'),
      ).rejects.toBeInstanceOf(TransientLLMError)
      vi.restoreAllMocks()
    }
  })

  describe('RELIABLE_TEXT_FALLBACK_MODEL', () => {
    it('uses google/gemini-2.0-flash (kept exported for backward compatibility)', () => {
      // Policy: never auto-fallback to non-user models. Constant is kept so
      // legacy callers that explicitly opt-in by passing it as a fallback
      // candidate still work, but it is not injected silently anymore.
      expect(RELIABLE_TEXT_FALLBACK_MODEL).toBe('google/gemini-2.0-flash')
    })
  })

  describe('user-controlled fallback', () => {
    it('falls back to the user-supplied model when the primary is unavailable', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      fetchSpy
        .mockResolvedValueOnce(unavailableModelResponse())            // primary fails
        .mockResolvedValueOnce(successResponse('ok from user fallback')) // user fallback succeeds

      const result = await callLLMWithFallback(
        'sk-or-test',
        'system',
        'user',
        'broken/model',
        'user/chosen-fallback',
      )

      expect(result.content).toBe('ok from user fallback')
      expect(result.model).toBe('user/chosen-fallback')
      expect(result.operational?.fallbackUsed).toBe(true)
      expect(result.operational?.fallbackFrom).toBe('broken/model')
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('walks an ordered priority list of user-chosen fallbacks, skipping the failed model', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      fetchSpy
        .mockResolvedValueOnce(unavailableModelResponse())        // primary fails
        .mockResolvedValueOnce(unavailableModelResponse())        // priority #1 fails too
        .mockResolvedValueOnce(successResponse('priority #2 ok')) // priority #2 succeeds

      const result = await callLLMWithFallback(
        'sk-or-test',
        'system',
        'user',
        'broken/primary',
        // The failed primary is also listed → must be skipped automatically
        ['broken/primary', 'user/priority-1', 'user/priority-2'],
      )

      expect(result.content).toBe('priority #2 ok')
      expect(result.model).toBe('user/priority-2')
      expect(result.operational?.fallbackUsed).toBe(true)
      expect(result.operational?.fallbackFrom).toBe('broken/primary')
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('triggers the user-chosen fallback on upstream 504 gateway timeouts', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      fetchSpy
        .mockResolvedValueOnce(gatewayTimeoutResponse())              // primary 504
        .mockResolvedValueOnce(successResponse('ok from fallback'))   // fallback ok

      const result = await callLLMWithFallback(
        'sk-or-test',
        'system',
        'user',
        'broken/primary',
        ['user/priority-1'],
      )

      expect(result.content).toBe('ok from fallback')
      expect(result.operational?.fallbackUsed).toBe(true)
      expect(result.operational?.fallbackReason).toBe('transient_error')
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('does NOT inject a non-user-chosen fallback when the user list is empty', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      fetchSpy.mockResolvedValueOnce(unavailableModelResponse())

      await expect(
        callLLMWithFallback('sk-or-test', 'system', 'user', 'broken/model', []),
      ).rejects.toBeInstanceOf(ModelUnavailableError)

      // Strict policy: only the primary attempt happens — no silent fallback.
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('does NOT inject a non-user-chosen fallback when the only fallback equals the failed primary', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      fetchSpy.mockResolvedValueOnce(unavailableModelResponse())

      await expect(
        callLLMWithFallback('sk-or-test', 'system', 'user', 'broken/model', 'broken/model'),
      ).rejects.toBeInstanceOf(ModelUnavailableError)

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('applies the same user-controlled fallback strategy for messages-based calls', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      fetchSpy
        .mockResolvedValueOnce(unavailableModelResponse())
        .mockResolvedValueOnce(successResponse('ok from messages fallback'))

      const result = await callLLMWithMessagesFallback(
        'sk-or-test',
        [{ role: 'user', content: 'hi' }],
        'broken/messages-model',
        ['user/messages-fallback'],
      )

      expect(result.content).toBe('ok from messages fallback')
      expect(result.model).toBe('user/messages-fallback')
      expect(result.operational?.fallbackUsed).toBe(true)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('does not retry timeout on the same model, surfacing TransientLLMError immediately', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new DOMException('timed out', 'AbortError'),
      )

      await expect(
        callLLM('sk-or-test', 'system', 'user', 'slow/model'),
      ).rejects.toBeInstanceOf(TransientLLMError)

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })
})
