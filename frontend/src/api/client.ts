import axios, { AxiosResponse } from 'axios'
import {
  DEMO_MODE, DEMO_USER, DEMO_STATS, DEMO_DOCUMENTS,
  DEMO_DOCUMENT_TYPES, DEMO_LEGAL_AREAS, DEMO_MODULES,
} from './mock'

const api = axios.create({
  baseURL: '/api/v1',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lexio_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('lexio_token')
      const base = import.meta.env.BASE_URL || '/'
      window.location.href = `${base}login`
    }
    return Promise.reject(error)
  }
)

// ---- Demo mode wrapper ----
function mockResponse<T>(data: T): Promise<AxiosResponse<T>> {
  return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config: {} } as AxiosResponse<T>)
}

/**
 * Wraps axios instance to intercept calls in demo mode.
 * In demo mode, returns mock data instead of calling the real backend.
 */
const demoApi = {
  get(url: string, config?: any): Promise<AxiosResponse> {
    if (!DEMO_MODE) return api.get(url, config)

    if (url === '/stats') return mockResponse(DEMO_STATS)
    if (url === '/document-types') return mockResponse(DEMO_DOCUMENT_TYPES)
    if (url === '/legal-areas') return mockResponse(DEMO_LEGAL_AREAS)
    if (url === '/documents') return mockResponse({ items: DEMO_DOCUMENTS, total: DEMO_DOCUMENTS.length })
    if (url.startsWith('/documents/')) {
      const id = url.split('/')[2]
      const doc = DEMO_DOCUMENTS.find(d => d.id === id) || DEMO_DOCUMENTS[0]
      return mockResponse(doc)
    }
    if (url === '/admin/modules') return mockResponse(DEMO_MODULES)
    if (url === '/admin/modules/health') return mockResponse({
      total: DEMO_MODULES.length,
      healthy: DEMO_MODULES.filter(m => m.is_healthy).length,
      unhealthy: 0,
      modules: DEMO_MODULES,
    })
    if (url === '/health') return mockResponse({
      status: 'healthy',
      app: 'Lexio',
      version: '1.0.0',
      services: { postgres: 'ok', qdrant: 'ok', ollama: 'ok', searxng: 'ok' },
      modules: { total: 10, healthy: 10 },
    })
    return api.get(url, config)
  },

  post(url: string, data?: any, config?: any): Promise<AxiosResponse> {
    if (!DEMO_MODE) return api.post(url, data, config)

    if (url === '/auth/login') return mockResponse(DEMO_USER)
    if (url === '/auth/register') return mockResponse(DEMO_USER)
    if (url === '/documents') {
      const newDoc: any = {
        id: 'demo-doc-new-' + Date.now(),
        document_type_id: data?.document_type_id || 'parecer',
        legal_area_ids: data?.legal_area_ids || [],
        template_variant: data?.template_variant || 'generic',
        original_request: data?.original_request || '',
        tema: null as string | null,
        status: 'processando',
        quality_score: null as number | null,
        docx_path: null as string | null,
        created_at: new Date().toISOString(),
        origem: 'web',
      }
      DEMO_DOCUMENTS.unshift(newDoc)
      // Simulate completion after 26 seconds
      setTimeout(() => {
        newDoc.status = 'concluido'
        newDoc.tema = 'Análise jurídica (Demo)'
        newDoc.quality_score = 88
      }, 26000)
      return mockResponse(newDoc)
    }
    if (url === '/uploads') return mockResponse({ id: 'demo-upload-001', filename: 'documento.pdf', status: 'done' })
    return api.post(url, data, config)
  },

  put(url: string, data?: any, config?: any): Promise<AxiosResponse> {
    if (!DEMO_MODE) return api.put(url, data, config)
    return mockResponse({ success: true })
  },

  delete(url: string, config?: any): Promise<AxiosResponse> {
    if (!DEMO_MODE) return api.delete(url, config)
    return mockResponse({ success: true })
  },
}

export default demoApi
export { DEMO_MODE }
