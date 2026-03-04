/**
 * Lexio — Mock data for GitHub Pages demo mode.
 * Used when no backend is available (static deployment).
 */

export const DEMO_MODE = !window.location.hostname.includes('localhost')
  && !window.location.hostname.includes('127.0.0.1')

export const DEMO_USER = {
  access_token: 'demo-token-lexio-2026',
  user_id: 'demo-user-001',
  role: 'admin',
  full_name: 'Dr. João Silva',
  email: 'joao@lexio.app',
  title: 'Promotor de Justiça',
}

export const DEMO_STATS = {
  total_documents: 47,
  completed_documents: 42,
  processing_documents: 5,
  average_quality_score: 88.3,
  total_cost_usd: 12.4521,
}

export const DEMO_DOCUMENT_TYPES = [
  { id: 'parecer', name: 'Parecer Jurídico', description: 'Opinião técnica sobre questão jurídica', category: 'mp', templates: ['mprs_caopp', 'generic'], is_enabled: true },
  { id: 'peticao_inicial', name: 'Petição Inicial', description: 'Petição inicial para ação judicial', category: 'advocacy', templates: ['generic'], is_enabled: true },
  { id: 'contestacao', name: 'Contestação', description: 'Peça de defesa em processo judicial', category: 'advocacy', templates: ['generic'], is_enabled: true },
  { id: 'recurso', name: 'Recurso', description: 'Recurso (apelação, agravo, etc.)', category: 'advocacy', templates: ['generic'], is_enabled: true },
  { id: 'sentenca', name: 'Sentença', description: 'Decisão judicial', category: 'judiciary', templates: ['generic'], is_enabled: false },
]

export const DEMO_LEGAL_AREAS = [
  { id: 'administrative', name: 'Direito Administrativo', description: 'Licitações, improbidade, servidores', specializations: ['licitacoes', 'improbidade', 'servidores'], is_enabled: true },
  { id: 'constitutional', name: 'Direito Constitucional', description: 'Controle de constitucionalidade, direitos fundamentais', specializations: ['controle', 'direitos_fundamentais'], is_enabled: true },
  { id: 'civil', name: 'Direito Civil', description: 'Obrigações, contratos, responsabilidade civil', specializations: ['obrigacoes', 'contratos', 'responsabilidade'], is_enabled: true },
  { id: 'tax', name: 'Direito Tributário', description: 'ICMS, IR, execução fiscal', specializations: ['icms', 'ir', 'execucao_fiscal'], is_enabled: true },
  { id: 'labor', name: 'Direito do Trabalho', description: 'Individual, coletivo, terceirização', specializations: ['individual', 'coletivo', 'terceirizacao'], is_enabled: true },
]

const now = new Date().toISOString()
const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
const yesterday = new Date(Date.now() - 86400000).toISOString()
const twoDaysAgo = new Date(Date.now() - 172800000).toISOString()
const threeDaysAgo = new Date(Date.now() - 259200000).toISOString()

