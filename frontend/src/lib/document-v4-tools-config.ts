/**
 * Document v4 — per-user tool catalog configuration.
 *
 * The v4 pipeline uses a curated catalog of tools (defined in
 * `document-v4-tools.ts`). Each user can enable/disable tools and override
 * simple parameters. Storage lives at
 * `/users/{uid}/settings/preferences.document_v4_tools` with a version flag
 * so future migrations grow the shape without breaking existing user docs.
 */
import { IS_FIREBASE } from './firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from './firestore-service'
import type { UserSettingsData } from './firestore-types'

/** Versioned shape persisted under `users/{uid}/settings/preferences.document_v4_tools`. */
export interface DocumentV4ToolsConfig {
  schema_version: number
  tools: Record<string, DocumentV4ToolEntry>
}

export interface DocumentV4ToolEntry {
  enabled: boolean
  params?: Record<string, unknown>
}

export const DOCUMENT_V4_TOOLS_SCHEMA_VERSION = 1

/**
 * Default configuration applied when no user override exists.
 *
 * Defaults err on the side of "enabled" so a fresh user gets a fully-featured
 * agent. Heavy tools (`deep_research_web`, `verify_citations` LLM mode) default
 * to "enabled but conservative params".
 */
export function getDefaultDocumentV4ToolsConfig(): DocumentV4ToolsConfig {
  return {
    schema_version: DOCUMENT_V4_TOOLS_SCHEMA_VERSION,
    tools: {
      read_profile: { enabled: true },
      read_context_detail: { enabled: true },
      search_acervo: { enabled: true, params: { use_llm_rerank: false, max_results: 5 } },
      search_thesis_bank: { enabled: true, params: { max_results: 12 } },
      // LLM rerank on by default to mirror v3, which always reranks
      // jurisprudence (ranker + synthesis) so the agent grounds the document in
      // the most relevant precedents rather than raw DataJud ordering.
      search_jurisprudence: { enabled: true, params: { use_llm_rerank: true, max_per_tribunal: 5 } },
      search_web: { enabled: true, params: { max_results: 8 } },
      deep_research_web: { enabled: true, params: { max_pages: 3 } },
      verify_citations: { enabled: true, params: { use_llm_review: false } },
      evaluate_quality: { enabled: true },
      save_draft_section: { enabled: true },
      submit_final_answer: { enabled: true },
    },
  }
}

function resolveScopedUid(uid?: string): string | undefined {
  if (uid) return uid
  return getCurrentUserId() ?? undefined
}

/**
 * Merge a stored config with defaults. Tools missing from the stored payload
 * fall back to the catalog default; unknown tool keys (e.g. removed in a later
 * version) are dropped. Param overrides are merged shallowly with defaults.
 */
function mergeWithDefaults(stored: Partial<DocumentV4ToolsConfig> | undefined): DocumentV4ToolsConfig {
  const defaults = getDefaultDocumentV4ToolsConfig()
  if (!stored || !stored.tools) return defaults
  const merged: Record<string, DocumentV4ToolEntry> = {}
  for (const [key, defaultEntry] of Object.entries(defaults.tools)) {
    const storedEntry = stored.tools[key]
    if (!storedEntry) {
      merged[key] = defaultEntry
      continue
    }
    merged[key] = {
      enabled: typeof storedEntry.enabled === 'boolean' ? storedEntry.enabled : defaultEntry.enabled,
      params: { ...(defaultEntry.params ?? {}), ...(storedEntry.params ?? {}) },
    }
  }
  return {
    schema_version: DOCUMENT_V4_TOOLS_SCHEMA_VERSION,
    tools: merged,
  }
}

export async function loadDocumentV4ToolsConfig(uid?: string): Promise<DocumentV4ToolsConfig> {
  if (!IS_FIREBASE) return getDefaultDocumentV4ToolsConfig()
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return getDefaultDocumentV4ToolsConfig()
  try {
    const settings = await ensureUserSettingsMigrated(resolvedUid)
    return mergeWithDefaults(settings.document_v4_tools)
  } catch {
    return getDefaultDocumentV4ToolsConfig()
  }
}

export async function saveDocumentV4ToolsConfig(
  config: DocumentV4ToolsConfig,
  uid?: string,
): Promise<void> {
  if (!IS_FIREBASE) return
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return
  await saveUserSettings(resolvedUid, {
    document_v4_tools: {
      schema_version: DOCUMENT_V4_TOOLS_SCHEMA_VERSION,
      tools: config.tools,
    },
  } as Partial<UserSettingsData>)
}

export async function resetDocumentV4ToolsConfig(uid?: string): Promise<void> {
  await saveDocumentV4ToolsConfig(getDefaultDocumentV4ToolsConfig(), uid)
}
