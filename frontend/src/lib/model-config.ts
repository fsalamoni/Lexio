/**
 * Agent model configuration — defines which LLM model each pipeline agent uses.
 *
 * Persistence:
 *   Firebase mode → Firestore /users/{uid}/settings/preferences.agent_models
 *   Backend mode  → not yet wired (uses defaults)
 *
 * The generation-service reads these at generation time so admin changes
 * take effect immediately without redeployment.
 */

import { IS_FIREBASE } from './firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from './firestore-service'
import type { FallbackPriorityConfig, FallbackPriorityList, UserSettingsData } from './firestore-types'

// ── Available OpenRouter models (curated) ─────────────────────────────────────

/** Agent function categories — used to compute model fit score per agent */
export type AgentCategory = 'extraction' | 'synthesis' | 'reasoning' | 'writing'

/**
 * Fit scores (1–10) per agent category — absolute global scale.
 *  10 = best-in-class globally · 7-9 = excellent · 5-6 = adequate · 3-4 = weak · 1-2 = poor
 *
 *  extraction — Triagem, Buscador, Fact-Checker (fast, accurate structured extraction)
 *  synthesis  — Compilador, Revisor, Moderador (document assembly & coherence review)
 *  reasoning  — Pesquisador, Jurista, Adv.Diabo, Jurista v2 (deep legal reasoning)
 *  writing    — Redator (long-form Portuguese legal document writing)
 */
export interface AgentFitScores {
  extraction: number
  synthesis:  number
  reasoning:  number
  writing:    number
}

export interface ModelOption {
  id: string
  label: string
  provider: string
  tier: 'fast' | 'balanced' | 'premium'
  description: string
  /** Maximum context window in tokens */
  contextWindow: number
  /** Cost per 1M input tokens in USD (0 for free models) */
  inputCost: number
  /** Cost per 1M output tokens in USD (0 for free models) */
  outputCost: number
  /** Whether this model is available on the free tier */
  isFree: boolean
  /** How well this model fits each agent category (1–10) */
  agentFit: AgentFitScores
  /** Model capabilities — e.g. ['text'], ['text','image'], ['audio'] */
  capabilities?: ModelCapability[]
  /** Known rate limits (present when applicable) */
  rateLimits?: {
    /** Max requests per minute */
    rpm: number
    /** Max requests per day */
    rpd: number
    /** Optional additional note */
    note?: string
  }
}

/**
 * Standard OpenRouter free-tier rate limits.
 * Applied to all models with isFree = true.
 * Source: https://openrouter.ai/docs/limits
 */
export const FREE_TIER_RATE_LIMITS = { rpm: 20, rpd: 200 } as const

