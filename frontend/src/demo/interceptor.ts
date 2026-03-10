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
  DEMO_STATS_DAILY,
  DEMO_STATS_AGENTS,
  DEMO_STATS_RECENT,
  DEMO_EXECUTIONS,
} from './data'

export const IS_DEMO     = import.meta.env.VITE_DEMO_MODE === 'true'
const IS_FIREBASE_CONFIGURED = Boolean(import.meta.env.VITE_FIREBASE_API_KEY)

/**
 * Auto-login only in pure demo mode (no Firebase configured).
 * When Firebase is active, the user must authenticate for real.
 */
export function seedDemoAuth(): void {
  if (!IS_DEMO || IS_FIREBASE_CONFIGURED) return
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
  if (url.includes('/stats/daily')) return DEMO_STATS_DAILY
  if (url.includes('/stats/agents')) return DEMO_STATS_AGENTS
  if (url.includes('/stats/recent')) return DEMO_STATS_RECENT
  if (url.includes('/stats')) return { ...DEMO_STATS, average_duration_ms: 143100 }

  // Executions for a document
  if (url.match(/\/documents\/[^/]+\/executions$/) && method === 'get') return DEMO_EXECUTIONS

  // Document content (editor)
  if (url.match(/\/documents\/[^/]+\/content$/) && method === 'get') {
    const id = url.split('/').slice(-2)[0]
    const doc = DEMO_DOCUMENTS.find(d => d.id === id) || DEMO_DOCUMENTS[0]
    return {
      content: `<h1>${doc.document_type_id.toUpperCase()} — ${doc.tema || 'Documento Demonstração'}</h1>\n<p>Este é o conteúdo de demonstração do documento. Na versão com backend completo, o texto gerado pelos agentes de IA será exibido aqui no editor.</p>\n<h2>Fundamentação Jurídica</h2>\n<p>A análise jurídica é elaborada por 9 agentes especializados em sequência: triagem → moderador → jurista → advogado do diabo → revisão → fact-checker → redator → revisor.</p>\n<h2>Conclusão</h2>\n<p>Para acessar documentos reais, configure o ambiente de produção com Docker Compose e gere um novo documento através do formulário.</p>`,
      document_type_id: doc.document_type_id,
      tema: doc.tema,
    }
  }
  if (url.match(/\/documents\/[^/]+\/content$/) && method === 'put') return { ok: true }

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

  // Anamnesis — onboarding completion
  if (url.includes('/anamnesis/onboarding') && method === 'post') {
    localStorage.setItem('lexio_onboarding_done', 'true')
    return { onboarding_completed: true, profile: body || {} }
  }

  // Anamnesis — wizard state
  if (url.includes('/anamnesis/wizard')) {
    return {
      onboarding_completed: !!localStorage.getItem('lexio_onboarding_done'),
      onboarding_steps: [
        {
          step: 1,
          title: 'Perfil Profissional',
          description: 'Informações básicas sobre sua atuação',
          fields: [
            { key: 'full_name', label: 'Nome completo', type: 'text', placeholder: 'Seu nome', required: true },
            { key: 'role', label: 'Cargo/Função', type: 'select', options: [
              { value: 'promotor', label: 'Promotor de Justiça' },
              { value: 'procurador', label: 'Procurador' },
              { value: 'advogado', label: 'Advogado' },
              { value: 'juiz', label: 'Juiz' },
              { value: 'defensor', label: 'Defensor Público' },
              { value: 'assessor', label: 'Assessor Jurídico' },
            ]},
            { key: 'institution', label: 'Instituição', type: 'text', placeholder: 'Ex: MPRS, TJ/RS, OAB/RS' },
          ],
        },
        {
          step: 2,
          title: 'Áreas de Atuação',
          description: 'Selecione suas áreas de atuação principal',
          fields: [
            { key: 'legal_areas', label: 'Áreas do Direito', type: 'multiselect', options: [
              { value: 'administrative', label: 'Direito Administrativo' },
              { value: 'constitutional', label: 'Direito Constitucional' },
              { value: 'civil', label: 'Direito Civil' },
              { value: 'tax', label: 'Direito Tributário' },
              { value: 'labor', label: 'Direito do Trabalho' },
            ]},
            { key: 'experience_years', label: 'Anos de experiência', type: 'number', placeholder: 'Ex: 10' },
          ],
        },
        {
          step: 3,
          title: 'Preferências de Redação',
          description: 'Como você prefere que os documentos sejam redigidos',
          fields: [
            { key: 'writing_style', label: 'Estilo de redação', type: 'select', options: [
              { value: 'formal', label: 'Formal e técnico' },
              { value: 'moderate', label: 'Moderado (padrão)' },
              { value: 'accessible', label: 'Acessível e didático' },
            ]},
            { key: 'citation_style', label: 'Estilo de citação', type: 'select', options: [
              { value: 'abnt', label: 'ABNT' },
              { value: 'inline', label: 'Citação no texto' },
            ]},
            { key: 'include_jurisprudence', label: 'Incluir jurisprudência automaticamente', type: 'boolean', default: true },
          ],
        },
        {
          step: 4,
          title: 'Instruções Adicionais',
          description: 'Orientações específicas para o sistema de IA',
          fields: [
            { key: 'custom_instructions', label: 'Instruções personalizadas', type: 'textarea', placeholder: 'Ex: Sempre citar a Lei 14.133/21 em pareceres de licitação. Preferir jurisprudência do STJ.' },
            { key: 'signature_line', label: 'Linha de assinatura', type: 'text', placeholder: 'Ex: Dr. João Silva — Promotor de Justiça — MPRS' },
          ],
        },
      ],
      profile: null,
    }
  }

  // Anamnesis — request-fields per document type
  if (url.match(/\/anamnesis\/request-fields\/[^/]+$/)) {
    const typeId = url.split('/').pop()
    const fieldsByType: Record<string, any[]> = {
      parecer: [
        { key: 'consulente', label: 'Consulente', type: 'text', placeholder: 'Quem solicita o parecer' },
        { key: 'fatos', label: 'Fatos relevantes', type: 'textarea', placeholder: 'Descreva os fatos' },
        { key: 'questao_juridica', label: 'Questão jurídica', type: 'textarea', placeholder: 'Qual a questão a ser analisada' },
        { key: 'documentos_referencia', label: 'Documentos de referência', type: 'textarea', placeholder: 'Leis, contratos, processos...' },
        { key: 'resultado_desejado', label: 'Resultado desejado', type: 'textarea', placeholder: 'Qual conclusão espera' },
      ],
      peticao_inicial: [
        { key: 'autor', label: 'Autor', type: 'text', placeholder: 'Nome do autor' },
        { key: 'reu', label: 'Réu', type: 'text', placeholder: 'Nome do réu' },
        { key: 'fatos', label: 'Fatos', type: 'textarea', placeholder: 'Narrativa dos fatos' },
        { key: 'pedidos', label: 'Pedidos', type: 'textarea', placeholder: 'O que se pede ao juízo' },
        { key: 'valor_causa', label: 'Valor da causa', type: 'text', placeholder: 'R$ 0,00' },
        { key: 'tutela_urgencia', label: 'Tutela de urgência', type: 'boolean', default: false },
        { key: 'rito', label: 'Rito', type: 'select', options: [
          { value: 'ordinario', label: 'Ordinário' },
          { value: 'sumario', label: 'Sumário' },
          { value: 'especial', label: 'Especial' },
          { value: 'sumarissimo', label: 'Sumaríssimo (JEC)' },
        ]},
      ],
      contestacao: [
        { key: 'processo_numero', label: 'Número do processo', type: 'text', placeholder: '0000000-00.0000.0.00.0000' },
        { key: 'sintese_inicial', label: 'Síntese da petição inicial', type: 'textarea', placeholder: 'Resuma os principais pontos da inicial' },
        { key: 'fatos_defesa', label: 'Fatos para defesa', type: 'textarea', placeholder: 'Fatos que contrariam a inicial' },
        { key: 'preliminares', label: 'Preliminares', type: 'textarea', placeholder: 'Prescrição, decadência, ilegitimidade...' },
        { key: 'provas', label: 'Provas a produzir', type: 'textarea', placeholder: 'Documental, testemunhal, pericial...' },
      ],
      recurso: [
        { key: 'processo_numero', label: 'Número do processo', type: 'text', placeholder: '0000000-00.0000.0.00.0000' },
        { key: 'decisao_recorrida', label: 'Decisão recorrida', type: 'textarea', placeholder: 'Resuma a decisão que se pretende reformar' },
        { key: 'tipo_recurso', label: 'Tipo de recurso', type: 'select', options: [
          { value: 'apelacao', label: 'Apelação' },
          { value: 'agravo_instrumento', label: 'Agravo de instrumento' },
          { value: 'embargos_declaracao', label: 'Embargos de declaração' },
          { value: 'recurso_especial', label: 'Recurso especial' },
          { value: 'recurso_extraordinario', label: 'Recurso extraordinário' },
        ]},
        { key: 'erros_apontados', label: 'Erros apontados', type: 'textarea', placeholder: 'Quais erros da decisão recorrida' },
        { key: 'resultado_pretendido', label: 'Resultado pretendido', type: 'textarea', placeholder: 'O que se espera do tribunal' },
      ],
      sentenca: [
        { key: 'processo_numero', label: 'Número do processo', type: 'text', placeholder: '0000000-00.0000.0.00.0000' },
        { key: 'partes', label: 'Partes', type: 'textarea', placeholder: 'Autor vs. Réu' },
        { key: 'sintese_caso', label: 'Síntese do caso', type: 'textarea', placeholder: 'Resuma os fatos e pedidos' },
        { key: 'tipo_sentenca', label: 'Tipo de sentença', type: 'select', options: [
          { value: 'procedente', label: 'Procedente' },
          { value: 'improcedente', label: 'Improcedente' },
          { value: 'parcialmente_procedente', label: 'Parcialmente procedente' },
          { value: 'extincao', label: 'Extinção sem mérito' },
        ]},
      ],
      acao_civil_publica: [
        { key: 'legitimado', label: 'Legitimado ativo', type: 'text', placeholder: 'MP, Defensoria, etc.' },
        { key: 'reu', label: 'Réu', type: 'text', placeholder: 'Pessoa/órgão demandado' },
        { key: 'fatos', label: 'Fatos', type: 'textarea', placeholder: 'Narrativa dos fatos' },
        { key: 'interesse_tutelado', label: 'Interesse tutelado', type: 'select', options: [
          { value: 'difuso', label: 'Difuso' },
          { value: 'coletivo', label: 'Coletivo' },
          { value: 'individual_homogeneo', label: 'Individual homogêneo' },
        ]},
        { key: 'inquerito_civil', label: 'Inquérito civil vinculado', type: 'text', placeholder: 'Número do IC (se houver)' },
        { key: 'tutela_urgencia', label: 'Tutela de urgência', type: 'boolean', default: false },
        { key: 'pedidos', label: 'Pedidos', type: 'textarea', placeholder: 'O que se pede ao juízo' },
      ],
    }
    return { fields: fieldsByType[typeId || ''] || [] }
  }

  // Anamnesis — profile
  if (url.includes('/anamnesis/profile') && method === 'patch') return { ok: true }
  if (url.includes('/anamnesis/profile')) return { onboarding_completed: true }
  if (url.includes('/anamnesis')) return { onboarding_completed: true }

  // Fallback
  return { status: 'demo', message: 'Modo demonstração — dados simulados' }
}
