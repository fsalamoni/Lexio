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

/**
 * Agent definitions for model configuration.
 * Keys here are agent names (matching generation-service model lookups).
 * Note: PipelineProgressPanel uses phase names (e.g. 'redacao') for progress tracking,
 * which is a separate system. Agent key 'redator' maps to progress phase 'redacao'.
 */
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
    key: 'acervo_buscador',
    label: 'Buscador de Acervo',
    description: 'Busca documentos similares no acervo do usuário para reutilização',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'library',
  },
  {
    key: 'acervo_compilador',
    label: 'Compilador de Base',
    description: 'Compila documentos do acervo em um documento base unificado',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'layers',
  },
  {
    key: 'acervo_revisor',
    label: 'Revisor de Base',
    description: 'Revisa o documento base compilado para coerência e completude',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'scan-search',
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

// ── Thesis Analyst Agent Definitions ─────────────────────────────────────────

/**
 * Five-agent pipeline for the manual "Analisar Teses" feature.
 *
 * Agent execution order:
 *  1. Catalogador    — inventory & similarity clustering
 *  2. Analista       — deep redundancy analysis per cluster
 *  3. Compilador     — draft merged thesis for each merge group
 *  4. Curador        — extract new theses from unanalyzed acervo docs
 *  5. Revisor        — rank, annotate and finalise all suggestions
 */
export const THESIS_ANALYST_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'thesis_catalogador',
    label: 'Catalogador',
    description: 'Faz inventário das teses existentes e agrupa candidatas a duplicatas ou compilação',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'search',
  },
  {
    key: 'thesis_analista',
    label: 'Analista de Redundâncias',
    description: 'Analisa profundamente cada grupo, identificando duplicatas, complementares e contradições',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'scale',
  },
  {
    key: 'thesis_compilador',
    label: 'Compilador',
    description: 'Redige a versão compilada de cada grupo a mesclar, preservando todos os argumentos únicos',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'refresh-cw',
  },
  {
    key: 'thesis_curador',
    label: 'Curador de Lacunas',
    description: 'Extrai novas teses de documentos ainda não analisados, focando em lacunas temáticas',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'book-open',
  },
  {
    key: 'thesis_revisor',
    label: 'Revisor Final',
    description: 'Revisa, prioriza e anota todas as sugestões produzidas pelos agentes anteriores',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
  },
]

/** Map from thesis-analyst agent key → model ID */
export type ThesisAnalystModelMap = Record<string, string>

/** Default model map for the thesis analyst pipeline. */
export function getDefaultThesisAnalystModelMap(): ThesisAnalystModelMap {
  const map: ThesisAnalystModelMap = {}
  for (const def of THESIS_ANALYST_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load thesis analyst model configuration.
 * Returns saved overrides merged with defaults.
 */
export async function loadThesisAnalystModels(): Promise<ThesisAnalystModelMap> {
  const defaults = getDefaultThesisAnalystModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const saved = (settings.thesis_analyst_models ?? {}) as Record<string, string>
    for (const def of THESIS_ANALYST_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string') {
        defaults[def.key] = saved[def.key]
      }
    }
  } catch {
    // Fall back to defaults silently
  }
  return defaults
}

/**
 * Save thesis analyst model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveThesisAnalystModels(models: ThesisAnalystModelMap): Promise<void> {
  if (!IS_FIREBASE) return
  const defaults = getDefaultThesisAnalystModelMap()
  const overrides: ThesisAnalystModelMap = {}
  for (const def of THESIS_ANALYST_AGENT_DEFS) {
    const model = models[def.key]
    if (model && model !== defaults[def.key]) {
      overrides[def.key] = model
    }
  }
  await saveSettings({ thesis_analyst_models: overrides })
}

/** Reset thesis analyst models to defaults. */
export async function resetThesisAnalystModels(): Promise<void> {
  if (!IS_FIREBASE) return
  await saveSettings({ thesis_analyst_models: {} })
}

// ── Context Detail Agent Definition ──────────────────────────────────────────

/**
 * Single-agent definition for the optional "Detalhar contexto" feature.
 *
 * This agent analyses the user's request, document type and legal areas
 * to generate 3-10 targeted questions that help refine the document brief.
 */
export const CONTEXT_DETAIL_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'context_detail',
    label: 'Detalhamento de Contexto',
    description: 'Analisa a solicitação e gera perguntas para refinar o contexto do documento',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'search',
  },
]

/** Map from context-detail agent key → model ID */
export type ContextDetailModelMap = Record<string, string>

/** Default model map for the context detail agent. */
export function getDefaultContextDetailModelMap(): ContextDetailModelMap {
  const map: ContextDetailModelMap = {}
  for (const def of CONTEXT_DETAIL_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load context detail model configuration.
 * Returns saved overrides merged with defaults.
 */
export async function loadContextDetailModels(): Promise<ContextDetailModelMap> {
  const defaults = getDefaultContextDetailModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const saved = (settings.context_detail_models ?? {}) as Record<string, string>
    for (const def of CONTEXT_DETAIL_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string') {
        defaults[def.key] = saved[def.key]
      }
    }
  } catch {
    // Fall back to defaults silently
  }
  return defaults
}

