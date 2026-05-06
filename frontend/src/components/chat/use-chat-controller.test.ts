import { describe, expect, it } from 'vitest'
import type { ChatTrailEvent } from '../../lib/firestore-types'
import { compactChatTrailForPersistence, mergeStreamingTrailEvent } from './use-chat-controller'

describe('chat controller trail helpers', () => {
  it('coalesces consecutive streaming events instead of appending every token', () => {
    const first: ChatTrailEvent = {
      type: 'agent_token',
      agent_key: 'chat_critic',
      delta: 'A',
      total: 'A',
      ts: '2026-05-06T17:00:00.000Z',
    }
    const second: ChatTrailEvent = {
      type: 'agent_token',
      agent_key: 'chat_critic',
      delta: 'B',
      total: 'AB',
      ts: '2026-05-06T17:00:01.000Z',
    }

    const trail = mergeStreamingTrailEvent([first], second)

    expect(trail).toHaveLength(1)
    expect(trail[0]).toMatchObject({ type: 'agent_token', total: 'AB' })
  })

  it('keeps chronological milestones while compacting oversized streaming payloads for persistence', () => {
    const trail: ChatTrailEvent[] = [
      { type: 'iteration_start', i: 1, ts: '2026-05-06T17:00:00.000Z' },
      {
        type: 'orchestrator_thought',
        delta: 'x'.repeat(1000),
        total: 'y'.repeat(7000),
        ts: '2026-05-06T17:00:01.000Z',
      },
      { type: 'final_answer', ts: '2026-05-06T17:00:02.000Z' },
    ]

    const compacted = compactChatTrailForPersistence(trail)

    expect(compacted).toHaveLength(3)
    expect(compacted[0].type).toBe('iteration_start')
    expect(compacted[2].type).toBe('final_answer')
    expect(compacted[1]).toMatchObject({ type: 'orchestrator_thought' })
    if (compacted[1].type === 'orchestrator_thought') {
      expect(compacted[1].total.length).toBeLessThanOrEqual(6000 + 64)
      expect(compacted[1].total).toContain('conteúdo de streaming resumido')
    }
  })
})
