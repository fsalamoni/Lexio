import { describe, expect, it, vi } from 'vitest'
import type { ChatTrailEvent } from '../firestore-types'
import { runChatTurn } from './orchestrator'
import type { OrchestratorLLMCall } from './types'

// Stub `dispatchSpecialistAgent` so the orchestrator never tries to reach
// OpenRouter. The stub keeps just enough state to exercise the loop's
// branching: a deterministic per-agent reply and a fake usage record.
vi.mock('./dispatch', () => {
  let counter = 0
  return {
    dispatchSpecialistAgent: vi.fn(async (args: { agentKey: string; task: string }) => {
      counter += 1
      const usage = {
        source_type: 'chat_orchestrator',
        source_id: 'turn-stub',
        created_at: new Date().toISOString(),
        function_key: 'chat_orchestrator',
        function_label: 'Orquestrador (Chat)',
        phase: args.agentKey,
        phase_label: `Chat: ${args.agentKey}`,
        agent_name: args.agentKey,
        model: 'demo/x',
        model_label: 'demo/x',
        tokens_in: 100,
        tokens_out: 100,
        total_tokens: 200,
        cost_usd: 0.01,
        duration_ms: 5,
        execution_state: 'completed',
      }
      const output = args.agentKey === 'chat_critic'
        ? JSON.stringify({ score: 90, reasons: ['ok'], should_stop: true })
        : `(${args.agentKey} #${counter}) ${args.task.slice(0, 80)}`
      return { output, usage }
    }),
    __reset: () => {
      counter = 0
    },
  }
})

const baseModels: Record<string, string> = {
  chat_orchestrator: 'demo/orch',
  chat_planner: 'demo/plan',
  chat_summarizer: 'demo/summ',
  chat_critic: 'demo/crit',
  chat_writer: 'demo/write',
  chat_clarifier: 'demo/clar',
  chat_legal_researcher: 'demo/legal',
  chat_code_writer: 'demo/code',
  chat_fs_actor: 'demo/fs',
}

function makeInput(overrides: Partial<Parameters<typeof runChatTurn>[0]> = {}): Parameters<typeof runChatTurn>[0] {
  return {
    uid: 'u',
    conversationId: 'c',
    turnId: 't',
    effort: 'medio',
    history: [],
    user_input: 'Olá, faça um resumo.',
    models: baseModels,
    apiKey: 'demo',
    signal: new AbortController().signal,
    onTrail: () => {},
    mock: true,
    ...overrides,
  }
}

describe('runChatTurn', () => {
  it('terminates immediately when the orchestrator emits submit_final_answer', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# pronto' } }),
      usage: null,
    })) satisfies OrchestratorLLMCall

    const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

    expect(result.status).toBe('done')
    expect(result.assistant_markdown).toBe('# pronto')
    expect(llmCall).toHaveBeenCalledTimes(1)
    expect(events.find(e => e.type === 'final_answer')).toBeDefined()
  })

  it('respects maxIterations when the orchestrator never finalises', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({ tool: 'call_agent', args: { agent_key: 'chat_planner', task: 'plan' } }),
      usage: null,
    }))

    const result = await runChatTurn(makeInput({ effort: 'rapido', llmCall, onTrail: e => events.push(e) }))

    // rapido caps maxIterations at 3 — orchestrator runs 3 times, then the
    // forced finalisation kicks in and produces a closing answer.
    expect(llmCall).toHaveBeenCalledTimes(3)
    expect(result.status).toBe('done')
    expect(result.assistant_markdown).toBeTruthy()
    const iterEvents = events.filter(e => e.type === 'iteration_start')
    expect(iterEvents).toHaveLength(3)
  })

  it('pauses the turn with awaiting_user when the orchestrator asks a question', async () => {
    const events: ChatTrailEvent[] = []
    const llmCall = vi.fn(async () => ({
      raw: JSON.stringify({
        tool: 'ask_user_question',
        args: { question: 'Você tem o número do processo?' },
      }),
      usage: null,
    }))

    const result = await runChatTurn(makeInput({ llmCall, onTrail: e => events.push(e) }))

    expect(result.status).toBe('awaiting_user')
    expect(result.pending_question?.text).toContain('número do processo')
    expect(events.some(e => e.type === 'clarification_request')).toBe(true)
  })

  it('throws AbortError when the signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      runChatTurn(makeInput({ signal: ac.signal })),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('coaches the orchestrator after a parse failure and finalises on the second try', async () => {
    let attempt = 0
    const llmCall = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) {
        return { raw: 'this is plain prose, not JSON', usage: null }
      }
      return {
        raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# ok' } }),
        usage: null,
      }
    })

    const result = await runChatTurn(makeInput({ llmCall }))

    expect(attempt).toBe(2)
    expect(result.status).toBe('done')
    expect(result.assistant_markdown).toBe('# ok')
  })

  it('records llm executions in the result so cost-analytics can ingest them', async () => {
    const llmCall = vi.fn(async (params: Parameters<OrchestratorLLMCall>[0]) => ({
      raw: JSON.stringify({ tool: 'submit_final_answer', args: { markdown: '# pronto' } }),
      usage: {
        source_type: 'chat_orchestrator' as const,
        source_id: 'turn-stub',
        created_at: new Date().toISOString(),
        function_key: 'chat_orchestrator' as const,
        function_label: 'Orquestrador (Chat)',
        phase: params.modelKey,
        phase_label: `Chat: ${params.modelKey}`,
        agent_name: 'Orquestrador',
        model: 'demo/x',
        model_label: 'demo/x',
        tokens_in: 200,
        tokens_out: 50,
        total_tokens: 250,
        cost_usd: 0.005,
        duration_ms: 12,
        execution_state: 'completed' as const,
      },
    }))
    const result = await runChatTurn(makeInput({ llmCall }))
    expect(result.llm_executions).toHaveLength(1)
    expect(result.llm_executions[0].source_type).toBe('chat_orchestrator')
  })
})
