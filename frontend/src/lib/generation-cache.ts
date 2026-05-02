/**
 * In-memory caches for the document generation pipeline (Subonda 2).
 *
 * These caches avoid redundant Firestore reads / API calls during a single
 * browser session, especially when the user generates multiple documents
 * in quick succession (common in legal workflows).
 *
 * Cache invalidation strategy: session-scoped (cleared on page refresh).
 * All caches use a simple TTL to balance freshness vs. performance.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CachedEmenta {
  ementa: string
  keywords: string[]
  savedAt: number
}

export interface CachedClassificacao {
  natureza: string
  area_direito: string[]
  assuntos: string[]
  tipo_documento: string
  contexto: string[]
  savedAt: number
}

export interface CachedTemplate {
  structure: string
  savedAt: number
}

interface CacheEntry<T> {
  data: T
  savedAt: number
}

// ── Config ────────────────────────────────────────────────────────────────────
// TTL values tuned for legal workflow patterns:
// - Ementas: long (1h) — rarely change once generated
// - Classificação: long (1h) — same as ementas
// - Templates: very long (24h) — admin changes are rare
// - Admin doc types: medium (10min) — faster for admin panel updates
// - Model configs: short (5min) — already handled by sessionStorage in generation-service

export const EMENTA_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
export const CLASSIFICACAO_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
export const TEMPLATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
export const ADMIN_DOC_TYPES_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
export const GET_ACERVO_CONTEXT_CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutes

// ── Generic cache helpers ─────────────────────────────────────────────────────

function isExpired(entry: { savedAt: number } | null, ttlMs: number): boolean {
  if (!entry) return true
  return Date.now() - entry.savedAt > ttlMs
}

function buildKey(...parts: string[]): string {
  return `lexio:gencache:${parts.join(':')}`
}

// ── Ementa cache ──────────────────────────────────────────────────────────────

const ementaCache = new Map<string, CacheEntry<Omit<CachedEmenta, 'savedAt'>>>()

export function getEmentaFromCache(uid: string, docId: string): CachedEmenta | null {
  const key = buildKey('ementa', uid, docId)
  const entry = ementaCache.get(key) ?? null
  if (entry && !isExpired(entry, EMENTA_CACHE_TTL_MS)) {
    return { ...entry.data, savedAt: entry.savedAt }
  }
  if (entry) ementaCache.delete(key)
  return null
}

export function setEmentaInCache(uid: string, docId: string, data: Omit<CachedEmenta, 'savedAt'>): void {
  const key = buildKey('ementa', uid, docId)
  ementaCache.set(key, { data, savedAt: Date.now() })
}

export function invalidateEmentaCache(uid: string, docId: string): void {
  const key = buildKey('ementa', uid, docId)
  ementaCache.delete(key)
}

// ── Classificação cache ───────────────────────────────────────────────────────

const classificacaoCache = new Map<string, CacheEntry<Omit<CachedClassificacao, 'savedAt'>>>()

export function getClassificacaoFromCache(uid: string, docId: string): CachedClassificacao | null {
  const key = buildKey('classificacao', uid, docId)
  const entry = classificacaoCache.get(key) ?? null
  if (entry && !isExpired(entry, CLASSIFICACAO_CACHE_TTL_MS)) {
    return { ...entry.data, savedAt: entry.savedAt }
  }
  if (entry) classificacaoCache.delete(key)
  return null
}

export function setClassificacaoInCache(uid: string, docId: string, data: Omit<CachedClassificacao, 'savedAt'>): void {
  const key = buildKey('classificacao', uid, docId)
  classificacaoCache.set(key, { data, savedAt: Date.now() })
}

export function invalidateClassificacaoCache(uid: string, docId: string): void {
  const key = buildKey('classificacao', uid, docId)
  classificacaoCache.delete(key)
}

// ── Template cache ────────────────────────────────────────────────────────────

const templateCache = new Map<string, CacheEntry<Omit<CachedTemplate, 'savedAt'>>>()

export function getTemplateFromCache(uid: string, docType: string): CachedTemplate | null {
  const key = buildKey('template', uid, docType)
  const entry = templateCache.get(key) ?? null
  if (entry && !isExpired(entry, TEMPLATE_CACHE_TTL_MS)) {
    return { ...entry.data, savedAt: entry.savedAt }
  }
  if (entry) templateCache.delete(key)
  return null
}

export function setTemplateInCache(uid: string, docType: string, data: Omit<CachedTemplate, 'savedAt'>): void {
  const key = buildKey('template', uid, docType)
  templateCache.set(key, { data, savedAt: Date.now() })
}

export function invalidateTemplateCache(uid: string, docType: string): void {
  const key = buildKey('template', uid, docType)
  templateCache.delete(key)
}

// ── Admin doc types cache ─────────────────────────────────────────────────────

const adminDocTypesCache = new Map<string, CacheEntry<Array<{ id: string; structure?: string }>>>()

export function getAdminDocTypesFromCache(uid: string): { id: string; structure?: string }[] | null {
  const key = buildKey('adminDocTypes', uid)
  const entry = adminDocTypesCache.get(key) ?? null
  if (entry && !isExpired(entry, ADMIN_DOC_TYPES_CACHE_TTL_MS)) {
    return entry.data
  }
  if (entry) adminDocTypesCache.delete(key)
  return null
}

export function setAdminDocTypesInCache(
  uid: string,
  data: Array<{ id: string; structure?: string }>,
): void {
  const key = buildKey('adminDocTypes', uid)
  adminDocTypesCache.set(key, { data, savedAt: Date.now() })
}

export function invalidateAdminDocTypesCache(uid: string): void {
  const key = buildKey('adminDocTypes', uid)
  adminDocTypesCache.delete(key)
}

// ── Acervo context cache ──────────────────────────────────────────────────────

const acervoContextCache = new Map<string, CacheEntry<string>>()

export function getAcervoContextFromCache(uid: string): string | null {
  const key = buildKey('acervoContext', uid)
  const entry = acervoContextCache.get(key) ?? null
  if (entry && !isExpired(entry, GET_ACERVO_CONTEXT_CACHE_TTL_MS)) {
    return entry.data
  }
  if (entry) acervoContextCache.delete(key)
  return null
}

export function setAcervoContextInCache(uid: string, data: string): void {
  const key = buildKey('acervoContext', uid)
  acervoContextCache.set(key, { data, savedAt: Date.now() })
}

// ── Bulk invalidation ─────────────────────────────────────────────────────────

/** Invalidate all generation caches for a given user (e.g., after logout). */
export function invalidateAllGenerationCaches(uid: string): void {
  const prefix = buildKey('')
  for (const key of ementaCache.keys()) {
    if (key.startsWith(prefix)) ementaCache.delete(key)
  }
  for (const key of classificacaoCache.keys()) {
    if (key.startsWith(prefix)) classificacaoCache.delete(key)
  }
  for (const key of templateCache.keys()) {
    if (key.startsWith(prefix)) templateCache.delete(key)
  }
  for (const key of adminDocTypesCache.keys()) {
    if (key.startsWith(prefix)) adminDocTypesCache.delete(key)
  }
  for (const key of acervoContextCache.keys()) {
    if (key.startsWith(prefix)) acervoContextCache.delete(key)
  }
}

/** Full wipe — use sparingly (e.g., after admin bulk-updates acervo). */
export function invalidateAllCaches(): void {
  ementaCache.clear()
  classificacaoCache.clear()
  templateCache.clear()
  adminDocTypesCache.clear()
  acervoContextCache.clear()
}