import { describe, expect, it } from 'vitest'
import { OrchestratorDecisionParseError, parseOrchestratorDecision, renderSkillsManifest } from './tools-adapter'

const ALLOWED = ['call_agent', 'submit_final_answer', 'critique_draft']

describe('parseOrchestratorDecision', () => {
  it('parses a clean JSON decision', () => {
    const raw = '{"tool":"call_agent","args":{"agent_key":"chat_planner","task":"plan"}}'
    const decision = parseOrchestratorDecision(raw, ALLOWED)
    expect(decision.tool).toBe('call_agent')
    expect(decision.args).toEqual({ agent_key: 'chat_planner', task: 'plan' })
  })

  it('strips markdown fences before parsing', () => {
    const raw = '```json\n{"tool":"submit_final_answer","args":{"markdown":"# Resposta"}}\n```'
    const decision = parseOrchestratorDecision(raw, ALLOWED)
    expect(decision.tool).toBe('submit_final_answer')
    expect(decision.args.markdown).toBe('# Resposta')
  })

  it('extracts a JSON object from prose preamble', () => {
    const raw = 'Pensando: vou usar o crítico.\n{"tool":"critique_draft","args":{"draft":"x"}}'
    const decision = parseOrchestratorDecision(raw, ALLOWED)
    expect(decision.tool).toBe('critique_draft')
  })

  it('rejects tools outside the allow-list', () => {
    const raw = '{"tool":"shell.run","args":{}}'
    expect(() => parseOrchestratorDecision(raw, ALLOWED)).toThrow(OrchestratorDecisionParseError)
  })

  it('rejects malformed JSON', () => {
    expect(() => parseOrchestratorDecision('not-json', ALLOWED)).toThrow(OrchestratorDecisionParseError)
  })

  it('rejects when tool is missing', () => {
    expect(() => parseOrchestratorDecision('{"args":{}}', ALLOWED)).toThrow(OrchestratorDecisionParseError)
  })
})

describe('renderSkillsManifest', () => {
  it('lists every skill with its args hint', () => {
    const manifest = renderSkillsManifest([
      {
        name: 'call_agent',
        description: 'Chama agente',
        argsHint: { agent_key: 'chave do agente', task: 'tarefa' },
        async run() { return { tool_message: '' } },
      },
      {
        name: 'submit_final_answer',
        description: 'Finaliza',
        argsHint: { markdown: 'resposta' },
        async run() { return { tool_message: '' } },
      },
    ])
    expect(manifest).toContain('call_agent')
    expect(manifest).toContain('agent_key')
    expect(manifest).toContain('submit_final_answer')
    expect(manifest).toContain('markdown')
  })
})
