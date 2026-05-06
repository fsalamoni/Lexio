/**
 * Model Health Check — validates catalog models against each model provider.
 *
 * Runs on app load (once per session) and can be triggered manually.
 * Every model is verified against the provider responsible for dispatching it
 * (OpenRouter, Groq, OpenAI, etc.), preventing false removals caused by
 * checking non-OpenRouter models only against OpenRouter.
 */

import { IS_FIREBASE } from './firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from './firestore-service'
import {
  loadModelCatalog,
  saveModelCatalog,
  fetchProviderModels,
  emitCatalogUpdated,
} from './model-catalog'
import { AGENT_CONFIG_DEFS, sanitizeModelCapabilitiesAgainstDefs } from './model-config'
import type { ProviderSettingsMap } from './firestore-types'
import { PROVIDERS, apiKeyFieldForProvider, type ProviderId } from './providers'
import { resolveProviderForModel } from './provider-credentials'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Firestore keys that hold model overrides for each agent group */
const AGENT_CONFIG_KEYS = [
  'agent_models',
  'thesis_analyst_models',
  'context_detail_models',
  'acervo_classificador_models',
  'acervo_ementa_models',
  'research_notebook_models',
  'notebook_acervo_models',
  'video_pipeline_models',
  'audio_pipeline_models',
  'presentation_pipeline_models',
] as const

/** Key under which we store the last health check timestamp */
const HEALTH_CHECK_KEY = 'model_health_check_last_run'

/** Minimum interval between automatic checks (24 hours in ms) */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  /** Models removed from catalog (no longer available in their provider) */
  removedModels: Array<{ id: string; label: string }>
  /** Agent configs that had models cleared (with agent key and model id) */
  clearedAgents: Array<{ configKey: string; agentKey: string; modelId: string }>
  /** Total models remaining in catalog after cleanup */
  catalogSize: number
  /** Whether the check actually ran (false if skipped due to interval) */
  didRun: boolean
  /** Providers that were successfully checked in this run. */
  checkedProviders: ProviderId[]
  /** Providers skipped because live model listing could not be fetched. */
  skippedProviders: ProviderId[]
}

// ── Session guard ─────────────────────────────────────────────────────────────

let sessionCheckDone = false

// ── Core Logic ────────────────────────────────────────────────────────────────

/**
 * Run the model health check. Compares catalog against OpenRouter live data.
 *
 * @param force - If true, ignores the 24h interval guard
 * @returns Report of what was removed/cleared
 */
