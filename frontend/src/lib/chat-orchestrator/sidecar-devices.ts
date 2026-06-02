/**
 * Multi-PC (sidecar devices) — persisted per user under
 * `users/{uid}/settings/preferences.sidecar_devices` + `active_sidecar_device_id`.
 *
 * Each device is a named PC the user paired (label + pairing token + host/port).
 * All devices bind to 127.0.0.1, and only one sidecar runs at a time, so the
 * "active" device just selects which token the browser → localhost WebSocket
 * uses. Behind `FF_CHAT_PC_DEVICES`; when the flag is off the legacy single
 * `sidecar_connection` is used instead.
 *
 * The pure helpers (normalize/add/rename/remove/setActive) are exported and unit
 * tested without Firestore; only `load*`/`save*` touch persistence.
 */
import { IS_FIREBASE } from '../firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from '../firestore-service'
import type { SidecarDeviceConfig, UserSettingsData } from '../firestore-types'
import {
  DEFAULT_SIDECAR_HOST,
  DEFAULT_SIDECAR_PORT,
  type SidecarConnectionConfig,
} from './sidecar-config'

/** Stable id for the device migrated from the legacy single connection. */
export const LEGACY_DEVICE_ID = 'legacy'

export interface SidecarDevicesState {
  devices: SidecarDeviceConfig[]
  activeId: string | null
}

export function getDefaultSidecarDevicesState(): SidecarDevicesState {
  return { devices: [], activeId: null }
}

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `dev-${crypto.randomUUID()}`
    }
  } catch {
    // fall through to the time-based id
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Coerce one stored entry into a valid device, or null when unusable. */
export function normalizeDevice(input: unknown): SidecarDeviceConfig | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<SidecarDeviceConfig>
  const token = typeof raw.token === 'string' ? raw.token.trim() : ''
  if (!token) return null // a device without a token cannot connect
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : genId()
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : 'Meu PC'
  const host = typeof raw.host === 'string' && raw.host.trim() ? raw.host.trim() : DEFAULT_SIDECAR_HOST
  const port = Number.isFinite(raw.port) ? Number(raw.port) : DEFAULT_SIDECAR_PORT
  const created_at = typeof raw.created_at === 'string' && raw.created_at ? raw.created_at : nowIso()
  const device: SidecarDeviceConfig = { id, label, token, host, port, created_at }
  if (typeof raw.last_connected_at === 'string' && raw.last_connected_at) {
    device.last_connected_at = raw.last_connected_at
  }
  return device
}

/**
 * Build a clean devices state from stored values, migrating the legacy single
 * `sidecar_connection` into a device when the list is empty. De-duplicates by
 * id and guarantees `activeId` points at an existing device (or null).
 */
export function normalizeDevicesState(
  storedDevices: unknown,
  storedActiveId: unknown,
  legacyConnection?: { token?: string; host?: string; port?: number } | undefined,
): SidecarDevicesState {
  const list = Array.isArray(storedDevices) ? storedDevices : []
  const seen = new Set<string>()
  const devices: SidecarDeviceConfig[] = []
  for (const entry of list) {
    const device = normalizeDevice(entry)
    if (!device || seen.has(device.id)) continue
    seen.add(device.id)
    devices.push(device)
  }

  // Migrate the legacy single connection if we have nothing else.
  if (devices.length === 0 && legacyConnection && typeof legacyConnection.token === 'string' && legacyConnection.token.trim()) {
    const migrated = normalizeDevice({
      id: LEGACY_DEVICE_ID,
      label: 'Meu PC',
      token: legacyConnection.token,
      host: legacyConnection.host,
      port: legacyConnection.port,
    })
    if (migrated) devices.push(migrated)
  }

  let activeId: string | null = null
  if (typeof storedActiveId === 'string' && devices.some(d => d.id === storedActiveId)) {
    activeId = storedActiveId
  } else if (devices.length > 0) {
    activeId = devices[0].id
  }
  return { devices, activeId }
}

export function getActiveDevice(state: SidecarDevicesState): SidecarDeviceConfig | null {
  if (!state.activeId) return null
  return state.devices.find(d => d.id === state.activeId) ?? null
}

/** Map a device onto a connection config, keeping the global enabled/policy. */
export function deviceToConnectionConfig(
  device: SidecarDeviceConfig,
  base: SidecarConnectionConfig,
): SidecarConnectionConfig {
  return {
    ...base,
    token: device.token,
    host: device.host || DEFAULT_SIDECAR_HOST,
    port: device.port || DEFAULT_SIDECAR_PORT,
  }
}

// ── Pure array operations (return a new state) ────────────────────────────────

export function addDevice(
  state: SidecarDevicesState,
  input: { label?: string; token: string; host?: string; port?: number },
): SidecarDevicesState {
  const device = normalizeDevice({
    id: genId(),
    label: input.label,
    token: input.token,
    host: input.host,
    port: input.port,
    created_at: nowIso(),
  })
  if (!device) return state // no token → no-op
  const devices = [...state.devices, device]
  // First device added becomes active automatically.
  const activeId = state.activeId && state.devices.some(d => d.id === state.activeId)
    ? state.activeId
    : device.id
  return { devices, activeId }
}

export function renameDevice(state: SidecarDevicesState, id: string, label: string): SidecarDevicesState {
  const clean = label.trim()
  if (!clean) return state
  return {
    ...state,
    devices: state.devices.map(d => (d.id === id ? { ...d, label: clean } : d)),
  }
}

export function removeDevice(state: SidecarDevicesState, id: string): SidecarDevicesState {
  const devices = state.devices.filter(d => d.id !== id)
  let activeId = state.activeId
  if (activeId === id) activeId = devices.length > 0 ? devices[0].id : null
  return { devices, activeId }
}

export function setActiveDevice(state: SidecarDevicesState, id: string): SidecarDevicesState {
  if (!state.devices.some(d => d.id === id)) return state
  return { ...state, activeId: id }
}

// ── Firestore-backed load/save ────────────────────────────────────────────────

let cached: { uid: string | undefined; state: SidecarDevicesState } | null = null

export function invalidateSidecarDevicesCache(): void {
  cached = null
}

function resolveScopedUid(uid?: string): string | undefined {
  return uid ?? getCurrentUserId() ?? undefined
}

export async function loadSidecarDevices(uid?: string): Promise<SidecarDevicesState> {
  if (!IS_FIREBASE) return getDefaultSidecarDevicesState()
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return getDefaultSidecarDevicesState()
  if (cached && cached.uid === resolvedUid) return cached.state
  try {
    const settings = await ensureUserSettingsMigrated(resolvedUid)
    const state = normalizeDevicesState(
      settings.sidecar_devices,
      settings.active_sidecar_device_id,
      settings.sidecar_connection,
    )
    cached = { uid: resolvedUid, state }
    return state
  } catch {
    return getDefaultSidecarDevicesState()
  }
}

export async function saveSidecarDevices(state: SidecarDevicesState, uid?: string): Promise<void> {
  if (!IS_FIREBASE) return
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) return
  const normalized = normalizeDevicesState(state.devices, state.activeId, undefined)
  await saveUserSettings(resolvedUid, {
    sidecar_devices: normalized.devices,
    active_sidecar_device_id: normalized.activeId ?? undefined,
  } as Partial<UserSettingsData>)
  cached = { uid: resolvedUid, state: normalized }
}
