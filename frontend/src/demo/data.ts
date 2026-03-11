/**
 * Demo mock data — returned by the demo interceptor when VITE_DEMO_MODE=true
 * and the real backend is unavailable (e.g. GitHub Pages / Firebase Hosting).
 */

// ── Stats ─────────────────────────────────────────────────────────────────────

export const DEMO_STATS = {
  total_documents: 42,
  completed_documents: 35,
  processing_documents: 2,
  pending_review_documents: 5,
  average_quality_score: 82,
  total_cost_usd: 0.4732,
  average_duration_ms: 12400,
}

export const DEMO_STATS_DAILY = Array.from({ length: 30 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - (29 - i))
  const total = Math.floor(Math.random() * 4) + 1
  return {
    dia: d.toISOString().slice(0, 10),
    total,
    concluidos: Math.max(0, total - Math.floor(Math.random() * 2)),
    custo: +(Math.random() * 0.025).toFixed(5),
  }
})

export const DEMO_STATS_AGENTS = [
  { agent_name: 'Pesquisador', chamadas: 38, custo_total: 0.082, tempo_medio_ms: 3200 },
  { agent_name: 'Redator', chamadas: 35, custo_total: 0.195, tempo_medio_ms: 8500 },
  { agent_name: 'Revisor', chamadas: 35, custo_total: 0.112, tempo_medio_ms: 4100 },
  { agent_name: 'Formatador', chamadas: 35, custo_total: 0.054, tempo_medio_ms: 1800 },
]

export const DEMO_STATS_RECENT = [
  { id: 'demo-1', document_type_id: 'parecer', tema: 'Responsabilidade civil por danos ambientais', status: 'concluido', quality_score: 91, created_at: new Date(Date.now() - 3600_000).toISOString() },
  { id: 'demo-2', document_type_id: 'peticao_inicial', tema: 'Ação de indenização por erro médico', status: 'em_revisao', quality_score: 78, created_at: new Date(Date.now() - 7200_000).toISOString() },
  { id: 'demo-3', document_type_id: 'contestacao', tema: 'Defesa em ação trabalhista', status: 'concluido', quality_score: 85, created_at: new Date(Date.now() - 14400_000).toISOString() },
  { id: 'demo-4', document_type_id: 'recurso', tema: 'Apelação cível — cláusula abusiva', status: 'processando', quality_score: null, created_at: new Date(Date.now() - 21600_000).toISOString() },
  { id: 'demo-5', document_type_id: 'parecer', tema: 'Análise de contrato de locação comercial', status: 'concluido', quality_score: 88, created_at: new Date(Date.now() - 86400_000).toISOString() },
]

export const DEMO_STATS_BY_TYPE = [
  { document_type_id: 'parecer', total: 15, avg_score: 86 },
  { document_type_id: 'peticao_inicial', total: 12, avg_score: 79 },
  { document_type_id: 'contestacao', total: 8, avg_score: 83 },
  { document_type_id: 'recurso', total: 5, avg_score: 77 },
  { document_type_id: 'sentenca', total: 2, avg_score: 90 },
]

// ── Documents ─────────────────────────────────────────────────────────────────

export const DEMO_DOCUMENTS = DEMO_STATS_RECENT.map(d => ({
  ...d,
  original_request: 'Pedido de exemplo para demonstração',
  content: '<p>Conteúdo de exemplo gerado automaticamente para fins de demonstração.</p>',
  origem: 'manual',
  legal_area_ids: ['civil'],
}))

// ── Document Types ────────────────────────────────────────────────────────────

export const DEMO_DOCUMENT_TYPES = [
  { id: 'parecer', name: 'Parecer Jurídico', description: 'Análise técnica sobre questão jurídica', template_variants: ['padrão'], is_enabled: true },
  { id: 'peticao_inicial', name: 'Petição Inicial', description: 'Petição para iniciar processo judicial', template_variants: ['cível', 'trabalhista'], is_enabled: true },
  { id: 'contestacao', name: 'Contestação', description: 'Peça de defesa do réu', template_variants: ['padrão'], is_enabled: true },
  { id: 'recurso', name: 'Recurso', description: 'Peça recursal para tribunais superiores', template_variants: ['apelação', 'agravo'], is_enabled: true },
  { id: 'sentenca', name: 'Sentença', description: 'Decisão judicial fundamentada', template_variants: ['padrão'], is_enabled: true },
]

// ── Legal Areas ───────────────────────────────────────────────────────────────

export const DEMO_LEGAL_AREAS = [
  { id: 'civil', name: 'Direito Civil', description: 'Relações privadas e contratos' },
  { id: 'trabalho', name: 'Direito do Trabalho', description: 'Relações trabalhistas e previdenciárias' },
  { id: 'penal', name: 'Direito Penal', description: 'Crimes e infrações penais' },
  { id: 'tributario', name: 'Direito Tributário', description: 'Impostos e obrigações fiscais' },
  { id: 'ambiental', name: 'Direito Ambiental', description: 'Proteção do meio ambiente' },
]

// ── Health ─────────────────────────────────────────────────────────────────────

