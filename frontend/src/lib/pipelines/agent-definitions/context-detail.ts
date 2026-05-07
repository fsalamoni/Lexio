import type { AgentModelDef } from '../../model-config'

// ── Context Detail Agent Definition ──────────────────────────────────────────

/**
 * Single-agent definition for the optional "Detalhar contexto" feature.
 *
 * This agent analyses the user's request, document type and legal areas
 * to generate 3-10 targeted questions that help refine the document brief.
 */
export const CONTEXT_DETAIL_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'context_detail_orchestrator',
    label: 'Orquestrador do Detalhamento',
    description: 'Supervisiona retries, retomadas e continuidade operacional do detalhamento de contexto',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'activity',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'context_detail',
    label: 'Detalhamento de Contexto',
    description: 'Analisa a solicitação e gera perguntas para refinar o contexto do documento',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'search',
    agentCategory: 'reasoning',
  },
]
