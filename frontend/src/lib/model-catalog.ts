/**
 * Model Catalog — manages the master list of available models for the platform.
 *
 * The catalog is stored in Firestore at /settings/platform.model_catalog.
 * On first use, it defaults to AVAILABLE_MODELS from model-config.ts.
 *
 * Components listen for CATALOG_UPDATED_EVENT to refresh when catalog changes.
 * A module-level cache avoids redundant Firestore reads.
 */

import { useState, useEffect } from 'react'
import { IS_FIREBASE } from './firebase'
import { getSettings, saveSettings } from './firestore-service'
import { AVAILABLE_MODELS, type ModelOption, type ModelCapability, type AgentFitScores, type AgentCategory } from './model-config'

// ── Event bus ─────────────────────────────────────────────────────────────────

export const CATALOG_UPDATED_EVENT = 'lexio:catalog_updated'

/** In-memory cache — avoids redundant Firestore reads across components */
let catalogCache: ModelOption[] | null = null

export function emitCatalogUpdated(updated?: ModelOption[]): void {
  if (updated) catalogCache = updated
  window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT))
}

// ── Firestore CRUD ────────────────────────────────────────────────────────────

/**
 * Load the model catalog.
 * Returns catalog from Firestore (or in-memory cache) falling back to AVAILABLE_MODELS.
 */
export async function loadModelCatalog(): Promise<ModelOption[]> {
  if (catalogCache) return catalogCache

  if (IS_FIREBASE) {
    try {
      const settings = await getSettings()
      const saved = settings.model_catalog as ModelOption[] | undefined
      if (Array.isArray(saved) && saved.length > 0) {
        const validated = normalizeModelCatalog(saved)

        // Detect old 1–5 scale data: if no model has any score > 5, the catalog
        // was saved before the 1–10 scale was introduced — reset to fresh defaults.
        const maxScore = validated.reduce(
          (max, m) => Math.max(
            max,
            m.agentFit.extraction, m.agentFit.synthesis,
            m.agentFit.reasoning,  m.agentFit.writing,
          ),
          0,
        )
        if (maxScore > 5) {
          catalogCache = validated
          return validated
        }
        // Old scale detected — fall through to AVAILABLE_MODELS defaults below
      }
    } catch {
      // Fall through to defaults
    }
  }

  catalogCache = normalizeModelCatalog(AVAILABLE_MODELS)
  return catalogCache
}

/**
 * Persist catalog to Firestore and notify all listeners.
 */
export async function saveModelCatalog(models: ModelOption[]): Promise<void> {
  const normalized = normalizeModelCatalog(models)
  catalogCache = normalized
  if (IS_FIREBASE) {
    await saveSettings({ model_catalog: normalized })
  }
  emitCatalogUpdated(normalized)
}

/** Invalidate the in-memory cache (forces next loadModelCatalog to hit Firestore). */
export function invalidateCatalogCache(): void {
  catalogCache = null
}

// ── React hook ────────────────────────────────────────────────────────────────

/**
 * Returns the current model catalog.
 * Subscribes to CATALOG_UPDATED_EVENT so the component re-renders on changes.
 */
export function useCatalogModels(): ModelOption[] {
  const [models, setModels] = useState<ModelOption[]>(() => catalogCache ?? normalizeModelCatalog(AVAILABLE_MODELS))

  useEffect(() => {
    // Load from Firestore on mount
    loadModelCatalog().then(setModels).catch(() => {})

    // Refresh when catalog changes (e.g., ModelCatalogCard saved)
    const handler = () => {
      if (catalogCache) setModels(catalogCache)
      else loadModelCatalog().then(setModels).catch(() => {})
    }
    window.addEventListener(CATALOG_UPDATED_EVENT, handler)
    return () => window.removeEventListener(CATALOG_UPDATED_EVENT, handler)
  }, [])

  return models
}

// ── OpenRouter API ────────────────────────────────────────────────────────────

