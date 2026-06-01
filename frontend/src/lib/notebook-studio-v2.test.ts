import { describe, expect, it, vi } from 'vitest'
import {
  runStudioPipelineV2,
  studioGenerationMetaPatch,
  DEFAULT_STUDIO_V2_SETTINGS,
  type RunStudioPipelineV2Options,
  type StudioV2LlmCall,
} from './notebook-studio-pipeline'
import type { StudioPipelineInput } from './notebook-studio-pipeline'
import { sanitizeStudioV2Settings } from './model-config'
import type { LLMResult } from './llm-client'
import type { ResearchNotebookModelMap } from './model-config'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fakeResult(content: string, costUsd = 0.01): LLMResult {
  return {
    content,
    model: 'test/model',
    tokens_in: 100,
    tokens_out: 200,
    cost_usd: costUsd,
    duration_ms: 5,
  } as LLMResult
}

function verdict(score: number, shouldStop = false, reasons: string[] = ['melhore X']): string {
  return JSON.stringify({ score, reasons, should_stop: shouldStop })
}

const MODELS: ResearchNotebookModelMap = {
  studio_pesquisador: 'test/research',
  studio_escritor: 'test/writer',
  studio_revisor: 'test/reviewer',
} as ResearchNotebookModelMap

const INPUT: StudioPipelineInput = {
  apiKey: 'unused-in-test',
  uid: 'test-uid',
  topic: 'Responsabilidade civil do Estado',
  sourceContext: 'fonte 1; fonte 2',
  conversationContext: '',
  artifactType: 'resumo', // routes to studio_escritor; default threshold 76
  artifactLabel: 'Resumo',
}

/**
 * Builds an injected llmCall that returns canned content per phase. The `critics`
 * array supplies one verdict JSON per critic round (in order). Research/draft/
 * revision phases return marker content so we can assert the final value.
 */
function makeLlmCall(critics: string[], opts?: { costPerCall?: number }): { call: StudioV2LlmCall; phases: string[] } {
  const phases: string[] = []
  let criticIdx = 0
  let revisionIdx = 0
  const call: StudioV2LlmCall = async ({ phase }) => {
    phases.push(phase)
    const cost = opts?.costPerCall ?? 0.01
    if (phase === 'research') return fakeResult('RESEARCH NOTES', cost)
    if (phase === 'draft') return fakeResult('DRAFT v1', cost)
    if (phase === 'revision') {
      revisionIdx++
      return fakeResult(`REVISED v${revisionIdx + 1}`, cost)
    }
    // critic
    const v = critics[Math.min(criticIdx, critics.length - 1)]
    criticIdx++
    return fakeResult(v, cost)
  }
  return { call, phases }
}