export const DEMO_DOCUMENTS = [
  {
    id: 'demo-doc-001',
    document_type_id: 'parecer',
    legal_area_ids: ['administrative'],
    template_variant: 'mprs_caopp',
    original_request: 'Análise sobre a legalidade de contratação direta por dispensa de licitação para aquisição de equipamentos médicos em situação de emergência sanitária municipal.',
    tema: 'Dispensa de licitação em emergência sanitária',
    status: 'concluido',
    quality_score: 92,
    docx_path: '/output/parecer_demo-doc-001.docx',
    created_at: oneHourAgo,
    origem: 'web',
  },
  {
    id: 'demo-doc-002',
    document_type_id: 'parecer',
    legal_area_ids: ['administrative'],
    template_variant: 'generic',
    original_request: 'Consulta sobre a possibilidade de nepotismo cruzado entre Poderes Executivo e Legislativo no âmbito municipal.',
    tema: 'Nepotismo cruzado entre poderes municipais',
    status: 'concluido',
    quality_score: 88,
    docx_path: '/output/parecer_demo-doc-002.docx',
    created_at: yesterday,
    origem: 'web',
  },
  {
    id: 'demo-doc-003',
    document_type_id: 'parecer',
    legal_area_ids: ['constitutional', 'administrative'],
    template_variant: 'generic',
    original_request: 'Análise da constitucionalidade de lei municipal que estabelece regime especial de contratação de servidores temporários.',
    tema: 'Constitucionalidade de contratação temporária municipal',
    status: 'concluido',
    quality_score: 85,
    docx_path: null,
    created_at: twoDaysAgo,
    origem: 'web',
  },
  {
    id: 'demo-doc-004',
    document_type_id: 'parecer',
    legal_area_ids: ['administrative'],
    template_variant: 'mprs_caopp',
    original_request: 'Verificação de irregularidades em processo licitatório para concessão de serviço público de transporte coletivo.',
    tema: 'Irregularidades em licitação de transporte coletivo',
    status: 'processando',
    quality_score: null,
    docx_path: null,
    created_at: now,
    origem: 'web',
  },
  {
    id: 'demo-doc-005',
    document_type_id: 'peticao_inicial',
    legal_area_ids: ['civil'],
    template_variant: 'generic',
    original_request: 'Petição inicial para ação de indenização por danos morais e materiais decorrentes de falha na prestação de serviço público.',
    tema: 'Indenização por falha em serviço público',
    status: 'concluido',
    quality_score: 90,
    docx_path: '/output/peticao_demo-doc-005.docx',
    created_at: threeDaysAgo,
    origem: 'web',
  },
]

export const DEMO_MODULES = [
  { id: 'parecer', name: 'Parecer Jurídico', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Geração de pareceres jurídicos com pipeline de 10 agentes IA' },
  { id: 'peticao_inicial', name: 'Petição Inicial', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Petição inicial para ação judicial' },
  { id: 'contestacao', name: 'Contestação', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Peça de defesa em processo judicial' },
  { id: 'recurso', name: 'Recurso', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Recurso (apelação, agravo, etc.)' },
  { id: 'sentenca', name: 'Sentença', type: 'document_type', version: '1.0.0', is_enabled: false, is_healthy: true, error: null, description: 'Decisão judicial' },
  { id: 'administrative', name: 'Direito Administrativo', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Licitações, improbidade, servidores' },
  { id: 'constitutional', name: 'Direito Constitucional', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Controle de constitucionalidade' },
  { id: 'civil', name: 'Direito Civil', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Obrigações, contratos, responsabilidade' },
  { id: 'tax', name: 'Direito Tributário', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'ICMS, IR, execução fiscal' },
  { id: 'labor', name: 'Direito do Trabalho', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Individual, coletivo, terceirização' },
]

// Simulated pipeline progress
export function simulatePipelineProgress(callback: (data: any) => void): () => void {
  const phases = [
    { phase: 'pesquisa', message: 'Pesquisando acervo e jurisprudência...', progress: 5 },
    { phase: 'triagem', message: 'Executando triagem...', progress: 15 },
    { phase: 'moderador_agenda', message: 'Definindo tópicos de debate...', progress: 25 },
    { phase: 'jurista', message: 'Desenvolvendo teses jurídicas...', progress: 35 },
    { phase: 'advogado_diabo', message: 'Advogado do Diabo analisando...', progress: 45 },
    { phase: 'jurista_v2', message: 'Refinando teses...', progress: 55 },
    { phase: 'fact_checker', message: 'Verificando fatos e citações...', progress: 65 },
    { phase: 'moderador_plano', message: 'Montando plano de redação...', progress: 72 },
    { phase: 'redator', message: 'Redigindo documento completo...', progress: 82 },
    { phase: 'revisor', message: 'Revisão final (14 pontos)...', progress: 90 },
    { phase: 'qualidade', message: 'Avaliando qualidade...', progress: 95 },
    { phase: 'docx', message: 'Gerando DOCX...', progress: 98 },
    { phase: 'concluido', message: 'Documento concluído!', progress: 100 },
  ]

  let i = 0
  const interval = setInterval(() => {
    if (i < phases.length) {
      callback(phases[i])
      i++
    } else {
      clearInterval(interval)
    }
  }, 2000)

  return () => clearInterval(interval)
}
