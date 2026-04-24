import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  callLLM,
  callLLMWithFallback,
  callLLMWithMessagesFallback,
  ModelUnavailableError,
  RELIABLE_TEXT_FALLBACK_MODEL,
  TransientLLMError,
  pickReliableFallback,
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

  describe('RELIABLE_TEXT_FALLBACK_MODEL', () => {
    it('is not the deprecated google/gemini-2.0-flash-001 model', () => {
      expect(RELIABLE_TEXT_FALLBACK_MODEL).not.toBe('google/gemini-2.0-flash-001')
    })

    it('uses google/gemini-2.0-flash (without version suffix)', () => {
      expect(RELIABLE_TEXT_FALLBACK_MODEL).toBe('google/gemini-2.0-flash')
    })
  })

  describe('pickReliableFallback', () => {
    it('returns the primary model unchanged when it is a paid/reliable model', () => {
      expect(pickReliableFallback('anthropic/claude-3.5-haiku')).toBe('anthropic/claude-3.5-haiku')
      expect(pickReliableFallback('openai/gpt-4o')).toBe('openai/gpt-4o')
      expect(pickReliableFallback('google/gemini-2.0-flash')).toBe('google/gemini-2.0-flash')
    })

    it('returns RELIABLE_TEXT_FALLBACK_MODEL for :free models', () => {
      expect(pickReliableFallback('some/model:free')).toBe(RELIABLE_TEXT_FALLBACK_MODEL)
    })

    it('returns anthropic/claude-3.5-haiku when primary is in the gemini-2.0-flash family to avoid circular fallback', () => {
      expect(pickReliableFallback('google/gemini-2.0-flash:free')).toBe('anthropic/claude-3.5-haiku')
      expect(pickReliableFallback('google/gemini-2.0-flash-lite:free')).toBe('anthropic/claude-3.5-haiku')
    })

    it('returns RELIABLE_TEXT_FALLBACK_MODEL for :experimental models', () => {
      expect(pickReliableFallback('some/model:experimental')).toBe(RELIABLE_TEXT_FALLBACK_MODEL)
    })
  })

  describe('fallback resilience', () => {
    it('tries additional fallback candidates when configured fallback also fails', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      fetchSpy
        .mockResolvedValueOnce(unavailableModelResponse()) // primary
        .mockResolvedValueOnce(unavailableModelResponse()) // configured fallback
        .mockResolvedValueOnce(successResponse('ok from reliable fallback')) // reliable fallback

      const result = await callLLMWithFallback(
        'sk-or-test',
        'system',
        'user',
        'broken/model',
        'broken/fallback',
      )

      expect(result.content).toBe('ok from reliable fallback')
      expect(result.model).toBe(RELIABLE_TEXT_FALLBACK_MODEL)
      expect(result.operational?.fallbackUsed).toBe(true)
      expect(result.operational?.fallbackFrom).toBe('broken/model')
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('applies the same cascading fallback strategy for messages-based calls', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      fetchSpy
        .mockResolvedValueOnce(unavailableModelResponse()) // primary
        .mockResolvedValueOnce(unavailableModelResponse()) // configured fallback
        .mockResolvedValueOnce(successResponse('ok from messages fallback')) // reliable fallback

      const result = await callLLMWithMessagesFallback(
        'sk-or-test',
        [{ role: 'user', content: 'hi' }],
        'broken/messages-model',
        'broken/messages-fallback',
      )

      expect(result.content).toBe('ok from messages fallback')
      expect(result.model).toBe(RELIABLE_TEXT_FALLBACK_MODEL)
      expect(result.operational?.fallbackUsed).toBe(true)
      expect(fetchSpy).toHaveBeenCalledTimes(3)
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
