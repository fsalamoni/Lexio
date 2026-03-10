/**
 * Admin settings store — backend API persistence.
 *
 * GET  /api/v1/admin/settings  → list keys with masked values
 * PATCH /api/v1/admin/settings → update keys, persisted in PostgreSQL
 */

import api from '../api/client'

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

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadApiKeys(): Promise<ApiKeyEntry[]> {
  const res = await api.get('/admin/settings')
  return Array.isArray(res.data?.settings) ? res.data.settings : []
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveApiKeys(updates: Record<string, string>): Promise<void> {
  await api.patch('/admin/settings', { updates })
}
