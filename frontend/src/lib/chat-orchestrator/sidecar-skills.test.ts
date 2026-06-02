import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSidecarSkills } from './sidecar-skills'
import { clearRuntimeFeatureFlags, setRuntimeFeatureFlags } from '../feature-flags'
import { DEFAULT_EFFORT } from './effort-presets'
import type { Skill, SkillContext } from './types'

function makeCtx(overrides?: Partial<SkillContext>): SkillContext {
  return {
    uid: 'u1',
    conversationId: 'c1',
    turnId: 't1',
    userInput: 'salve um arquivo',
    effort: DEFAULT_EFFORT,
    budget: {
      recordUsage() {},
      used: () => ({ tokens: 0, cost_usd: 0 }),
      usedRatio: () => 0,
      exceeded: () => false,
      hardStop() {},
      isHardStopped: () => ({ stopped: false }),
      records: () => [],
    },
    signal: new AbortController().signal,
    emit: vi.fn(),
    models: {},
    apiKey: '',
    mock: true,
    // No live sidecar in unit tests — the approval gate triggers on the flag
    // alone, and the non-gated paths must not open a real WebSocket here.
    sidecar: undefined,
    ...overrides,
  }
}

function skillByName(name: string): Skill {
  const skill = buildSidecarSkills().find(candidate => candidate.name === name)
  if (!skill) throw new Error(`skill ${name} not built`)
  return skill
}

afterEach(() => {
  clearRuntimeFeatureFlags()
  vi.restoreAllMocks()
})

describe('sidecar approval gate', () => {
  it('write_file pauses for approval before executing when the gate is on', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_PC_APPROVALS: true })
    const createApprovalRequest = vi.fn().mockResolvedValue('appr-1')
    const appendAuditEntry = vi.fn().mockResolvedValue(undefined)
    const ctx = makeCtx({ createApprovalRequest, appendAuditEntry })

    const result = await skillByName('write_file').run({ path: 'out/a.txt', content: 'olá' }, ctx)

    expect(result.awaiting_user).toBeTruthy()
    expect(result.awaiting_user?.approval_id).toBe('appr-1')
    expect(result.awaiting_user?.resume_tool).toBe('write_file')
    // resume must carry approved:true so the re-run actually executes
    expect(result.awaiting_user?.resume_args?.approved).toBe(true)
    expect(result.final_answer).toBeUndefined()
    expect(createApprovalRequest).toHaveBeenCalledTimes(1)
    // a "proposed" audit entry is recorded at proposal time
    expect(appendAuditEntry).toHaveBeenCalledWith(expect.objectContaining({ operation: 'write', status: 'proposed' }))
  })

  it('write_file does NOT request approval when the gate is off (legacy behavior)', async () => {
    const createApprovalRequest = vi.fn()
    const ctx = makeCtx({ createApprovalRequest })

    const result = await skillByName('write_file').run({ path: 'out/a.txt', content: 'olá' }, ctx)

    expect(result.awaiting_user).toBeFalsy()
    expect(createApprovalRequest).not.toHaveBeenCalled()
  })

  it('read_file is not gated under the default (per_command) policy', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_PC_APPROVALS: true })
    const createApprovalRequest = vi.fn()
    const ctx = makeCtx({ createApprovalRequest })

    const result = await skillByName('read_file').run({ path: 'out/a.txt' }, ctx)

    expect(result.awaiting_user).toBeFalsy()
    expect(createApprovalRequest).not.toHaveBeenCalled()
  })

  it('read_file IS gated under the "always" (máxima cautela) policy', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_PC_APPROVALS: true })
    const ctx = makeCtx({
      createApprovalRequest: vi.fn().mockResolvedValue('r1'),
      sidecar: { token: '', host: '127.0.0.1', port: 9420, enabled: true, approval_policy: 'always' },
    })

    const result = await skillByName('read_file').run({ path: 'out/a.txt' }, ctx)

    expect(result.awaiting_user?.resume_tool).toBe('read_file')
    expect(result.awaiting_user?.resume_args?.approved).toBe(true)
  })

  it('run_shell pauses for approval when the gate is on', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_PC_APPROVALS: true })
    const ctx = makeCtx({ createApprovalRequest: vi.fn().mockResolvedValue('appr-2') })

    const result = await skillByName('run_shell').run({ cmd: 'ls -la' }, ctx)

    expect(result.awaiting_user?.resume_tool).toBe('run_shell')
    expect(result.awaiting_user?.resume_args?.approved).toBe(true)
  })
})

