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
      expect.arrayContaining([
        'github_list_repos', 'github_read_file', 'github_create_issue', 'github_open_pr', 'github_comment',
        'github_write_file', 'github_delete_file', 'github_create_branch', 'github_commit',
        'github_get_status', 'github_list_pr_files',
      ]),
    )
  })
})

describe('github write skills', () => {
  it('github_write_file blocks direct writes to protected branches', async () => {
    mockedLoad.mockResolvedValue({ token: 'tok', default_owner: 'me', default_repo: 'repo' })
    const result = await skill('github_write_file').run({ path: 'a.txt', content: 'x', branch: 'main' }, makeCtx())
    expect(result.tool_message).toMatch(/bloqueada/i)
  })

  it('github_commit rejects when the file list exceeds the limit', async () => {
    mockedLoad.mockResolvedValue({ token: 'tok', default_owner: 'me', default_repo: 'repo' })
    const files = Array.from({ length: 51 }, (_, i) => ({ path: `f${i}.txt`, content: 'x' }))
    const result = await skill('github_commit').run({ branch: 'feature', message: 'm', files }, makeCtx())
    expect(result.tool_message).toMatch(/Limite de 50/)
  })

  it('github_commit pauses for approval when the gate is on', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_GITHUB: true, FF_CHAT_PC_APPROVALS: true })
    mockedLoad.mockResolvedValue({ token: 'tok', default_owner: 'me', default_repo: 'repo' })
    const ctx = makeCtx({ createApprovalRequest: vi.fn().mockResolvedValue('gc1') })
    const result = await skill('github_commit').run(
      { branch: 'feature', message: 'm', files: [{ path: 'a.txt', content: 'x' }] }, ctx,
    )
    expect(result.awaiting_user?.resume_tool).toBe('github_commit')
    expect(result.awaiting_user?.resume_args?.approved).toBe(true)
    expect(result.awaiting_user?.resume_args?.branch).toBe('feature')
  })
})

describe('github write skills — agent modes', () => {
  beforeEach(() => {
    mockedLoad.mockResolvedValue({ token: 'tok', default_owner: 'me', default_repo: 'repo' })
  })

  it('auto mode executes writes without pausing (no approval, no plan)', async () => {
    const ctx = makeCtx({ agentMode: 'auto', createApprovalRequest: vi.fn() })
    const result = await skill('github_create_issue').run({ title: 'Bug X' }, ctx)
    expect(result.awaiting_user).toBeUndefined()
    expect(ctx.createApprovalRequest).not.toHaveBeenCalled()
  })

  it('auto mode still blocks direct writes to protected branches', async () => {
    const ctx = makeCtx({ agentMode: 'auto' })
    const result = await skill('github_write_file').run({ path: 'a.txt', content: 'x', branch: 'main' }, ctx)
    expect(result.tool_message).toMatch(/bloqueada/i)
  })

  it('ask mode pauses behind an approval card', async () => {
    const ctx = makeCtx({ agentMode: 'ask', createApprovalRequest: vi.fn().mockResolvedValue('ga1') })
    const result = await skill('github_create_issue').run({ title: 'Bug X' }, ctx)
    expect(result.awaiting_user?.resume_tool).toBe('github_create_issue')
    expect(result.awaiting_user?.resume_args?.approved).toBe(true)
    expect(result.awaiting_user?.plan).toBeUndefined()
  })

  it('plan mode returns a structured plan proposal without executing', async () => {
    const ctx = makeCtx({ agentMode: 'plan', createApprovalRequest: vi.fn().mockResolvedValue('gp1') })
    const result = await skill('github_create_issue').run({ title: 'Bug X' }, ctx)
    expect(result.awaiting_user?.resume_tool).toBe('github_create_issue')
    expect(result.awaiting_user?.options).toEqual(['aprovar', 'rejeitar', 'revisar'])
    expect(result.awaiting_user?.plan?.state).toBe('proposed')
    expect(result.awaiting_user?.plan?.steps.length).toBeGreaterThan(0)
    // Plan mode must NOT pre-arm execution with approved:true.
    expect(result.awaiting_user?.resume_args?.approved).toBeUndefined()
    expect(ctx.createApprovalRequest).toHaveBeenCalledWith(expect.objectContaining({ kind: 'plan' }))
  })

  it('plan mode incorporates revision notes into a new proposal', async () => {
    const ctx = makeCtx({ agentMode: 'plan', createApprovalRequest: vi.fn().mockResolvedValue('gp2') })
    const result = await skill('github_create_issue').run(
      { title: 'Bug X', plan_revision_notes: 'inclua testes', plan_revision_count: 1 }, ctx,
    )
    expect(result.awaiting_user?.plan?.summary).toMatch(/inclua testes/i)
    expect(result.awaiting_user?.plan?.revision_notes).toBe('inclua testes')
    expect(result.awaiting_user?.plan?.revision_count).toBe(1)
  })

  it('approved:true executes regardless of mode (plan approval path)', async () => {
    const ctx = makeCtx({ agentMode: 'plan', createApprovalRequest: vi.fn() })
    const result = await skill('github_create_issue').run({ title: 'Bug X', approved: true }, ctx)
    expect(result.awaiting_user).toBeUndefined()
    expect(ctx.createApprovalRequest).not.toHaveBeenCalled()
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
