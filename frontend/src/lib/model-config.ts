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
    agentCategory: 'extraction',
  },
  {
    key: 'acervo_buscador',
    label: 'Buscador de Acervo',
    description: 'Busca documentos similares no acervo do usuário para reutilização',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'library',
    agentCategory: 'extraction',
  },
  {
    key: 'acervo_compilador',
    label: 'Compilador de Base',
    description: 'Compila documentos do acervo em um documento base unificado',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'layers',
    agentCategory: 'synthesis',
  },
  {
    key: 'acervo_revisor',
    label: 'Revisor de Base',
    description: 'Revisa o documento base compilado para coerência e completude',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'scan-search',
    agentCategory: 'synthesis',
  },
  {
    key: 'pesquisador',
    label: 'Pesquisador',
    description: 'Pesquisa legislação, jurisprudência e doutrina aplicáveis',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'book-open',
    agentCategory: 'reasoning',
  },
  {
    key: 'jurista',
    label: 'Jurista',
    description: 'Desenvolve teses jurídicas robustas e fundamentadas',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'scale',
    agentCategory: 'reasoning',
  },
  {
    key: 'advogado_diabo',
    label: 'Advogado do Diabo',
    description: 'Critica e identifica fraquezas nos argumentos',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'shield',
    agentCategory: 'reasoning',
  },
  {
    key: 'jurista_v2',
    label: 'Jurista (revisão)',
    description: 'Refina teses incorporando as críticas válidas',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'refresh-cw',
    agentCategory: 'reasoning',
  },
  {
    key: 'fact_checker',
    label: 'Fact-Checker',
    description: 'Verifica citações legais e corrige imprecisões',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'clipboard-check',
    agentCategory: 'extraction',
  },
  {
    key: 'moderador',
    label: 'Moderador',
    description: 'Planeja a estrutura e organização do documento final',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'scale',
    agentCategory: 'synthesis',
  },
  {
    key: 'redator',
    label: 'Redator',
    description: 'Redige o documento completo seguindo o plano definido',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
  },
]

// ── Types ─────────────────────────────────────────────────────────────────────

/** Map from agent key → model ID */
export type AgentModelMap = Record<string, string>

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Set of hardcoded model IDs for fast lookup. */
const AVAILABLE_MODEL_IDS = new Set(AVAILABLE_MODELS.map(m => m.id))

/**
 * Build a Set of valid model IDs from both the hardcoded catalog AND
 * the dynamic Firestore catalog (settings.model_catalog).
 *
 * This ensures that models added via "Adicionar do OpenRouter" are
 * recognized when loading agent configs, not just the hardcoded defaults.
 */
