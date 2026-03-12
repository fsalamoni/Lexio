/**
 * Demo interceptor — returns mock data when VITE_DEMO_MODE=true
 * and the real backend is unavailable.
 *
 * Installed as an Axios response-error interceptor: when a request fails
 * with a network error or 404, the interceptor checks if a matching route
 * handler exists and resolves with fake data instead of rejecting.
 */

import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import * as D from './data'

// ── Route matching helpers ────────────────────────────────────────────────────

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

interface RouteHandler {
  method: Method
  pattern: RegExp
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (match: RegExpMatchArray, config: InternalAxiosRequestConfig) => any
}

function fakeResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  config: InternalAxiosRequestConfig,
  status = 200,
): AxiosResponse {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config,
  }
}

// ── Route definitions ─────────────────────────────────────────────────────────

const routes: RouteHandler[] = [
  // Auth
  { method: 'post', pattern: /^\/auth\/login$/, handler: () => D.DEMO_AUTH_RESPONSE },
  { method: 'post', pattern: /^\/auth\/register$/, handler: () => D.DEMO_AUTH_RESPONSE },
  { method: 'post', pattern: /^\/auth\/change-password$/, handler: () => ({ message: 'ok' }) },

  // Stats
  { method: 'get', pattern: /^\/stats$/, handler: () => D.DEMO_STATS },
  { method: 'get', pattern: /^\/stats\/daily/, handler: () => D.DEMO_STATS_DAILY },
  { method: 'get', pattern: /^\/stats\/agents$/, handler: () => D.DEMO_STATS_AGENTS },
  { method: 'get', pattern: /^\/stats\/recent$/, handler: () => D.DEMO_STATS_RECENT },
  { method: 'get', pattern: /^\/stats\/by-type$/, handler: () => D.DEMO_STATS_BY_TYPE },

  // Documents (list)
  { method: 'get', pattern: /^\/documents$/, handler: () => ({ items: D.DEMO_DOCUMENTS, total: D.DEMO_DOCUMENTS.length }) },

  // Documents (single + sub-resources)
  { method: 'get', pattern: /^\/documents\/([^/]+)\/content$/, handler: (_m) => ({ content: D.DEMO_DOCUMENTS[0]?.content ?? '' }) },
  { method: 'get', pattern: /^\/documents\/([^/]+)\/executions$/, handler: () => [] },
  { method: 'get', pattern: /^\/documents\/([^/]+)$/, handler: (m) => D.DEMO_DOCUMENTS.find(d => d.id === m[1]) ?? D.DEMO_DOCUMENTS[0] },

  // Documents (mutations)
  { method: 'post', pattern: /^\/documents\/bulk-export$/, handler: () => new Blob() },
  { method: 'post', pattern: /^\/documents\/([^/]+)\/(retry|reject|approve|submit-review)$/, handler: () => ({ message: 'ok' }) },
  { method: 'post', pattern: /^\/documents$/, handler: () => ({ ...D.DEMO_DOCUMENTS[0], id: 'demo-new' }) },
  { method: 'put', pattern: /^\/documents\/([^/]+)\/content$/, handler: () => ({ message: 'ok' }) },
  { method: 'delete', pattern: /^\/documents\/([^/]+)$/, handler: () => ({ message: 'ok' }) },

  // Document types & legal areas
  { method: 'get', pattern: /^\/document-types$/, handler: () => D.DEMO_DOCUMENT_TYPES },
  { method: 'get', pattern: /^\/legal-areas$/, handler: () => D.DEMO_LEGAL_AREAS },

  // Health
  { method: 'get', pattern: /^\/health$/, handler: () => D.DEMO_HEALTH },

  // Admin
  { method: 'get', pattern: /^\/admin\/modules$/, handler: () => D.DEMO_MODULES },
  { method: 'post', pattern: /^\/admin\/modules\/([^/]+)\/toggle$/, handler: () => ({ is_enabled: true }) },
  { method: 'post', pattern: /^\/admin\/reindex$/, handler: () => ({ message: 'Reindexação iniciada' }) },
  { method: 'get', pattern: /^\/admin\/settings$/, handler: () => D.DEMO_ADMIN_SETTINGS },
  { method: 'patch', pattern: /^\/admin\/settings$/, handler: () => ({ message: 'ok' }) },
  { method: 'get', pattern: /^\/admin\/pipeline-logs/, handler: () => D.DEMO_PIPELINE_LOGS },
  { method: 'get', pattern: /^\/admin\/users$/, handler: () => D.DEMO_USERS },
  { method: 'patch', pattern: /^\/admin\/users\/([^/]+)$/, handler: () => ({ message: 'ok' }) },

  // Theses
  { method: 'get', pattern: /^\/theses\/stats$/, handler: () => D.DEMO_THESES_STATS },
  { method: 'get', pattern: /^\/theses$/, handler: () => ({ items: D.DEMO_THESES, total: D.DEMO_THESES.length }) },
  { method: 'patch', pattern: /^\/theses\/([^/]+)$/, handler: () => ({ message: 'ok' }) },
  { method: 'post', pattern: /^\/theses\/$/, handler: () => ({ ...D.DEMO_THESES[0], id: 'thesis-new' }) },

  // Uploads
  { method: 'get', pattern: /^\/uploads$/, handler: () => D.DEMO_UPLOADS },
  { method: 'post', pattern: /^\/uploads$/, handler: () => ({ message: 'ok' }) },
  { method: 'delete', pattern: /^\/uploads\/([^/]+)$/, handler: () => ({ message: 'ok' }) },

  // Anamnesis
  { method: 'get', pattern: /^\/anamnesis\/profile$/, handler: () => D.DEMO_ANAMNESIS_PROFILE },
  { method: 'patch', pattern: /^\/anamnesis\/profile$/, handler: () => D.DEMO_ANAMNESIS_PROFILE },
  { method: 'get', pattern: /^\/anamnesis\/wizard$/, handler: () => D.DEMO_ANAMNESIS_WIZARD },
  { method: 'post', pattern: /^\/anamnesis\/onboarding$/, handler: () => ({ message: 'ok' }) },
  { method: 'get', pattern: /^\/anamnesis\/request-fields\/([^/]+)$/, handler: () => ({ fields: [] }) },
]

