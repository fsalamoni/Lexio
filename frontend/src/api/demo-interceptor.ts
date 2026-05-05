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

const DEMO_SMOKE_LOGIN_EMAIL = (import.meta.env.VITE_SMOKE_LOGIN_EMAIL as string | undefined) ?? 'smoke@local.test'
const DEMO_SMOKE_LOGIN_PASSWORD = (import.meta.env.VITE_SMOKE_LOGIN_PASSWORD as string | undefined) ?? 'lexio-smoke-123'
const DEMO_SMOKE_LOGIN_NAME = (import.meta.env.VITE_SMOKE_LOGIN_NAME as string | undefined) ?? 'Admin Smoke Local'

const DEMO_STATS = {
  total_documents: 12,
  completed_documents: 8,
  processing_documents: 1,
  pending_review_documents: 3,
  average_quality_score: 78,
  total_cost_usd: 0.04523,
  average_duration_ms: 45000,
}

const DEMO_COST_BREAKDOWN = {
  total_cost_usd: 0.04523,
  total_cost_brl: 0.25781,
  total_tokens_in: 25800,
  total_tokens_out: 11200,
  total_tokens: 37000,
  total_calls: 18,
  exchange_rate_brl: 5.7,
  by_provider: [
    { key: 'anthropic', label: 'Anthropic', calls: 15, tokens_in: 21600, tokens_out: 9200, total_tokens: 30800, cost_usd: 0.0407, cost_brl: 0.23199, avg_duration_ms: 5100 },
    { key: 'openai', label: 'OpenAI', calls: 3, tokens_in: 4200, tokens_out: 2000, total_tokens: 6200, cost_usd: 0.00453, cost_brl: 0.02582, avg_duration_ms: 1800 },
  ],
  by_model: [
    { key: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet', calls: 7, tokens_in: 14800, tokens_out: 6400, total_tokens: 21200, cost_usd: 0.0265, cost_brl: 0.15105, avg_duration_ms: 5600 },
    { key: 'anthropic/claude-opus-4', label: 'Claude Opus', calls: 3, tokens_in: 6800, tokens_out: 3200, total_tokens: 10000, cost_usd: 0.0142, cost_brl: 0.08094, avg_duration_ms: 7200 },
    { key: 'openai/gpt-4o-mini', label: 'GPT', calls: 8, tokens_in: 4200, tokens_out: 1600, total_tokens: 5800, cost_usd: 0.00453, cost_brl: 0.02582, avg_duration_ms: 1800 },
  ],
  by_function: [
    { key: 'document_generation', label: 'Geração de documentos', calls: 14, tokens_in: 22000, tokens_out: 9300, total_tokens: 31300, cost_usd: 0.0369, cost_brl: 0.21033, avg_duration_ms: 4900 },
    { key: 'thesis_analysis', label: 'Análise de teses', calls: 4, tokens_in: 3800, tokens_out: 1900, total_tokens: 5700, cost_usd: 0.00833, cost_brl: 0.04748, avg_duration_ms: 3600 },
  ],
  by_phase: [
    { key: 'pesquisador', label: 'Pesquisador', calls: 4, tokens_in: 9000, tokens_out: 3200, total_tokens: 12200, cost_usd: 0.0153, cost_brl: 0.08721, avg_duration_ms: 5400 },
    { key: 'redacao', label: 'Redação', calls: 4, tokens_in: 6100, tokens_out: 4500, total_tokens: 10600, cost_usd: 0.0149, cost_brl: 0.08493, avg_duration_ms: 8100 },
    { key: 'thesis_curador', label: 'Curador de Lacunas', calls: 2, tokens_in: 1800, tokens_out: 900, total_tokens: 2700, cost_usd: 0.0042, cost_brl: 0.02394, avg_duration_ms: 4100 },
  ],
  by_agent: [
    { key: 'Pesquisador', label: 'Pesquisador', calls: 4, tokens_in: 9000, tokens_out: 3200, total_tokens: 12200, cost_usd: 0.0153, cost_brl: 0.08721, avg_duration_ms: 5400 },
    { key: 'Redator', label: 'Redator', calls: 4, tokens_in: 6100, tokens_out: 4500, total_tokens: 10600, cost_usd: 0.0149, cost_brl: 0.08493, avg_duration_ms: 8100 },
    { key: 'Curador de Lacunas', label: 'Curador de Lacunas', calls: 2, tokens_in: 1800, tokens_out: 900, total_tokens: 2700, cost_usd: 0.0042, cost_brl: 0.02394, avg_duration_ms: 4100 },
  ],
  by_agent_function: [
    { key: 'document_generation::Pesquisador', label: 'Geração de documentos · Pesquisador', calls: 4, tokens_in: 9000, tokens_out: 3200, total_tokens: 12200, cost_usd: 0.0153, cost_brl: 0.08721, avg_duration_ms: 5400 },
    { key: 'document_generation::Redator', label: 'Geração de documentos · Redator', calls: 4, tokens_in: 6100, tokens_out: 4500, total_tokens: 10600, cost_usd: 0.0149, cost_brl: 0.08493, avg_duration_ms: 8100 },
    { key: 'thesis_analysis::Curador de Lacunas', label: 'Análise de teses · Curador de Lacunas', calls: 2, tokens_in: 1800, tokens_out: 900, total_tokens: 2700, cost_usd: 0.0042, cost_brl: 0.02394, avg_duration_ms: 4100 },
  ],
  by_document_type: [
    { key: 'parecer', label: 'Parecer', calls: 8, tokens_in: 12400, tokens_out: 4800, total_tokens: 17200, cost_usd: 0.0216, cost_brl: 0.12312, avg_duration_ms: 5200 },
    { key: 'peticao_inicial', label: 'Petição Inicial', calls: 6, tokens_in: 9600, tokens_out: 3800, total_tokens: 13400, cost_usd: 0.0153, cost_brl: 0.08721, avg_duration_ms: 4700 },
  ],
}

const DEMO_DOCUMENT_TYPES = [
  { id: 'parecer', name: 'Parecer Jurídico', description: 'Opinião técnico-jurídica fundamentada sobre questão de direito', templates: ['mprs_caopp', 'generic'] },
  { id: 'peticao_inicial', name: 'Petição Inicial', description: 'Peça inaugural de ação judicial', templates: ['generic'] },
  { id: 'contestacao', name: 'Contestação', description: 'Resposta do réu à petição inicial', templates: ['generic'] },
  { id: 'recurso', name: 'Recurso', description: 'Peça recursal para reforma de decisão judicial', templates: ['generic'] },
  { id: 'acao_civil_publica', name: 'Ação Civil Pública', description: 'Ação para tutela de direitos difusos e coletivos', templates: ['generic'] },
  { id: 'sentenca', name: 'Sentença', description: 'Decisão judicial que resolve o mérito da causa', templates: ['generic'] },
  { id: 'mandado_seguranca', name: 'Mandado de Segurança', description: 'Remédio constitucional contra ato ilegal de autoridade pública', templates: ['generic'] },
  { id: 'habeas_corpus', name: 'Habeas Corpus', description: 'Remédio constitucional contra violação da liberdade de locomoção', templates: ['generic'] },
  { id: 'agravo', name: 'Agravo de Instrumento', description: 'Recurso contra decisões interlocutórias', templates: ['generic'] },
  { id: 'embargos_declaracao', name: 'Embargos de Declaração', description: 'Recurso para sanar omissão, contradição ou obscuridade', templates: ['generic'] },
]

const DEMO_LEGAL_AREAS = [
  { id: 'administrative', name: 'Direito Administrativo', description: 'Licitações, contratos administrativos, improbidade, servidores públicos' },
  { id: 'constitutional', name: 'Direito Constitucional', description: 'Direitos fundamentais, controle de constitucionalidade, organização do Estado' },
  { id: 'civil', name: 'Direito Civil', description: 'Obrigações, contratos, responsabilidade civil, direitos reais, família e sucessões' },
  { id: 'tax', name: 'Direito Tributário', description: 'Tributos, contribuições, isenções, planejamento tributário' },
  { id: 'labor', name: 'Direito do Trabalho', description: 'Relações de trabalho, CLT, direitos trabalhistas, previdência' },
  { id: 'criminal', name: 'Direito Penal', description: 'Crimes, penas, execução penal, legislação penal especial' },
  { id: 'criminal_procedure', name: 'Processo Penal', description: 'Inquérito, ação penal, provas, recursos criminais, execução penal' },
  { id: 'civil_procedure', name: 'Processo Civil', description: 'Procedimentos, recursos, execução, tutelas provisórias, CPC/2015' },
  { id: 'consumer', name: 'Direito do Consumidor', description: 'Relações de consumo, CDC, responsabilidade do fornecedor, práticas abusivas' },
  { id: 'environmental', name: 'Direito Ambiental', description: 'Proteção ambiental, licenciamento, crimes ambientais, responsabilidade ambiental' },
  { id: 'business', name: 'Direito Empresarial', description: 'Sociedades, contratos mercantis, recuperação judicial, falência, propriedade intelectual' },
  { id: 'family', name: 'Direito de Família', description: 'Casamento, divórcio, guarda, alimentos, adoção, união estável' },
  { id: 'inheritance', name: 'Direito das Sucessões', description: 'Herança, testamento, inventário, partilha, sucessão legítima e testamentária' },
  { id: 'social_security', name: 'Direito Previdenciário', description: 'Aposentadoria, benefícios do INSS, auxílios, pensão por morte, BPC/LOAS' },
  { id: 'electoral', name: 'Direito Eleitoral', description: 'Eleições, partidos políticos, propaganda eleitoral, prestação de contas' },
  { id: 'international', name: 'Direito Internacional', description: 'Tratados, direito internacional público e privado, extradição, cooperação jurídica' },
  { id: 'digital', name: 'Direito Digital', description: 'LGPD, Marco Civil, crimes cibernéticos, proteção de dados, e-commerce' },
]

/** URL patterns that return an object (not an array). */
const OBJECT_ENDPOINTS: Record<string, unknown> = {
  '/stats': DEMO_STATS,
  '/stats/cost-breakdown': DEMO_COST_BREAKDOWN,
  '/anamnesis/profile': { preferences: {} },
  '/health': { status: 'demo', app: 'Lexio', version: '1.0.0', services: {}, modules: { total: 0, healthy: 0 } },
  '/admin/settings': { settings: [] },
}

/** URL patterns that return an array with specific content. */
const MS_PER_DAY = 86_400_000
const ARRAY_ENDPOINTS: Record<string, unknown[]> = {
  '/document-types': DEMO_DOCUMENT_TYPES,
  '/legal-areas': DEMO_LEGAL_AREAS,
  '/stats/daily': [
    { dia: new Date(Date.now() - 6 * MS_PER_DAY).toISOString().slice(0, 10), total: 2, concluidos: 1, custo: 0.0052 },
    { dia: new Date(Date.now() - 5 * MS_PER_DAY).toISOString().slice(0, 10), total: 3, concluidos: 2, custo: 0.0078 },
    { dia: new Date(Date.now() - 4 * MS_PER_DAY).toISOString().slice(0, 10), total: 1, concluidos: 1, custo: 0.0041 },
    { dia: new Date(Date.now() - 3 * MS_PER_DAY).toISOString().slice(0, 10), total: 2, concluidos: 2, custo: 0.0063 },
    { dia: new Date(Date.now() - 2 * MS_PER_DAY).toISOString().slice(0, 10), total: 3, concluidos: 1, custo: 0.0095 },
    { dia: new Date(Date.now() - 1 * MS_PER_DAY).toISOString().slice(0, 10), total: 1, concluidos: 1, custo: 0.0034 },
    { dia: new Date().toISOString().slice(0, 10), total: 0, concluidos: 0, custo: 0 },
  ],
  '/stats/agents': [
    { agent_name: 'triagem', chamadas: 12, tempo_medio_ms: 2100, custo_total: 0.0021 },
    { agent_name: 'pesquisador', chamadas: 12, tempo_medio_ms: 5400, custo_total: 0.0089 },
    { agent_name: 'jurista', chamadas: 12, tempo_medio_ms: 6200, custo_total: 0.0102 },
    { agent_name: 'advogado_diabo', chamadas: 10, tempo_medio_ms: 4800, custo_total: 0.0078 },
    { agent_name: 'redator', chamadas: 12, tempo_medio_ms: 8100, custo_total: 0.0131 },
  ],
  '/stats/recent': [
    { id: 'demo-1', document_type_id: 'parecer', tema: 'Análise de licitação pública', status: 'concluido', quality_score: 85, created_at: new Date(Date.now() - 2 * MS_PER_DAY).toISOString() },
    { id: 'demo-2', document_type_id: 'peticao_inicial', tema: 'Ação de indenização por danos morais', status: 'concluido', quality_score: 78, created_at: new Date(Date.now() - 3 * MS_PER_DAY).toISOString() },
    { id: 'demo-3', document_type_id: 'contestacao', tema: 'Defesa em ação trabalhista', status: 'revisao', quality_score: 72, created_at: new Date(Date.now() - 4 * MS_PER_DAY).toISOString() },
  ],
  '/stats/by-type': [
    { document_type_id: 'parecer', total: 4, avg_score: 82 },
    { document_type_id: 'peticao_inicial', total: 3, avg_score: 76 },
    { document_type_id: 'contestacao', total: 2, avg_score: 74 },
    { document_type_id: 'recurso', total: 2, avg_score: 79 },
    { document_type_id: 'sentenca', total: 1, avg_score: 88 },
  ],
}

function resolve(url: string, method?: string): unknown {
  // Exact-match object endpoints
  if (url in OBJECT_ENDPOINTS) return OBJECT_ENDPOINTS[url]
  // Exact-match array endpoints
  if (url in ARRAY_ENDPOINTS) return ARRAY_ENDPOINTS[url]

  // Notifications endpoint — return empty list with unread count
  if (url.startsWith('/notifications')) {
    if (method === 'get') return { items: [], unread_count: 0 }
    return { success: true }
  }

  // Document list endpoint returns paginated structure
  if (url.startsWith('/documents') && method === 'get' && !url.includes('/documents/')) {
    return { items: [], total: 0 }
  }

  // Single document detail
  if (/^\/documents\/[^/]+$/.test(url) && method === 'get') {
    return null
  }

  // Document executions
  if (url.includes('/executions') && method === 'get') {
    return []
  }

  // POST to create document — return a mock ID
  if (url === '/documents' && method === 'post') {
    return { id: 'demo-' + Date.now(), status: 'rascunho' }
  }

  // Auth endpoints — enforce the fixed local smoke credentials.
  if (url === '/auth/login' && method === 'post') {
    return null
  }
  if (url === '/auth/register' && method === 'post') {
    return {
      access_token: 'demo-token-' + Date.now(),
      user_id: 'demo-user',
      role: 'admin',
      full_name: DEMO_SMOKE_LOGIN_NAME,
    }
  }

  // Password change / reset — acknowledge success
  if (url.startsWith('/auth/') && method === 'post') {
    return { success: true }
  }

  // Profile save — acknowledge success
  if (url === '/anamnesis/profile' && (method === 'patch' || method === 'put')) {
    return { success: true }
  }

  // Onboarding save — acknowledge success
  if (url === '/anamnesis/onboarding' && method === 'post') {
    return { success: true }
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
    const url = error.config?.url ?? ''
    const method = error.config?.method ?? 'get'

    if (url === '/auth/login' && method === 'post') {
      const rawBody = error.config?.data
      let email = ''
      let password = ''

      if (typeof rawBody === 'string') {
        try {
          const parsed = JSON.parse(rawBody) as { email?: string; password?: string }
          email = parsed.email?.trim() ?? ''
          password = parsed.password ?? ''
        } catch {
          email = ''
          password = ''
        }
      } else if (rawBody && typeof rawBody === 'object') {
        const parsed = rawBody as { email?: string; password?: string }
        email = parsed.email?.trim() ?? ''
        password = parsed.password ?? ''
      }

      if (email === DEMO_SMOKE_LOGIN_EMAIL && password === DEMO_SMOKE_LOGIN_PASSWORD) {
        return Promise.resolve({
          data: {
            access_token: 'demo-token-' + Date.now(),
            user_id: 'demo-user',
            role: 'admin',
            full_name: DEMO_SMOKE_LOGIN_NAME,
          },
          status: 200,
          statusText: 'OK (demo)',
          headers: {},
          config: error.config,
        })
      }

      const unauthorizedError = new Error('Use as credenciais do smoke local exibidas na tela de login.') as AxiosError
      unauthorizedError.config = error.config
      unauthorizedError.isAxiosError = true
      unauthorizedError.response = {
        status: 401,
        statusText: 'Unauthorized',
        data: { detail: 'Use as credenciais do smoke local exibidas na tela de login.' },
        headers: {},
        config: (error.config ?? {}) as never,
      }
      return Promise.reject(unauthorizedError)
    }

    // Let auth/rate-limit errors through so existing handlers work
    if (status === 401 || status === 429) return Promise.reject(error)

    return Promise.resolve({
      data: resolve(url, method),
      status: 200,
      statusText: 'OK (demo)',
      headers: {},
      config: error.config,
    })
  })
}
