import { describe, expect, it } from 'vitest'
import { buildChatV2Profile, buildChatV2Skills } from './profile'
import {
  getDefaultChatV2ToolsConfig,
  resolveEnabledChatV2Tools,
  type ChatV2ToolsConfig,
} from './tools-config'
import { CHAT_V2_ALWAYS_ON_TOOLS, CHAT_V2_TOOL_NAMES } from './tool-catalog'
import { dispatchSpecialistAgent } from '../chat-orchestrator/dispatch'
import type { SkillContext } from '../chat-orchestrator/types'
import type { UsageExecutionRecord } from '../cost-analytics'

function makeBudget() {
  const records: UsageExecutionRecord[] = []
  return {
    recordUsage: (r: Partial<UsageExecutionRecord>) => { records.push(r as UsageExecutionRecord) },
    used: () => ({ tokens: 0, cost_usd: 0 }),
    usedRatio: () => 0,
    exceeded: () => false,
    hardStop: () => {},
    isHardStopped: () => ({ stopped: false }),
    records: () => records,
  }
}

function makeCtx(overrides: Partial<SkillContext> = {}): SkillContext {
  const enabled = resolveEnabledChatV2Tools(getDefaultChatV2ToolsConfig())
  return {
    uid: 'u1',
    conversationId: 'c1',
    turnId: 't1',
    userInput: 'oi',
    effort: 'medio',
    budget: makeBudget(),
    signal: new AbortController().signal,
    emit: () => {},
    models: { cv2_worker: 'anthropic/claude-sonnet-4', cv2_critic: 'anthropic/claude-sonnet-4' },
    apiKey: 'sk-test',
    mock: true,
    profile: buildChatV2Profile(enabled),
    ...overrides,
  }
}

describe('chat orchestrator v2 — profile', () => {
  it('builds the lean profile with the v2 cost key and single worker', () => {
    const profile = buildChatV2Profile(new Set(CHAT_V2_TOOL_NAMES))
    expect(profile.id).toBe('v2')
    expect(profile.orchestratorAgentKey).toBe('cv2_orchestrator')
    expect(profile.finalForceAgentKey).toBe('cv2_worker')
    expect(profile.criticAgentKey).toBe('cv2_critic')
    expect(profile.functionKey).toBe('chat_orchestrator_v2')
    expect(profile.callableAgentKeys.has('cv2_worker')).toBe(true)
    expect(profile.callableAgentKeys.has('chat_planner')).toBe(false)
    expect(profile.listCallableAgents().map(a => a.key)).toEqual(['cv2_worker'])
  })

  it('keeps the full capability catalog (media, web/site, PC)', () => {
    expect(CHAT_V2_TOOL_NAMES).toEqual(expect.arrayContaining([
      'generate_image', 'generate_audio', 'generate_video', 'generate_presentation',
      'generate_document', 'hybrid_search', 'fetch_url', 'search_jurisprudence',
      'read_file', 'write_file', 'list_directory', 'run_shell',
    ]))
  })

  it('buildChatV2Skills respects the enabled set but keeps always-on tools', () => {
    const enabled = new Set<string>(['generate_image']) // run_shell disabled
    const skills = buildChatV2Skills(enabled).map(s => s.name)
    expect(skills).toContain('submit_final_answer') // always-on
    expect(skills).toContain('call_agent') // always-on
    expect(skills).toContain('generate_image') // enabled
    expect(skills).not.toContain('run_shell') // disabled
    // fetch_url is a v2-only skill, included when enabled
    expect(buildChatV2Skills(new Set(['fetch_url'])).map(s => s.name)).toContain('fetch_url')
  })

  it('always-on tools cannot be disabled via config', () => {
    const config: ChatV2ToolsConfig = {
      schema_version: 1,
      tools: { submit_final_answer: { enabled: false }, run_shell: { enabled: false } },
    }
    const enabled = resolveEnabledChatV2Tools(config)
    for (const name of CHAT_V2_ALWAYS_ON_TOOLS) expect(enabled.has(name)).toBe(true)
    expect(enabled.has('run_shell')).toBe(false)
  })

  it('tags specialist usage with the v2 cost source_type (mock dispatch)', async () => {
    const ctx = makeCtx()
    const { usage } = await dispatchSpecialistAgent({ agentKey: 'cv2_worker', task: 'pesquise X', ctx })
    expect(usage?.source_type).toBe('chat_orchestrator_v2')
    expect(usage?.function_key).toBe('chat_orchestrator_v2')
    expect(usage?.phase).toBe('cv2_worker')
  })

  it('falls back to v1 cost key when no profile is present', async () => {
    const ctx = makeCtx({ profile: undefined, models: { chat_writer: 'anthropic/claude-sonnet-4' } })
    const { usage } = await dispatchSpecialistAgent({ agentKey: 'chat_writer', task: 'x', ctx })
    expect(usage?.source_type).toBe('chat_orchestrator')
  })
})