// ── Interceptor installation ──────────────────────────────────────────────────

function matchRoute(method: string, url: string) {
  const m = (method || 'get').toLowerCase() as Method
  // Strip leading baseURL (/api/v1) if present so patterns match the relative path
  const path = url.replace(/^\/api\/v1/, '')
  for (const route of routes) {
    if (route.method !== m) continue
    const match = path.match(route.pattern)
    if (match) return { route, match }
  }
  return null
}

/**
 * Install the demo interceptor on an Axios instance.
 *
 * Two scenarios are handled:
 *  1. Failed responses (404 / network error on GitHub Pages) — return mock data.
 *  2. Successful responses that are clearly NOT valid API JSON (e.g. an HTML
 *     page returned by Firebase Hosting's SPA rewrite) — replace with mock data.
 */
export function installDemoInterceptor(api: AxiosInstance): void {
  api.interceptors.response.use(
    // Success path — detect HTML responses masquerading as API data
    (response) => {
      const ct = (response.headers?.['content-type'] as string) ?? ''
      const isHtml = ct.includes('text/html') ||
        (typeof response.data === 'string' && response.data.trimStart().startsWith('<!'))

      if (isHtml) {
        const config = response.config
        const url = config.url || ''
        const result = matchRoute(config.method || 'get', url)
        if (result) {
          return fakeResponse(result.route.handler(result.match, config), config)
        }
      }
      return response
    },
    // Error path — network error or HTTP 4xx/5xx
    (error) => {
      const config = error?.config as InternalAxiosRequestConfig | undefined
      if (!config) return Promise.reject(error)

      const url = config.url || ''
      const result = matchRoute(config.method || 'get', url)

      if (result) {
        const data = result.route.handler(result.match, config)
        return Promise.resolve(fakeResponse(data, config))
      }

      return Promise.reject(error)
    },
  )
}
