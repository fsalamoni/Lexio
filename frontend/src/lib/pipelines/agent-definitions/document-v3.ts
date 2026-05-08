import type { AgentModelDef } from '../../model-config'

// ── Document v3 Pipeline Agent Definitions ───────────────────────────────────

/**
 * Document v3 pipeline — multi-phase orchestrated multi-agent generation.
 *
 * Phases: Compreensão → Análise → Pesquisa → Redação. Within each phase,
 * agents marked with `parallel` in `DOCUMENT_V3_PIPELINE_STAGES` may run
 * concurrently. The supervisor (orchestrator) controls retries, fallbacks
 * and quality gates without burning extra LLM calls when avoidable.
 *
 * The v3 pipeline persists results in the same `users/{uid}/documents/{docId}`
 * collection used by the v2 pipeline so all existing list/detail/editor
 * surfaces continue to work without any change.
 */
export const DOCUMENT_V3_PIPELINE_AGENT_DEFS: AgentModelDef[] = [
  // Fase 1 — Compreensão
  {
    key: 'v3_intent_classifier',
    label: 'Classificador de Intenção',
    description: 'Identifica tipo de demanda, urgência e complexidade',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
    requiredCapability: 'text',
  },
  {
    key: 'v3_request_parser',
    label: 'Parser da Solicitação',
    description: 'Extrai fatos, partes, pedidos, prazos e jurisdição',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'clipboard-check',
    agentCategory: 'extraction',
    requiredCapability: 'text',
  },
  {
    key: 'v3_legal_issue_spotter',
    label: 'Identificador de Questões Jurídicas',
    description: 'Mapeia todas as questões jurídicas implicadas no caso',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'scale',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'v3_prompt_architect',
    label: 'Arquiteto de Prompts',
    description: 'Consolida a compreensão e gera os briefings das fases seguintes',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'layers',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
  },
  // Fase 2 — Análise
  {
    key: 'v3_acervo_retriever',
    label: 'Buscador de Acervo',
    description: 'Recupera documentos similares no acervo do usuário',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'library',
    agentCategory: 'extraction',
    requiredCapability: 'text',
  },
  {
    key: 'v3_thesis_retriever',
    label: 'Buscador de Teses',
    description: 'Recupera teses pertinentes do banco de teses do usuário',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'library',
    agentCategory: 'extraction',
    requiredCapability: 'text',
  },
  {
    key: 'v3_thesis_builder',
    label: 'Construtor de Teses',
    description: 'Desenvolve argumentação robusta para cada questão jurídica',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'scale',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'v3_devil_advocate',
    label: 'Advogado do Diabo',
    description: 'Critica as teses e identifica fraquezas argumentativas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'shield',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'v3_thesis_refiner',
    label: 'Refinador de Teses',
    description: 'Incorpora as críticas válidas e fortalece os argumentos',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'refresh-cw',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  // Fase 3 — Pesquisa
  {
    key: 'v3_legislation_researcher',
    label: 'Pesquisador de Legislação',
    description: 'Identifica legislação aplicável e atualizada',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'book-open',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'v3_jurisprudence_researcher',
    label: 'Pesquisador de Jurisprudência',
    description: 'Busca jurisprudência STF, STJ e tribunais aplicáveis',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'book-open',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'v3_doctrine_researcher',
    label: 'Pesquisador de Doutrina',
    description: 'Localiza doutrina pertinente e atualizada',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'book-open',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'v3_citation_verifier',
    label: 'Verificador de Citações',
    description: 'Verifica artigos, súmulas e julgados; corrige imprecisões',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'clipboard-check',
    agentCategory: 'extraction',
    requiredCapability: 'text',
  },
  // Fase 4 — Redação
  {
    key: 'v3_outline_planner',
    label: 'Planejador da Estrutura',
    description: 'Planeja a arquitetura e organização do documento final',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'layers',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
  },
  {
    key: 'v3_writer',
    label: 'Redator',
    description: 'Redige o documento completo seguindo o plano definido',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
    requiredCapability: 'text',
  },
  {
    key: 'v3_writer_reviser',
    label: 'Revisor de Redação',
    description: 'Revisa o documento quando o verificador de citações encontra referências não fundamentadas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'pen-tool',
    agentCategory: 'writing',
    requiredCapability: 'text',
  },
  // Transversal
  {
    key: 'v3_pipeline_orchestrator',
    label: 'Orquestrador do Pipeline',
    description: 'Controla retries, retomadas, escalonamentos e continuidade operacional do Novo Documento v3',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'activity',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'v3_supervisor',
    label: 'Supervisor (refazimento)',
    description: 'Modelo usado quando o supervisor escala um agente para refazer um trabalho',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'shield',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
]
