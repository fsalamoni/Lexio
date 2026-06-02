/**
 * Sidecar (PC) connection config — persisted per user under
 * `users/{uid}/settings/preferences.sidecar_connection`.
 *
 * Holds the pairing token the user copied from the `@lexio/desktop` banner and
 * the workspace label/path the sidecar exposes. The token authenticates the
 * browser → localhost WebSocket; it is the same secret the local process
 * generated, so storing it scoped to the user's own settings is acceptable
 * (it only grants access to that user's own machine, and only while the local
 * process is running).
 */
import { IS_FIREBASE } from '../firebase'
import { isEnabled } from '../feature-flags'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from '../firestore-service'
import type { ChatSidecarApprovalPolicy, UserSettingsData } from '../firestore-types'
import { deviceToConnectionConfig, getActiveDevice, normalizeDevicesState } from './sidecar-devices'

export const DEFAULT_SIDECAR_PORT = 9420
export const DEFAULT_SIDECAR_HOST = '127.0.0.1'
export const DEFAULT_SIDECAR_APPROVAL_POLICY: ChatSidecarApprovalPolicy = 'per_command'

export interface SidecarConnectionConfig {
  /** Pairing token from the sidecar banner. Empty when not configured. */
  token: string
  /** Host the sidecar listens on (default 127.0.0.1). */
  host: string
  /** Port the sidecar listens on (default 9420). */
  port: number
  /** Whether the user enabled PC actions at all. */
  enabled: boolean
  /**
   * How write/delete/rename/shell actions are gated when `FF_CHAT_PC_APPROVALS`
   * is on. Reads are never gated. Optional for backward compatibility with
   * configs stored before this field existed (defaults to `per_command`).
   */
  approval_policy?: ChatSidecarApprovalPolicy
}

export function getDefaultSidecarConnectionConfig(): SidecarConnectionConfig {
  return {
    token: '',
    host: DEFAULT_SIDECAR_HOST,
    port: DEFAULT_SIDECAR_PORT,
    enabled: false,
    approval_policy: DEFAULT_SIDECAR_APPROVAL_POLICY,
  }
}

const VALID_APPROVAL_POLICIES: ReadonlySet<ChatSidecarApprovalPolicy> = new Set<ChatSidecarApprovalPolicy>([
  'always',
  'per_command',
  'batch',
  'trusted_readonly',
])

function normalizeApprovalPolicy(value: unknown): ChatSidecarApprovalPolicy {
  return typeof value === 'string' && VALID_APPROVAL_POLICIES.has(value as ChatSidecarApprovalPolicy)
    ? (value as ChatSidecarApprovalPolicy)
    : DEFAULT_SIDECAR_APPROVAL_POLICY
}

function resolveScopedUid(uid?: string): string | undefined {
  return uid ?? getCurrentUserId() ?? undefined
}

function normalize(stored: Partial<SidecarConnectionConfig> | undefined): SidecarConnectionConfig {
  const defaults = getDefaultSidecarConnectionConfig()
  if (!stored) return defaults
  return {
    token: typeof stored.token === 'string' ? stored.token.trim() : defaults.token,
    host: typeof stored.host === 'string' && stored.host.trim() ? stored.host.trim() : defaults.host,
    port: Number.isFinite(stored.port) ? Number(stored.port) : defaults.port,
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : Boolean(stored.token),
    approval_policy: normalizeApprovalPolicy(stored.approval_policy),
  }
}

/**
 * In-memory cache so the hot path (every sidecar skill call) does not hit
 * Firestore. The settings card invalidates it on save.
 */
let cached: { uid: string | undefined; config: SidecarConnectionConfig } | null = null

export function invalidateSidecarConnectionCache(): void {
  cached = null
}

export async function loadSidecarConnectionConfig(uid?: string): Promise<SidecarConnectionConfig> {
  if (!IS_FIREBASE) return getDefaultSidecarConnectionConfig()
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return getDefaultSidecarConnectionConfig()
  if (cached && cached.uid === resolvedUid) return cached.config
  try {
    const settings = await ensureUserSettingsMigrated(resolvedUid)
    let config = normalize(settings.sidecar_connection)
    // Multi-PC: when enabled, the active device supplies the token/host/port,
    // while the global enabled/approval_policy stay on `sidecar_connection`.
    if (isEnabled('FF_CHAT_PC_DEVICES')) {
      const state = normalizeDevicesState(
        settings.sidecar_devices,
        settings.active_sidecar_device_id,
        settings.sidecar_connection,
      )
      const active = getActiveDevice(state)
      if (active) config = deviceToConnectionConfig(active, config)
    }
    cached = { uid: resolvedUid, config }
    return config
  } catch {
    return getDefaultSidecarConnectionConfig()
  }
}

export async function saveSidecarConnectionConfig(config: SidecarConnectionConfig, uid?: string): Promise<void> {
  if (!IS_FIREBASE) return
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return
  const normalized = normalize(config)
  await saveUserSettings(resolvedUid, { sidecar_connection: normalized } as Partial<UserSettingsData>)
  cached = { uid: resolvedUid, config: normalized }
}

/** Build the WebSocket URL (with token as query param) from a config. */
export function buildSidecarWsUrl(config: SidecarConnectionConfig): string {
  const base = `ws://${config.host || DEFAULT_SIDECAR_HOST}:${config.port || DEFAULT_SIDECAR_PORT}`
  return config.token ? `${base}/?token=${encodeURIComponent(config.token)}` : base
}
