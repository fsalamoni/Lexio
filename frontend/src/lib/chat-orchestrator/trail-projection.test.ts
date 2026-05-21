import { describe, expect, it } from 'vitest'
import type { ChatTrailEvent } from '../firestore-types'
import { countProjectedEvents, projectTrailToSteps, splitOrchestratorThought } from './trail-projection'

function ts(seconds: number): string {
  return new Date(Date.UTC(2026, 4, 21, 12, 0, seconds)).toISOString()
}

describe('splitOrchestratorThought', () => {
  it('returns empty prose for empty input', () => {
    expect(splitOrchestratorThought('').prose).toBe('')
  })

  it('strips a trailing bare decision JSON object, keeping the reasoning prose', () => {
    const total = 'Vou analisar o pedido e gerar a imagem.\n{"tool":"generate_image","args":{"prompt":"x"}}'
    const { prose } = splitOrchestratorThought(total)
    expect(prose).toContain('Vou analisar o pedido')
    expect(prose).not.toContain('generate_image')
    expect(prose).not.toContain('{')
  })

  it('strips a fenced decision block', () => {
    const total = 'Raciocínio aqui.\n```json\n{"tool":"call_agent","args":{}}\n```'
    expect(splitOrchestratorThought(total).prose).toBe('Raciocínio aqui.')
  })

  it('keeps a fenced json block that is not a decision object', () => {
    const total = 'Veja o exemplo:\n```json\n{"porta":3000}\n```'
    expect(splitOrchestratorThought(total).prose).toContain('"porta"')
  })
})

