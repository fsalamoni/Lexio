/**
 * Google connector config — persisted per user under
 * `users/{uid}/settings/preferences.google_connection`.
 *
 * Only the **public OAuth Client ID** is stored (no client secret — this is a
 * browser-only app using the Google Identity Services token model). The
 * short-lived access token is obtained interactively and kept in memory only
 * (see `google-auth.ts`), never persisted.
 */
import { IS_FIREBASE } from '../firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from '../firestore-service'
import type { UserSettingsData } from '../firestore-types'

/** Scopes requested for Drive (read) + Gmail (read + compose drafts). */
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
].join(' ')

export interface GoogleConnectorConfig {
  /** Public OAuth Client ID (…apps.googleusercontent.com). Empty when not configured. */
  client_id: string
}

export function getDefaultGoogleConnectorConfig(): GoogleConnectorConfig {
  return { client_id: '' }
}

function resolveScopedUid(uid?: string): string | undefined {
  return uid ?? getCurrentUserId() ?? undefined
}

function normalize(stored: Partial<GoogleConnectorConfig> | undefined): GoogleConnectorConfig {
  return { client_id: typeof stored?.client_id === 'string' ? stored.client_id.trim() : '' }
}

let cached: { uid: string | undefined; config: GoogleConnectorConfig } | null = null

export function invalidateGoogleConnectorCache(): void {
  cached = null
}

export async function loadGoogleConnectorConfig(uid?: string): Promise<GoogleConnectorConfig> {
  if (!IS_FIREBASE) return getDefaultGoogleConnectorConfig()
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return getDefaultGoogleConnectorConfig()
  if (cached && cached.uid === resolvedUid) return cached.config
  try {
    const settings = await ensureUserSettingsMigrated(resolvedUid)
    const config = normalize(settings.google_connection)
    cached = { uid: resolvedUid, config }
    return config
  } catch {
    return getDefaultGoogleConnectorConfig()
  }
}

export async function saveGoogleConnectorConfig(config: GoogleConnectorConfig, uid?: string): Promise<void> {
  if (!IS_FIREBASE) return
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return
  const normalized = normalize(config)
  await saveUserSettings(resolvedUid, { google_connection: normalized } as Partial<UserSettingsData>)
  cached = { uid: resolvedUid, config: normalized }
}
