/**
 * GitHub connector config — persisted per user under
 * `users/{uid}/settings/preferences.github_connection`.
 *
 * The app is 100% browser-side with no backend, so GitHub auth uses a
 * fine-grained Personal Access Token (PAT) the user pastes — never OAuth (which
 * would need a server to hold the client secret). The token is stored scoped to
 * the user's own settings, exactly like the OpenRouter/DataJud keys.
 */
import { IS_FIREBASE } from '../firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from '../firestore-service'
import type { UserSettingsData } from '../firestore-types'

export interface GithubConnectorConfig {
  /** Fine-grained PAT. Empty when not configured. */
  token: string
  /** Optional default owner/org used when a skill omits it. */
  default_owner?: string
  /** Optional default repository used when a skill omits it. */
  default_repo?: string
}

export function getDefaultGithubConnectorConfig(): GithubConnectorConfig {
  return { token: '', default_owner: '', default_repo: '' }
}

function resolveScopedUid(uid?: string): string | undefined {
  return uid ?? getCurrentUserId() ?? undefined
}

function normalize(stored: Partial<GithubConnectorConfig> | undefined): GithubConnectorConfig {
  const defaults = getDefaultGithubConnectorConfig()
  if (!stored) return defaults
  return {
    token: typeof stored.token === 'string' ? stored.token.trim() : defaults.token,
    default_owner: typeof stored.default_owner === 'string' ? stored.default_owner.trim() : defaults.default_owner,
    default_repo: typeof stored.default_repo === 'string' ? stored.default_repo.trim() : defaults.default_repo,
  }
}

let cached: { uid: string | undefined; config: GithubConnectorConfig } | null = null

export function invalidateGithubConnectorCache(): void {
  cached = null
}

export async function loadGithubConnectorConfig(uid?: string): Promise<GithubConnectorConfig> {
  if (!IS_FIREBASE) return getDefaultGithubConnectorConfig()
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return getDefaultGithubConnectorConfig()
  if (cached && cached.uid === resolvedUid) return cached.config
  try {
    const settings = await ensureUserSettingsMigrated(resolvedUid)
    const config = normalize(settings.github_connection)
    cached = { uid: resolvedUid, config }
    return config
  } catch {
    return getDefaultGithubConnectorConfig()
  }
}

export async function saveGithubConnectorConfig(config: GithubConnectorConfig, uid?: string): Promise<void> {
  if (!IS_FIREBASE) return
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return
  const normalized = normalize(config)
  await saveUserSettings(resolvedUid, { github_connection: normalized } as Partial<UserSettingsData>)
  cached = { uid: resolvedUid, config: normalized }
}
