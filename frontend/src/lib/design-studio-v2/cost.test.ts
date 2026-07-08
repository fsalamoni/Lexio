import { describe, expect, it } from 'vitest'
import { buildCostBreakdown, createUsageExecutionRecord, extractDesignStudioSessionExecutions } from '../cost-analytics'

describe('extractDesignStudioSessionExecutions', () => {
  it('maps persisted executions preserving the design_studio_v2 function key', () => {
    const executions = extractDesignStudioSessionExecutions({
      id: 'sess-1',
      title: 'Landing',
      created_at: '2026-07-08T12:00:00.000Z',
      llm_executions: [
        createUsageExecutionRecord({
          source_type: 'design_studio_v2',
          source_id: 'sess-1',
          phase: 'ds2_orchestrator',
          agent_name: 'Orquestrador',
          model: 'anthropic/claude-sonnet-4',
          cost_usd: 0.05,
          tokens_in: 100,
          tokens_out: 200,
        }),
      ],
    })
    expect(executions).toHaveLength(1)
    expect(executions[0].function_key).toBe('design_studio_v2')
    expect(executions[0].source_id).toBe('sess-1')
  })

  it('falls back to a consolidated record from usage_summary when no executions exist', () => {
    const executions = extractDesignStudioSessionExecutions({
      id: 'sess-2',
      created_at: '2026-07-08T12:00:00.000Z',
      usage_summary: { total_tokens_in: 50, total_tokens_out: 80, total_cost_usd: 0.02 },
    })
    expect(executions).toHaveLength(1)
    expect(executions[0].function_key).toBe('design_studio_v2')
    expect(executions[0].cost_usd).toBeCloseTo(0.02)
  })

  it('returns nothing when there is no usage at all', () => {
    expect(extractDesignStudioSessionExecutions({ created_at: '2026-07-08T12:00:00.000Z' })).toEqual([])
  })

  it('aggregates into the design_studio_v2 function bucket in a cost breakdown', () => {
    const executions = extractDesignStudioSessionExecutions({
      id: 'sess-3',
      created_at: '2026-07-08T12:00:00.000Z',
      llm_executions: [
        createUsageExecutionRecord({ source_type: 'design_studio_v2', source_id: 'sess-3', phase: 'ds2_orchestrator', agent_name: 'Orquestrador', model: 'anthropic/claude-sonnet-4', cost_usd: 0.03 }),
        createUsageExecutionRecord({ source_type: 'design_studio_v2', source_id: 'sess-3', phase: 'ds2_reviewer', agent_name: 'Revisor', model: 'anthropic/claude-3.5-haiku', cost_usd: 0.01 }),
      ],
    })
    const breakdown = buildCostBreakdown(executions)
    const func = breakdown.by_function.find((item) => item.key === 'design_studio_v2')
    expect(func?.label).toBe('Design Studio v2')
    expect(breakdown.by_phase.find((p) => p.key === 'ds2_orchestrator')?.label).toBe('Design Studio v2: Orquestrador')
    expect(breakdown.by_phase.find((p) => p.key === 'ds2_reviewer')?.label).toBe('Design Studio v2: Revisor')
  })
})
