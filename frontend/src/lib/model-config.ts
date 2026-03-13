/**
 * Agent model configuration — defines which LLM model each pipeline agent uses.
 *
 * Persistence:
 *   Firebase mode → Firestore /settings/platform.agent_models
 *   Backend mode  → not yet wired (uses defaults)
 *
 * The generation-service reads these at generation time so admin changes
 * take effect immediately without redeployment.
 */

import { IS_FIREBASE } from './firebase'
import { getSettings, saveSettings } from './firestore-service'

// ── Available OpenRouter models (curated) ─────────────────────────────────────

export interface ModelOption {
  id: string
  label: string
  provider: string
  tier: 'fast' | 'balanced' | 'premium'
  description: string
}

export const AVAILABLE_MODELS: ModelOption[] = [
  // Anthropic
  { id: 'anthropic/claude-3.5-haiku',   label: 'Claude 3.5 Haiku',    provider: 'Anthropic', tier: 'fast',     description: 'Rápido e econômico — ideal para triagem e verificação' },
  { id: 'anthropic/claude-sonnet-4',     label: 'Claude Sonnet 4',     provider: 'Anthropic', tier: 'balanced', description: 'Equilibrado — excelente para raciocínio jurídico' },
  { id: 'anthropic/claude-3.5-sonnet',   label: 'Claude 3.5 Sonnet',   provider: 'Anthropic', tier: 'balanced', description: 'Versão anterior do Sonnet — boa relação custo-benefício' },
  // Google
  { id: 'google/gemini-2.0-flash-001',   label: 'Gemini 2.0 Flash',    provider: 'Google',    tier: 'fast',     description: 'Rápido e econômico — boa alternativa para tarefas simples' },
  { id: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro',      provider: 'Google',    tier: 'premium',  description: 'Premium — raciocínio avançado do Google' },
  // OpenAI
  { id: 'openai/gpt-4o',                label: 'GPT-4o',               provider: 'OpenAI',    tier: 'balanced', description: 'Modelo multimodal equilibrado da OpenAI' },
  { id: 'openai/gpt-4o-mini',           label: 'GPT-4o Mini',          provider: 'OpenAI',    tier: 'fast',     description: 'Versão leve e econômica do GPT-4o' },
  { id: 'openai/gpt-4.1',               label: 'GPT-4.1',              provider: 'OpenAI',    tier: 'premium',  description: 'Modelo mais recente e avançado da OpenAI' },
  // DeepSeek
  { id: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3',        provider: 'DeepSeek',  tier: 'balanced', description: 'Modelo de alto desempenho com custo reduzido' },
  // Meta
  { id: 'meta-llama/llama-4-maverick',  label: 'Llama 4 Maverick',    provider: 'Meta',      tier: 'balanced', description: 'Modelo open-source avançado da Meta' },
]

// ── Pipeline agent definitions ────────────────────────────────────────────────

export interface AgentModelDef {
  /** Agent key (matches generation-service phases) */
  key: string
  /** Display label */
  label: string
  /** Short description of what this agent does */
  description: string
  /** Default model ID */
  defaultModel: string
  /** Recommended tier for this agent */
  recommendedTier: 'fast' | 'balanced' | 'premium'
  /** Agent icon key (matches PipelineProgressPanel) */
  icon: string
}

export const PIPELINE_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'triagem',
    label: 'Triagem',
    description: 'Extrai tema, subtemas e palavras-chave da solicitação',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'search',
  },
  {
    key: 'pesquisador',
    label: 'Pesquisador',
    description: 'Pesquisa legislação, jurisprudência e doutrina aplicáveis',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'book-open',
  },
  {
    key: 'jurista',
    label: 'Jurista',
    description: 'Desenvolve teses jurídicas robustas e fundamentadas',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'scale',
  },
  {
    key: 'advogado_diabo',
    label: 'Advogado do Diabo',
    description: 'Critica e identifica fraquezas nos argumentos',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'shield',
  },
  {
    key: 'jurista_v2',
    label: 'Jurista (revisão)',
    description: 'Refina teses incorporando as críticas válidas',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'refresh-cw',
  },
  {
    key: 'fact_checker',
    label: 'Fact-Checker',
    description: 'Verifica citações legais e corrige imprecisões',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'clipboard-check',
  },
  {
    key: 'moderador',
    label: 'Moderador',
    description: 'Planeja a estrutura e organização do documento final',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'scale',
  },
  {
    key: 'redator',
    label: 'Redator',
    description: 'Redige o documento completo seguindo o plano definido',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'file-text',
  },
]

// ── Types ─────────────────────────────────────────────────────────────────────

/** Map from agent key → model ID */
export type AgentModelMap = Record<string, string>

// ── Load / Save ───────────────────────────────────────────────────────────────

/** Build the default model map from PIPELINE_AGENT_DEFS. */
export function getDefaultModelMap(): AgentModelMap {
  const map: AgentModelMap = {}
  for (const def of PIPELINE_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load the current agent model configuration.
 * Returns the saved overrides merged with defaults (so every agent always has a model).
 */
export async function loadAgentModels(): Promise<AgentModelMap> {
  const defaults = getDefaultModelMap()

  if (!IS_FIREBASE) return defaults

  try {
    const settings = await getSettings()
    const saved = (settings.agent_models ?? {}) as Record<string, string>
    // Merge saved over defaults, but only for known agents
    for (const def of PIPELINE_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string') {
        defaults[def.key] = saved[def.key]
      }
    }
  } catch {
    // On error, just return defaults silently
  }

  return defaults
}

/**
 * Save agent model configuration to Firestore.
 * Only saves entries that differ from defaults (to keep stored data minimal).
 */
export async function saveAgentModels(models: AgentModelMap): Promise<void> {
  if (!IS_FIREBASE) return

  const defaults = getDefaultModelMap()
  const overrides: AgentModelMap = {}

  for (const def of PIPELINE_AGENT_DEFS) {
    const model = models[def.key]
    if (model && model !== defaults[def.key]) {
      overrides[def.key] = model
    }
  }

  await saveSettings({ agent_models: overrides })
}

/**
 * Reset all agent models to defaults by clearing the stored overrides.
 */
export async function resetAgentModels(): Promise<void> {
  if (!IS_FIREBASE) return
  await saveSettings({ agent_models: {} })
}
