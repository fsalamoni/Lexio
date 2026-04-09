/**
 * Admin settings store — backend API or Firestore persistence.
 *
 * Backend mode:
 *   GET  /api/v1/admin/settings  → list keys with masked values
 *   PATCH /api/v1/admin/settings → update keys, persisted in PostgreSQL
 *
 * Firebase mode:
 *   Reads from user-scoped Firestore settings after one-time migration.
 */

import api from '../api/client'
import { IS_FIREBASE } from './firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, getUserSettings, saveUserSettings } from './firestore-service'

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
}

// Default API key definitions for Firebase mode
const DEFAULT_KEY_DEFS: Omit<ApiKeyEntry, 'is_set' | 'masked_value' | 'source'>[] = [
  {
    key: 'openrouter_api_key',
    label: 'OpenRouter API Key',
    description: 'Chave para geração de texto com LLMs (Claude, GPT, etc.)',
    placeholder: 'sk-or-v1-...',
    link: 'https://openrouter.ai/settings/keys',
    guide: ['Crie uma conta em openrouter.ai', 'Vá em Settings → Keys', 'Crie uma nova chave e cole aqui'],
    is_auto: false,
  },
  {
    key: 'datajud_api_key',
    label: 'DataJud API Key',
    description: 'Chave para acesso à base de jurisprudência do CNJ',
    placeholder: 'cDZH...',
    link: 'https://datajud-wiki.cnj.jus.br/',
    guide: ['Acesse https://datajud-wiki.cnj.jus.br/api-publica/', 'Copie a chave pública atualizada', 'Cole a chave fornecida aqui'],
    is_auto: false,
  },
]

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadApiKeyValues(uid?: string): Promise<Record<string, string>> {
  if (!IS_FIREBASE) return {}

  const resolvedUid = uid ?? getCurrentUserId() ?? undefined
  const userSettings = resolvedUid ? await ensureUserSettingsMigrated(resolvedUid) : {}
  const userApiKeys = (userSettings.api_keys ?? {}) as Record<string, string>
  return userApiKeys
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
    return
  }
  await api.patch('/admin/settings', { updates })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskValue(value: string): string {
  if (value.length <= 8) return '••••••••'
  return '••••••••' + value.slice(-4)
}
