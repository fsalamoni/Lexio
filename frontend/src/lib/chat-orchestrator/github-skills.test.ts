import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./github-config', () => ({
  loadGithubConnectorConfig: vi.fn(),
}))

import { buildGithubSkills } from './github-skills'
import { loadGithubConnectorConfig } from './github-config'
import { clearRuntimeFeatureFlags, setRuntimeFeatureFlags } from '../feature-flags'
import { DEFAULT_EFFORT } from './effort-presets'
import type { Skill, SkillContext } from './types'

const mockedLoad = vi.mocked(loadGithubConnectorConfig)

function makeCtx(overrides?: Partial<SkillContext>): SkillContext {
  return {
    uid: 'u1', conversationId: 'c1', turnId: 't1', userInput: 'gh', effort: DEFAULT_EFFORT,
    budget: {
      recordUsage() {}, used: () => ({ tokens: 0, cost_usd: 0 }), usedRatio: () => 0,
      exceeded: () => false, hardStop() {}, isHardStopped: () => ({ stopped: false }), records: () => [],
    },
    signal: new AbortController().signal, emit: vi.fn(), models: {}, apiKey: '', mock: true,
    ...overrides,
  }
}

function skill(name: string): Skill {
  const found = buildGithubSkills().find(s => s.name === name)
  if (!found) throw new Error(`skill ${name} not built`)
  return found
}

beforeEach(() => {
  setRuntimeFeatureFlags({ FF_CHAT_GITHUB: true })
  mockedLoad.mockResolvedValue({ token: '', default_owner: '', default_repo: '' })
})
afterEach(() => {
  clearRuntimeFeatureFlags()
  vi.clearAllMocks()
})

describe('github skills exposure', () => {
  it('is empty unless FF_CHAT_GITHUB is on', () => {
    clearRuntimeFeatureFlags()
    expect(buildGithubSkills()).toHaveLength(0)
    setRuntimeFeatureFlags({ FF_CHAT_GITHUB: true })
    expect(buildGithubSkills().map(s => s.name)).toEqual(
      expect.arrayContaining(['github_list_repos', 'github_read_file', 'github_create_issue', 'github_open_pr', 'github_comment']),
    )
  })
})

describe('github skills behavior', () => {
  it('asks the user to configure a token when none is set', async () => {
    const result = await skill('github_list_repos').run({}, makeCtx())
    expect(result.tool_message).toMatch(/não configurado/i)
  })

  it('github_create_issue pauses for approval when the gate is on (with a token)', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_GITHUB: true, FF_CHAT_PC_APPROVALS: true })
    mockedLoad.mockResolvedValue({ token: 'tok', default_owner: 'me', default_repo: 'repo' })
    const ctx = makeCtx({ createApprovalRequest: vi.fn().mockResolvedValue('ga1') })
    const result = await skill('github_create_issue').run({ title: 'Bug X' }, ctx)
    expect(result.awaiting_user?.resume_tool).toBe('github_create_issue')
    expect(result.awaiting_user?.resume_args?.approved).toBe(true)
    expect(result.awaiting_user?.resume_args?.owner).toBe('me')
  })
})