/**
 * Save context detail model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveContextDetailModels(models: ContextDetailModelMap): Promise<void> {
  if (!IS_FIREBASE) return
  const defaults = getDefaultContextDetailModelMap()
  const overrides: ContextDetailModelMap = {}
  for (const def of CONTEXT_DETAIL_AGENT_DEFS) {
    const model = models[def.key]
    if (model && model !== defaults[def.key]) {
      overrides[def.key] = model
    }
  }
  await saveSettings({ context_detail_models: overrides })
}

/** Reset context detail models to defaults. */
export async function resetContextDetailModels(): Promise<void> {
  if (!IS_FIREBASE) return
  await saveSettings({ context_detail_models: {} })
}

// ── Acervo Classificador Agent Definition ────────────────────────────────────

/**
 * Single-agent definition for the "Classificar Acervo" feature.
 *
 * This agent analyses acervo documents and generates classification tags:
 * natureza, área do direito, assuntos, and contexto.
 */
export const ACERVO_CLASSIFICADOR_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'acervo_classificador',
    label: 'Classificador de Acervo',
    description: 'Classifica documentos do acervo com tags de natureza, área do direito, assuntos e contexto',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'tag',
  },
]

/** Map from acervo-classificador agent key → model ID */
export type AcervoClassificadorModelMap = Record<string, string>

/** Default model map for the acervo classificador agent. */
export function getDefaultAcervoClassificadorModelMap(): AcervoClassificadorModelMap {
  const map: AcervoClassificadorModelMap = {}
  for (const def of ACERVO_CLASSIFICADOR_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load acervo classificador model configuration.
 * Returns saved overrides merged with defaults.
 */
export async function loadAcervoClassificadorModels(): Promise<AcervoClassificadorModelMap> {
  const defaults = getDefaultAcervoClassificadorModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const saved = (settings.acervo_classificador_models ?? {}) as Record<string, string>
    for (const def of ACERVO_CLASSIFICADOR_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string') {
        defaults[def.key] = saved[def.key]
      }
    }
  } catch {
    // Fall back to defaults silently
  }
  return defaults
}

/**
 * Save acervo classificador model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveAcervoClassificadorModels(models: AcervoClassificadorModelMap): Promise<void> {
  if (!IS_FIREBASE) return
  const defaults = getDefaultAcervoClassificadorModelMap()
  const overrides: AcervoClassificadorModelMap = {}
  for (const def of ACERVO_CLASSIFICADOR_AGENT_DEFS) {
    const model = models[def.key]
    if (model && model !== defaults[def.key]) {
      overrides[def.key] = model
    }
  }
  await saveSettings({ acervo_classificador_models: overrides })
}

/** Reset acervo classificador models to defaults. */
export async function resetAcervoClassificadorModels(): Promise<void> {
  if (!IS_FIREBASE) return
  await saveSettings({ acervo_classificador_models: {} })
}

// ── Acervo Ementa Agent Definition ───────────────────────────────────────────

/**
 * Single-agent definition for the "Gerador de Ementa" feature.
 *
 * This agent generates structured ementas and keywords for acervo documents
 * to support indexing and semantic search.
 */
export const ACERVO_EMENTA_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'acervo_ementa',
    label: 'Gerador de Ementa',
    description: 'Gera ementas estruturadas e keywords para indexação de documentos do acervo',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'file-text',
  },
]

/** Map from acervo-ementa agent key → model ID */
export type AcervoEmentaModelMap = Record<string, string>

/** Default model map for the acervo ementa agent. */
export function getDefaultAcervoEmentaModelMap(): AcervoEmentaModelMap {
  const map: AcervoEmentaModelMap = {}
  for (const def of ACERVO_EMENTA_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load acervo ementa model configuration.
 * Returns saved overrides merged with defaults.
 */
export async function loadAcervoEmentaModels(): Promise<AcervoEmentaModelMap> {
  const defaults = getDefaultAcervoEmentaModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const saved = (settings.acervo_ementa_models ?? {}) as Record<string, string>
    for (const def of ACERVO_EMENTA_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string') {
        defaults[def.key] = saved[def.key]
      }
    }
  } catch {
    // Fall back to defaults silently
  }
  return defaults
}

/**
 * Save acervo ementa model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveAcervoEmentaModels(models: AcervoEmentaModelMap): Promise<void> {
  if (!IS_FIREBASE) return
  const defaults = getDefaultAcervoEmentaModelMap()
  const overrides: AcervoEmentaModelMap = {}
  for (const def of ACERVO_EMENTA_AGENT_DEFS) {
    const model = models[def.key]
    if (model && model !== defaults[def.key]) {
      overrides[def.key] = model
    }
  }
  await saveSettings({ acervo_ementa_models: overrides })
}

/** Reset acervo ementa models to defaults. */
export async function resetAcervoEmentaModels(): Promise<void> {
  if (!IS_FIREBASE) return
  await saveSettings({ acervo_ementa_models: {} })
}