function baseOptions(call: StudioV2LlmCall, settings?: RunStudioPipelineV2Options['settings']): RunStudioPipelineV2Options {
  return {
    llmCall: call,
    models: MODELS,
    fallbackResolver: () => [],
    settings,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('runStudioPipelineV2', () => {
  it('stops at threshold_met on the first critic round when the draft is good enough (no revision)', async () => {
    const { call, phases } = makeLlmCall([verdict(90, false)])
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call))

    expect(result.content).toBe('DRAFT v1')
    expect(result.generation_meta.stop_reason).toBe('threshold_met')
    expect(result.generation_meta.iterations).toBe(1) // only the draft
    expect(result.generation_meta.critic_rounds).toBe(1)
    expect(result.generation_meta.forced_submission).toBe(false)
    expect(result.generation_meta.final_score).toBe(90)
    expect(phases).toEqual(['research', 'draft', 'critic'])
    // research + draft + critic = 3 executions
    expect(result.executions).toHaveLength(3)
  })

  it('runs exactly one guided revision then accepts when the second critic clears the threshold', async () => {
    const { call, phases } = makeLlmCall([verdict(50, false), verdict(85, false)])
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call))

    expect(result.content).toBe('REVISED v2')
    expect(result.generation_meta.stop_reason).toBe('threshold_met')
    expect(result.generation_meta.iterations).toBe(2) // draft + 1 revision
    expect(result.generation_meta.critic_rounds).toBe(2)
    expect(result.generation_meta.scores).toEqual([50, 85])
    expect(result.generation_meta.forced_submission).toBe(false)
    expect(phases).toEqual(['research', 'draft', 'critic', 'revision', 'critic'])
  })

  it('stops with should_stop=true even when the score is below threshold (critic says ready)', async () => {
    const { call } = makeLlmCall([verdict(40, true)])
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call))

    expect(result.generation_meta.stop_reason).toBe('should_stop')
    expect(result.generation_meta.forced_submission).toBe(false)
    expect(result.generation_meta.iterations).toBe(1)
  })

  it('forces submission at max_iterations when the critic never clears the threshold', async () => {
    const { call, phases } = makeLlmCall([verdict(30), verdict(40), verdict(45)])
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call, { maxIterations: 2 }))

    expect(result.generation_meta.stop_reason).toBe('max_iterations')
    expect(result.generation_meta.forced_submission).toBe(true)
    expect(result.generation_meta.iterations).toBe(2) // draft + 1 revision, then capped
    expect(result.content).toBe('REVISED v2')
    // research, draft, critic(30), revision, critic(40) → stop (writingPasses=2 >= max 2)
    expect(phases).toEqual(['research', 'draft', 'critic', 'revision', 'critic'])
  })

  it('stops at the soft cost cap and flags a forced submission', async () => {
    // Each call costs 1.0; cap 2.5 → research(1.0)+draft(2.0) then top-of-loop sees 2.0<2.5,
    // critic(3.0) low → re-check after critic: 3.0>=2.5 → cost_cap forced.
    const { call } = makeLlmCall([verdict(20), verdict(20), verdict(20)], { costPerCall: 1.0 })
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call, { maxIterations: 5, costCapUsd: 2.5 }))

    expect(result.generation_meta.stop_reason).toBe('cost_cap')
    expect(result.generation_meta.forced_submission).toBe(true)
    expect(result.generation_meta.total_cost_usd).toBeGreaterThanOrEqual(2.5)
  })

  it('clamps maxIterations to the hard safety cap (6)', async () => {
    const { call } = makeLlmCall([verdict(10)]) // always low → would loop forever without a cap
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call, { maxIterations: 999 }))

    expect(result.generation_meta.max_iterations).toBe(6)
    expect(result.generation_meta.iterations).toBeLessThanOrEqual(6)
    expect(result.generation_meta.stop_reason).toBe('max_iterations')
  })

  it('respects a criticThreshold override from settings', async () => {
    const { call } = makeLlmCall([verdict(70, false)])
    // default 'resumo' threshold is 76 → 70 would revise; override to 65 → 70 passes.
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call, { criticThreshold: 65 }))

    expect(result.generation_meta.critic_threshold).toBe(65)
    expect(result.generation_meta.stop_reason).toBe('threshold_met')
    expect(result.generation_meta.iterations).toBe(1)
  })

  it('aborts promptly when the signal is already aborted', async () => {
    const { call } = makeLlmCall([verdict(90)])
    const controller = new AbortController()
    controller.abort()
    await expect(
      runStudioPipelineV2(INPUT, undefined, { ...baseOptions(call), signal: controller.signal }),
    ).rejects.toThrow(/cancelada/i)
  })

  it('exposes the v3-compatible result contract (content + executions + quality + iterations)', async () => {
    const { call } = makeLlmCall([verdict(88, false)])
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call))

    expect(typeof result.content).toBe('string')
    expect(Array.isArray(result.executions)).toBe(true)
    expect(result.quality).toEqual({ score: 88, reasons: expect.any(Array), should_stop: false })
    expect(result.iterations).toBe(result.generation_meta.iterations)
    // each execution carries cost/model fields used downstream
    for (const exec of result.executions) {
      expect(exec).toHaveProperty('phase')
      expect(exec).toHaveProperty('cost_usd')
      expect(exec).toHaveProperty('model')
    }
  })

  it('uses sane defaults', () => {
    expect(DEFAULT_STUDIO_V2_SETTINGS.maxIterations).toBe(3)
    expect(DEFAULT_STUDIO_V2_SETTINGS.costCapUsd).toBeGreaterThan(0)
  })

  it('sanitizeStudioV2Settings clamps overrides to safe ranges and drops invalid fields', () => {
    expect(sanitizeStudioV2Settings({ maxIterations: 999, costCapUsd: 1000, criticThreshold: 250 })).toEqual({
      maxIterations: 6,
      costCapUsd: 50,
      criticThreshold: 100,
    })
    expect(sanitizeStudioV2Settings({ maxIterations: 0, costCapUsd: -5, criticThreshold: -10 })).toEqual({
      maxIterations: 1,
      criticThreshold: 0,
      // costCapUsd <= 0 is dropped
    })
    expect(sanitizeStudioV2Settings({ criticModel: '  anthropic/claude-sonnet-4  ' })).toEqual({
      criticModel: 'anthropic/claude-sonnet-4',
    })
    expect(sanitizeStudioV2Settings({ criticModel: '   ' })).toEqual({})
    expect(sanitizeStudioV2Settings(null)).toEqual({})
    expect(sanitizeStudioV2Settings(undefined)).toEqual({})
  })

  it('the motor honors injected settings overrides (settings option wins over persisted/defaults)', async () => {
    const { call } = makeLlmCall([verdict(40), verdict(40), verdict(40)])
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call, { maxIterations: 1, criticThreshold: 95 }))
    // maxIterations 1 → only the draft, one critic, no revision; threshold 95 not met.
    expect(result.generation_meta.max_iterations).toBe(1)
    expect(result.generation_meta.critic_threshold).toBe(95)
    expect(result.generation_meta.iterations).toBe(1)
    expect(result.generation_meta.stop_reason).toBe('max_iterations')
  })

  it('studioGenerationMetaPatch returns {} for results without generation_meta (audio/presentation/null)', () => {
    expect(studioGenerationMetaPatch({ content: 'x', executions: [] })).toEqual({})
    expect(studioGenerationMetaPatch(null)).toEqual({})
    expect(studioGenerationMetaPatch(undefined)).toEqual({})
    expect(studioGenerationMetaPatch('not an object')).toEqual({})
  })

  it('threads generation_meta through to the persisted artifact patch', async () => {
    const { call } = makeLlmCall([verdict(90, false)])
    const result = await runStudioPipelineV2(INPUT, undefined, baseOptions(call))
    const patch = studioGenerationMetaPatch(result)
    expect(patch.generation_meta).toBe(result.generation_meta)
    expect(patch.generation_meta?.pipeline_version).toBe('studio_v2')
  })

  it('does not touch the network/Firestore in test mode (llmCall injected)', async () => {
    const spy = vi.fn()
    const { call } = makeLlmCall([verdict(90)])
    // No models/fallbackResolver loaders should be invoked; if they were, the test
    // env would throw. Passing only llmCall + models + resolver proves isolation.
    const result = await runStudioPipelineV2(INPUT, spy, baseOptions(call))
    expect(result.generation_meta.pipeline_version).toBe('studio_v2')
    expect(spy).toHaveBeenCalled() // progress callback fired
  })
})
