import { describe, expect, it, vi } from 'vitest'
import type { ChatTrailEvent, SkillContext } from './types'
import { buildSkillRegistry, CALLABLE_AGENT_KEYS, listCallableAgentDescriptions } from './skill-registry'

interface TestSkillContext extends SkillContext {
  trail: ChatTrailEvent[]
}

function mockContext(overrides: Partial<SkillContext> = {}): TestSkillContext {
  const trail: ChatTrailEvent[] = []
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
    emit: event => trail.push(event),
    models: { chat_writer: 'demo/writer', chat_orchestrator: 'demo/orchestrator' },
    apiKey: 'demo-key',
    mock: true,
    ...overrides,
    trail,
  } as TestSkillContext
}

describe('chat orchestrator skill registry', () => {
  it('exposes multimodal evidence specialists to the orchestrator prompt', () => {
    const descriptions = listCallableAgentDescriptions()
    const keys = descriptions.map(agent => agent.key)

    expect(keys).toEqual(expect.arrayContaining([
      'chat_image_evidence_specialist',
      'chat_audio_evidence_specialist',
      'chat_video_evidence_specialist',
      'chat_multimodal_evidence_synthesizer',
    ]))

    expect(keys).not.toContain('chat_multimodal_analysis')
    expect(keys).not.toContain('chat_audio_transcription')
    expect(descriptions.every(agent => CALLABLE_AGENT_KEYS.has(agent.key))).toBe(true)
  })

  it('emits visible errors when callable agent work-package persistence fails', async () => {
    const callAgent = buildSkillRegistry().find(skill => skill.name === 'call_agent')!
    const persistWorkPackage = vi.fn(async workPackage => {
      throw new Error(`Falha persistindo ${workPackage.agent_key}`)
    })
    const ctx = mockContext({ persistWorkPackage })

    const result = await callAgent.run({ agent_key: 'chat_writer', task: 'Redija uma minuta curta.' }, ctx)

    expect(result.tool_message).toContain('Resposta de chat_writer')
    expect(persistWorkPackage).toHaveBeenCalled()
    expect(ctx.trail.some(event => event.type === 'agent_work_package')).toBe(true)
    expect(ctx.trail.some(event => event.type === 'error' && event.message.includes('persistência remota falhou'))).toBe(true)
  })

  it('clips oversized shared context before parallel agent fan-out', async () => {
    const parallel = buildSkillRegistry().find(skill => skill.name === 'call_agents_parallel')!
    const ctx = mockContext()
    const sharedContext = 'x'.repeat(20_000)

    const result = await parallel.run({
      shared_context: sharedContext,
      calls: [{ agent_key: 'chat_writer', task: 'Sintetize o contexto.' }],
    }, ctx)

    expect(result.tool_message).toContain('Contexto compartilhado do lote truncado para 12000 caracteres')
    expect(ctx.trail.some(event => event.type === 'agent_call' && event.agent_key === 'chat_writer')).toBe(true)
  })
})