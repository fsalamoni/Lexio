/**
 * Demo-mode adapter for the API client.
 *
 * When VITE_DEMO_MODE is enabled and no real backend is available,
 * this interceptor returns sensible empty/default responses so the UI
 * renders cleanly without error toasts or 404 console noise.
 */

import type { AxiosInstance, AxiosError } from 'axios'

const DEMO_STATS = {
  total_documents: 0,
  completed_documents: 0,
  processing_documents: 0,
  pending_review_documents: 0,
  average_quality_score: null,
  total_cost_usd: 0,
  average_duration_ms: null,
}

/** URL patterns that return an object (not an array). */
const OBJECT_ENDPOINTS: Record<string, unknown> = {
  '/stats': DEMO_STATS,
  '/anamnesis/profile': { preferences: {} },
  '/health': { status: 'demo' },
}

function resolve(url: string): unknown {
  // Exact-match object endpoints
  if (url in OBJECT_ENDPOINTS) return OBJECT_ENDPOINTS[url]
  // Everything else (lists, sub-resources) → empty array
  return []
}

/**
 * Install demo-mode response interceptor on the given axios instance.
 * Failed requests are silently resolved with mock data; 401/429 errors
 * are still propagated so auth logic keeps working.
 */
export function installDemoInterceptor(api: AxiosInstance): void {
  api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
    const status = error.response?.status

    // Let auth/rate-limit errors through so existing handlers work
    if (status === 401 || status === 429) return Promise.reject(error)

    const url = error.config?.url ?? ''
    return Promise.resolve({
      data: resolve(url),
      status: 200,
      statusText: 'OK (demo)',
      headers: {},
      config: error.config,
    })
  })
}
