/**
 * Admin settings store — backend API or Firestore persistence.
 *
 * Backend mode:
 *   GET  /api/v1/admin/settings  → list keys with masked values
 *   PATCH /api/v1/admin/settings → update keys, persisted in PostgreSQL
 *
 * Firebase mode:
 *   Reads from user-scoped Firestore settings after one-time migration.
 *   Now scoped per-provider — every entry in `lib/providers.ts` exposes its
 *   own API key + enabled flag through the same UI.
 */

import api from '../api/client'
import { IS_FIREBASE } from './firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, getUserSettings, saveUserSettings } from './firestore-service'
import { PROVIDERS, PROVIDER_ORDER, apiKeyFieldForProvider, type ProviderId } from './providers'
import type { ProviderSettingsMap } from './firestore-types'

export const PROVIDER_SETTINGS_UPDATED_EVENT = 'lexio:provider_settings_updated'

export function emitProviderSettingsUpdated(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent(PROVIDER_SETTINGS_UPDATED_EVENT))
  } catch {
    // Never break persistence flow because of UI refresh signaling.
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiKeyEntry {
  key: string
  label: string
  description: string
  placeholder: string
  link: string
  guide: string[]
  is_auto: boolean
  is_set: boolean
  masked_value: string | null
  source: string
  /** Provider id this key belongs to (multi-provider support). */
  provider_id?: ProviderId
}

const DATAJUD_DEF: Omit<ApiKeyEntry, 'is_set' | 'masked_value' | 'source'> = {
  key: 'datajud_api_key',
  label: 'DataJud API Key',
  description: 'Chave para acesso à base de jurisprudência do CNJ',
  placeholder: 'cDZH...',
  link: 'https://datajud-wiki.cnj.jus.br/',
  guide: ['Acesse https://datajud-wiki.cnj.jus.br/api-publica/', 'Copie a chave pública atualizada', 'Cole a chave fornecida aqui'],
  is_auto: false,
}

function buildProviderDefs(): Omit<ApiKeyEntry, 'is_set' | 'masked_value' | 'source'>[] {
  return PROVIDER_ORDER.map((pid) => {
    const def = PROVIDERS[pid]
    return {
      key: apiKeyFieldForProvider(pid),
      label: `${def.label} API Key`,
      description: def.description,
      placeholder: def.keyPrefix ? `${def.keyPrefix}...` : 'cole sua chave aqui',
      link: def.consoleUrl,
      guide: def.guide,
      is_auto: false,
      provider_id: pid,
    }
  })
}

const DEFAULT_KEY_DEFS: Omit<ApiKeyEntry, 'is_set' | 'masked_value' | 'source'>[] = [
  ...buildProviderDefs(),
  DATAJUD_DEF,
]

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadApiKeyValues(uid?: string): Promise<Record<string, string>> {
  if (!IS_FIREBASE) return {}

  const resolvedUid = uid ?? getCurrentUserId() ?? undefined
  const userSettings = resolvedUid ? await ensureUserSettingsMigrated(resolvedUid) : {}
  const userApiKeys = (userSettings.api_keys ?? {}) as Record<string, string>
  return userApiKeys
}

export async function loadProviderSettings(uid?: string): Promise<ProviderSettingsMap> {
  if (!IS_FIREBASE) return {}
  const resolvedUid = uid ?? getCurrentUserId() ?? undefined
  if (!resolvedUid) return {}
  const settings = await ensureUserSettingsMigrated(resolvedUid)
  return (settings.provider_settings ?? {}) as ProviderSettingsMap
}

export async function loadApiKeys(uid?: string): Promise<ApiKeyEntry[]> {
  if (IS_FIREBASE) {
    const resolvedUid = uid ?? getCurrentUserId() ?? undefined
    const userSettings = resolvedUid ? await ensureUserSettingsMigrated(resolvedUid) : {}
    const userApiKeys = (userSettings.api_keys ?? {}) as Record<string, string>

    return DEFAULT_KEY_DEFS.map(def => ({
      ...def,
      is_set: Boolean(userApiKeys[def.key]),
      masked_value: userApiKeys[def.key] ? maskValue(userApiKeys[def.key]) : null,
      source: userApiKeys[def.key] ? 'perfil' : 'not_set',
    }))
  }
  const res = await api.get('/admin/settings')
  return Array.isArray(res.data?.settings) ? res.data.settings : []
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveApiKeys(updates: Record<string, string>, uid?: string): Promise<void> {
  if (IS_FIREBASE) {
    const resolvedUid = uid ?? getCurrentUserId()
    if (!resolvedUid) throw new Error('Usuário não autenticado.')

    const settings = await getUserSettings(resolvedUid)
    const current = (settings.api_keys ?? {}) as Record<string, string>
    await saveUserSettings(resolvedUid, { api_keys: { ...current, ...updates } })
    emitProviderSettingsUpdated()
    return
  }
  await api.patch('/admin/settings', { updates })
  emitProviderSettingsUpdated()
}

export async function saveProviderSettings(
  updates: ProviderSettingsMap,
  uid?: string,
): Promise<void> {
  if (!IS_FIREBASE) return
  const resolvedUid = uid ?? getCurrentUserId()
  if (!resolvedUid) throw new Error('Usuário não autenticado.')
  const settings = await getUserSettings(resolvedUid)
  const current = (settings.provider_settings ?? {}) as ProviderSettingsMap
  const merged: ProviderSettingsMap = { ...current }
  for (const [pid, entry] of Object.entries(updates)) {
    merged[pid] = { ...(current[pid] ?? { enabled: false }), ...entry }
  }
  await saveUserSettings(resolvedUid, { provider_settings: merged })
  emitProviderSettingsUpdated()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskValue(value: string): string {
  if (value.length <= 8) return '••••••••'
  return '••••••••' + value.slice(-4)
}
