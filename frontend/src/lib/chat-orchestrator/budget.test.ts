import { describe, expect, it } from 'vitest'
import { createBudget } from './budget'

describe('budget', () => {
  it('accumulates token usage and reports usedRatio', () => {
    const budget = createBudget(100)
    budget.recordUsage({ total_tokens: 30, cost_usd: 0.01 })
    budget.recordUsage({ total_tokens: 50, cost_usd: 0.02 })
    expect(budget.used().tokens).toBe(80)
    expect(budget.used().cost_usd).toBeCloseTo(0.03, 5)
    expect(budget.usedRatio()).toBeCloseTo(0.8)
    expect(budget.exceeded()).toBe(false)
  })

  it('marks exceeded() when tokens reach the cap', () => {
    const budget = createBudget(100)
    budget.recordUsage({ total_tokens: 100 })
    expect(budget.exceeded()).toBe(true)
  })

  it('respects an explicit hardStop reason', () => {
    const budget = createBudget(100_000)
    expect(budget.exceeded()).toBe(false)
    budget.hardStop('user_cancel')
    expect(budget.exceeded()).toBe(true)
    expect(budget.isHardStopped()).toEqual({ stopped: true, reason: 'user_cancel' })
  })

  it('only persists records that look like full UsageExecutionRecord shapes', () => {
    const budget = createBudget(100_000)
    budget.recordUsage({ total_tokens: 10, cost_usd: 0 })
    expect(budget.records()).toHaveLength(0)

    budget.recordUsage({
      source_type: 'chat_orchestrator',
      source_id: 'turn-1',
      created_at: new Date().toISOString(),
      function_key: 'chat_orchestrator',
      function_label: 'Orquestrador (Chat)',
      phase: 'chat_writer',
      phase_label: 'Chat: Redator',
      agent_name: 'Redator',
      model: 'demo/x',
      model_label: 'demo/x',
      tokens_in: 1,
      tokens_out: 1,
      total_tokens: 2,
      cost_usd: 0.01,
      duration_ms: 1,
    })
    expect(budget.records()).toHaveLength(1)
  })
})
