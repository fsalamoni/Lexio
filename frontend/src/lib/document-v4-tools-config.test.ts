import { beforeEach, describe, expect, it, vi } from 'vitest'

const settingsMock: { current: Record<string, unknown> } = { current: {} }

vi.mock('./firebase', () => ({ IS_FIREBASE: true }))
vi.mock('./firestore-service', () => ({
  ensureUserSettingsMigrated: async () => settingsMock.current,
  getCurrentUserId: () => 'uid-test',
  saveUserSettings: async (_uid: string, patch: Record<string, unknown>) => {
    settingsMock.current = { ...settingsMock.current, ...patch }
  },
}))

import {
  DOCUMENT_V4_TOOLS_SCHEMA_VERSION,
  getDefaultDocumentV4ToolsConfig,
  loadDocumentV4ToolsConfig,
  resetDocumentV4ToolsConfig,
  saveDocumentV4ToolsConfig,
} from './document-v4-tools-config'

describe('Document v4 tools config', () => {
  beforeEach(() => {
    settingsMock.current = {}
  })

  it('returns defaults when no stored config exists', async () => {
    const config = await loadDocumentV4ToolsConfig()
    expect(config.schema_version).toBe(DOCUMENT_V4_TOOLS_SCHEMA_VERSION)
    expect(config.tools.read_profile?.enabled).toBe(true)
    expect(config.tools.submit_final_answer?.enabled).toBe(true)
    expect(config.tools.deep_research_web?.params?.max_pages).toBe(3)
  })

  it('merges stored config with defaults — unknown tools dropped, missing tools backfilled', async () => {
    settingsMock.current = {
      document_v4_tools: {
        schema_version: 1,
        tools: {
          search_acervo: { enabled: false, params: { use_llm_rerank: true } },
          // submit_final_answer intentionally omitted — should be backfilled from defaults
          legacy_removed_tool: { enabled: true, params: { whatever: 1 } }, // ignored
        },
      },
    }
    const config = await loadDocumentV4ToolsConfig()
    expect(config.tools.search_acervo?.enabled).toBe(false)
    expect(config.tools.search_acervo?.params?.use_llm_rerank).toBe(true)
    // missing tools are backfilled from defaults
    expect(config.tools.submit_final_answer?.enabled).toBe(true)
    // unknown tools are dropped
    expect((config.tools as Record<string, unknown>).legacy_removed_tool).toBeUndefined()
    // params get shallow-merged with defaults (max_results comes from default)
    expect(config.tools.search_acervo?.params?.max_results).toBe(5)
  })

  it('saves config back via saveUserSettings with the schema version', async () => {
    const cfg = getDefaultDocumentV4ToolsConfig()
    cfg.tools.search_web.enabled = false
    await saveDocumentV4ToolsConfig(cfg)
    const saved = (settingsMock.current as Record<string, unknown>).document_v4_tools as Record<string, unknown>
    expect(saved.schema_version).toBe(DOCUMENT_V4_TOOLS_SCHEMA_VERSION)
    const tools = saved.tools as Record<string, { enabled: boolean }>
    expect(tools.search_web.enabled).toBe(false)
  })

  it('reset restores defaults', async () => {
    settingsMock.current = {
      document_v4_tools: {
        schema_version: 1,
        tools: { search_acervo: { enabled: false } },
      },
    }
    await resetDocumentV4ToolsConfig()
    const saved = (settingsMock.current as Record<string, unknown>).document_v4_tools as Record<string, unknown>
    const tools = saved.tools as Record<string, { enabled: boolean }>
    expect(tools.search_acervo.enabled).toBe(true)
  })
})