export interface OpenRouterModel {
  id: string
  name?: string
  description?: string
  context_length?: number
  pricing?: {
    prompt?: string
    completion?: string
  }
  architecture?: {
    modality?: string
    tokenizer?: string
  }
  top_provider?: {
    context_length?: number
  }
}

/** Fetch all available models from the OpenRouter API. */
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'HTTP-Referer': window.location.origin, 'X-Title': 'Lexio Admin' },
  })
  if (!res.ok) throw new Error(`Erro na API do OpenRouter (${res.status})`)
  const json = await res.json() as { data?: OpenRouterModel[] }
  return json.data ?? []
}

// ── Inference helpers ─────────────────────────────────────────────────────────

const PROVIDER_MAP: Record<string, string> = {
  'anthropic':    'Anthropic',
  'google':       'Google',
  'openai':       'OpenAI',
  'deepseek':     'DeepSeek',
  'meta-llama':   'Meta',
  'mistralai':    'Mistral',
  'qwen':         'Qwen',
  'x-ai':         'xAI',
  'cohere':       'Cohere',
  'microsoft':    'Microsoft',
  'perplexity':   'Perplexity',
  'amazon':       'Amazon',
  'nvidia':       'NVIDIA',
  'nousresearch': 'Nous',
  'ai21':         'AI21',
  'together':     'Together',
  'huggingfaceh4':'HuggingFace',
}

export function inferProviderFromId(modelId: string): string {
  const prefix = modelId.split('/')[0]
  return PROVIDER_MAP[prefix] ?? (prefix.charAt(0).toUpperCase() + prefix.slice(1))
}

export function inferTier(id: string, name = ''): 'fast' | 'balanced' | 'premium' {
  const s = (id + ' ' + name).toLowerCase()
  if (/\bmini\b|nano|lite|\bflash\b|haiku|small|swift|turbo|tiny/.test(s)) return 'fast'
  if (/\br1\b|\br2\b|\bo3\b|\bo4\b|thinking|reason|opus|ultra|plus|\blarge\b/.test(s)) return 'premium'
  return 'balanced'
}

export function inferFitScores(tier: 'fast' | 'balanced' | 'premium', id: string): AgentFitScores {
  // 1-10 absolute global scale: 10=best-in-class, 7-9=excellent, 5-6=adequate, 3-4=weak
  const isReasoning = /\br1\b|\br2\b|\bo3\b|\bo4\b|think|reason/.test(id.toLowerCase())
  if (isReasoning) return { extraction: 3, synthesis: 6, reasoning: 9, writing: 6 }
  switch (tier) {
    case 'fast':    return { extraction: 8, synthesis: 5, reasoning: 4, writing: 5 }
    case 'premium': return { extraction: 6, synthesis: 9, reasoning: 9, writing: 9 }
    default:        return { extraction: 7, synthesis: 7, reasoning: 7, writing: 7 }
  }
}

/**
 * Infer model capabilities from OpenRouter architecture.modality string.
 * Common modality values: "text->text", "text+image->text", "text->image", "text->audio", etc.
 *
 * Note: This checks for modality keywords anywhere in the string (both input and output sides).
 * A model with "image->text" (accepts images, outputs text) will be tagged with both 'image' and 'text'.
 * This is intentional: models that understand a modality as input are useful for agents working with that modality.
 */
export function inferCapabilities(modality?: string): ModelCapability[] {
  if (!modality) return ['text']
  const m = modality.toLowerCase()
  const caps: ModelCapability[] = []
  // Input/output modalities separated by '->'
  // e.g. "text+image->text" means input: text+image, output: text
  // e.g. "text->image" means generates images
  // e.g. "text->audio" means generates audio
  if (m.includes('text'))  caps.push('text')
  if (m.includes('image')) caps.push('image')
  if (m.includes('audio')) caps.push('audio')
  if (m.includes('video')) caps.push('video')
  return caps.length > 0 ? caps : ['text']
}

