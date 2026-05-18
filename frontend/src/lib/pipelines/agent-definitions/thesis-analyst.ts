import type { AgentModelDef } from '../../model-config'

// ── Thesis Analyst Agent Definitions ─────────────────────────────────────────

/**
 * Thesis analysis pipeline for the manual "Analisar Teses" feature.
 *
 * Execution topology:
 *  Local inventory → Analista → Compilador
 *  Curador de Lacunas in parallel when runtime limits allow
 *  Final: Revisor, after both tracks finish
 */
export const THESIS_ANALYST_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'thesis_pipeline_orchestrator',
    label: 'Orquestrador do Pipeline',
    description: 'Controla retries, retomadas, paralelismo e continuidade operacional da análise de teses',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'activity',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
  },
  {
    key: 'thesis_analista',
    label: 'Analista de Redundâncias',
    description: 'Analisa profundamente os grupos similares detectados localmente, identificando duplicatas, complementares e contradições',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'scale',
    agentCategory: 'reasoning',
  },
  {
    key: 'thesis_compilador',
    label: 'Compilador',
    description: 'Redige a versão compilada de cada grupo a mesclar, preservando todos os argumentos únicos',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'refresh-cw',
    agentCategory: 'synthesis',
  },
  {
    key: 'thesis_curador',
    label: 'Curador de Lacunas',
    description: 'Extrai novas teses de documentos ainda não analisados em trilha paralela ao inventário do banco',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'book-open',
    agentCategory: 'synthesis',
  },
  {
    key: 'thesis_revisor',
    label: 'Revisor Final',
    description: 'Revisa, prioriza e anota todas as sugestões produzidas pelos agentes anteriores',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
  },
]
