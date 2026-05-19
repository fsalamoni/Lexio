import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillContext } from './types'

const llmMocks = vi.hoisted(() => ({
  callLLMWithMessages: vi.fn(),
  callLLMWithMessagesFallback: vi.fn(),
}))

vi.mock('../llm-client', () => ({
  callLLMWithMessages: (...args: unknown[]) => llmMocks.callLLMWithMessages(...args),
  callLLMWithMessagesFallback: (...args: unknown[]) => llmMocks.callLLMWithMessagesFallback(...args),
}))

import { dispatchSpecialistAgent } from './dispatch'

function mockContext(overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    uid: 'test-uid',
    conversationId: 'test-conversation',
    turnId: 'test-turn',
    effort: 'medio',
    budget: {
      recordUsage: vi.fn(),
      used: () => ({ tokens: 0, cost_usd: 0 }),
      usedRatio: () => 0,
      exceeded: () => false,
      hardStop: vi.fn(),
      isHardStopped: () => ({ stopped: false }),
      records: () => [],
    },
    signal: new AbortController().signal,
    emit: vi.fn(),
    models: {},
    apiKey: 'test-key',
    mock: false,
    ...overrides,
  } as SkillContext
}

describe('dispatchSpecialistAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    llmMocks.callLLMWithMessages.mockResolvedValue({
      content: 'Resposta especializada',
      model: 'demo/researcher',
      provider_id: 'demo',
      provider_label: 'Demo',
      tokens_in: 12,
      tokens_out: 18,
      cost_usd: 0.001,
      duration_ms: 25,
    })
  })

  it('inherits a configured category model when a newly added specialist has no direct model', async () => {
    const ctx = mockContext({
      models: {
        chat_image_evidence_specialist: '',
        chat_legal_researcher: 'demo/researcher',
      },
    })

    const result = await dispatchSpecialistAgent({
      agentKey: 'chat_image_evidence_specialist',
      task: 'Analise OCR e lacunas.',
      ctx,
    })

    expect(result.output).toBe('Resposta especializada')
    expect(llmMocks.callLLMWithMessages).toHaveBeenCalledWith(
      'test-key',
      expect.any(Array),
      'demo/researcher',
      expect.any(Number),
      0.4,
      expect.any(Object),
    )
  })

  it('returns actionable operational failure markdown when the provider rejects the call', async () => {
    llmMocks.callLLMWithMessages.mockRejectedValue(
      new Error('OpenRouter API error 403: {"error":{"message":"Key limit exceeded (monthly limit).","code":403}}'),
    )

    const ctx = mockContext({
      models: {
        chat_writer: 'openrouter/test-writer',
      },
    })

    const result = await dispatchSpecialistAgent({
      agentKey: 'chat_writer',
      task: 'Redija a resposta final.',
      ctx,
    })

    expect(result.usage).toBeNull()
    expect(result.output).toContain('## Falha operacional')
    expect(result.output).toContain('Limite mensal da chave atingido')
  })
})