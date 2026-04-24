import { afterEach, describe, expect, it, vi } from 'vitest'
import { callLLM, ModelUnavailableError, RELIABLE_TEXT_FALLBACK_MODEL, pickReliableFallback } from './llm-client'

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
})