export async function runModelHealthCheck(force = false): Promise<HealthCheckResult> {
  const noopResult: HealthCheckResult = {
    removedModels: [],
    clearedAgents: [],
    catalogSize: 0,
    didRun: false,
    checkedProviders: [],
    skippedProviders: [],
  }

  if (!IS_FIREBASE) return noopResult

  // Session guard — only run once per page load unless forced
  if (sessionCheckDone && !force) return noopResult

  // Interval guard — don't check more than once per 24h unless forced
  if (!force) {
    try {
      const resolvedUid = getCurrentUserId()
      if (!resolvedUid) return noopResult
      const userSettings = await ensureUserSettingsMigrated(resolvedUid)
      const lastRun = (userSettings as Record<string, unknown>)[HEALTH_CHECK_KEY] as number | undefined
      if (lastRun && Date.now() - lastRun < CHECK_INTERVAL_MS) {
        sessionCheckDone = true
        return noopResult
      }
    } catch {
      // Continue with check
    }
  }

  sessionCheckDone = true

  try {
    const resolvedUid = getCurrentUserId()
    if (!resolvedUid) return noopResult

    const settings = await ensureUserSettingsMigrated(resolvedUid)
    const providerSettings = (settings.provider_settings ?? {}) as ProviderSettingsMap
    const apiKeys = (settings.api_keys ?? {}) as Record<string, string>

    // 1. Load current catalog
    const catalog = await loadModelCatalog()
    if (!Array.isArray(catalog) || catalog.length === 0) {
      return {
        removedModels: [],
        clearedAgents: [],
        catalogSize: 0,
        didRun: true,
        checkedProviders: [],
        skippedProviders: [],
      }
    }

    // 2. Resolve the provider of every catalog model using the same routing
    // semantics used by runtime dispatch.
    const modelsByProvider = new Map<ProviderId, typeof catalog>()
    for (const model of catalog) {
      const providerId = resolveProviderForModel(model.id, catalog, providerSettings)
      const current = modelsByProvider.get(providerId) ?? []
      current.push(model)
      modelsByProvider.set(providerId, current)
    }

    // 3. Fetch live model ids per provider.
    const checkedProviders: ProviderId[] = []
    const skippedProviders: ProviderId[] = []
    const liveModelIdsByProvider = new Map<ProviderId, Set<string>>()

    for (const [providerId] of modelsByProvider) {
      const provider = PROVIDERS[providerId]
      if (!provider) {
        skippedProviders.push(providerId)
        continue
      }

      try {
        const apiKey = apiKeys[apiKeyFieldForProvider(providerId)] ?? ''
        const baseUrl = providerSettings[providerId]?.base_url
        const liveModels = await fetchProviderModels(providerId, apiKey, baseUrl, { allowStaticFallback: false })
        if (!Array.isArray(liveModels) || liveModels.length === 0) {
          skippedProviders.push(providerId)
          continue
        }

        liveModelIdsByProvider.set(providerId, new Set(liveModels.map(model => model.id)))
        checkedProviders.push(providerId)
      } catch (error) {
        console.warn(`[HealthCheck] Falha ao verificar provedor ${provider.label}:`, error)
        skippedProviders.push(providerId)
      }
    }

    // 4. Find models that do not exist in their own provider catalog.
    const invalidModels: typeof catalog = []
    for (const [providerId, models] of modelsByProvider) {
      const liveIds = liveModelIdsByProvider.get(providerId)
      // Never remove models from providers that could not be checked.
      if (!liveIds) continue

      for (const model of models) {
        if (!liveIds.has(model.id)) {
          invalidModels.push(model)
        }
      }
    }

    if (invalidModels.length === 0) {
      // All good — just update timestamp
      await saveUserSettings(resolvedUid, { [HEALTH_CHECK_KEY]: Date.now() } as Partial<Record<string, unknown>>)
      return {
        removedModels: [],
        clearedAgents: [],
        catalogSize: catalog.length,
        didRun: true,
        checkedProviders,
        skippedProviders,
      }
    }

    const invalidIds = new Set(invalidModels.map(m => m.id))

    // 5. Remove invalid models from catalog
    const cleanCatalog = catalog.filter(m => !invalidIds.has(m.id))
    await saveModelCatalog(cleanCatalog)
    emitCatalogUpdated(cleanCatalog)

    // 6. Clear invalid models from all agent configs
    const clearedAgents: HealthCheckResult['clearedAgents'] = []
    const catalogForValidation = cleanCatalog
    const updates: Record<string, unknown> = {
      [HEALTH_CHECK_KEY]: Date.now(),
    }

    for (const configKey of AGENT_CONFIG_KEYS) {
      const agentMap = (settings[configKey] ?? {}) as Record<string, string>
      let changed = false
      const cleanMap = { ...agentMap }

      for (const [agentKey, modelId] of Object.entries(cleanMap)) {
        if (invalidIds.has(modelId)) {
          clearedAgents.push({ configKey, agentKey, modelId })
          delete cleanMap[agentKey]
          changed = true
        }
      }

      const capabilitySource = { ...cleanMap }
      const capabilitySanitized = sanitizeModelCapabilitiesAgainstDefs(AGENT_CONFIG_DEFS[configKey], capabilitySource, catalogForValidation)
      if (Object.keys(capabilitySanitized).length !== Object.keys(capabilitySource).length) {
        for (const [agentKey, modelId] of Object.entries(capabilitySource)) {
          if (!(agentKey in capabilitySanitized)) {
            clearedAgents.push({ configKey, agentKey, modelId })
          }
        }
        for (const agentKey of Object.keys(cleanMap)) {
          if (!(agentKey in capabilitySanitized)) delete cleanMap[agentKey]
        }
        Object.assign(cleanMap, capabilitySanitized)
        changed = true
      }

      if (changed) {
        updates[configKey] = cleanMap
      }
    }

    await saveUserSettings(resolvedUid, updates as Record<string, unknown>)

    return {
      removedModels: invalidModels.map(m => ({ id: m.id, label: m.label })),
      clearedAgents,
      catalogSize: cleanCatalog.length,
      didRun: true,
      checkedProviders,
      skippedProviders,
    }
  } catch (err) {
    console.error('[HealthCheck] Erro na verificação de modelos:', err)
    throw err
  }
}

/**
 * Format health check results for display as a user-facing notification.
 * Always returns a valid object (never null).
 */
export function formatHealthCheckMessage(result: HealthCheckResult): {
  title: string
  message: string
} {
  if (!result.didRun) {
    return {
      title: 'Verificação não executada',
      message: 'A verificação de modelos não foi realizada.',
    }
  }

  if (result.removedModels.length === 0) {
    const skipped = result.skippedProviders.length > 0
      ? ` Não foi possível verificar: ${result.skippedProviders.map(providerId => PROVIDERS[providerId]?.label ?? providerId).join(', ')}.`
      : ''
    return {
      title: 'Todos os modelos estão válidos',
      message: `Nenhum modelo indisponível encontrado. ${result.catalogSize} modelo(s) no catálogo.${skipped}`,
    }
  }

  const modelNames = result.removedModels.map(m => m.label).join(', ')
  const agentCount = result.clearedAgents.length
  const checkedProviders = result.checkedProviders.length > 0
    ? result.checkedProviders.map(providerId => PROVIDERS[providerId]?.label ?? providerId).join(', ')
    : 'nenhum provedor'
  const skippedProviders = result.skippedProviders.length > 0
    ? ` Não foi possível verificar: ${result.skippedProviders.map(providerId => PROVIDERS[providerId]?.label ?? providerId).join(', ')}.`
    : ''

  return {
    title: `${result.removedModels.length} modelo(s) removido(s) do catálogo`,
    message: agentCount > 0
      ? `Os seguintes modelos não estão mais disponíveis em seus provedores (${checkedProviders}) e foram removidos: ${modelNames}. ${agentCount} agente(s) foram desconfigurados e precisam de um novo modelo. Vá em Configurações para selecionar substitutos.${skippedProviders}`
      : `Os seguintes modelos não estão mais disponíveis em seus provedores (${checkedProviders}) e foram removidos: ${modelNames}. Nenhum agente foi afetado.${skippedProviders}`,
  }
}
