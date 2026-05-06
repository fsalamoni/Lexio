/**
 * Model Catalog — manages the master list of available models for the platform.
 *
 * The catalog is stored in the authenticated user's Firestore settings.
 * On first use, the user's personal catalog is seeded from AVAILABLE_MODELS
 * and persisted immediately into that user's own Firestore settings.
 *
 * Components listen for CATALOG_UPDATED_EVENT to refresh when catalog changes.
 * A module-level cache avoids redundant Firestore reads.
 */

import { useState, useEffect } from 'react'
import { IS_FIREBASE } from './firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from './firestore-service'
import { AVAILABLE_MODELS, FREE_TIER_RATE_LIMITS, type ModelOption, type ModelCapability, type AgentFitScores, type AgentCategory } from './model-config'
import type { UserSettingsData } from './firestore-types'

// ── Event bus ─────────────────────────────────────────────────────────────────

export const CATALOG_UPDATED_EVENT = 'lexio:catalog_updated'

/** In-memory cache — avoids redundant Firestore reads across components */
const catalogCache = new Map<string, ModelOption[]>()
const OPENROUTER_REFERER = typeof window !== 'undefined' && window.location?.origin
  ? window.location.origin
  : 'https://lexio.web.app'

function getCatalogCacheKey(uid?: string): string {
  return uid ?? getCurrentUserId() ?? 'anonymous'
}

function getSeedCatalog(): ModelOption[] {
  return normalizeModelCatalog(AVAILABLE_MODELS)
}

export function emitCatalogUpdated(updated?: ModelOption[], uid?: string): void {
  if (updated) catalogCache.set(getCatalogCacheKey(uid), updated)
  window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT))
}

// ── Firestore CRUD ────────────────────────────────────────────────────────────

/**
 * Load the model catalog.
 * Returns catalog from Firestore (or in-memory cache), seeding the user's
 * personal catalog in Firestore on first use when necessary.
 */
export async function loadModelCatalog(uid?: string): Promise<ModelOption[]> {
  const cacheKey = getCatalogCacheKey(uid)
  const cached = catalogCache.get(cacheKey)
  if (cached) return cached

  const resolvedUid = uid ?? getCurrentUserId() ?? undefined
  const seededCatalog = getSeedCatalog()

  if (IS_FIREBASE) {
    try {
      const userSettings = resolvedUid ? await ensureUserSettingsMigrated(resolvedUid) : {} as UserSettingsData
      const saved = userSettings.model_catalog as ModelOption[] | undefined
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
          catalogCache.set(cacheKey, validated)
          return validated
        }
        // Old scale detected — reseed the personal catalog below.
      }
    } catch {
      // Fall through to seeded defaults.
    }
  }

  catalogCache.set(cacheKey, seededCatalog)

  if (IS_FIREBASE && resolvedUid) {
    await saveUserSettings(resolvedUid, { model_catalog: seededCatalog } as UserSettingsData)
  }

  return seededCatalog
}

/**
 * Persist catalog to Firestore and notify all listeners.
 */
export async function saveModelCatalog(models: ModelOption[], uid?: string): Promise<void> {
  if (models.length === 0) {
    throw new Error('O catálogo pessoal deve conter pelo menos um modelo.')
  }

  const normalized = normalizeModelCatalog(models)
  const resolvedUid = uid ?? getCurrentUserId() ?? undefined
  catalogCache.set(getCatalogCacheKey(resolvedUid), normalized)
  if (IS_FIREBASE) {
    if (!resolvedUid) throw new Error('Usuário não autenticado.')
    await saveUserSettings(resolvedUid, { model_catalog: normalized } as UserSettingsData)
  }
  emitCatalogUpdated(normalized, resolvedUid)
}

/** Invalidate the in-memory cache (forces next loadModelCatalog to hit Firestore). */
export function invalidateCatalogCache(uid?: string): void {
  catalogCache.delete(getCatalogCacheKey(uid))
}

// ── React hook ────────────────────────────────────────────────────────────────

/**
 * Returns the current model catalog.
 * Subscribes to CATALOG_UPDATED_EVENT so the component re-renders on changes.
 */