function buildCatalogIdSet(settings: Record<string, unknown>): Set<string> {
  const ids = new Set(AVAILABLE_MODEL_IDS)
  const dynamicCatalog = settings.model_catalog
  if (Array.isArray(dynamicCatalog)) {
    for (const m of dynamicCatalog) {
      if (m && typeof m === 'object' && typeof (m as { id?: string }).id === 'string') {
        ids.add((m as { id: string }).id)
      }
    }
  }
  return ids
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
export async function loadAgentModels(): Promise<AgentModelMap> {
  const defaults = getDefaultModelMap()

  if (!IS_FIREBASE) return defaults

  try {
    const settings = await getSettings()
    const catalogIds = buildCatalogIdSet(settings)
    const saved = (settings.agent_models ?? {}) as Record<string, string>
    // Merge saved over defaults, but only for known agents with valid model IDs
    for (const def of PIPELINE_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string' && catalogIds.has(saved[def.key])) {
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
    agentCategory: 'extraction',
  },
  {
    key: 'thesis_analista',
    label: 'Analista de Redundâncias',
    description: 'Analisa profundamente cada grupo, identificando duplicatas, complementares e contradições',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'scale',
    agentCategory: 'reasoning',
  },
  {
    key: 'thesis_compilador',
    label: 'Compilador',
    description: 'Redige a versão compilada de cada grupo a mesclar, preservando todos os argumentos únicos',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'refresh-cw',
    agentCategory: 'synthesis',
  },
  {
    key: 'thesis_curador',
    label: 'Curador de Lacunas',
    description: 'Extrai novas teses de documentos ainda não analisados, focando em lacunas temáticas',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'book-open',
    agentCategory: 'synthesis',
  },
  {
    key: 'thesis_revisor',
    label: 'Revisor Final',
    description: 'Revisa, prioriza e anota todas as sugestões produzidas pelos agentes anteriores',
    defaultModel: 'anthropic/claude-sonnet-4',
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
export async function loadThesisAnalystModels(): Promise<ThesisAnalystModelMap> {
  const defaults = getDefaultThesisAnalystModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const catalogIds = buildCatalogIdSet(settings)
    const saved = (settings.thesis_analyst_models ?? {}) as Record<string, string>
    for (const def of THESIS_ANALYST_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string' && catalogIds.has(saved[def.key])) {
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
export async function loadContextDetailModels(): Promise<ContextDetailModelMap> {
  const defaults = getDefaultContextDetailModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const catalogIds = buildCatalogIdSet(settings)
    const saved = (settings.context_detail_models ?? {}) as Record<string, string>
    for (const def of CONTEXT_DETAIL_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string' && catalogIds.has(saved[def.key])) {
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
export async function loadAcervoClassificadorModels(): Promise<AcervoClassificadorModelMap> {
  const defaults = getDefaultAcervoClassificadorModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const catalogIds = buildCatalogIdSet(settings)
    const saved = (settings.acervo_classificador_models ?? {}) as Record<string, string>
    for (const def of ACERVO_CLASSIFICADOR_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string' && catalogIds.has(saved[def.key])) {
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
export async function loadAcervoEmentaModels(): Promise<AcervoEmentaModelMap> {
  const defaults = getDefaultAcervoEmentaModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const catalogIds = buildCatalogIdSet(settings)
    const saved = (settings.acervo_ementa_models ?? {}) as Record<string, string>
    for (const def of ACERVO_EMENTA_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string' && catalogIds.has(saved[def.key])) {
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
 */
export const RESEARCH_NOTEBOOK_AGENT_DEFS: AgentModelDef[] = [
  // ── Pesquisa & Análise ──
  {
    key: 'notebook_pesquisador',
    label: 'Pesquisador de Fontes',
    description: 'Busca e indexa conteúdo relevante nas fontes do caderno e no acervo',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'notebook_analista',
    label: 'Analista de Conhecimento',
    description: 'Analisa, cruza referências e sintetiza descobertas sobre o tema',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'brain',
    agentCategory: 'reasoning',
  },
  {
    key: 'notebook_assistente',
    label: 'Assistente Conversacional',
    description: 'Responde perguntas do usuário com base no conhecimento indexado',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'message-circle',
    agentCategory: 'reasoning',
  },
  // ── Estúdio de Criação ──
  {
    key: 'studio_pesquisador',
    label: 'Pesquisador do Estúdio',
    description: 'Extrai e organiza dados relevantes das fontes para o artefato solicitado',
    defaultModel: 'meta-llama/llama-4-scout:free',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'studio_escritor',
    label: 'Escritor',
    description: 'Redige conteúdo textual: resumos, relatórios, documentos, cartões e testes',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    recommendedTier: 'balanced',
    icon: 'file-text',
    agentCategory: 'writing',
  },
  {
    key: 'studio_roteirista',
    label: 'Roteirista',
    description: 'Cria roteiros profissionais com narração, timing e notas de produção para áudio e vídeo',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    recommendedTier: 'balanced',
    icon: 'mic',
    agentCategory: 'writing',
  },
  {
    key: 'studio_visual',
    label: 'Designer Visual',
    description: 'Estrutura apresentações, mapas mentais, infográficos e tabelas com layout profissional',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    recommendedTier: 'balanced',
    icon: 'pen-tool',
    agentCategory: 'synthesis',
  },
  {
    key: 'studio_revisor',
    label: 'Revisor de Qualidade',
    description: 'Revisa, aprimora e garante excelência em qualquer artefato antes da entrega final',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    recommendedTier: 'balanced',
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
export async function loadResearchNotebookModels(): Promise<ResearchNotebookModelMap> {
  const defaults = getDefaultResearchNotebookModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const catalogIds = buildCatalogIdSet(settings)
    const saved = (settings.research_notebook_models ?? {}) as Record<string, string>
    for (const def of RESEARCH_NOTEBOOK_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string' && catalogIds.has(saved[def.key])) {
        defaults[def.key] = saved[def.key]
      }
    }
  } catch {
    // Fall back to defaults silently
  }
  return defaults
}

/**
 * Save research notebook model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveResearchNotebookModels(models: ResearchNotebookModelMap): Promise<void> {
  if (!IS_FIREBASE) return
  const defaults = getDefaultResearchNotebookModelMap()
  const overrides: ResearchNotebookModelMap = {}
  for (const def of RESEARCH_NOTEBOOK_AGENT_DEFS) {
    const model = models[def.key]
    if (model && model !== defaults[def.key]) {
      overrides[def.key] = model
    }
  }
  await saveSettings({ research_notebook_models: overrides })
}

/** Reset research notebook models to defaults. */
export async function resetResearchNotebookModels(): Promise<void> {
  if (!IS_FIREBASE) return
  await saveSettings({ research_notebook_models: {} })
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
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'search',
    agentCategory: 'extraction',
  },
  {
    key: 'nb_acervo_buscador',
    label: 'Buscador de Acervo',
    description: 'Busca e classifica documentos do acervo por relevância ao tema do caderno',
    defaultModel: 'anthropic/claude-3.5-haiku',
    recommendedTier: 'fast',
    icon: 'library',
    agentCategory: 'extraction',
  },
  {
    key: 'nb_acervo_analista',
    label: 'Analista de Acervo',
    description: 'Analisa em profundidade os documentos selecionados, avaliando relevância e conteúdo',
    defaultModel: 'anthropic/claude-sonnet-4',
    recommendedTier: 'balanced',
    icon: 'scale',
    agentCategory: 'reasoning',
  },
  {
    key: 'nb_acervo_curador',
    label: 'Curador de Fontes',
    description: 'Faz curadoria final dos documentos e recomenda fontes para o caderno',
    defaultModel: 'anthropic/claude-sonnet-4',
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
export async function loadNotebookAcervoModels(): Promise<NotebookAcervoModelMap> {
  const defaults = getDefaultNotebookAcervoModelMap()
  if (!IS_FIREBASE) return defaults
  try {
    const settings = await getSettings()
    const catalogIds = buildCatalogIdSet(settings)
    const saved = (settings.notebook_acervo_models ?? {}) as Record<string, string>
    for (const def of NOTEBOOK_ACERVO_AGENT_DEFS) {
      if (saved[def.key] && typeof saved[def.key] === 'string' && catalogIds.has(saved[def.key])) {
        defaults[def.key] = saved[def.key]
      }
    }
  } catch {
    // Fall back to defaults silently
  }
  return defaults
}

/**
 * Save notebook acervo analyzer model configuration to Firestore.
 * Only stores non-default values to keep data minimal.
 */
export async function saveNotebookAcervoModels(models: NotebookAcervoModelMap): Promise<void> {
  if (!IS_FIREBASE) return
  const defaults = getDefaultNotebookAcervoModelMap()
  const overrides: NotebookAcervoModelMap = {}
  for (const def of NOTEBOOK_ACERVO_AGENT_DEFS) {
    const model = models[def.key]
    if (model && model !== defaults[def.key]) {
      overrides[def.key] = model
    }
  }
  await saveSettings({ notebook_acervo_models: overrides })
}

/** Reset notebook acervo analyzer models to defaults. */
export async function resetNotebookAcervoModels(): Promise<void> {
  if (!IS_FIREBASE) return
  await saveSettings({ notebook_acervo_models: {} })
}