export const AVAILABLE_MODELS: ModelOption[] = [
  // ── Anthropic ────────────────────────────────────────────────────────────────
  {
    id: 'anthropic/claude-3.5-haiku',
    label: 'Claude 3.5 Haiku', provider: 'Anthropic', tier: 'fast',
    description: 'Rápido e econômico — ideal para triagem e verificação',
    contextWindow: 200_000, inputCost: 0.80, outputCost: 4.00, isFree: false,
    agentFit: { extraction: 9, synthesis: 5, reasoning: 4, writing: 5 },
  },
  {
    id: 'anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4', provider: 'Anthropic', tier: 'balanced',
    description: 'Equilibrado — excelente para raciocínio jurídico avançado',
    contextWindow: 200_000, inputCost: 3.00, outputCost: 15.00, isFree: false,
    agentFit: { extraction: 7, synthesis: 9, reasoning: 9, writing: 9 },
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    label: 'Claude 3.5 Sonnet', provider: 'Anthropic', tier: 'balanced',
    description: 'Versão anterior do Sonnet — boa relação custo-benefício',
    contextWindow: 200_000, inputCost: 3.00, outputCost: 15.00, isFree: false,
    agentFit: { extraction: 7, synthesis: 8, reasoning: 8, writing: 8 },
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    label: 'Claude 3.7 Sonnet', provider: 'Anthropic', tier: 'balanced',
    description: 'Raciocínio híbrido — combina velocidade e profundidade analítica',
    contextWindow: 200_000, inputCost: 3.00, outputCost: 15.00, isFree: false,
    agentFit: { extraction: 7, synthesis: 8, reasoning: 9, writing: 8 },
  },
  {
    id: 'anthropic/claude-opus-4',
    label: 'Claude Opus 4', provider: 'Anthropic', tier: 'premium',
    description: 'Topo de linha — máxima capacidade para tarefas complexas',
    contextWindow: 200_000, inputCost: 15.00, outputCost: 75.00, isFree: false,
    agentFit: { extraction: 5, synthesis: 10, reasoning: 10, writing: 10 },
  },

  // ── Google ────────────────────────────────────────────────────────────────────
  {
    id: 'google/gemini-2.0-flash-001',
    label: 'Gemini 2.0 Flash', provider: 'Google', tier: 'fast',
    description: 'Rápido e econômico — boa alternativa para tarefas simples',
    contextWindow: 1_000_000, inputCost: 0.10, outputCost: 0.40, isFree: false,
    agentFit: { extraction: 9, synthesis: 5, reasoning: 5, writing: 5 },
  },
  {
    id: 'google/gemini-2.0-flash-lite-001',
    label: 'Gemini 2.0 Flash Lite', provider: 'Google', tier: 'fast',
    description: 'Ultra econômico — para tarefas de extração de baixa complexidade',
    contextWindow: 1_000_000, inputCost: 0.075, outputCost: 0.30, isFree: false,
    agentFit: { extraction: 8, synthesis: 4, reasoning: 3, writing: 4 },
  },
  {
    id: 'google/gemini-2.5-flash-preview',
    label: 'Gemini 2.5 Flash', provider: 'Google', tier: 'balanced',
    description: 'Equilíbrio ideal — contexto gigante com raciocínio aprimorado',
    contextWindow: 1_000_000, inputCost: 0.15, outputCost: 0.60, isFree: false,
    agentFit: { extraction: 8, synthesis: 7, reasoning: 7, writing: 7 },
  },
  {
    id: 'google/gemini-2.5-pro-preview',
    label: 'Gemini 2.5 Pro', provider: 'Google', tier: 'premium',
    description: 'Premium — raciocínio avançado com contexto de 1M tokens',
    contextWindow: 1_000_000, inputCost: 1.25, outputCost: 10.00, isFree: false,
    agentFit: { extraction: 7, synthesis: 9, reasoning: 9, writing: 8 },
  },

  // ── OpenAI ────────────────────────────────────────────────────────────────────
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini', provider: 'OpenAI', tier: 'fast',
    description: 'Versão leve e econômica do GPT-4o',
    contextWindow: 128_000, inputCost: 0.15, outputCost: 0.60, isFree: false,
    agentFit: { extraction: 8, synthesis: 5, reasoning: 5, writing: 5 },
  },
  {
    id: 'openai/gpt-4.1-nano',
    label: 'GPT-4.1 Nano', provider: 'OpenAI', tier: 'fast',
    description: 'Nanoscale — ultra rápido para extração e triagem',
    contextWindow: 1_000_000, inputCost: 0.10, outputCost: 0.40, isFree: false,
    agentFit: { extraction: 7, synthesis: 4, reasoning: 3, writing: 4 },
  },
  {
    id: 'openai/gpt-4.1-mini',
    label: 'GPT-4.1 Mini', provider: 'OpenAI', tier: 'fast',
    description: 'Balanceado e eficiente — contexto 1M tokens',
    contextWindow: 1_000_000, inputCost: 0.40, outputCost: 1.60, isFree: false,
    agentFit: { extraction: 7, synthesis: 6, reasoning: 6, writing: 6 },
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o', provider: 'OpenAI', tier: 'balanced',
    description: 'Modelo multimodal equilibrado da OpenAI',
    contextWindow: 128_000, inputCost: 2.50, outputCost: 10.00, isFree: false,
    agentFit: { extraction: 8, synthesis: 8, reasoning: 8, writing: 8 },
  },
  {
    id: 'openai/gpt-4.1',
    label: 'GPT-4.1', provider: 'OpenAI', tier: 'premium',
    description: 'Modelo mais recente e avançado da OpenAI — contexto 1M',
    contextWindow: 1_000_000, inputCost: 2.00, outputCost: 8.00, isFree: false,
    agentFit: { extraction: 7, synthesis: 9, reasoning: 9, writing: 9 },
  },
  {
    id: 'openai/o3-mini',
    label: 'o3-mini', provider: 'OpenAI', tier: 'balanced',
    description: 'Modelo de raciocínio compacto — excelente para argumentação',
    contextWindow: 200_000, inputCost: 1.10, outputCost: 4.40, isFree: false,
    agentFit: { extraction: 5, synthesis: 6, reasoning: 8, writing: 6 },
  },
  {
    id: 'openai/o4-mini',
    label: 'o4-mini', provider: 'OpenAI', tier: 'balanced',
    description: 'Raciocínio eficiente — ideal para análise jurídica aprofundada',
    contextWindow: 200_000, inputCost: 1.10, outputCost: 4.40, isFree: false,
    agentFit: { extraction: 5, synthesis: 7, reasoning: 9, writing: 7 },
  },
  {
    id: 'openai/o3',
    label: 'o3', provider: 'OpenAI', tier: 'premium',
    description: 'Máximo raciocínio — para argumentações jurídicas de alta complexidade',
    contextWindow: 200_000, inputCost: 10.00, outputCost: 40.00, isFree: false,
    agentFit: { extraction: 3, synthesis: 7, reasoning: 10, writing: 7 },
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────────
  {
    id: 'deepseek/deepseek-chat-v3-0324',
    label: 'DeepSeek V3', provider: 'DeepSeek', tier: 'balanced',
    description: 'Alto desempenho com custo reduzido — ótima redação técnica',
    contextWindow: 64_000, inputCost: 0.27, outputCost: 1.10, isFree: false,
    agentFit: { extraction: 7, synthesis: 8, reasoning: 8, writing: 9 },
  },
  {
    id: 'deepseek/deepseek-r1',
    label: 'DeepSeek R1', provider: 'DeepSeek', tier: 'balanced',
    description: 'Modelo de raciocínio — excelente para análise e argumentação',
    contextWindow: 64_000, inputCost: 0.55, outputCost: 2.19, isFree: false,
    agentFit: { extraction: 3, synthesis: 6, reasoning: 9, writing: 7 },
  },

  // ── Meta ──────────────────────────────────────────────────────────────────────
  {
    id: 'meta-llama/llama-4-scout',
    label: 'Llama 4 Scout', provider: 'Meta', tier: 'fast',
    description: 'Contexto 512K — eficiente para tarefas de busca e extração',
    contextWindow: 512_000, inputCost: 0.17, outputCost: 0.17, isFree: false,
    agentFit: { extraction: 8, synthesis: 6, reasoning: 5, writing: 6 },
  },
  {
    id: 'meta-llama/llama-4-maverick',
    label: 'Llama 4 Maverick', provider: 'Meta', tier: 'balanced',
    description: 'Modelo open-source avançado — contexto 1M tokens',
    contextWindow: 1_000_000, inputCost: 0.19, outputCost: 0.65, isFree: false,
    agentFit: { extraction: 7, synthesis: 7, reasoning: 7, writing: 7 },
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B', provider: 'Meta', tier: 'balanced',
    description: 'Modelo 70B — excelente capacidade a custo acessível',
    contextWindow: 128_000, inputCost: 0.12, outputCost: 0.30, isFree: false,
    agentFit: { extraction: 7, synthesis: 7, reasoning: 6, writing: 7 },
  },

  // ── Mistral ───────────────────────────────────────────────────────────────────
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct',
    label: 'Mistral Small 3.1', provider: 'Mistral', tier: 'fast',
    description: 'Compacto e eficiente — boa opção para extração e triagem',
    contextWindow: 128_000, inputCost: 0.10, outputCost: 0.30, isFree: false,
    agentFit: { extraction: 7, synthesis: 5, reasoning: 5, writing: 5 },
  },
  {
    id: 'mistralai/mistral-large-2411',
    label: 'Mistral Large', provider: 'Mistral', tier: 'balanced',
    description: 'Poderoso modelo europeu — forte em código e texto técnico',
    contextWindow: 128_000, inputCost: 2.00, outputCost: 6.00, isFree: false,
    agentFit: { extraction: 7, synthesis: 7, reasoning: 6, writing: 8 },
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    label: 'Qwen 2.5 72B', provider: 'Qwen', tier: 'balanced',
    description: 'Modelo multilíngue robusto — bom desempenho em texto jurídico',
    contextWindow: 128_000, inputCost: 0.13, outputCost: 0.40, isFree: false,
    agentFit: { extraction: 7, synthesis: 7, reasoning: 6, writing: 7 },
  },
  {
    id: 'qwen/qwen3-235b-a22b',
    label: 'Qwen3 235B', provider: 'Qwen', tier: 'premium',
    description: 'Maior modelo Qwen — raciocínio avançado com MoE',
    contextWindow: 128_000, inputCost: 0.13, outputCost: 0.60, isFree: false,
    agentFit: { extraction: 6, synthesis: 8, reasoning: 8, writing: 8 },
  },
  {
    id: 'qwen/qwen3-30b-a3b',
    label: 'Qwen3 30B', provider: 'Qwen', tier: 'balanced',
    description: 'MoE eficiente — bom equilíbrio entre velocidade e qualidade',
    contextWindow: 128_000, inputCost: 0.29, outputCost: 1.15, isFree: false,
    agentFit: { extraction: 7, synthesis: 6, reasoning: 7, writing: 6 },
  },

  // ── xAI ──────────────────────────────────────────────────────────────────────
  {
    id: 'x-ai/grok-3-mini',
    label: 'Grok-3 Mini', provider: 'xAI', tier: 'fast',
    description: 'Raciocínio compacto — boa relação custo-benefício',
    contextWindow: 131_000, inputCost: 0.30, outputCost: 0.50, isFree: false,
    agentFit: { extraction: 7, synthesis: 5, reasoning: 6, writing: 5 },
  },
  {
    id: 'x-ai/grok-3',
    label: 'Grok-3', provider: 'xAI', tier: 'premium',
    description: 'Modelo flagship xAI — alta capacidade analítica',
    contextWindow: 131_000, inputCost: 3.00, outputCost: 15.00, isFree: false,
    agentFit: { extraction: 6, synthesis: 8, reasoning: 8, writing: 8 },
  },
  {
    id: 'cohere/command-r-plus-08-2024',
    label: 'Command R+', provider: 'Cohere', tier: 'balanced',
    description: 'RAG especializado — excelente para pesquisa e síntese',
    contextWindow: 128_000, inputCost: 2.50, outputCost: 10.00, isFree: false,
    agentFit: { extraction: 8, synthesis: 8, reasoning: 6, writing: 7 },
  },

  // ── MODELOS GRATUITOS (Free tier OpenRouter) ──────────────────────────────────
  {
    id: 'google/gemini-2.0-flash:free',
    label: 'Gemini 2.0 Flash', provider: 'Google', tier: 'fast',
    description: '✦ GRÁTIS — Gemini 2.0 Flash free tier, contexto 1M, sem custo',
    contextWindow: 1_000_000, inputCost: 0, outputCost: 0, isFree: true,
    agentFit: { extraction: 8, synthesis: 5, reasoning: 5, writing: 5 },
  },
  {
    id: 'google/gemma-3-27b-it:free',
    label: 'Gemma 3 27B', provider: 'Google', tier: 'fast',
    description: '✦ GRÁTIS — Modelo open do Google, 128K contexto',
    contextWindow: 128_000, inputCost: 0, outputCost: 0, isFree: true,
    agentFit: { extraction: 6, synthesis: 5, reasoning: 5, writing: 5 },
  },
  {
    id: 'meta-llama/llama-4-scout:free',
    label: 'Llama 4 Scout', provider: 'Meta', tier: 'fast',
    description: '✦ GRÁTIS — Llama 4 Scout no free tier, 512K contexto',
    contextWindow: 512_000, inputCost: 0, outputCost: 0, isFree: true,
    agentFit: { extraction: 7, synthesis: 5, reasoning: 5, writing: 5 },
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B', provider: 'Meta', tier: 'balanced',
    description: '✦ GRÁTIS — Llama 3.3 70B no free tier',
    contextWindow: 128_000, inputCost: 0, outputCost: 0, isFree: true,
    agentFit: { extraction: 7, synthesis: 6, reasoning: 6, writing: 6 },
  },
  // deepseek/deepseek-chat-v3-0324:free — removido do OpenRouter (404 "no endpoints")
  {
    id: 'deepseek/deepseek-r1:free',
    label: 'DeepSeek R1', provider: 'DeepSeek', tier: 'balanced',
    description: '✦ GRÁTIS — DeepSeek R1 raciocínio no free tier',
    contextWindow: 64_000, inputCost: 0, outputCost: 0, isFree: true,
    agentFit: { extraction: 3, synthesis: 5, reasoning: 9, writing: 6 },
  },
  {
    id: 'qwen/qwen3-8b:free',
    label: 'Qwen3 8B', provider: 'Qwen', tier: 'fast',
    description: '✦ GRÁTIS — Modelo compacto Qwen3, 8B parâmetros',
    contextWindow: 128_000, inputCost: 0, outputCost: 0, isFree: true,
    agentFit: { extraction: 6, synthesis: 4, reasoning: 4, writing: 4 },
  },
  {
    id: 'qwen/qwen3-30b-a3b:free',
    label: 'Qwen3 30B', provider: 'Qwen', tier: 'balanced',
    description: '✦ GRÁTIS — Qwen3 30B MoE no free tier',
    contextWindow: 128_000, inputCost: 0, outputCost: 0, isFree: true,
    agentFit: { extraction: 7, synthesis: 5, reasoning: 6, writing: 5 },
  },
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct:free',
    label: 'Mistral Small 3.1', provider: 'Mistral', tier: 'fast',
    description: '✦ GRÁTIS — Mistral Small 3.1 no free tier',
    contextWindow: 128_000, inputCost: 0, outputCost: 0, isFree: true,
    agentFit: { extraction: 6, synthesis: 5, reasoning: 4, writing: 5 },
  },
  {
    id: 'microsoft/phi-4-multimodal-instruct:free',
    label: 'Phi-4 Multimodal', provider: 'Microsoft', tier: 'fast',
    description: '✦ GRÁTIS — Phi-4 da Microsoft, eficiente e compacto',
    contextWindow: 128_000, inputCost: 0, outputCost: 0, isFree: true,
    agentFit: { extraction: 6, synthesis: 5, reasoning: 4, writing: 5 },
  },
]

