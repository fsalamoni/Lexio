import axios from 'axios'

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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lexio_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('lexio_token')
      window.location.href = '/login'
    }
    if (error.response?.status === 429) {
      window.dispatchEvent(new CustomEvent('lexio:rate-limit'))
    }
    return Promise.reject(error)
  },
)

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
