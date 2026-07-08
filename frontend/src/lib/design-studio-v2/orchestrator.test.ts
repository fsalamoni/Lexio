import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../llm-client', async (importActual) => {
  const actual = await importActual<typeof import('../llm-client')>()
  return { ...actual, callLLMWithMessagesFallback: vi.fn() }
})

import { callLLMWithMessagesFallback, type LLMResult } from '../llm-client'
import { runStudioTurn } from './orchestrator'
import { createEmptyProject } from './project'
import type { DesignStudioRuntime } from './types'

const mockCall = callLLMWithMessagesFallback as unknown as Mock

function makeResult(content: string): LLMResult {
  return {
    content,
    model: 'test/model',
    tokens_in: 10,
    tokens_out: 20,
    cost_usd: 0.0012,
    duration_ms: 5,
    provider_id: 'test',
    provider_label: 'Test',
    operational: {
      requestedModel: 'test/model',
      resolvedModel: 'test/model',
      fallbackUsed: false,
      networkRetryCount: 0,
      emptyRetryCount: 0,
      totalRetryCount: 0,
    },
  }
}

const runtime: DesignStudioRuntime = {
  apiKey: 'test-key',
  models: { ds2_orchestrator: 'test/model' }, // no reviewer → no extra pass
  resolveFallback: () => [],
  sessionId: 'sess-1',
}

describe('runStudioTurn', () => {
  beforeEach(() => {
    mockCall.mockReset()
  })

  it('builds files in auto mode and records a design_studio_v2 execution', async () => {
    mockCall.mockResolvedValue(makeResult([
      '```json',
      '{ "intent": "build", "message": "Criei a página.", "sessionTitle": "Landing" }',
      '```',
      '@@@LEXIO_WRITE index.html@@@',
      '<h1>Olá</h1>',
      '@@@LEXIO_END@@@',
    ].join('\n')))

    const result = await runStudioTurn({
      userMessage: 'crie uma landing',
      mode: 'auto',
      project: createEmptyProject(),
      history: [],
      runtime,
    })

    expect(result.project.files['index.html'].content).toBe('<h1>Olá</h1>')
    expect(result.previewChanged).toBe(true)
    expect(result.assistantMessage.content).toContain('Criei a página.')
    expect(result.assistantMessage.file_changes?.[0]).toMatchObject({ path: 'index.html', op: 'create' })
    expect(result.sessionTitle).toBe('Landing')
    expect(result.executions).toHaveLength(1)
    expect(result.executions[0].function_key).toBe('design_studio_v2')
    expect(result.executions[0].phase).toBe('ds2_orchestrator')
    expect(result.executions[0].source_id).toBe('sess-1')
  })

  it('surfaces clarifying questions in ask mode without touching the project', async () => {
    mockCall.mockResolvedValue(makeResult('{ "intent": "ask", "message": "Preciso de detalhes", "questions": ["Qual stack?"] }'))

    const result = await runStudioTurn({
      userMessage: 'faça um app',
      mode: 'ask',
      project: createEmptyProject(),
      history: [],
      runtime,
    })

    expect(result.assistantMessage.questions).toEqual(['Qual stack?'])
    expect(Object.keys(result.project.files)).toHaveLength(0)
    expect(result.previewChanged).toBe(false)
  })

  it('produces an approvable plan in plan mode', async () => {
    mockCall.mockResolvedValue(makeResult('{ "intent": "plan", "message": "plano", "plan": { "summary": "criar site", "steps": [{ "title": "html" }] } }'))

    const result = await runStudioTurn({
      userMessage: 'monte um site',
      mode: 'plan',
      project: createEmptyProject(),
      history: [],
      runtime,
    })

    expect(result.assistantMessage.plan?.state).toBe('proposed')
    expect(result.assistantMessage.plan?.summary).toBe('criar site')
  })

  it('throws a clear error when the orchestrator model is not configured', async () => {
    await expect(runStudioTurn({
      userMessage: 'x',
      mode: 'auto',
      project: createEmptyProject(),
      history: [],
      runtime: { ...runtime, models: {} },
    })).rejects.toThrow(/Orquestrador/)
  })
})