// ── Pipeline agent definitions ────────────────────────────────────────────────

export type ModelCapability = 'text' | 'image' | 'audio' | 'video'

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
  /** Functional category — used to pick the right fit score from ModelOption.agentFit */
  agentCategory: AgentCategory
  /** Required model capability — restricts model selection to only models with this capability. Defaults to 'text'. */
  requiredCapability?: ModelCapability
  /** Admin hint — short note about the best model type for this agent */
  bestModelNote?: string
}

export class ModelCapabilityMismatchError extends Error {
  agentKey: string
  agentLabel: string
  modelId: string
  requiredCapability: ModelCapability

  constructor(agent: AgentModelDef, modelId: string, requiredCapability: ModelCapability) {
    super(`O modelo "${modelId}" não atende a capability obrigatória "${requiredCapability}" para o agente "${agent.label}".`)
    this.name = 'ModelCapabilityMismatchError'
    this.agentKey = agent.key
    this.agentLabel = agent.label
    this.modelId = modelId
    this.requiredCapability = requiredCapability
  }
}

// ── Models Not Configured Error ───────────────────────────────────────────────

/**
 * Thrown when a pipeline tries to run but one or more required agent models
 * have not been configured by the admin.
 */
export class ModelsNotConfiguredError extends Error {
  /** Name of the pipeline (for routing to the correct admin config card) */
  pipelineName: string
  /** Agent keys that are missing model configuration */
  missingAgents: string[]

  constructor(pipelineName: string, missingAgents: string[]) {
    const agentList = missingAgents.join(', ')
    super(`Modelos não configurados para o pipeline "${pipelineName}". Agentes sem modelo: ${agentList}. Configure os modelos em Configurações.`)
    this.name = 'ModelsNotConfiguredError'
    this.pipelineName = pipelineName
    this.missingAgents = missingAgents
  }
}

/**
 * Validates that all agents in a model map have a non-empty model configured.
 * Throws ModelsNotConfiguredError if any agent is missing.
 */
export function validateModelMap(
  modelMap: Record<string, string>,
  agentDefs: AgentModelDef[],
  pipelineName: string,
): void {
  const missing = agentDefs
    .filter(def => !modelMap[def.key])
    .map(def => def.key)
  if (missing.length > 0) {
    throw new ModelsNotConfiguredError(pipelineName, missing)
  }
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
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'acervo_buscador',
    label: 'Buscador de Acervo',
    description: 'Busca documentos similares no acervo do usuário para reutilização',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'library',
    agentCategory: 'extraction',
  },
  {
    key: 'acervo_compilador',
    label: 'Compilador de Base',
    description: 'Compila documentos do acervo em um documento base unificado',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'layers',
    agentCategory: 'synthesis',
  },
  {
    key: 'acervo_revisor',
    label: 'Revisor de Base',
    description: 'Revisa o documento base compilado para coerência e completude',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'scan-search',
    agentCategory: 'synthesis',
  },
  {
    key: 'pesquisador',
    label: 'Pesquisador',
    description: 'Pesquisa legislação, jurisprudência e doutrina aplicáveis',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'book-open',
    agentCategory: 'reasoning',
  },
  {
    key: 'jurista',
    label: 'Jurista',
    description: 'Desenvolve teses jurídicas robustas e fundamentadas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'scale',
    agentCategory: 'reasoning',
  },
  {
    key: 'advogado_diabo',
    label: 'Advogado do Diabo',
    description: 'Critica e identifica fraquezas nos argumentos',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'shield',
    agentCategory: 'reasoning',
  },
  {
    key: 'jurista_v2',
    label: 'Jurista (revisão)',
    description: 'Refina teses incorporando as críticas válidas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'refresh-cw',
    agentCategory: 'reasoning',
  },
  {
    key: 'fact_checker',
    label: 'Fact-Checker',
    description: 'Verifica citações legais e corrige imprecisões',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'clipboard-check',
    agentCategory: 'extraction',
  },
  {
    key: 'moderador',
    label: 'Moderador',
    description: 'Planeja a estrutura e organização do documento final',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'scale',
    agentCategory: 'synthesis',
  },
  {
    key: 'redator',
    label: 'Redator',
    description: 'Redige o documento completo seguindo o plano definido',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
  },
]

// ── Types ─────────────────────────────────────────────────────────────────────

/** Map from agent key → model ID */
export type AgentModelMap = Record<string, string>

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferCapabilitiesFromModelId(modelId: string): ModelCapability[] {
  const haystack = modelId.toLowerCase()
  const capabilities: ModelCapability[] = []
  if (/(tts|audio|speech|voice)/.test(haystack)) capabilities.push('audio')
  if (/(image|flux|dall|imagen|recraft|sdxl|seedream)/.test(haystack)) capabilities.push('image')
  if (/(video|veo|sora|runway|pika|kling|hailuo|ltx)/.test(haystack)) capabilities.push('video')
  if (capabilities.length === 0) capabilities.push('text')
  if (!capabilities.includes('text') && capabilities.length > 0) capabilities.unshift('text')
  return [...new Set(capabilities)]
}

function buildCatalogEntries(settings: Record<string, unknown>): ModelOption[] {
  const dynamicCatalog = settings.model_catalog
  if (Array.isArray(dynamicCatalog) && dynamicCatalog.length > 0) {
    return dynamicCatalog
      .filter((model): model is ModelOption =>
        Boolean(model) && typeof model === 'object' && typeof (model as { id?: string }).id === 'string',
      )
  }
  return AVAILABLE_MODELS
}

