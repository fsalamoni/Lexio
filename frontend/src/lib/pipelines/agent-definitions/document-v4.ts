import type { AgentModelDef } from '../../model-config'

/**
 * Document v4 — single-agent + tools pipeline.
 *
 * Replaces the v3 multi-agent orchestration with one reasoning-tier agent that
 * uses tools in a loop. Runs in parallel to v3 behind FF_DOCUMENT_GENERATION_V4.
 * The primary agent internalizes the role hints that v3 split across 18 agents
 * (intent classification, request parsing, legal issue spotting, thesis
 * building, devil advocate, research, citation verification, outline, writing,
 * revision). The critic is the only secondary LLM in the pipeline and runs at
 * most once (evaluator-optimizer pattern) — when its verdict is below the
 * configured threshold, the primary agent gets one revision turn.
 */
export const DOCUMENT_V4_PIPELINE_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'v4_agent',
    label: 'Agente Principal v4',
    description: 'Único agente que conduz toda a geração do documento — internaliza compreensão, análise, pesquisa e redação, e chama ferramentas conforme necessário',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'pen-tool',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Modelo reasoning-tier (Opus/Sonnet 4/o3) — precisa raciocinar sobre tools e produzir documento jurídico longo',
  },
  {
    key: 'v4_critic',
    label: 'Crítico v4',
    description: 'Avalia o rascunho do agente principal e emite veredito (score 0-100). Se score < threshold (padrão 75), uma rodada de revisão é disparada',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'shield',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Modelo balanced — uma única chamada para revisão crítica',
  },
]
