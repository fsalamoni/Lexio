import axios from 'axios'
import { installDemoInterceptor } from './demo-interceptor'
import { firebaseAuth, IS_FIREBASE } from '../lib/firebase'

// ── In-memory GET cache with TTL + inflight deduplication ────────────────────

interface CacheEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any
  expires: number
}

const cache = new Map<string, CacheEntry>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inflight = new Map<string, Promise<any>>()

// URL-pattern rules for automatic caching (no call-site changes needed)
const CACHE_RULES: { pattern: RegExp; ttl: number }[] = [
  { pattern: /^\/stats(\/|$|\?)/, ttl: 60_000 },
  { pattern: /^\/document-types(\/|$|\?)/, ttl: 300_000 },
  { pattern: /^\/legal-areas(\/|$|\?)/, ttl: 300_000 },
  { pattern: /^\/theses\/stats/, ttl: 60_000 },
  { pattern: /^\/anamnesis\/profile$/, ttl: 120_000 },
  { pattern: /^\/health(\/|$|\?)/, ttl: 30_000 },
  { pattern: /^\/admin\/modules(\/|$|\?)/, ttl: 30_000 },
]

function resolveTTL(url: string): number | null {
  for (const rule of CACHE_RULES) {
    if (rule.pattern.test(url)) return rule.ttl
  }
  return null
}

function buildCacheKey(url: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return url
  return `${url}?${new URLSearchParams(params as Record<string, string>).toString()}`
}

/** Manually invalidate cache entries whose key starts with the given prefix. */
export function invalidateApiCache(prefix?: string): void {
  if (!prefix) { cache.clear(); return }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

// ── Axios instance ────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: '/api/v1',
})

function readStoredAuthToken(): string | null {
  try {
    return localStorage.getItem('lexio_token')
  } catch {
    return null
  }
}

async function resolveAuthToken(forceRefresh = false): Promise<string | null> {
  if (IS_FIREBASE && firebaseAuth?.currentUser) {
    try {
      const token = await firebaseAuth.currentUser.getIdToken(forceRefresh)
      localStorage.setItem('lexio_token', token)
      return token
    } catch (error) {
      console.warn('[api] Firebase token refresh failed:', error)
    }
  }

  return readStoredAuthToken()
}

api.interceptors.request.use(async (config) => {
  let token: string | null = null
  try {
    token = await resolveAuthToken(false)
  } catch (error) {
    console.warn('[api] Failed to resolve auth token for request:', error)
    token = readStoredAuthToken()
  }
  if (!token && IS_FIREBASE && firebaseAuth?.currentUser) {
    console.warn('[api] Proceeding without bearer token even though a Firebase user is present.')
  }
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const originalConfig = error.config as (typeof error.config & { _lexioAuthRetry?: boolean }) | undefined

      if (IS_FIREBASE) {
        if (firebaseAuth?.currentUser && originalConfig && !originalConfig._lexioAuthRetry) {
          originalConfig._lexioAuthRetry = true
          const freshToken = await resolveAuthToken(true)
          if (freshToken) {
            originalConfig.headers = originalConfig.headers ?? {}
            originalConfig.headers.Authorization = `Bearer ${freshToken}`
            return api(originalConfig)
          }
        }
      } else {
        localStorage.removeItem('lexio_token')
        const base = (import.meta.env.VITE_BASE_PATH as string | undefined)?.replace(/\/$/, '') || ''
        window.location.href = `${base}/login`
      }
    }
    if (error.response?.status === 429) {
      window.dispatchEvent(new CustomEvent('lexio:rate-limit'))
    }
    return Promise.reject(error)
  },
)

if (import.meta.env.VITE_DEMO_MODE === 'true' && !IS_FIREBASE) {
  installDemoInterceptor(api)
}

// ── Override api.get with caching ────────────────────────────────────────────

const _get = api.get.bind(api)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
api.get = function cachedGet(url: string, config?: any): any {
  if (config?.noCache) return _get(url, config)

  const ttl = resolveTTL(url)
  if (ttl === null) return _get(url, config)

  const key = buildCacheKey(url, config?.params)

  const entry = cache.get(key)
  if (entry && Date.now() < entry.expires) {
    return Promise.resolve(entry.response)
  }

  const existing = inflight.get(key)
  if (existing) return existing

  const req = _get(url, config)
    .then((res: unknown) => {
      cache.set(key, { response: res, expires: Date.now() + ttl })
      inflight.delete(key)
      return res
    })
    .catch((err: unknown) => {
      inflight.delete(key)
      throw err
    })

  inflight.set(key, req)
  return req
}

export default api
