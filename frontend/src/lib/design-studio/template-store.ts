/**
 * Design Studio — persistence for user-created templates.
 *
 * User templates are stored in `localStorage` under a single key. The store is
 * defensive (SSR-safe, quota-safe, corruption-safe) and merges the read-only
 * starter templates with the user's own saved templates.
 */

import { STARTER_DESIGN_TEMPLATES, coerceSpec, type DesignSpec, type DesignTemplate } from './design-spec'

const STORAGE_KEY = 'lexio.design-studio.templates.v1'

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

function readUserTemplates(): DesignTemplate[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const templates: DesignTemplate[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      const spec = coerceSpec(record.spec)
      if (!spec) continue
      templates.push({
        id: typeof record.id === 'string' ? record.id : createTemplateId(),
        name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : spec.title,
        spec,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
      })
    }
    return templates
  } catch {
    return []
  }
}

function writeUserTemplates(templates: DesignTemplate[]): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(templates))
    return true
  } catch {
    return false
  }
}

/** Generates a reasonably-unique template id without external deps. */
export function createTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Returns starter templates followed by the user's own templates (newest first). */
export function listDesignTemplates(): DesignTemplate[] {
  const user = readUserTemplates().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return [...STARTER_DESIGN_TEMPLATES, ...user]
}

/** Returns only the user-created (persisted) templates. */
export function listUserDesignTemplates(): DesignTemplate[] {
  return readUserTemplates().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * Saves a template. When `id` matches an existing user template it is updated;
 * otherwise a new template is appended. Returns the saved template, or `null`
 * when persistence is unavailable.
 */
export function saveDesignTemplate(name: string, spec: DesignSpec, id?: string): DesignTemplate | null {
  const templates = readUserTemplates()
  const saved: DesignTemplate = {
    id: id ?? createTemplateId(),
    name: name.trim() || spec.title || 'Template',
    spec,
    updatedAt: new Date().toISOString(),
  }
  const index = templates.findIndex((entry) => entry.id === saved.id)
  if (index >= 0) {
    templates[index] = saved
  } else {
    templates.push(saved)
  }
  return writeUserTemplates(templates) ? saved : null
}

/** Deletes a user template by id. Returns true when something was removed. */
export function deleteDesignTemplate(id: string): boolean {
  const templates = readUserTemplates()
  const next = templates.filter((entry) => entry.id !== id)
  if (next.length === templates.length) return false
  return writeUserTemplates(next)
}
