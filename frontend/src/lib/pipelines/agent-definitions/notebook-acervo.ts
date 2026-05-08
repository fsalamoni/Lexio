import type { AgentModelDef } from '../../model-config'

// ── Notebook Acervo Analyzer Agent Definitions ───────────────────────────────

/**
 * Four-agent pipeline for the "Analisar Acervo" feature in Research Notebooks.
 *
 * Agent execution order:
 *  1. Triagem   — Extract keywords, areas and context from notebook topic
 *  2. Buscador  — Pre-filter + LLM ranking of acervo documents
 *  3. Analista  — Deep relevance analysis of selected docs
 *  4. Curador   — Final curation with summaries and recommendations
 */
export const NOTEBOOK_ACERVO_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'notebook_acervo_orchestrator',
    label: 'Orquestrador do Acervo do Caderno',
    description: 'Controla retries, retomadas e continuidade operacional da análise de acervo no caderno',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'activity',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'nb_acervo_triagem',
    label: 'Triagem de Acervo',
    description: 'Extrai palavras-chave, áreas e contexto do tema do caderno para busca no acervo',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'nb_acervo_buscador',
    label: 'Buscador de Acervo',
    description: 'Busca e classifica documentos do acervo por relevância ao tema do caderno',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'library',
    agentCategory: 'extraction',
  },
  {
    key: 'nb_acervo_analista',
    label: 'Analista de Acervo',
    description: 'Analisa em profundidade os documentos selecionados, avaliando relevância e conteúdo',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'scale',
    agentCategory: 'reasoning',
  },
  {
    key: 'nb_acervo_curador',
    label: 'Curador de Fontes',
    description: 'Faz curadoria final dos documentos e recomenda fontes para o caderno',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
  },
]
