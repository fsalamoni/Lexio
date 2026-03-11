/**
 * Demo-mode adapter for the API client.
 *
 * When VITE_DEMO_MODE is enabled and no real backend is available,
 * this interceptor returns sensible empty/default responses so the UI
 * renders cleanly without error toasts or 404 console noise.
 *
 * NOTE: This is only active when VITE_DEMO_MODE=true AND requests fail.
 * When IS_FIREBASE=true, pages route directly to Firestore — this
 * interceptor only catches residual API calls that couldn't be handled.
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

const DEMO_DOCUMENT_TYPES = [
  { id: 'parecer', name: 'Parecer Jurídico', description: 'Opinião técnico-jurídica fundamentada sobre questão de direito', templates: ['mprs_caopp', 'generic'] },
  { id: 'peticao_inicial', name: 'Petição Inicial', description: 'Peça inaugural de ação judicial', templates: ['generic'] },
  { id: 'contestacao', name: 'Contestação', description: 'Resposta do réu à petição inicial', templates: ['generic'] },
  { id: 'recurso', name: 'Recurso', description: 'Peça recursal para reforma de decisão judicial', templates: ['generic'] },
  { id: 'acao_civil_publica', name: 'Ação Civil Pública', description: 'Ação para tutela de direitos difusos e coletivos', templates: ['generic'] },
  { id: 'sentenca', name: 'Sentença', description: 'Decisão judicial que resolve o mérito da causa', templates: ['generic'] },
]

const DEMO_LEGAL_AREAS = [
  { id: 'administrative', name: 'Direito Administrativo', description: 'Licitações, contratos administrativos, improbidade, servidores públicos' },
  { id: 'constitutional', name: 'Direito Constitucional', description: 'Direitos fundamentais, controle de constitucionalidade, organização do Estado' },
  { id: 'civil', name: 'Direito Civil', description: 'Obrigações, contratos, responsabilidade civil, direitos reais, família e sucessões' },
  { id: 'tax', name: 'Direito Tributário', description: 'Tributos, contribuições, isenções, planejamento tributário' },
  { id: 'labor', name: 'Direito do Trabalho', description: 'Relações de trabalho, CLT, direitos trabalhistas, previdência' },
]

/** URL patterns that return an object (not an array). */
const OBJECT_ENDPOINTS: Record<string, unknown> = {
  '/stats': DEMO_STATS,
  '/anamnesis/profile': { preferences: {} },
  '/health': { status: 'demo', app: 'Lexio', version: '1.0.0', services: {}, modules: { total: 0, healthy: 0 } },
  '/admin/settings': { settings: [] },
}

/** URL patterns that return an array with specific content. */
const ARRAY_ENDPOINTS: Record<string, unknown[]> = {
  '/document-types': DEMO_DOCUMENT_TYPES,
  '/legal-areas': DEMO_LEGAL_AREAS,
  '/stats/daily': [],
  '/stats/agents': [],
  '/stats/recent': [],
  '/stats/by-type': [],
}

function resolve(url: string, method?: string): unknown {
  // Exact-match object endpoints
  if (url in OBJECT_ENDPOINTS) return OBJECT_ENDPOINTS[url]
  // Exact-match array endpoints
  if (url in ARRAY_ENDPOINTS) return ARRAY_ENDPOINTS[url]

  // Document list endpoint returns paginated structure
  if (url.startsWith('/documents') && method === 'get' && !url.includes('/documents/')) {
    return { items: [], total: 0 }
  }

  // POST to create document — return a mock ID
  if (url === '/documents' && method === 'post') {
    return { id: 'demo-' + Date.now(), status: 'rascunho' }
  }

  // Wizard data
  if (url === '/anamnesis/wizard') {
    return { onboarding_completed: false, profile: {}, onboarding_steps: [] }
  }

  // Request fields
  if (url.startsWith('/anamnesis/request-fields/')) {
    return { fields: [] }
  }

  // Everything else → empty array
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
    const method = error.config?.method ?? 'get'
    return Promise.resolve({
      data: resolve(url, method),
      status: 200,
      statusText: 'OK (demo)',
      headers: {},
      config: error.config,
    })
  })
}
