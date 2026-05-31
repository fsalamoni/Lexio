import { describe, expect, it } from 'vitest'
import { applySystemPromptCache, type ChatMessage } from './llm-client'

const base: ChatMessage[] = [
  { role: 'system', content: 'Você é o orquestrador.' },
  { role: 'user', content: 'oi' },
]

describe('applySystemPromptCache', () => {
  it('adds an ephemeral cache breakpoint to the first system message for anthropic models', () => {
    const out = applySystemPromptCache(base, 'anthropic/claude-sonnet-4')
    expect(Array.isArray(out[0].content)).toBe(true)
    const parts = out[0].content as Array<{ type: string; text: string; cache_control?: { type: string } }>
    expect(parts[0]).toEqual({ type: 'text', text: 'Você é o orquestrador.', cache_control: { type: 'ephemeral' } })
    // user message untouched
    expect(out[1]).toEqual({ role: 'user', content: 'oi' })
  })

  it('is a no-op for non-anthropic models', () => {
    expect(applySystemPromptCache(base, 'openai/gpt-4o')).toBe(base)
    expect(applySystemPromptCache(base, 'google/gemini-2.5-flash')).toBe(base)
  })

  it('only marks the first system message', () => {
    const twoSystems: ChatMessage[] = [
      { role: 'system', content: 'A' },
      { role: 'system', content: 'B' },
      { role: 'user', content: 'x' },
    ]
    const out = applySystemPromptCache(twoSystems, 'anthropic/claude-3.5-haiku')
    expect(Array.isArray(out[0].content)).toBe(true)
    expect(out[1].content).toBe('B') // second system left as-is
  })

  it('leaves an empty system message unchanged', () => {
    const empty: ChatMessage[] = [{ role: 'system', content: '' }, { role: 'user', content: 'x' }]
    expect(applySystemPromptCache(empty, 'anthropic/claude-opus-4')).toBe(empty)
  })
})
