/**
 * Model Health Check — validates catalog models against OpenRouter API.
 *
 * Runs on app load (once per session) and can be triggered manually.
 * Compares the local model catalog against the live OpenRouter models list.
 * Removes unavailable models from:
 *   1. The catalog (Firestore /settings/platform.model_catalog)
 *   2. All agent configs that reference them (agent_models, thesis_analyst_models, etc.)
 *
 * Users are notified of removed models so they can select replacements.
 */

import { IS_FIREBASE } from './firebase'
import { getSettings, saveSettings } from './firestore-service'
import {
  loadModelCatalog,
  saveModelCatalog,
  fetchOpenRouterModels,
  emitCatalogUpdated,
} from './model-catalog'

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
] as const

/** Key under which we store the last health check timestamp */
const HEALTH_CHECK_KEY = 'model_health_check_last_run'

/** Minimum interval between automatic checks (24 hours in ms) */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  /** Models removed from catalog (no longer on OpenRouter) */
  removedModels: Array<{ id: string; label: string }>
  /** Agent configs that had models cleared (with agent key and model id) */
  clearedAgents: Array<{ configKey: string; agentKey: string; modelId: string }>
  /** Total models remaining in catalog after cleanup */
  catalogSize: number
  /** Whether the check actually ran (false if skipped due to interval) */
  didRun: boolean
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
    removedModels: [], clearedAgents: [], catalogSize: 0, didRun: false,
  }

  if (!IS_FIREBASE) return noopResult

  // Session guard — only run once per page load unless forced
  if (sessionCheckDone && !force) return noopResult

  // Interval guard — don't check more than once per 24h unless forced
  if (!force) {
    try {
      const settings = await getSettings()
      const lastRun = settings[HEALTH_CHECK_KEY] as number | undefined
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
    // 1. Fetch live models from OpenRouter
    const liveModels = await fetchOpenRouterModels()
    if (!Array.isArray(liveModels) || liveModels.length === 0) {
      throw new Error('Não foi possível obter a lista de modelos do OpenRouter.')
    }
    const liveModelIds = new Set(liveModels.map(m => m.id))

    // 2. Load current catalog
    const catalog = await loadModelCatalog()
    if (!Array.isArray(catalog) || catalog.length === 0) {
      return { removedModels: [], clearedAgents: [], catalogSize: 0, didRun: true }
    }

    // 3. Find models in catalog that don't exist on OpenRouter
    const invalidModels = catalog.filter(m => !liveModelIds.has(m.id))

    if (invalidModels.length === 0) {
      // All good — just update timestamp
      await saveSettings({ [HEALTH_CHECK_KEY]: Date.now() })
      return {
        removedModels: [],
        clearedAgents: [],
        catalogSize: catalog.length,
        didRun: true,
      }
    }

    const invalidIds = new Set(invalidModels.map(m => m.id))

    // 4. Remove invalid models from catalog
    const cleanCatalog = catalog.filter(m => !invalidIds.has(m.id))
    await saveModelCatalog(cleanCatalog)
    emitCatalogUpdated(cleanCatalog)

    // 5. Clear invalid models from all agent configs
    const clearedAgents: HealthCheckResult['clearedAgents'] = []
    const settings = await getSettings()
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

      if (changed) {
        updates[configKey] = cleanMap
      }
    }

    await saveSettings(updates)

    return {
      removedModels: invalidModels.map(m => ({ id: m.id, label: m.label })),
      clearedAgents,
      catalogSize: cleanCatalog.length,
      didRun: true,
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
    return {
      title: 'Todos os modelos estão válidos',
      message: `Nenhum modelo indisponível encontrado. ${result.catalogSize} modelo(s) no catálogo.`,
    }
  }

  const modelNames = result.removedModels.map(m => m.label).join(', ')
  const agentCount = result.clearedAgents.length

  return {
    title: `${result.removedModels.length} modelo(s) removido(s) do catálogo`,
    message: agentCount > 0
      ? `Os seguintes modelos não estão mais disponíveis no OpenRouter e foram removidos: ${modelNames}. ${agentCount} agente(s) foram desconfigurados e precisam de um novo modelo. Vá em Administração para selecionar substitutos.`
      : `Os seguintes modelos não estão mais disponíveis no OpenRouter e foram removidos: ${modelNames}. Nenhum agente foi afetado.`,
  }
}