describe('multi-PC approval UX (FF_CHAT_PC_DEVICES)', () => {
  it('offers permitir desta vez / sempre / negar when the devices flag is on', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_PC_APPROVALS: true, FF_CHAT_PC_DEVICES: true })
    const ctx = makeCtx({ createApprovalRequest: vi.fn().mockResolvedValue('a1') })
    const result = await skillByName('write_file').run({ path: 'out/a.txt', content: 'oi' }, ctx)
    expect(result.awaiting_user?.options).toEqual(['permitir desta vez', 'permitir sempre', 'negar'])
  })

  it('keeps the legacy buttons when the devices flag is off', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_PC_APPROVALS: true })
    const ctx = makeCtx({ createApprovalRequest: vi.fn().mockResolvedValue('a1') })
    const result = await skillByName('write_file').run({ path: 'out/a.txt', content: 'oi' }, ctx)
    expect(result.awaiting_user?.options).toEqual(['aprovar', 'rejeitar', 'ajustar'])
  })

  it('exposes grant_folder only with the devices flag, and it pauses for approval', async () => {
    clearRuntimeFeatureFlags()
    expect(buildSidecarSkills().map(s => s.name)).not.toContain('grant_folder')

    setRuntimeFeatureFlags({ FF_CHAT_PC_APPROVALS: true, FF_CHAT_PC_DEVICES: true })
    expect(buildSidecarSkills().map(s => s.name)).toContain('grant_folder')

    const ctx = makeCtx({ createApprovalRequest: vi.fn().mockResolvedValue('g1') })
    const result = await skillByName('grant_folder').run({ path: 'C:/Casos/Cliente X' }, ctx)
    expect(result.awaiting_user?.resume_tool).toBe('grant_folder')
    expect(result.awaiting_user?.resume_args?.approved).toBe(true)
    expect(result.awaiting_user?.options).toEqual(['permitir desta vez', 'permitir sempre', 'negar'])
  })
})

describe('sidecar skill exposure', () => {
  it('exposes delete_file/rename_file only when the gate is on', () => {
    clearRuntimeFeatureFlags()
    const off = buildSidecarSkills().map(s => s.name)
    expect(off).not.toContain('delete_file')
    expect(off).not.toContain('rename_file')

    setRuntimeFeatureFlags({ FF_CHAT_PC_APPROVALS: true })
    const on = buildSidecarSkills().map(s => s.name)
    expect(on).toContain('delete_file')
    expect(on).toContain('rename_file')
  })

  it('exposes git skills only when FF_CHAT_PC_GIT is on', () => {
    clearRuntimeFeatureFlags()
    expect(buildSidecarSkills().map(s => s.name)).not.toContain('git_status')

    setRuntimeFeatureFlags({ FF_CHAT_PC_GIT: true })
    expect(buildSidecarSkills().map(s => s.name)).toEqual(
      expect.arrayContaining(['git_status', 'git_diff', 'git_commit', 'git_pull', 'git_push']),
    )
  })
})

describe('git skills', () => {
  it('git_status is read-only (no approval) and reports demo without a sidecar', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_PC_GIT: true, FF_CHAT_PC_APPROVALS: true })
    const createApprovalRequest = vi.fn()
    const result = await skillByName('git_status').run({}, makeCtx({ createApprovalRequest }))
    expect(result.awaiting_user).toBeFalsy()
    expect(createApprovalRequest).not.toHaveBeenCalled()
  })

  it('git_commit pauses for approval when the gate is on', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_PC_GIT: true, FF_CHAT_PC_APPROVALS: true })
    const ctx = makeCtx({ createApprovalRequest: vi.fn().mockResolvedValue('a3') })
    const result = await skillByName('git_commit').run({ message: 'wip', add_all: true }, ctx)
    expect(result.awaiting_user?.resume_tool).toBe('git_commit')
    expect(result.awaiting_user?.resume_args?.approved).toBe(true)
    expect(result.awaiting_user?.resume_args?.message).toBe('wip')
  })
})
