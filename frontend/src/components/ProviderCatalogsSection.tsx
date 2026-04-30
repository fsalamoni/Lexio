/**
 * ProviderCatalogsSection — orchestrator for the per-provider catalog cards.
 *
 * Mounts one `ProviderCatalogCard` for every provider that is effectively
 * available to the user (enabled toggle and/or API key configured).
 *
 * The user's unified Catálogo Pessoal lives in `ModelCatalogCard.tsx`.
 */
import { useEffect, useState } from 'react'
import ProviderCatalogCard from './ProviderCatalogCard'
import {
  loadApiKeyValues,
  loadProviderSettings,
  PROVIDER_SETTINGS_UPDATED_EVENT,
} from '../lib/settings-store'
import {
  PROVIDER_ORDER, PROVIDERS, apiKeyFieldForProvider, type ProviderId,
} from '../lib/providers'

export default function ProviderCatalogsSection() {
  const [enabledIds, setEnabledIds] = useState<ProviderId[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function refreshEnabledProviders() {
      try {
        const [keys, settings] = await Promise.all([loadApiKeyValues(), loadProviderSettings()])
        const enabled: ProviderId[] = []

        for (const pid of PROVIDER_ORDER) {
          const setting = settings[pid]
          const provider = PROVIDERS[pid]
          const apiKeySet = Boolean(keys[apiKeyFieldForProvider(pid)])

          // Provider catalog is visible whenever there is an API key configured
          // for that provider, even if the user never opened the provider
          // toggle UI. This keeps the UX symmetric with OpenRouter and ensures
          // "key configured => catalog available" for Groq, ElevenLabs, etc.
          const shouldShowByKey = apiKeySet

          // Explicit toggle remains respected, especially for local providers
          // that may not need a key (e.g., Ollama with local base_url).
          const shouldShowByToggle = setting?.enabled === true

          // Local/self-hosted providers can be considered available when a
          // custom base URL is configured and provider was enabled.
          const shouldShowLocalProvider = provider.id === 'ollama' && shouldShowByToggle

          if (shouldShowByKey || shouldShowByToggle || shouldShowLocalProvider) {
            enabled.push(pid)
          }
        }

        if (!cancelled) setEnabledIds(enabled)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const handleProviderSettingsUpdated = () => {
      void refreshEnabledProviders()
    }

    void refreshEnabledProviders()
    window.addEventListener(PROVIDER_SETTINGS_UPDATED_EVENT, handleProviderSettingsUpdated)

    return () => {
      cancelled = true
      window.removeEventListener(PROVIDER_SETTINGS_UPDATED_EVENT, handleProviderSettingsUpdated)
    }
  }, [])

  if (loading) {
    return (
      <p className="text-sm text-[var(--v2-ink-faint)]">Carregando catálogos dos provedores...</p>
    )
  }

  if (enabledIds.length === 0) {
    return (
      <p className="text-sm text-[var(--v2-ink-soft)]">
        Habilite um provedor em <strong>Provedores de IA</strong> para ver o catálogo de modelos
        correspondente aqui. Cada provedor habilitado terá seu próprio catálogo com a lista
        atualizada de modelos disponíveis.
      </p>
    )
  }

  return (
    <div>
      {enabledIds.map(pid => (
        <ProviderCatalogCard key={pid} providerId={pid} defaultOpen={pid === 'openrouter'} />
      ))}
    </div>
  )
}