function getModelCapabilities(modelId: string, catalogEntries: ModelOption[]): ModelCapability[] {
  const exact = catalogEntries.find(model => model.id === modelId)
  if (exact?.capabilities && exact.capabilities.length > 0) return exact.capabilities
  return inferCapabilitiesFromModelId(modelId)
}

function validateModelCapabilitiesAgainstDefs(
  defs: AgentModelDef[],
  models: Record<string, string>,
  catalogEntries: ModelOption[],
): void {
  for (const agent of defs) {
    const modelId = models[agent.key]
    const requiredCapability = agent.requiredCapability
    if (!modelId || !requiredCapability) continue
    const capabilities = getModelCapabilities(modelId, catalogEntries)
    if (!capabilities.includes(requiredCapability)) {
      throw new ModelCapabilityMismatchError(agent, modelId, requiredCapability)
    }
  }
}

export function sanitizeModelCapabilitiesAgainstDefs<T extends Record<string, string>>(
  defs: AgentModelDef[],
  models: T,
  catalogEntries: ModelOption[],
): T {
  const next = { ...models }
  for (const agent of defs) {
    const modelId = next[agent.key]
    const requiredCapability = agent.requiredCapability
    if (!modelId || !requiredCapability) continue
    const capabilities = getModelCapabilities(modelId, catalogEntries)
    if (!capabilities.includes(requiredCapability)) {
      delete next[agent.key]
    }
  }
  return next
}

/**
 * Build a Set of valid model IDs from the user's personal catalog.
 * The hardcoded curated catalog is used only as the bootstrap seed when the
 * user still has no catalog persisted in Firestore.
 */
function buildCatalogIdSet(settings: Record<string, unknown>): Set<string> {
  const ids = new Set<string>()
  for (const model of buildCatalogEntries(settings)) {
    if (model?.id) {
      ids.add(model.id)
    }
  }
  return ids
}

export class ModelNotInUserCatalogError extends Error {
  agentKey: string
  agentLabel: string
  modelId: string

  constructor(agent: AgentModelDef, modelId: string) {
    super(`O modelo "${modelId}" não está presente no catálogo pessoal do usuário para o agente "${agent.label}".`)
    this.name = 'ModelNotInUserCatalogError'
    this.agentKey = agent.key
    this.agentLabel = agent.label
    this.modelId = modelId
  }
}

function validateModelIdsAgainstCatalog(
  defs: AgentModelDef[],
  models: Record<string, string>,
  catalogIds: Set<string>,
): void {
  for (const agent of defs) {
    const modelId = models[agent.key]
    if (!modelId) continue
    if (!catalogIds.has(modelId)) {
      throw new ModelNotInUserCatalogError(agent, modelId)
    }
  }
}

type ScopedModelSettingsKey =
  | 'agent_models'
  | 'thesis_analyst_models'
  | 'context_detail_models'
  | 'acervo_classificador_models'
  | 'acervo_ementa_models'
  | 'research_notebook_models'
  | 'notebook_acervo_models'
  | 'video_pipeline_models'
  | 'audio_pipeline_models'
  | 'presentation_pipeline_models'
  | 'document_v3_models'

function resolveScopedUid(uid?: string): string | undefined {
  return uid ?? getCurrentUserId() ?? undefined
}

function applySavedModelOverrides<T extends Record<string, string>>(
  target: T,
  defs: AgentModelDef[],
  saved: Record<string, string>,
  catalogIds: Set<string>,
  catalogEntries: ModelOption[],
): T {
  const mutableTarget = target as Record<string, string>
  for (const def of defs) {
    if (saved[def.key] && typeof saved[def.key] === 'string' && catalogIds.has(saved[def.key])) {
      const capabilities = getModelCapabilities(saved[def.key], catalogEntries)
      if (!def.requiredCapability || capabilities.includes(def.requiredCapability)) {
        mutableTarget[def.key] = saved[def.key]
      }
    }
  }
  return target
}

async function loadScopedModelMap<T extends Record<string, string>>(
  key: ScopedModelSettingsKey,
  defs: AgentModelDef[],
  defaults: T,
  uid?: string,
): Promise<T> {
  if (!IS_FIREBASE) return defaults

  try {
    const resolvedUid = resolveScopedUid(uid)
    const userSettings = resolvedUid ? await ensureUserSettingsMigrated(resolvedUid) : {} as UserSettingsData
    const settingsRecord = userSettings as unknown as Record<string, unknown>
    const catalogIds = buildCatalogIdSet(settingsRecord)
    const catalogEntries = buildCatalogEntries(settingsRecord)
    const userSaved = (userSettings[key] ?? {}) as Record<string, string>

    applySavedModelOverrides(defaults, defs, userSaved, catalogIds, catalogEntries)
  } catch {
    // On error, just return defaults silently
  }

  return defaults
}

async function saveScopedModelMap<T extends Record<string, string>>(
  key: ScopedModelSettingsKey,
  defs: AgentModelDef[],
  defaults: T,
  models: T,
  uid?: string,
): Promise<void> {
  if (!IS_FIREBASE) return

  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) throw new Error('Usuário não autenticado.')

  const userSettings = await ensureUserSettingsMigrated(resolvedUid)
  const settingsRecord = userSettings as unknown as Record<string, unknown>
  const catalogEntries = buildCatalogEntries(settingsRecord)
  const catalogIds = buildCatalogIdSet(settingsRecord)
  validateModelIdsAgainstCatalog(defs, models, catalogIds)
  validateModelCapabilitiesAgainstDefs(defs, models, catalogEntries)

  const overrides = {} as Record<string, string>

  for (const def of defs) {
    const model = models[def.key]
    if (model && model !== defaults[def.key]) {
      overrides[def.key] = model
    }
  }

  await saveUserSettings(resolvedUid, { [key]: overrides } as Partial<UserSettingsData>)
}

async function resetScopedModelMap(key: ScopedModelSettingsKey, uid?: string): Promise<void> {
  if (!IS_FIREBASE) return

  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) throw new Error('Usuário não autenticado.')

  await saveUserSettings(resolvedUid, { [key]: {} } as Partial<UserSettingsData>)
}

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
export async function loadAgentModels(uid?: string): Promise<AgentModelMap> {
  return loadScopedModelMap('agent_models', PIPELINE_AGENT_DEFS, getDefaultModelMap(), uid)
}

/**
 * Save agent model configuration to Firestore.
 * Only saves entries that differ from defaults (to keep stored data minimal).
 */
export async function saveAgentModels(models: AgentModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('agent_models', PIPELINE_AGENT_DEFS, getDefaultModelMap(), models, uid)
}

/**
 * Reset all agent models to defaults by clearing the stored overrides.
 */
