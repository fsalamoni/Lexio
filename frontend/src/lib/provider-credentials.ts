/**
 * Multi-provider credential resolver.
 *
 * Reads the user's per-provider settings from Firestore and produces, for any
 * model id, the routing details needed by `llm-client`:
 *  - `providerId`         — which provider should receive the request
 *  - `apiKey`             — bearer/x-api-key value
 *  - `baseUrl`            — endpoint root (respects user-supplied overrides
 *                           for self-hosted gateways like Ollama)
 *
 * Resolution order:
 *  1. If the model id appears in any enabled provider's saved catalog, use
 *     that provider.
 *  2. Otherwise default to OpenRouter (legacy behaviour) so existing user
 *     catalogs keep working without migration.
 */

import { IS_FIREBASE } from './firebase'
import { ensureUserSettingsMigrated, getCurrentUserId } from './firestore-service'
import {
  PROVIDERS,
  type ProviderDefinition,
  type ProviderId,
  apiKeyFieldForProvider,
} from './providers'
import type { ModelOption } from './model-config'
import type { ProviderSettingsMap } from './firestore-types'

export interface ResolvedProviderCall {
  provider: ProviderDefinition
  apiKey: string
  baseUrl: string
}

interface SettingsBundle {
  apiKeys: Record<string, string>
  providerSettings: ProviderSettingsMap
  catalog: ModelOption[]
}

async function loadSettingsBundle(uid?: string): Promise<SettingsBundle> {
  if (!IS_FIREBASE) {
    return { apiKeys: {}, providerSettings: {}, catalog: [] }
  }
  const resolvedUid = uid ?? getCurrentUserId() ?? undefined
  if (!resolvedUid) {
    return { apiKeys: {}, providerSettings: {}, catalog: [] }
  }
  const settings = await ensureUserSettingsMigrated(resolvedUid)
  return {
    apiKeys: (settings.api_keys ?? {}) as Record<string, string>,
    providerSettings: (settings.provider_settings ?? {}) as ProviderSettingsMap,
    catalog: (settings.model_catalog ?? []) as ModelOption[],
  }
}

/**
 * Determine which provider owns a given model id, using the user's catalog as
 * the source of truth and falling back to id-based heuristics.
 */
export function resolveProviderForModel(
  modelId: string,
  catalog: ModelOption[] = [],
  providerSettings: ProviderSettingsMap = {},
): ProviderId {
  const fromCatalog = catalog.find(m => m.id === modelId)
  if (fromCatalog?.providerId) {
    return fromCatalog.providerId as ProviderId
  }
  // Then check provider-specific saved catalogs.
  for (const [pid, entry] of Object.entries(providerSettings)) {
    if (!entry?.saved_models) continue
    if (entry.saved_models.some(m => m.id === modelId)) {
      return pid as ProviderId
    }
  }
  return 'openrouter'
}

/**
 * Resolve the call routing for `modelId`:
 *  - which provider definition is responsible
 *  - which API key to use
 *  - which base URL to call (respecting user overrides)
 *
 * Throws when the resolved provider is missing an API key or has been
 * explicitly disabled — the caller surfaces a friendly message asking the
 * user to configure the provider.
 */
export async function resolveProviderCall(
  modelId: string,
  uid?: string,
): Promise<ResolvedProviderCall> {
  const bundle = await loadSettingsBundle(uid)
  const providerId = resolveProviderForModel(modelId, bundle.catalog, bundle.providerSettings)
  const provider = PROVIDERS[providerId]
  if (!provider) {
    throw new Error(`Provedor desconhecido para o modelo "${modelId}".`)
  }

  const apiKeyField = apiKeyFieldForProvider(provider.id)
  let apiKey = bundle.apiKeys[apiKeyField] ?? ''

  // Backwards-compat: legacy code stored OpenRouter env key.
  if (!apiKey && provider.id === 'openrouter') {
    const envKey = (import.meta as ImportMeta).env?.VITE_OPENROUTER_API_KEY as string | undefined
    if (envKey) apiKey = envKey
  }

  // Provider explicitly disabled — only enforce when settings exist.
  const setting = bundle.providerSettings[provider.id]
  if (setting && setting.enabled === false) {
    throw new Error(`O provedor "${provider.label}" está desativado. Acesse Configurações → Provedores de IA.`)
  }

  if (!apiKey && provider.id !== 'ollama') {
    throw new Error(`Chave de API ausente para "${provider.label}". Configure-a em Configurações → Provedores de IA.`)
  }

  const baseUrl = setting?.base_url?.trim() || provider.baseUrl
  return { provider, apiKey, baseUrl }
}

/** Sync helper used by UI components that already loaded settings. */
export function pickProviderForCatalog(
  catalog: ModelOption[],
  providerSettings: ProviderSettingsMap,
  modelId: string,
): ProviderDefinition {
  const id = resolveProviderForModel(modelId, catalog, providerSettings)
  return PROVIDERS[id]
}
