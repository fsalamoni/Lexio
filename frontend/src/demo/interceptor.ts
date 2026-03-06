/**
 * Lexio Demo Mode — Axios interceptor that returns mock data.
 *
 * Intercepts all API requests and resolves with demo data
 * when VITE_DEMO_MODE is enabled.
 */

import type { AxiosInstance } from 'axios'
import {
  DEMO_USER,
  DEMO_DOCUMENTS,
  DEMO_MODULES,
  DEMO_HEALTH,
  DEMO_STATS,
  DEMO_DOC_TYPES,
  DEMO_LEGAL_AREAS,
  DEMO_SETTINGS,
  DEMO_THESES,
  DEMO_THESES_STATS,
} from './data'

export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true'

/** Auto-login in demo mode. */
export function seedDemoAuth(): void {
  if (!IS_DEMO) return
  if (!localStorage.getItem('lexio_token')) {
    localStorage.setItem('lexio_token', DEMO_USER.access_token)
    localStorage.setItem('lexio_user_id', DEMO_USER.user_id)
    localStorage.setItem('lexio_role', DEMO_USER.role)
    localStorage.setItem('lexio_full_name', DEMO_USER.full_name)
  }
}

/** Attach a request interceptor that fulfills requests locally. */
export function installDemoInterceptor(api: AxiosInstance): void {
  if (!IS_DEMO) return

  api.interceptors.request.use((config) => {
    const url = config.url || ''
    const method = (config.method || 'get').toLowerCase()
    const response = routeDemo(url, method, config.data)

    // Axios adapter override — return a fulfilled promise
    config.adapter = () =>
      Promise.resolve({
        data: response,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      })

    return config
  })
}

// ── Route matching ────────────────────────────────────────────────────

function routeDemo(url: string, method: string, body?: any): any {
  // Auth
  if (url.includes('/auth/login') && method === 'post') return DEMO_USER
  if (url.includes('/auth/register') && method === 'post') return DEMO_USER

  // Health
  if (url.includes('/health')) return DEMO_HEALTH

  // Stats
  if (url.includes('/stats')) return DEMO_STATS

  // Documents
  if (url.match(/\/documents\/[^/]+$/) && method === 'get') {
    const id = url.split('/').pop()
    const doc = DEMO_DOCUMENTS.find(d => d.id === id) || DEMO_DOCUMENTS[0]
    return { ...doc, texto_completo: `[Conteúdo completo do documento "${doc.tema}" — disponível apenas na versão com backend]` }
  }
  if (url.includes('/documents') && method === 'post') {
    return {
      ...DEMO_DOCUMENTS[0],
      id: 'demo-new-' + Date.now(),
      status: 'processando',
      created_at: new Date().toISOString(),
    }
  }
  if (url.includes('/documents')) {
    return { items: DEMO_DOCUMENTS, total: DEMO_DOCUMENTS.length, page: 1, pages: 1 }
  }

  // Document types
  if (url.includes('/document-types')) return DEMO_DOC_TYPES

  // Legal areas
  if (url.includes('/legal-areas')) return DEMO_LEGAL_AREAS

  // Admin modules
  if (url.includes('/admin/modules') && url.includes('/toggle')) {
    return { module_id: 'demo', is_enabled: true }
  }
  if (url.includes('/admin/modules')) return DEMO_MODULES

  // Admin settings
  if (url.includes('/admin/settings') && method === 'patch') {
    return { updated: Object.keys(body?.updates || {}), message: 'Demo — configurações não salvas no modo demonstração.' }
  }
  if (url.includes('/admin/settings')) return DEMO_SETTINGS

  // Theses — stats before list
  if (url.includes('/theses/stats')) return DEMO_THESES_STATS
  if (url.includes('/theses')) return { items: DEMO_THESES, total: DEMO_THESES.length }

  // Uploads
  if (url.includes('/uploads')) return { items: [], total: 0 }

  // Anamnesis — wizard, request-fields, onboarding, profile
  if (url.includes('/anamnesis/wizard') || url.includes('/anamnesis/onboarding')) {
    return { onboarding_completed: true, onboarding_steps: [], profile: null }
  }
  if (url.match(/\/anamnesis\/request-fields\/[^/]+$/)) {
    return { fields: [] }
  }
  if (url.includes('/profile') || url.includes('/anamnesis')) return { onboarding_completed: true }

  // Fallback
  return { status: 'demo', message: 'Modo demonstração — dados simulados' }
}