export async function resetAgentModels(uid?: string): Promise<void> {
  await resetScopedModelMap('agent_models', uid)
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
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'thesis_analista',
    label: 'Analista de Redundâncias',
    description: 'Analisa profundamente cada grupo, identificando duplicatas, complementares e contradições',
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
    description: 'Extrai novas teses de documentos ainda não analisados, focando em lacunas temáticas',
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
export async function loadThesisAnalystModels(uid?: string): Promise<ThesisAnalystModelMap> {
  return loadScopedModelMap('thesis_analyst_models', THESIS_ANALYST_AGENT_DEFS, getDefaultThesisAnalystModelMap(), uid)
}

/**
 * Save thesis analyst model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveThesisAnalystModels(models: ThesisAnalystModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('thesis_analyst_models', THESIS_ANALYST_AGENT_DEFS, getDefaultThesisAnalystModelMap(), models, uid)
}

/** Reset thesis analyst models to defaults. */
export async function resetThesisAnalystModels(uid?: string): Promise<void> {
  await resetScopedModelMap('thesis_analyst_models', uid)
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
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'search',
    agentCategory: 'reasoning',
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
export async function loadContextDetailModels(uid?: string): Promise<ContextDetailModelMap> {
  return loadScopedModelMap('context_detail_models', CONTEXT_DETAIL_AGENT_DEFS, getDefaultContextDetailModelMap(), uid)
}

/**
 * Save context detail model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveContextDetailModels(models: ContextDetailModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('context_detail_models', CONTEXT_DETAIL_AGENT_DEFS, getDefaultContextDetailModelMap(), models, uid)
}

/** Reset context detail models to defaults. */
export async function resetContextDetailModels(uid?: string): Promise<void> {
  await resetScopedModelMap('context_detail_models', uid)
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
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'tag',
    agentCategory: 'extraction',
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
export async function loadAcervoClassificadorModels(uid?: string): Promise<AcervoClassificadorModelMap> {
  return loadScopedModelMap('acervo_classificador_models', ACERVO_CLASSIFICADOR_AGENT_DEFS, getDefaultAcervoClassificadorModelMap(), uid)
}

/**
 * Save acervo classificador model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveAcervoClassificadorModels(models: AcervoClassificadorModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('acervo_classificador_models', ACERVO_CLASSIFICADOR_AGENT_DEFS, getDefaultAcervoClassificadorModelMap(), models, uid)
}

/** Reset acervo classificador models to defaults. */
export async function resetAcervoClassificadorModels(uid?: string): Promise<void> {
  await resetScopedModelMap('acervo_classificador_models', uid)
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
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'file-text',
    agentCategory: 'extraction',
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
export async function loadAcervoEmentaModels(uid?: string): Promise<AcervoEmentaModelMap> {
  return loadScopedModelMap('acervo_ementa_models', ACERVO_EMENTA_AGENT_DEFS, getDefaultAcervoEmentaModelMap(), uid)
}

/**
 * Save acervo ementa model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveAcervoEmentaModels(models: AcervoEmentaModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('acervo_ementa_models', ACERVO_EMENTA_AGENT_DEFS, getDefaultAcervoEmentaModelMap(), models, uid)
}

/** Reset acervo ementa models to defaults. */
export async function resetAcervoEmentaModels(uid?: string): Promise<void> {
  await resetScopedModelMap('acervo_ementa_models', uid)
}

// ── Research Notebook (Caderno de Pesquisa) Agent Definitions ─────────────────

/**
 * Multi-agent pipeline for the "Caderno de Pesquisa" feature — an intelligent
 * research assistant similar to NotebookLM. It uses the user's acervo and
 * additional uploaded sources to learn about a topic and answer questions,
 * generate summaries, presentations, mind maps, flashcards, and more.
 *
 * Agent groups:
 *  ── Pesquisa & Análise ──
 *  1. Pesquisador   — deep-searches sources and builds a knowledge base
 *  2. Analista      — analyses, cross-references and synthesises findings
 *  3. Assistente    — answers user questions conversationally using context
 *
 *  ── Estúdio de Criação (multi-agent pipeline) ──
 *  4. Pesquisador do Estúdio — extracts source data relevant to the specific artifact
 *  5. Escritor               — produces written content (summaries, reports, docs, flashcards, quizzes)
 *  6. Roteirista             — creates scripts with narration, timing and production notes (audio/video)
 *  7. Designer Visual        — builds visual structures (presentations, mind maps, infographics, tables)
 *  8. Revisor                — quality-checks, refines and enhances any artifact before delivery
 *
 * Visual artifacts then pass through dedicated media stages in the notebook
 * flow, where structured JSON is rendered into persisted images or posters.
 */
export const RESEARCH_NOTEBOOK_AGENT_DEFS: AgentModelDef[] = [
  // ── Pesquisa & Análise ──
  {
    key: 'notebook_pesquisador',
    label: 'Pesquisador de Fontes',
    description: 'Busca e indexa conteúdo relevante nas fontes do caderno e no acervo',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'notebook_analista',
    label: 'Analista de Conhecimento',
    description: 'Analisa, cruza referências e sintetiza descobertas sobre o tema',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'brain',
    agentCategory: 'reasoning',
  },
  {
    key: 'notebook_assistente',
    label: 'Assistente Conversacional',
    description: 'Responde perguntas do usuário com base no conhecimento indexado',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'message-circle',
    agentCategory: 'reasoning',
  },
  {
    key: 'notebook_pesquisador_externo',
    label: 'Pesquisador Externo',
    description: 'Realiza pesquisa externa web para enriquecer as fontes do caderno',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'notebook_pesquisador_externo_profundo',
    label: 'Pesquisador Externo Profundo',
    description: 'Conduz pesquisa externa profunda e curadoria avançada de múltiplas fontes',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'brain',
    agentCategory: 'reasoning',
  },
  {
    key: 'notebook_pesquisador_jurisprudencia',
    label: 'Pesquisador de Jurisprudência (DataJud)',
    description: 'Pesquisa jurisprudência na API do CNJ (DataJud) e prepara fontes para o caderno',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'notebook_ranqueador_jurisprudencia',
    label: 'Ranqueador de Jurisprudência',
    description: 'Avalia a relevância dos resultados do DataJud em relação à consulta e reordena por importância',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'bar-chart-2',
    agentCategory: 'extraction',
  },
  // ── Estúdio de Criação ──
  {
    key: 'studio_pesquisador',
    label: 'Pesquisador do Estúdio',
    description: 'Extrai e organiza dados relevantes das fontes para o artefato solicitado',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'studio_escritor',
    label: 'Escritor',
    description: 'Redige conteúdo textual e gera JSON estruturado para flashcards, quizzes, resumos e relatórios',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
  },
  {
    key: 'studio_roteirista',
    label: 'Roteirista',
    description: 'Cria roteiros profissionais em JSON estruturado com narração, timing e notas de produção',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'mic',
    agentCategory: 'writing',
  },
  {
    key: 'studio_visual',
    label: 'Designer Visual',
    description: 'Gera JSON estruturado para apresentações, mapas mentais, infográficos e tabelas que depois são renderizados em imagem final',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'pen-tool',
    agentCategory: 'synthesis',
  },
  {
    key: 'studio_revisor',
    label: 'Revisor de Qualidade',
    description: 'Revisa, aprimora e garante excelência mantendo o formato (JSON/Markdown) do artefato',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
  },
]

/** Map from research-notebook agent key → model ID */
export type ResearchNotebookModelMap = Record<string, string>

/** Default model map for the research notebook agents. */
export function getDefaultResearchNotebookModelMap(): ResearchNotebookModelMap {
  const map: ResearchNotebookModelMap = {}
  for (const def of RESEARCH_NOTEBOOK_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load research notebook model configuration.
 * Returns saved overrides merged with defaults.
 */
export async function loadResearchNotebookModels(uid?: string): Promise<ResearchNotebookModelMap> {
  return loadScopedModelMap('research_notebook_models', RESEARCH_NOTEBOOK_AGENT_DEFS, getDefaultResearchNotebookModelMap(), uid)
}

/**
 * Save research notebook model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveResearchNotebookModels(models: ResearchNotebookModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('research_notebook_models', RESEARCH_NOTEBOOK_AGENT_DEFS, getDefaultResearchNotebookModelMap(), models, uid)
}

/** Reset research notebook models to defaults. */
export async function resetResearchNotebookModels(uid?: string): Promise<void> {
  await resetScopedModelMap('research_notebook_models', uid)
}

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

/** Map from notebook-acervo agent key → model ID */
export type NotebookAcervoModelMap = Record<string, string>

/** Default model map for the notebook acervo analyzer pipeline. */
export function getDefaultNotebookAcervoModelMap(): NotebookAcervoModelMap {
  const map: NotebookAcervoModelMap = {}
  for (const def of NOTEBOOK_ACERVO_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load notebook acervo analyzer model configuration.
 * Returns saved overrides merged with defaults.
 */
export async function loadNotebookAcervoModels(uid?: string): Promise<NotebookAcervoModelMap> {
  return loadScopedModelMap('notebook_acervo_models', NOTEBOOK_ACERVO_AGENT_DEFS, getDefaultNotebookAcervoModelMap(), uid)
}

/**
 * Save notebook acervo analyzer model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveNotebookAcervoModels(models: NotebookAcervoModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('notebook_acervo_models', NOTEBOOK_ACERVO_AGENT_DEFS, getDefaultNotebookAcervoModelMap(), models, uid)
}

/** Reset notebook acervo analyzer models to defaults. */
export async function resetNotebookAcervoModels(uid?: string): Promise<void> {
  await resetScopedModelMap('notebook_acervo_models', uid)
}

// ── Video Pipeline Agent Definitions ─────────────────────────────────────────

/**
 * Eight-agent pipeline for comprehensive video generation.
 *
 * This is a multi-agent trail that takes the user through a complete video
 * production workflow: from planning and budgeting to scene-by-scene generation.
 *
 * Agent execution order:
 *  1. Planejador        — reads user options, creates production proposal with budget estimate
 *  2. Roteirista        — writes the full screenplay with dialogue, narration and directions
 *  3. Diretor de Cena   — breaks the script into detailed scene descriptions with timing
 *  4. Storyboarder      — creates visual descriptions for each scene frame-by-frame
 *  5. Designer Visual   — generates image prompts / visual assets for each scene (requires image capability)
 *  6. Compositor        — assembles scenes into a final video timeline with transitions
 *  7. Narrador          — generates narration/voice-over script with timing marks (requires audio capability)
 *  8. Revisor Final     — quality-checks the complete production package before rendering
 *
 * The pipeline supports videos of 15+ minutes by intelligently splitting into
 * segments. The Planejador agent estimates token costs before user approval.
 */
export const VIDEO_PIPELINE_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'video_planejador',
    label: 'Planejador de Produção',
    description: 'Analisa opções do usuário (formato, qualidade, duração, FPS) e cria proposta detalhada com estimativa de custos em tokens',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'clipboard-check',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Premium: Claude Sonnet ($3), GPT-4o ($2.50), GPT-4.1 ($2), Gemini 2.5 Pro ($1.25). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, DeepSeek R1:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_roteirista',
    label: 'Roteirista',
    description: 'Escreve o roteiro completo com diálogos, narração, direções de câmera e notas de produção',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'file-text',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Requer boa escrita criativa. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Llama 4 Maverick ($0.19), Gemini 2.5 Flash ($0.15), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_diretor_cena',
    label: 'Diretor de Cenas',
    description: 'Divide o roteiro em cenas detalhadas com temporização, transições e instruções técnicas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'layers',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Precisa estruturar JSON. Premium: Claude Sonnet ($3), GPT-4.1 ($2). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), GPT-4.1 Mini ($0.40), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_storyboarder',
    label: 'Storyboarder',
    description: 'Cria descrições visuais detalhadas frame-a-frame para cada cena do vídeo',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'pen-tool',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Requer boa descrição visual. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_designer',
    label: 'Designer Visual',
    description: 'Gera imagens e assets visuais para cada cena do vídeo a partir dos prompts do storyboard',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'image',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Produz prompts e diretrizes visuais em JSON. Prefira modelos de texto fortes em estruturação e descrição visual.',
  },
  {
    key: 'video_compositor',
    label: 'Compositor de Vídeo',
    description: 'Monta a timeline final do vídeo com transições, efeitos e sincronização de cenas',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'video',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Monta timeline e estrutura técnica em JSON. Prefira modelos de texto confiáveis para planejamento e composição.',
  },
  {
    key: 'video_narrador',
    label: 'Narrador',
    description: 'Gera a narração/voice-over com entonação e timing sincronizado com as cenas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'mic',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Produz script de narração e marcações de timing em JSON. Prefira modelos de texto com boa escrita e consistência.',
  },
  {
    key: 'video_revisor',
    label: 'Revisor Final de Vídeo',
    description: 'Verifica qualidade, coerência e completude do pacote de produção antes da renderização',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Revisão de qualidade. Premium: Claude Sonnet ($3), GPT-4.1 ($2). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), GPT-4.1 Mini ($0.40), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free, Mistral Small:free.',
  },
  {
    key: 'video_clip_planner',
    label: 'Planejador de Clips',
    description: 'Subdivide cada cena em clips de vídeo sequenciais (~8s cada) com prompts de imagem detalhados para cada momento, mantendo continuidade visual',
    defaultModel: 'google/gemini-2.5-flash-preview',
    recommendedTier: 'balanced',
    icon: 'film',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Chamado uma vez por cena. Precisa gerar prompts visuais detalhados. Baratos e rápidos: Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), DeepSeek V3 ($0.27). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'video_image_generator',
    label: 'Gerador de Imagens',
    description: 'Gera imagens reais para cada cena do vídeo usando IA generativa (modalities: image)',
    defaultModel: 'google/gemini-2.5-flash-preview:image-output',
    recommendedTier: 'balanced',
    icon: 'image-plus',
    agentCategory: 'synthesis',
    requiredCapability: 'image',
    bestModelNote: 'Gera imagens reais. Gemini Flash Image (barato, rápido), Flux 1.1 Pro (qualidade premium, $0.03/imagem), Flux Schnell (rápido).',
  },
  {
    key: 'video_tts',
    label: 'Narrador TTS',
    description: 'Converte texto de narração em áudio real usando Text-to-Speech via OpenRouter',
    defaultModel: 'openai/tts-1-hd',
    recommendedTier: 'premium',
    icon: 'volume-2',
    agentCategory: 'synthesis',
    requiredCapability: 'audio',
    bestModelNote: 'TTS HD: qualidade premium ($0.015/1K chars). TTS Standard: rápido ($0.015/1K chars). Vozes: nova, alloy, echo, fable, onyx, shimmer.',
  },
]

/** Default TTS voice for video narration */
export const DEFAULT_VIDEO_TTS_VOICE = 'nova'

/** Map from video-pipeline agent key → model ID */
export type VideoPipelineModelMap = Record<string, string>

/** Default model map for the video pipeline. */
export function getDefaultVideoPipelineModelMap(): VideoPipelineModelMap {
  const map: VideoPipelineModelMap = {}
  for (const def of VIDEO_PIPELINE_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load video pipeline model configuration.
 * Returns saved overrides merged with defaults.
 */
export async function loadVideoPipelineModels(uid?: string): Promise<VideoPipelineModelMap> {
  return loadScopedModelMap('video_pipeline_models', VIDEO_PIPELINE_AGENT_DEFS, getDefaultVideoPipelineModelMap(), uid)
}

/**
 * Save video pipeline model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveVideoPipelineModels(models: VideoPipelineModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('video_pipeline_models', VIDEO_PIPELINE_AGENT_DEFS, getDefaultVideoPipelineModelMap(), models, uid)
}

/** Reset video pipeline models to defaults. */
export async function resetVideoPipelineModels(uid?: string): Promise<void> {
  await resetScopedModelMap('video_pipeline_models', uid)
}

// ── Audio Pipeline Agent Definitions ─────────────────────────────────────────

/**
 * Six-agent pipeline for comprehensive audio generation.
 *
 * Similar to the video pipeline, this trail guides production of professional
 * audio content (podcasts, narrations, audiobooks) from planning to final mix.
 *
 * Agent execution order:
 *  1. Planejador        — analyzes user options, creates production proposal with budget
 *  2. Roteirista        — writes the full audio script with narration, pauses, and cues
 *  3. Diretor de Áudio  — structures the script into segments with timing and transitions
 *  4. Produtor Sonoro   — generates sound design notes, music cues and ambient descriptions
 *  5. Narrador          — generates the actual audio/voice-over (requires audio capability)
 *  6. Revisor Final     — quality-checks the complete audio production package
 */
export const AUDIO_PIPELINE_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'audio_planejador',
    label: 'Planejador de Áudio',
    description: 'Analisa opções do usuário (formato, duração, estilo, tom) e cria proposta com estimativa de custos',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Premium: Claude Sonnet ($3), GPT-4o ($2.50), GPT-4.1 ($2), Gemini 2.5 Pro ($1.25). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, DeepSeek R1:free, Llama 3.3 70B:free.',
  },
  {
    key: 'audio_roteirista',
    label: 'Roteirista de Áudio',
    description: 'Escreve o roteiro completo com narração, pausas, entonações e indicações de produção',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Requer boa escrita. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Llama 4 Maverick ($0.19), Gemini 2.5 Flash ($0.15), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'audio_diretor',
    label: 'Diretor de Áudio',
    description: 'Estrutura o roteiro em segmentos com temporização, transições e marcações técnicas',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'layers',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Estruturação em JSON. Premium: Claude Sonnet ($3), GPT-4.1 ($2). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), GPT-4.1 Mini ($0.40), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'audio_produtor_sonoro',
    label: 'Produtor Sonoro',
    description: 'Cria notas de design sonoro, trilha musical, efeitos e descrições de ambientação',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'music',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Escrita criativa de descrições sonoras. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free.',
  },
  {
    key: 'audio_narrador',
    label: 'Narrador / TTS',
    description: 'Gera a narração de áudio real com entonações e pausas a partir do roteiro',
    defaultModel: 'openai/tts-1-hd',
    recommendedTier: 'premium',
    icon: 'mic',
    agentCategory: 'synthesis',
    requiredCapability: 'audio',
    bestModelNote: 'Use um modelo TTS real. Padrão recomendado: OpenAI TTS HD para síntese final do áudio.',
  },
  {
    key: 'audio_revisor',
    label: 'Revisor Final de Áudio',
    description: 'Verifica qualidade, coerência e completude do pacote de produção de áudio',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Revisão de qualidade. Premium: Claude Sonnet ($3), GPT-4.1 ($2). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), GPT-4.1 Mini ($0.40), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Mistral Small:free.',
  },
]

/** Map from audio-pipeline agent key → model ID */
export type AudioPipelineModelMap = Record<string, string>

/** Default model map for the audio pipeline. */
export function getDefaultAudioPipelineModelMap(): AudioPipelineModelMap {
  const map: AudioPipelineModelMap = {}
  for (const def of AUDIO_PIPELINE_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load audio pipeline model configuration.
 * Returns saved overrides merged with defaults.
 */
export async function loadAudioPipelineModels(uid?: string): Promise<AudioPipelineModelMap> {
  return loadScopedModelMap('audio_pipeline_models', AUDIO_PIPELINE_AGENT_DEFS, getDefaultAudioPipelineModelMap(), uid)
}

/**
 * Save audio pipeline model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveAudioPipelineModels(models: AudioPipelineModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('audio_pipeline_models', AUDIO_PIPELINE_AGENT_DEFS, getDefaultAudioPipelineModelMap(), models, uid)
}

/** Reset audio pipeline models to defaults. */
export async function resetAudioPipelineModels(uid?: string): Promise<void> {
  await resetScopedModelMap('audio_pipeline_models', uid)
}

// ── Presentation Pipeline Agent Definitions ──────────────────────────────────

/**
 * Six-agent pipeline for comprehensive presentation generation.
 *
 * Multi-agent trail for creating professional presentations with structured
 * content, visual design, and speaker notes.
 *
 * Agent execution order:
 *  1. Planejador         — analyzes topic, audience and creates outline with budget estimate
 *  2. Pesquisador        — gathers and organizes relevant content from sources
 *  3. Redator de Slides  — writes slide content, titles, bullet points and speaker notes
 *  4. Designer Visual    — creates visual layout, color schemes, chart specs and slide-by-slide image briefs
 *  5. Revisor Final      — quality-checks slides for consistency, flow and completeness
 *  6. Gerador de Imagens — materializes slide visuals with an image-capable model
 */
export const PRESENTATION_PIPELINE_AGENT_DEFS: AgentModelDef[] = [
  {
    key: 'pres_planejador',
    label: 'Planejador de Apresentação',
    description: 'Analisa tema, público-alvo e cria estrutura detalhada com estimativa de custos em tokens',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'clipboard-check',
    agentCategory: 'reasoning',
    requiredCapability: 'text',
    bestModelNote: 'Premium: Claude Sonnet ($3), GPT-4o ($2.50), GPT-4.1 ($2), Gemini 2.5 Pro ($1.25). Baratos: DeepSeek V3 ($0.27), Gemini 2.5 Flash ($0.15), GPT-4o Mini ($0.15), Llama 4 Maverick ($0.19), Qwen 2.5 72B ($0.13). Grátis: Gemini 2.0 Flash:free, DeepSeek R1:free, Llama 3.3 70B:free.',
  },
  {
    key: 'pres_pesquisador',
    label: 'Pesquisador de Conteúdo',
    description: 'Busca e organiza conteúdo relevante das fontes para a apresentação',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
    requiredCapability: 'text',
    bestModelNote: 'Modelo rápido. Premium: Claude Haiku ($0.80), GPT-4o Mini ($0.15). Baratos: Gemini 2.0 Flash ($0.10), GPT-4.1 Nano ($0.10), Mistral Small ($0.10), Llama 4 Scout ($0.17), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 4 Scout:free, Mistral Small:free, Qwen3 8B:free.',
  },
  {
    key: 'pres_redator',
    label: 'Redator de Slides',
    description: 'Escreve conteúdo dos slides com títulos, tópicos, dados e notas do apresentador',
    defaultModel: '',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
    requiredCapability: 'text',
    bestModelNote: 'Requer boa escrita. Premium: Claude Sonnet ($3), GPT-4.1 ($2), GPT-4o ($2.50). Baratos: DeepSeek V3 ($0.27), Llama 4 Maverick ($0.19), Gemini 2.5 Flash ($0.15), Qwen 2.5 72B ($0.13), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 3.3 70B:free, Qwen3 30B:free.',
  },
  {
    key: 'pres_designer',
    label: 'Designer de Apresentação',
    description: 'Cria o plano visual dos slides, com direção de layout, contraste e briefings específicos para cada imagem',
    defaultModel: '',
    recommendedTier: 'premium',
    icon: 'pen-tool',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Produz diretrizes visuais e especificações de layout em JSON. Prefira modelos de texto com boa estruturação de conteúdo.',
  },
  {
    key: 'pres_image_generator',
    label: 'Gerador de Imagens de Slides',
    description: 'Gera imagens reais para os slides a partir das diretrizes visuais aprovadas no pipeline',
    defaultModel: 'google/gemini-2.5-flash-preview:image-output',
    recommendedTier: 'balanced',
    icon: 'image-plus',
    agentCategory: 'synthesis',
    requiredCapability: 'image',
    bestModelNote: 'Gera imagens reais para os slides. Gemini Flash Image oferece boa relação custo/velocidade; Flux 1.1 Pro e Imagen atendem quando a qualidade visual é prioritária.',
  },
  {
    key: 'pres_revisor',
    label: 'Revisor de Apresentação',
    description: 'Verifica consistência, fluxo narrativo e completude de todos os slides',
    defaultModel: '',
    recommendedTier: 'fast',
    icon: 'clipboard-check',
    agentCategory: 'synthesis',
    requiredCapability: 'text',
    bestModelNote: 'Modelo rápido para revisão. Premium: Claude Haiku ($0.80), GPT-4o Mini ($0.15). Baratos: Gemini 2.0 Flash ($0.10), GPT-4.1 Nano ($0.10), Mistral Small ($0.10), Llama 4 Scout ($0.17), Llama 3.3 70B ($0.12). Grátis: Gemini 2.0 Flash:free, Llama 4 Scout:free, Mistral Small:free, Qwen3 30B:free.',
  },
]

/** Map from presentation-pipeline agent key → model ID */
export type PresentationPipelineModelMap = Record<string, string>

/** Default model map for the presentation pipeline. */
export function getDefaultPresentationPipelineModelMap(): PresentationPipelineModelMap {
  const map: PresentationPipelineModelMap = {}
  for (const def of PRESENTATION_PIPELINE_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/**
 * Load presentation pipeline model configuration.
 * Returns saved overrides merged with defaults.
 */
export async function loadPresentationPipelineModels(uid?: string): Promise<PresentationPipelineModelMap> {
  return loadScopedModelMap('presentation_pipeline_models', PRESENTATION_PIPELINE_AGENT_DEFS, getDefaultPresentationPipelineModelMap(), uid)
}

/**
 * Save presentation pipeline model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function savePresentationPipelineModels(models: PresentationPipelineModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('presentation_pipeline_models', PRESENTATION_PIPELINE_AGENT_DEFS, getDefaultPresentationPipelineModelMap(), models, uid)
}

/** Reset presentation pipeline models to defaults. */
export async function resetPresentationPipelineModels(uid?: string): Promise<void> {
  await resetScopedModelMap('presentation_pipeline_models', uid)
}

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

/** Map from document v3 agent key → model ID */
export type DocumentV3PipelineModelMap = Record<string, string>

/** Default model map for the v3 document pipeline. */
export function getDefaultDocumentV3ModelMap(): DocumentV3PipelineModelMap {
  const map: DocumentV3PipelineModelMap = {}
  for (const def of DOCUMENT_V3_PIPELINE_AGENT_DEFS) {
    map[def.key] = def.defaultModel
  }
  return map
}

/** Load v3 pipeline model configuration. */
export async function loadDocumentV3Models(uid?: string): Promise<DocumentV3PipelineModelMap> {
  return loadScopedModelMap('document_v3_models', DOCUMENT_V3_PIPELINE_AGENT_DEFS, getDefaultDocumentV3ModelMap(), uid)
}

/** Save v3 pipeline model configuration to Firestore. */
export async function saveDocumentV3Models(models: DocumentV3PipelineModelMap, uid?: string): Promise<void> {
  await saveScopedModelMap('document_v3_models', DOCUMENT_V3_PIPELINE_AGENT_DEFS, getDefaultDocumentV3ModelMap(), models, uid)
}

/** Reset v3 pipeline model configuration to defaults. */
export async function resetDocumentV3Models(uid?: string): Promise<void> {
  await resetScopedModelMap('document_v3_models', uid)
}

export const AGENT_CONFIG_DEFS: Record<ScopedModelSettingsKey, AgentModelDef[]> = {
  agent_models: PIPELINE_AGENT_DEFS,
  thesis_analyst_models: THESIS_ANALYST_AGENT_DEFS,
  context_detail_models: CONTEXT_DETAIL_AGENT_DEFS,
  acervo_classificador_models: ACERVO_CLASSIFICADOR_AGENT_DEFS,
  acervo_ementa_models: ACERVO_EMENTA_AGENT_DEFS,
  research_notebook_models: RESEARCH_NOTEBOOK_AGENT_DEFS,
  notebook_acervo_models: NOTEBOOK_ACERVO_AGENT_DEFS,
  video_pipeline_models: VIDEO_PIPELINE_AGENT_DEFS,
  audio_pipeline_models: AUDIO_PIPELINE_AGENT_DEFS,
  presentation_pipeline_models: PRESENTATION_PIPELINE_AGENT_DEFS,
  document_v3_models: DOCUMENT_V3_PIPELINE_AGENT_DEFS,
}

export async function validateScopedAgentModels(
  key: ScopedModelSettingsKey,
  models: Record<string, string>,
  uid?: string,
): Promise<void> {
  const resolvedUid = resolveScopedUid(uid)
  const userSettings = resolvedUid ? await ensureUserSettingsMigrated(resolvedUid) : {} as UserSettingsData
  const settingsRecord = userSettings as unknown as Record<string, unknown>
  const catalogEntries = buildCatalogEntries(settingsRecord)
  const catalogIds = buildCatalogIdSet(settingsRecord)
  validateModelIdsAgainstCatalog(AGENT_CONFIG_DEFS[key], models, catalogIds)
  validateModelCapabilitiesAgainstDefs(AGENT_CONFIG_DEFS[key], models, catalogEntries)
}

// ── Fallback Priorities (per agent category) ──────────────────────────────────

/**
 * Re-export so consumers can import from a single module.
 */
export type { FallbackPriorityConfig, FallbackPriorityList } from './firestore-types'

/** All four agent categories that get an independent fallback priority list. */
export const FALLBACK_AGENT_CATEGORIES: ReadonlyArray<AgentCategory> = [
  'extraction',
  'synthesis',
  'reasoning',
  'writing',
]

/**
 * Number of priority slots a user can configure per category. The platform
 * walks them in order (slot 0 → 1 → 2) when a primary model fails.
 */
export const FALLBACK_PRIORITY_SLOTS = 3

/**
 * Empty-priority sentinel: a fallback list with three blank slots. Saved
 * settings are sparse — missing categories effectively mean "no fallback
 * configured". The platform never silently injects a non-user-chosen model.
 */
export function getEmptyFallbackPriorityList(): FallbackPriorityList {
  return ['', '', '']
}

/** Default config: every category empty (no fallbacks configured). */
export function getDefaultFallbackPriorityConfig(): FallbackPriorityConfig {
  return {
    extraction: getEmptyFallbackPriorityList(),
    synthesis: getEmptyFallbackPriorityList(),
    reasoning: getEmptyFallbackPriorityList(),
    writing: getEmptyFallbackPriorityList(),
  }
}

/**
 * Normalize a stored priority list, ensuring it always has exactly
 * `FALLBACK_PRIORITY_SLOTS` entries (padding with blanks if shorter and
 * truncating if longer). Non-string entries are coerced to ''.
 */
function normalizePriorityList(raw: unknown): FallbackPriorityList {
  const list = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (let i = 0; i < FALLBACK_PRIORITY_SLOTS; i++) {
    const value = list[i]
    out.push(typeof value === 'string' ? value : '')
  }
  return out as FallbackPriorityList
}

/**
 * Load the user's fallback-priority config, merged with defaults so every
 * category always has a (possibly empty) list. Returns blanks when running
 * outside Firebase mode or when the document does not exist.
 */
export async function loadFallbackPriorityConfig(uid?: string): Promise<FallbackPriorityConfig> {
  const defaults = getDefaultFallbackPriorityConfig()
  if (!IS_FIREBASE) return defaults

  try {
    const resolvedUid = resolveScopedUid(uid)
    const userSettings = resolvedUid ? await ensureUserSettingsMigrated(resolvedUid) : {} as UserSettingsData
    const saved = userSettings.fallback_priorities ?? {}
    const result: FallbackPriorityConfig = {}
    for (const category of FALLBACK_AGENT_CATEGORIES) {
      result[category] = normalizePriorityList(saved[category])
    }
    return result
  } catch {
    return defaults
  }
}

/**
 * Persist the user's fallback-priority config. Validates every non-empty
 * model ID against the user's personal catalog so the user cannot save a
 * model that no longer exists.
 */
export async function saveFallbackPriorityConfig(
  config: FallbackPriorityConfig,
  uid?: string,
): Promise<void> {
  if (!IS_FIREBASE) return

  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) throw new Error('Usuário não autenticado.')

  const userSettings = await ensureUserSettingsMigrated(resolvedUid)
  const settingsRecord = userSettings as unknown as Record<string, unknown>
  const catalogIds = buildCatalogIdSet(settingsRecord)

  const sanitized: FallbackPriorityConfig = {}
  for (const category of FALLBACK_AGENT_CATEGORIES) {
    const list = normalizePriorityList(config[category])
    for (const modelId of list) {
      if (!modelId) continue
      if (!catalogIds.has(modelId)) {
        throw new Error(
          `O modelo "${modelId}" não está no catálogo pessoal do usuário e não pode ser usado como fallback de ${category}.`,
        )
      }
    }
    sanitized[category] = list
  }

  await saveUserSettings(
    resolvedUid,
    { fallback_priorities: sanitized } as Partial<UserSettingsData>,
  )
}

/** Clear all fallback priorities for the current user. */
export async function resetFallbackPriorityConfig(uid?: string): Promise<void> {
  if (!IS_FIREBASE) return
  const resolvedUid = resolveScopedUid(uid)
  if (!resolvedUid) throw new Error('Usuário não autenticado.')
  await saveUserSettings(
    resolvedUid,
    { fallback_priorities: getDefaultFallbackPriorityConfig() } as Partial<UserSettingsData>,
  )
}

/**
 * Resolve the ordered fallback model list to pass to `callLLMWithFallback`
 * for a given agent. The list is built from the user's category-specific
 * priorities, with the currently failing primary model removed (so the
 * platform never silently re-tries the same model that just failed and
 * never injects a model the user did not pick).
 */
export function resolveFallbackModelsForCategory(
  primaryModel: string,
  category: AgentCategory | undefined,
  config: FallbackPriorityConfig | undefined | null,
): string[] {
  if (!category || !config) return []
  const list = config[category]
  if (!list) return []

  const out: string[] = []
  for (const candidate of list) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (!trimmed) continue
    if (trimmed === primaryModel) continue
    if (out.includes(trimmed)) continue
    out.push(trimmed)
  }
  return out
}
