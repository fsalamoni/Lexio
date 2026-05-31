import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./google-auth', () => ({
  getCachedGoogleToken: vi.fn(),
}))

import { buildGoogleSkills } from './google-skills'
import { getCachedGoogleToken } from './google-auth'
import { clearRuntimeFeatureFlags, setRuntimeFeatureFlags } from '../feature-flags'
import { DEFAULT_EFFORT } from './effort-presets'
import type { Skill, SkillContext } from './types'

const mockedToken = vi.mocked(getCachedGoogleToken)

function makeCtx(overrides?: Partial<SkillContext>): SkillContext {
  return {
    uid: 'u1', conversationId: 'c1', turnId: 't1', userInput: 'g', effort: DEFAULT_EFFORT,
    budget: { recordUsage() {}, used: () => ({ tokens: 0, cost_usd: 0 }), usedRatio: () => 0, exceeded: () => false, hardStop() {}, isHardStopped: () => ({ stopped: false }), records: () => [] },
    signal: new AbortController().signal, emit: vi.fn(), models: {}, apiKey: '', mock: true,
    ...overrides,
  }
}

function skill(name: string): Skill {
  const found = buildGoogleSkills().find(s => s.name === name)
  if (!found) throw new Error(`skill ${name} not built`)
  return found
}

beforeEach(() => { setRuntimeFeatureFlags({ FF_CHAT_GOOGLE: true }); mockedToken.mockReturnValue(null) })
afterEach(() => { clearRuntimeFeatureFlags(); vi.clearAllMocks() })

describe('google skills exposure', () => {
  it('is empty unless FF_CHAT_GOOGLE is on', () => {
    clearRuntimeFeatureFlags()
    expect(buildGoogleSkills()).toHaveLength(0)
    setRuntimeFeatureFlags({ FF_CHAT_GOOGLE: true })
    expect(buildGoogleSkills().map(s => s.name)).toEqual(
      expect.arrayContaining(['drive_list_files', 'drive_read_file', 'gmail_search', 'gmail_read', 'gmail_create_draft']),
    )
  })
})

describe('google skills behavior', () => {
  it('asks the user to connect when there is no token', async () => {
    const result = await skill('drive_list_files').run({}, makeCtx())
    expect(result.tool_message).toMatch(/não conectado/i)
  })

  it('gmail_create_draft pauses for approval when the gate is on (with a token)', async () => {
    setRuntimeFeatureFlags({ FF_CHAT_GOOGLE: true, FF_CHAT_PC_APPROVALS: true })
    mockedToken.mockReturnValue('tok')
    const ctx = makeCtx({ createApprovalRequest: vi.fn().mockResolvedValue('g1') })
    const result = await skill('gmail_create_draft').run({ to: 'a@b.com', subject: 'Oi' }, ctx)
    expect(result.awaiting_user?.resume_tool).toBe('gmail_create_draft')
    expect(result.awaiting_user?.resume_args?.approved).toBe(true)
    expect(result.awaiting_user?.resume_args?.to).toBe('a@b.com')
  })
})