export const DEMO_HEALTH = {
  status: 'ok',
  app: 'Lexio',
  version: '1.0.0-demo',
  services: { postgres: 'demo', qdrant: 'demo', ollama: 'demo' },
  modules: { total: 5, healthy: 5 },
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export const DEMO_MODULES = [
  { id: 'parecer', name: 'Parecer Jurídico', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Gerador de pareceres jurídicos' },
  { id: 'peticao_inicial', name: 'Petição Inicial', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Gerador de petições iniciais' },
  { id: 'contestacao', name: 'Contestação', type: 'document_type', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Gerador de contestações' },
  { id: 'civil', name: 'Direito Civil', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Área de direito civil' },
  { id: 'trabalho', name: 'Direito do Trabalho', type: 'legal_area', version: '1.0.0', is_enabled: true, is_healthy: true, error: null, description: 'Área de direito do trabalho' },
]

export const DEMO_ADMIN_SETTINGS = {
  settings: [
    { key: 'OPENROUTER_API_KEY', label: 'OpenRouter API Key', description: 'Chave de acesso ao OpenRouter', placeholder: 'sk-or-...', link: 'https://openrouter.ai', guide: ['Crie uma conta no OpenRouter', 'Gere uma API key'], is_auto: false, is_set: true, masked_value: 'sk-or-****1234', source: 'env' },
    { key: 'OLLAMA_BASE_URL', label: 'Ollama Base URL', description: 'URL do servidor Ollama para embeddings', placeholder: 'http://ollama:11434', link: 'https://ollama.ai', guide: ['Instale o Ollama', 'Execute ollama serve'], is_auto: true, is_set: true, masked_value: 'http://ollama:11434', source: 'env' },
  ],
}

export const DEMO_USERS = [
  { id: 'demo-user-1', email: 'admin@lexio.app', full_name: 'Admin Demo', role: 'admin', is_active: true, created_at: '2025-01-01T00:00:00Z' },
  { id: 'demo-user-2', email: 'user@lexio.app', full_name: 'Usuário Demo', role: 'user', is_active: true, created_at: '2025-01-15T00:00:00Z' },
]

export const DEMO_PIPELINE_LOGS = [
  { id: 'log-1', document_id: 'demo-1', document_type_id: 'parecer', status: 'concluido', started_at: new Date(Date.now() - 3600_000).toISOString(), finished_at: new Date(Date.now() - 3588_000).toISOString(), duration_ms: 12000, agents_used: ['Pesquisador', 'Redator', 'Revisor'] },
  { id: 'log-2', document_id: 'demo-2', document_type_id: 'peticao_inicial', status: 'em_revisao', started_at: new Date(Date.now() - 7200_000).toISOString(), finished_at: new Date(Date.now() - 7188_000).toISOString(), duration_ms: 12500, agents_used: ['Pesquisador', 'Redator', 'Revisor'] },
]

// ── Theses ─────────────────────────────────────────────────────────────────────

export const DEMO_THESES = [
  { id: 'thesis-1', title: 'Responsabilidade objetiva do Estado', content: 'O Estado responde objetivamente pelos danos causados por seus agentes.', area: 'civil', tags: ['responsabilidade', 'estado'], created_at: '2025-06-01T00:00:00Z' },
  { id: 'thesis-2', title: 'Princípio da dignidade da pessoa humana', content: 'Fundamento da República Federativa do Brasil, conforme art. 1º, III, CF.', area: 'constitucional', tags: ['princípio', 'dignidade'], created_at: '2025-06-10T00:00:00Z' },
  { id: 'thesis-3', title: 'Inversão do ônus da prova no CDC', content: 'Art. 6º, VIII, do CDC permite inversão quando verossímil a alegação.', area: 'consumidor', tags: ['prova', 'consumidor'], created_at: '2025-07-01T00:00:00Z' },
]

export const DEMO_THESES_STATS = {
  total: 3,
  by_area: { civil: 1, constitucional: 1, consumidor: 1 },
}

// ── Uploads ───────────────────────────────────────────────────────────────────

export const DEMO_UPLOADS = {
  items: [
    { id: 'upload-1', filename: 'contrato_locacao.docx', size: 45_000, status: 'processed', created_at: new Date(Date.now() - 86400_000).toISOString() },
    { id: 'upload-2', filename: 'procuracao.pdf', size: 120_000, status: 'processed', created_at: new Date(Date.now() - 172800_000).toISOString() },
  ],
}

// ── Anamnesis ──────────────────────────────────────────────────────────────────

export const DEMO_ANAMNESIS_PROFILE = {
  area_atuacao: 'civil',
  experiencia: 'senior',
  preferencias: {},
}

export const DEMO_ANAMNESIS_WIZARD = {
  onboarding_steps: [],
  profile: DEMO_ANAMNESIS_PROFILE,
  onboarding_completed: true,
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const DEMO_AUTH_RESPONSE = {
  access_token: 'demo-token-lexio',
  user_id: 'demo-user-1',
  role: 'admin',
  full_name: 'Usuário Demo',
}
