/**
 * Chat Orchestrator v2 — per-user tool catalog configuration.
 *
 * Lets each user enable/disable the v2 tools. Stored at
 * `/users/{uid}/settings/preferences.chat_orchestrator_v2_tools` with a
 * `schema_version` flag so future migrations can grow the shape without
 * breaking existing user docs. Mirrors the document-v4 tools-config pattern.
 */
import { IS_FIREBASE } from '../firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from '../firestore-service'
import type { UserSettingsData } from '../firestore-types'
import { CHAT_V2_TOOL_CATALOG, CHAT_V2_ALWAYS_ON_TOOLS } from './tool-catalog'

export const CHAT_V2_TOOLS_SCHEMA_VERSION = 1

export interface ChatV2ToolEntry {
  enabled: boolean
}

export interface ChatV2ToolsConfig {
  schema_version: number
  tools: Record<string, ChatV2ToolEntry>
}

/** Default config — every tool enabled (always-on tools are forced on). */
export function getDefaultChatV2ToolsConfig(): ChatV2ToolsConfig {
  const tools: Record<string, ChatV2ToolEntry> = {}
  for (const tool of CHAT_V2_TOOL_CATALOG) {
    tools[tool.name] = { enabled: true }
  }
  return { schema_version: CHAT_V2_TOOLS_SCHEMA_VERSION, tools }
}

function resolveScopedUid(uid?: string): string | undefined {
  if (uid) return uid
  return getCurrentUserId() ?? undefined
}

/**
 * Merge stored config with defaults: backfill missing tools, drop unknown
 * tools, and force always-on tools enabled regardless of stored value.
 */
function mergeWithDefaults(stored: Partial<ChatV2ToolsConfig> | undefined): ChatV2ToolsConfig {
  const defaults = getDefaultChatV2ToolsConfig()
  if (!stored || !stored.tools) return defaults
  const merged: Record<string, ChatV2ToolEntry> = {}
  for (const tool of CHAT_V2_TOOL_CATALOG) {
    const storedEntry = stored.tools[tool.name]
    const enabled = CHAT_V2_ALWAYS_ON_TOOLS.has(tool.name)
      ? true
      : (typeof storedEntry?.enabled === 'boolean' ? storedEntry.enabled : true)
    merged[tool.name] = { enabled }
  }
  return { schema_version: CHAT_V2_TOOLS_SCHEMA_VERSION, tools: merged }
}

export async function loadChatV2ToolsConfig(uid?: string): Promise<ChatV2ToolsConfig> {
  if (!IS_FIREBASE) return getDefaultChatV2ToolsConfig()
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return getDefaultChatV2ToolsConfig()
  try {
    const settings = await ensureUserSettingsMigrated(resolvedUid)
    return mergeWithDefaults(settings.chat_orchestrator_v2_tools)
  } catch {
    return getDefaultChatV2ToolsConfig()
  }
}

export async function saveChatV2ToolsConfig(config: ChatV2ToolsConfig, uid?: string): Promise<void> {
  if (!IS_FIREBASE) return
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return
  await saveUserSettings(resolvedUid, {
    chat_orchestrator_v2_tools: {
      schema_version: CHAT_V2_TOOLS_SCHEMA_VERSION,
      tools: config.tools,
    },
  } as Partial<UserSettingsData>)
}

export async function resetChatV2ToolsConfig(uid?: string): Promise<void> {
  await saveChatV2ToolsConfig(getDefaultChatV2ToolsConfig(), uid)
}

/** Resolve the set of enabled tool names (always-on tools always included). */
export function resolveEnabledChatV2Tools(config: ChatV2ToolsConfig): Set<string> {
  const enabled = new Set<string>()
  for (const tool of CHAT_V2_TOOL_CATALOG) {
    if (CHAT_V2_ALWAYS_ON_TOOLS.has(tool.name) || config.tools[tool.name]?.enabled) {
      enabled.add(tool.name)
    }
  }
  return enabled
}