describe('projectTrailToSteps', () => {
  it('returns an empty list for an empty trail', () => {
    expect(projectTrailToSteps([])).toEqual([])
  })

  it('groups iteration + thoughts + decision into one orchestrator step', () => {
    const trail: ChatTrailEvent[] = [
      { type: 'iteration_start', i: 1, ts: ts(1) },
      { type: 'orchestrator_thought', delta: 'Pensando', total: 'Pensando no pedido', ts: ts(2) },
      { type: 'orchestrator_thought', delta: ' do usuário', total: 'Pensando no pedido do usuário', ts: ts(3) },
      { type: 'decision', tool: 'generate_image', rationale: 'pedido de imagem', ts: ts(4) },
    ]
    const steps = projectTrailToSteps(trail)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('orchestrator_decision')
    expect(steps[0].status).toBe('done')
    expect(steps[0].decision?.tool).toBe('generate_image')
    expect(steps[0].thought?.stream).toContain('Pensando no pedido do usuário')
    expect(steps[0].sourceEventCount).toBe(4)
  })

  it('groups an agent call + tokens + response + work package into one step', () => {
    const trail: ChatTrailEvent[] = [
      { type: 'agent_call', agent_key: 'chat_writer', task: 'Redigir', ts: ts(1) },
      { type: 'agent_token', agent_key: 'chat_writer', delta: 'Re', total: 'Re', ts: ts(2) },
      { type: 'agent_response', agent_key: 'chat_writer', output: 'Resposta crua', ts: ts(3) },
      {
        type: 'agent_work_package',
        ts: ts(4),
        package: {
          conversation_id: 'c',
          turn_id: 't',
          agent_key: 'chat_writer',
          result_markdown: '## Final',
          thought: { summary: 'resumo operacional' },
          artifacts: [],
          created_at: ts(4),
        },
      },
    ]
    const steps = projectTrailToSteps(trail)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('agent_invocation')
    expect(steps[0].actor).toBe('chat_writer')
    expect(steps[0].status).toBe('done')
    expect(steps[0].resultMarkdown).toBe('## Final')
    expect(steps[0].thought?.package?.summary).toBe('resumo operacional')
  })

  it('merges consecutive super-skill calls for the same skill into one step with its artifact', () => {
    const trail: ChatTrailEvent[] = [
      { type: 'super_skill_call', skill: 'generate_image', result_summary: 'iniciando', ts: ts(1) },
      {
        type: 'agent_work_package',
        ts: ts(2),
        package: {
          conversation_id: 'c',
          turn_id: 't',
          agent_key: 'chat_image_generator',
          result_markdown: 'imagem',
          artifacts: [{
            artifact_id: 'img-v1',
            logical_document_id: 'img',
            version: 1,
            title: 'Render',
            kind: 'image',
            format: 'png',
          }],
          created_at: ts(2),
        },
      },
      { type: 'super_skill_call', skill: 'generate_image', result_summary: 'imagem pronta', ts: ts(3) },
    ]
    const steps = projectTrailToSteps(trail)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('super_skill')
    expect(steps[0].actor).toBe('generate_image')
    expect(steps[0].sourceEventCount).toBe(3)
    expect(steps[0].artifacts).toHaveLength(1)
    expect(steps[0].artifacts?.[0]?.title).toBe('Render')
  })

  it('represents a critic call as a single critic_review step', () => {
    const trail: ChatTrailEvent[] = [
      { type: 'agent_call', agent_key: 'chat_critic', task: 'Avaliar', ts: ts(1) },
      { type: 'agent_response', agent_key: 'chat_critic', output: '{}', ts: ts(2) },
      { type: 'critic', score: 88, reasons: ['claro'], should_stop: true, ts: ts(3) },
    ]
    const steps = projectTrailToSteps(trail)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('critic_review')
    expect(steps[0].critic?.score).toBe(88)
    expect(steps[0].critic?.shouldStop).toBe(true)
  })

  it('folds parallel agent calls into the batch as children', () => {
    const trail: ChatTrailEvent[] = [
      {
        type: 'parallel_agents',
        calls: [{ agent_key: 'chat_planner', task: 'a' }, { agent_key: 'chat_writer', task: 'b' }],
        ts: ts(1),
      },
      { type: 'agent_call', agent_key: 'chat_planner', task: 'a', ts: ts(2) },
      { type: 'agent_call', agent_key: 'chat_writer', task: 'b', ts: ts(3) },
    ]
    const steps = projectTrailToSteps(trail)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('parallel_batch')
    expect(steps[0].children).toHaveLength(2)
  })

  it('keeps every source event accounted for (coverage invariant)', () => {
    const trail: ChatTrailEvent[] = [
      { type: 'iteration_start', i: 1, ts: ts(1) },
      { type: 'orchestrator_thought', delta: 'x', total: 'x', ts: ts(2) },
      { type: 'decision', tool: 'call_agent', ts: ts(3) },
      { type: 'agent_call', agent_key: 'chat_writer', task: 't', ts: ts(4) },
      { type: 'agent_response', agent_key: 'chat_writer', output: 'o', ts: ts(5) },
      { type: 'budget_hit', reason: 'token_cap_reached', ts: ts(6) },
      { type: 'final_answer', ts: ts(7) },
    ]
    expect(countProjectedEvents(projectTrailToSteps(trail))).toBe(trail.length)
  })

  it('emits steps in chronological order', () => {
    const trail: ChatTrailEvent[] = [
      { type: 'iteration_start', i: 1, ts: ts(1) },
      { type: 'decision', tool: 'submit_final_answer', ts: ts(2) },
      { type: 'final_answer', ts: ts(3) },
    ]
    const times = projectTrailToSteps(trail).map(step => step.ts)
    expect([...times].sort()).toEqual(times)
  })

  it('marks an unfinished agent step as running and resolves it in place', () => {
    const running = projectTrailToSteps([
      { type: 'agent_call', agent_key: 'chat_writer', task: 't', ts: ts(1) },
    ])
    expect(running[0].status).toBe('running')

    const resolved = projectTrailToSteps([
      { type: 'agent_call', agent_key: 'chat_writer', task: 't', ts: ts(1) },
      {
        type: 'agent_work_package',
        ts: ts(2),
        package: {
          conversation_id: 'c',
          turn_id: 't',
          agent_key: 'chat_writer',
          result_markdown: 'r',
          created_at: ts(2),
        },
      },
    ])
    expect(resolved[0].status).toBe('done')
    expect(resolved[0].id).toBe(running[0].id)
  })
})