export function useCatalogModels(): ModelOption[] {
  const cacheKey = getCatalogCacheKey()
  const [models, setModels] = useState<ModelOption[]>(() => catalogCache.get(cacheKey) ?? [])

  useEffect(() => {
    // Load from Firestore on mount
    loadModelCatalog().then(setModels).catch((err) => {
      console.warn('Failed to load model catalog on mount:', err)
    })

    // Refresh when catalog changes (e.g., ModelCatalogCard saved)
    const handler = () => {
      const current = catalogCache.get(getCatalogCacheKey())
      if (current) setModels(current)
      else loadModelCatalog().then(setModels).catch((err) => {
        console.warn('Failed to refresh model catalog:', err)
      })
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
    headers: { 'HTTP-Referer': OPENROUTER_REFERER, 'X-Title': 'Lexio Admin' },
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
  const rateLimits = isFree
    ? { ...FREE_TIER_RATE_LIMITS, note: 'Limite oficial do plano gratuito OpenRouter.' }
    : undefined
  const tier = inferTier(id, label)
  const agentFit = inferFitScores(tier, id)
  const desc = (or.description ?? '').replace(/<[^>]+>/g, '').slice(0, 120)

  return {
    id,
    label,
    provider,
    providerId: 'openrouter',
    tier,
    description: desc || `Modelo ${provider} via OpenRouter`,
    contextWindow: or.context_length ?? or.top_provider?.context_length ?? 128_000,
    inputCost,
    outputCost,
    isFree,
    rateLimits,
    agentFit,
    capabilities: inferCapabilities(or.architecture?.modality),
  }
}

// ── Per-provider catalog fetcher ──────────────────────────────────────────────

import { PROVIDERS, type ProviderId, type ProviderDefinition } from './providers'

interface RawProviderModel {
  id: string
  name?: string
  display_name?: string
  description?: string
  context_length?: number
  context_window?: number
  pricing?: { prompt?: string; completion?: string; input?: string; output?: string }
  capabilities?: string[]
}

/** Convert a static or fetched provider entry into a normalized ModelOption. */
export function providerEntryToModelOption(
  provider: ProviderDefinition,
  raw: RawProviderModel | { id: string; label?: string; description?: string; contextWindow?: number; inputCost?: number; outputCost?: number; isFree?: boolean; tier?: 'fast' | 'balanced' | 'premium'; capabilities?: ModelCapability[] },
): ModelOption {
  const id = raw.id
  const labelSource = (raw as RawProviderModel).display_name
    ?? (raw as RawProviderModel).name
    ?? (raw as { label?: string }).label
    ?? id
  const label = labelSource.replace(/^[^:]+:\s*/, '').trim() || id
  const tier = (raw as { tier?: 'fast' | 'balanced' | 'premium' }).tier ?? inferTier(id, label)
  const inputCostRaw = (raw as RawProviderModel).pricing?.prompt
    ?? (raw as RawProviderModel).pricing?.input
  const outputCostRaw = (raw as RawProviderModel).pricing?.completion
    ?? (raw as RawProviderModel).pricing?.output
  const hasInputCostNumber = typeof (raw as { inputCost?: number }).inputCost === 'number'
  const hasOutputCostNumber = typeof (raw as { outputCost?: number }).outputCost === 'number'
  const hasInputCostRaw = typeof inputCostRaw === 'string' && inputCostRaw.trim().length > 0
  const hasOutputCostRaw = typeof outputCostRaw === 'string' && outputCostRaw.trim().length > 0
  const hasPricingData = hasInputCostNumber || hasOutputCostNumber || hasInputCostRaw || hasOutputCostRaw
  const inputCost = (raw as { inputCost?: number }).inputCost ?? (inputCostRaw ? parseFloat(inputCostRaw) * 1_000_000 : 0)
  const outputCost = (raw as { outputCost?: number }).outputCost ?? (outputCostRaw ? parseFloat(outputCostRaw) * 1_000_000 : 0)
  const explicitIsFree = (raw as { isFree?: boolean }).isFree
  const isZeroPriced = hasPricingData ? (inputCost === 0 && outputCost === 0) : false
  const isFree = explicitIsFree ?? (provider.id === 'nvidia' ? false : isZeroPriced)
  const contextWindow = (raw as { contextWindow?: number }).contextWindow
    ?? (raw as RawProviderModel).context_length
    ?? (raw as RawProviderModel).context_window
    ?? 128_000
  const rateLimits = isFree && provider.id === 'openrouter'
    ? { ...FREE_TIER_RATE_LIMITS, note: 'Limite oficial do plano gratuito OpenRouter.' }
    : undefined
  const explicitCaps = (raw as { capabilities?: ModelCapability[] }).capabilities
  const capabilities: ModelCapability[] = explicitCaps && explicitCaps.length > 0
    ? explicitCaps
    : provider.capabilities.includes('text') ? ['text'] : (provider.capabilities as ModelCapability[])

  return {
    id,
    label,
    provider: provider.label,
    providerId: provider.id,
    tier,
    description: (raw as RawProviderModel).description ?? `Modelo ${provider.label}`,
    contextWindow,
    inputCost,
    outputCost,
    isFree,
    rateLimits,
    agentFit: inferFitScores(tier, id),
    capabilities,
  }
}

/**
 * Fetch the available model list for a given provider. Falls back to the
 * provider's static catalog when:
 *  - the provider has no remote endpoint (Cohere compat / Qwen / Perplexity)
 *  - the request fails (typical with local Ollama not running)
 *  - the response shape isn't recognised
 */
export async function fetchProviderModels(
  providerId: ProviderId,
  apiKey: string,
  baseUrlOverride?: string,
  options: { allowStaticFallback?: boolean } = {},
): Promise<ModelOption[]> {
  const provider = PROVIDERS[providerId]
  if (!provider) return []
  const allowStaticFallback = options.allowStaticFallback ?? true

  if (provider.id === 'openrouter') {
    const orModels = await fetchOpenRouterModels()
    return orModels.map(openRouterToModelOption)
  }

  const useStatic = !provider.modelsListUrl || provider.modelsListShape === 'static'
  if (useStatic) {
    if (!allowStaticFallback) return []
    return provider.staticModels.map(m => providerEntryToModelOption(provider, m))
  }

  if (provider.authHeader && !apiKey.trim()) {
    if (!allowStaticFallback) return []
    return provider.staticModels.map(m => providerEntryToModelOption(provider, m))
  }

  const normalizedBaseUrlOverride = baseUrlOverride?.trim().replace(/\/+$/, '')
  const url = normalizedBaseUrlOverride
    ? provider.id === 'ollama'
      ? `${normalizedBaseUrlOverride.replace(/\/v1$/, '')}/api/tags`
      : `${normalizedBaseUrlOverride}/models`
    : provider.modelsListUrl

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.authHeader && apiKey) {
      headers[provider.authHeader] = `${provider.authPrefix ?? ''}${apiKey}`
    }
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json() as Record<string, unknown>

    // Normalize across the three known response shapes.
    if (provider.modelsListShape === 'anthropic') {
      const data = (json.data ?? []) as RawProviderModel[]
      return data.map(m => providerEntryToModelOption(provider, m))
    }
    if (provider.modelsListShape === 'ollama') {
      const data = (json.models ?? []) as Array<{ name: string; details?: { parameter_size?: string } }>
      return data.map(m => providerEntryToModelOption(provider, { id: m.name, label: m.name }))
    }
    // openai-shape
    const data = (json.data ?? []) as RawProviderModel[]
    if (!Array.isArray(data) || data.length === 0) {
      if (!allowStaticFallback) return []
      return provider.staticModels.map(m => providerEntryToModelOption(provider, m))
    }
    return data.map(m => providerEntryToModelOption(provider, m))
  } catch (err) {
    console.warn(`[provider-catalog] Falha ao buscar modelos de ${provider.label}:`, err)
    if (!allowStaticFallback) throw err
    return provider.staticModels.map(m => providerEntryToModelOption(provider, m))
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
