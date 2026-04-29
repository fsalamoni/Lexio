/**
 * ProviderCatalogsSection — orchestrator for the per-provider catalog cards.
 *
 * Mounts one `ProviderCatalogCard` for every provider the user has enabled
 * in `provider_settings`. The OpenRouter catalog (the historical one) is
 * still rendered as a separate, dedicated card so existing flows keep
 * working — but here it shows up labelled "Catálogo OpenRouter", giving
 * symmetry with the other provider catalogs.
 *
 * The user's unified Catálogo Pessoal lives in `ModelCatalogCard.tsx`.
 */
import { useEffect, useState } from 'react'
import ProviderCatalogCard from './ProviderCatalogCard'
import { loadApiKeyValues, loadProviderSettings } from '../lib/settings-store'
import {
  PROVIDER_ORDER, apiKeyFieldForProvider, type ProviderId,
} from '../lib/providers'

export default function ProviderCatalogsSection() {
  const [enabledIds, setEnabledIds] = useState<ProviderId[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const [keys, settings] = await Promise.all([loadApiKeyValues(), loadProviderSettings()])
        const enabled: ProviderId[] = []
        for (const pid of PROVIDER_ORDER) {
          const setting = settings[pid]
          const apiKeySet = Boolean(keys[apiKeyFieldForProvider(pid)])
          // Provider is shown if the user explicitly enabled it OR it is
          // OpenRouter and a legacy key already exists (preserves the old
          // behaviour for users that never opened the new settings).
          if (setting?.enabled === true) enabled.push(pid)
          else if (setting === undefined && pid === 'openrouter' && apiKeySet) enabled.push(pid)
        }
        if (!cancelled) setEnabledIds(enabled)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
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
