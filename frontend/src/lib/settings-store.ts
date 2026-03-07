/**
 * Admin settings store — dual-mode persistence.
 *
 * Demo mode (GitHub Pages / VITE_DEMO_MODE=true) + Firebase:
 *   Reads metadata from DEMO_SETTINGS, overrides with values stored in
 *   Firestore `platform_settings/{key}`.  Keys persist across sessions.
 *
 * Production mode (real backend):
 *   GET  /api/v1/admin/settings  → list keys with masked values
 *   PATCH /api/v1/admin/settings → update keys, persisted in PostgreSQL
 */

import api from '../api/client'
import { IS_DEMO } from '../demo/interceptor'
import { IS_FIREBASE, firestore } from './firebase'
import { DEMO_SETTINGS } from '../demo/data'

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function _mask(value: string | null | undefined): string | null {
  if (!value || value.length < 6) return null
  if (value.length <= 12) return value.slice(0, 4) + '••••'
  return value.slice(0, 6) + '•'.repeat(value.length - 10) + value.slice(-4)
}

// ── Firestore path ─────────────────────────────────────────────────────────────

const FS_COLLECTION = 'settings'

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadApiKeys(): Promise<ApiKeyEntry[]> {
  // Demo mode + Firebase: merge DEMO_SETTINGS metadata with Firestore values
  if (IS_DEMO && IS_FIREBASE && firestore) {
    const { collection, getDocs } = await import('firebase/firestore')
    const snap = await getDocs(collection(firestore, FS_COLLECTION))
    const stored: Record<string, string> = {}
    snap.forEach(doc => { stored[doc.id] = doc.data().value as string })

    return DEMO_SETTINGS.settings.map(item => {
      const value = stored[item.key] ?? null
      const hasValue = Boolean(value)
      return {
        ...item,
        is_set: hasValue || item.is_set,
        masked_value: hasValue ? _mask(value) : item.masked_value,
        source: hasValue ? 'banco' : item.source,
      } as ApiKeyEntry
    })
  }

  // Production: use backend API
  const res = await api.get('/admin/settings')
  return res.data.settings as ApiKeyEntry[]
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveApiKeys(updates: Record<string, string>): Promise<void> {
  // Demo mode + Firebase: persist each key as a Firestore document
  if (IS_DEMO && IS_FIREBASE && firestore) {
    const { collection, doc, setDoc } = await import('firebase/firestore')
    const col = collection(firestore, FS_COLLECTION)
    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        setDoc(doc(col, key), { value: value.trim(), updated_at: new Date().toISOString() })
      )
    )
    return
  }

  // Production: use backend API
  await api.patch('/admin/settings', { updates })
}