function inferCapabilitiesFromMetadata(model: Pick<ModelOption, 'id' | 'label' | 'description'>): ModelCapability[] {
  const haystack = `${model.id} ${model.label} ${model.description}`.toLowerCase()
  const caps: ModelCapability[] = []
  const add = (cap: ModelCapability) => {
    if (!caps.includes(cap)) caps.push(cap)
  }

  if (/\b(dall[- ]?e|flux|sdxl|stable diffusion|midjourney|imagen|ideogram|recraft|seedream|gpt-image|image generation|gera(?:dor|cao) de imagem)\b/.test(haystack)) {
    add('image')
  }
  if (/\b(tts|text-to-speech|speech|voice|elevenlabs|audio generation|gera(?:dor|cao) de audio)\b/.test(haystack)) {
    add('audio')
  }
  if (/\b(sora|veo|runway|pika|kling|hailuo|ltx-video|video generation|gera(?:dor|cao) de video)\b/.test(haystack)) {
    add('video')
  }

  if (caps.length === 0) add('text')
  return caps
}

function normalizeModelCatalog(models: ModelOption[]): ModelOption[] {
  return models.map(model => ({
    ...model,
    agentFit: model.agentFit ?? inferFitScores(model.tier ?? 'balanced', model.id),
    capabilities: model.capabilities && model.capabilities.length > 0
      ? [...new Set(model.capabilities)]
      : inferCapabilitiesFromMetadata(model),
  }))
}

/** Convert an OpenRouter API model response to our ModelOption format. */
export function openRouterToModelOption(or: OpenRouterModel): ModelOption {
  const id = or.id
  // Strip "Provider: " prefix that OR adds to names
  const rawLabel = (or.name ?? id).replace(/^[^:]+:\s*/, '').trim()
  const label = rawLabel || id.split('/').pop() || id
  const provider = inferProviderFromId(id)
  const inputCost = parseFloat(or.pricing?.prompt ?? '0') * 1_000_000
  const outputCost = parseFloat(or.pricing?.completion ?? '0') * 1_000_000
  const isFree = inputCost === 0 && outputCost === 0
  const tier = inferTier(id, label)
  const agentFit = inferFitScores(tier, id)
  const desc = (or.description ?? '').replace(/<[^>]+>/g, '').slice(0, 120)

  return {
    id,
    label,
    provider,
    tier,
    description: desc || `Modelo ${provider} via OpenRouter`,
    contextWindow: or.context_length ?? or.top_provider?.context_length ?? 128_000,
    inputCost,
    outputCost,
    isFree,
    agentFit,
    capabilities: inferCapabilities(or.architecture?.modality),
  }
}

// ── Best-agent recommendation ─────────────────────────────────────────────────

const CATEGORY_AGENTS: Record<AgentCategory, string[]> = {
  extraction: ['Triagem', 'Buscador', 'Fact-Checker', 'Catalogador'],
  synthesis:  ['Compilador', 'Revisor', 'Moderador', 'Curador'],
  reasoning:  ['Pesquisador', 'Jurista', 'Adv. do Diabo', 'Jurista v2', 'Analista'],
  writing:    ['Redator'],
}

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  extraction: 'Extração',
  synthesis:  'Síntese',
  reasoning:  'Raciocínio',
  writing:    'Redação',
}

const CATEGORY_WHY: Record<AgentCategory, string> = {
  extraction: 'Rápido e preciso para extrair informações estruturadas',
  synthesis:  'Excelente para compilar e revisar documentos complexos',
  reasoning:  'Raciocínio jurídico profundo e argumentação elaborada',
  writing:    'Redação fluente de documentos jurídicos longos',
}

export function getBestAgentInfo(agentFit: AgentFitScores): {
  topCategory: AgentCategory
  categoryLabel: string
  agents: string[]
  why: string
} {
  const entries = (Object.entries(agentFit) as [AgentCategory, number][])
    .sort(([, a], [, b]) => b - a)
  const topCategory = entries[0][0]
  return {
    topCategory,
    categoryLabel: CATEGORY_LABELS[topCategory],
    agents: CATEGORY_AGENTS[topCategory],
    why: CATEGORY_WHY[topCategory],
  }
}
