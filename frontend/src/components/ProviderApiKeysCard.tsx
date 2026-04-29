/**
 * ProviderApiKeysCard — multi-provider configuration surface.
 *
 * Shows one row per AI provider declared in `lib/providers.ts`. Each row lets
 * the user:
 *  - toggle the provider on/off
 *  - paste / rotate the API key
 *  - read a step-by-step setup guide
 *  - (Ollama) override the base URL when running self-hosted
 *
 * Persistence: api keys go to `users/{uid}/settings/preferences.api_keys`,
 * provider state goes to `users/{uid}/settings/preferences.provider_settings`.
 *
 * The DataJud key is rendered separately at the bottom because it is not an
 * AI provider — it is the CNJ jurisprudence service key.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, BookOpen, CheckCircle2, ChevronDown, ChevronUp,
  ExternalLink, Eye, EyeOff, KeyRound, Save, ToggleLeft, ToggleRight,
  Server,
} from 'lucide-react'
import {
  loadApiKeys, saveApiKeys, loadProviderSettings, saveProviderSettings,
  type ApiKeyEntry,
} from '../lib/settings-store'
import { PROVIDERS, PROVIDER_ORDER, apiKeyFieldForProvider, type ProviderId } from '../lib/providers'
import type { ProviderSettingsMap } from '../lib/firestore-types'
import { useToast } from './Toast'

type EditMap = Record<string, string>

export default function ProviderApiKeysCard() {
  const toast = useToast()
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [providerSettings, setProviderSettings] = useState<ProviderSettingsMap>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [edits, setEdits] = useState<EditMap>({})
  const [enabledOverrides, setEnabledOverrides] = useState<Record<string, boolean>>({})
  const [baseUrlOverrides, setBaseUrlOverrides] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const [entries, providers] = await Promise.all([loadApiKeys(), loadProviderSettings()])
      setApiKeys(entries)
      setProviderSettings(providers)
    } catch (err) {
      console.error(err)
      setError('Não foi possível carregar as configurações de provedores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const isEnabled = (pid: ProviderId): boolean => {
    if (pid in enabledOverrides) return enabledOverrides[pid]
    const setting = providerSettings[pid]
    // OpenRouter is implicitly enabled when its key is set (legacy behaviour).
    if (setting === undefined) {
      const apiKeyField = apiKeyFieldForProvider(pid)
      const entry = apiKeys.find(e => e.key === apiKeyField)
      if (pid === 'openrouter') return Boolean(entry?.is_set)
      return false
    }
    return Boolean(setting.enabled)
  }

  const toggleEnabled = (pid: ProviderId) => {
    setEnabledOverrides(prev => ({ ...prev, [pid]: !isEnabled(pid) }))
  }

  const hasPendingChanges = useMemo(() => {
    if (Object.values(edits).some(v => v && v.trim().length > 0)) return true
    if (Object.keys(enabledOverrides).length > 0) return true
    if (Object.keys(baseUrlOverrides).length > 0) return true
    return false
  }, [edits, enabledOverrides, baseUrlOverrides])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const keyUpdates: Record<string, string> = {}
      for (const [k, v] of Object.entries(edits)) {
        if (v && v.trim().length > 0) keyUpdates[k] = v.trim()
      }
      if (Object.keys(keyUpdates).length > 0) {
        await saveApiKeys(keyUpdates)
      }
      const providerUpdates: ProviderSettingsMap = {}
      for (const [pid, enabled] of Object.entries(enabledOverrides)) {
        providerUpdates[pid] = { ...(providerSettings[pid] ?? {}), enabled }
      }
      for (const [pid, baseUrl] of Object.entries(baseUrlOverrides)) {
        providerUpdates[pid] = { ...(providerUpdates[pid] ?? providerSettings[pid] ?? { enabled: true }), base_url: baseUrl }
      }
      if (Object.keys(providerUpdates).length > 0) {
        await saveProviderSettings(providerUpdates)
      }
      setEdits({})
      setEnabledOverrides({})
      setBaseUrlOverrides({})
      await refresh()
      toast.success('Provedores atualizados', 'Suas configurações foram salvas.')
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Erro ao salvar configurações.'
      setError(msg)
      toast.error('Erro ao salvar', msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-[1.25rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.68)] px-4 py-4">
        <p className="text-sm text-[var(--v2-ink-faint)]">Carregando provedores de IA...</p>
      </div>
    )
  }

  const datajudEntry = apiKeys.find(e => e.key === 'datajud_api_key')

  return (
    <form onSubmit={(e) => { e.preventDefault(); void handleSave() }}>
      <div className="flex items-center justify-end gap-3 mb-4">
        {error && (
          <span className="flex items-center gap-1 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" /> {error}
          </span>
        )}
        <button
          type="submit"
          disabled={!hasPendingChanges || saving}
          className="v2-btn-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>

      <p className="mb-4 text-sm text-[var(--v2-ink-soft)]">
        Habilite quantos provedores de IA quiser. Cada provedor habilitado terá seu próprio
        <strong> Catálogo</strong> mais abaixo, com a lista de modelos disponíveis. Os modelos
        que você adicionar a partir desses catálogos compõem o seu Catálogo Pessoal e podem ser
        atribuídos aos agentes — cada chamada é cobrada de acordo com as regras do provedor.
      </p>

      <div className="space-y-3">
        {PROVIDER_ORDER.map((pid) => {
          const provider = PROVIDERS[pid]
          const apiKeyField = apiKeyFieldForProvider(pid)
          const entry = apiKeys.find(e => e.key === apiKeyField)
          if (!entry) return null
          const enabled = isEnabled(pid)
          const editValue = edits[apiKeyField] ?? ''
          const isShown = visible[apiKeyField]
          const isExpanded = expanded[apiKeyField]
          const baseUrlEdit = baseUrlOverrides[pid] ?? providerSettings[pid]?.base_url ?? ''
          const dirty = editValue.trim().length > 0 || pid in enabledOverrides || pid in baseUrlOverrides

          return (
            <div
              key={pid}
              className={`overflow-hidden rounded-[1.35rem] border transition-all ${
                enabled
                  ? 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)]'
                  : 'border-[rgba(15,23,42,0.08)] bg-[rgba(15,23,42,0.03)]'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleEnabled(pid)}
                    title={enabled ? 'Desabilitar provedor' : 'Habilitar provedor'}
                    className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition ${
                      enabled
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-[rgba(15,23,42,0.06)] text-[var(--v2-ink-soft)] hover:bg-[rgba(15,23,42,0.1)]'
                    }`}
                  >
                    {enabled
                      ? <><ToggleRight className="w-4 h-4" /> Ativo</>
                      : <><ToggleLeft className="w-4 h-4" /> Desligado</>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[var(--v2-ink-strong)]">{provider.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${provider.color}`}>provedor</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        entry.is_set ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {entry.is_set ? '✓ chave configurada' : '⚠ chave não configurada'}
                      </span>
                      {dirty && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                          alterações pendentes
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">{provider.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={provider.consoleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-600 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Site
                    </a>
                    <button
                      type="button"
                      onClick={() => setExpanded(prev => ({ ...prev, [apiKeyField]: !prev[apiKeyField] }))}
                      className="flex items-center gap-1 rounded-lg border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-2 py-1 text-xs text-[var(--v2-ink-soft)] hover:text-[var(--v2-ink-strong)]"
                    >
                      <BookOpen className="w-3 h-3" />
                      {isExpanded ? 'Fechar guia' : 'Como configurar'}
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {entry.is_set && editValue.length === 0 && (
                  <div className="mt-2">
                    <code className="rounded bg-[rgba(15,23,42,0.06)] px-2 py-1 font-mono text-xs text-[var(--v2-ink-soft)]">
                      {entry.masked_value}
                    </code>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <div className="relative flex-1">
                    <input
                      type={isShown ? 'text' : 'password'}
                      value={editValue}
                      onChange={(e) => setEdits(prev => ({ ...prev, [apiKeyField]: e.target.value }))}
                      placeholder={entry.is_set ? 'Nova chave (deixe vazio para manter a atual)' : entry.placeholder}
                      autoComplete="new-password"
                      className="w-full rounded-[1.05rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-2 pr-10 font-mono text-sm text-[var(--v2-ink-strong)] outline-none focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
                    />
                    <button
                      type="button"
                      onClick={() => setVisible(prev => ({ ...prev, [apiKeyField]: !prev[apiKeyField] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--v2-ink-faint)] hover:text-[var(--v2-ink-strong)]"
                    >
                      {isShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {pid === 'ollama' && (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-[var(--v2-ink-soft)] flex items-center gap-1">
                      <Server className="w-3 h-3" /> URL do servidor Ollama
                    </label>
                    <input
                      type="text"
                      value={baseUrlEdit}
                      onChange={(e) => setBaseUrlOverrides(prev => ({ ...prev, [pid]: e.target.value }))}
                      placeholder={provider.baseUrl}
                      className="mt-1 w-full rounded-[1.05rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-2 font-mono text-sm text-[var(--v2-ink-strong)] outline-none focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
                    />
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className="border-t border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.62)] p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-[var(--v2-ink-strong)]">
                    <BookOpen className="w-3 h-3" />
                    Guia de configuração — {provider.label}
                  </p>
                  <ol className="space-y-2">
                    {provider.guide.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm text-[var(--v2-ink-strong)]">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )
        })}

        {datajudEntry && <DatajudKeyRow
          entry={datajudEntry}
          editValue={edits[datajudEntry.key] ?? ''}
          onEdit={(v) => setEdits(prev => ({ ...prev, [datajudEntry.key]: v }))}
          isShown={Boolean(visible[datajudEntry.key])}
          onToggleShown={() => setVisible(prev => ({ ...prev, [datajudEntry.key]: !prev[datajudEntry.key] }))}
          isExpanded={Boolean(expanded[datajudEntry.key])}
          onToggleExpanded={() => setExpanded(prev => ({ ...prev, [datajudEntry.key]: !prev[datajudEntry.key] }))}
        />}

        {hasPendingChanges && (
          <div className="flex items-center justify-end gap-2 text-xs text-amber-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Há alterações pendentes — clique em "Salvar alterações".
          </div>
        )}
      </div>
    </form>
  )
}

// ── DataJud row (kept here so the section stays a single card) ────────────────

function DatajudKeyRow({
  entry,
  editValue,
  onEdit,
  isShown,
  onToggleShown,
  isExpanded,
  onToggleExpanded,
}: {
  entry: ApiKeyEntry
  editValue: string
  onEdit: (value: string) => void
  isShown: boolean
  onToggleShown: () => void
  isExpanded: boolean
  onToggleExpanded: () => void
}) {
  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)]">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <KeyRound className="w-4 h-4 text-[var(--v2-ink-soft)]" />
              <span className="font-medium text-[var(--v2-ink-strong)]">{entry.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                entry.is_set ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {entry.is_set ? '✓ configurado' : '⚠ não configurado'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">{entry.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={entry.link} target="_blank" rel="noopener noreferrer"
              className="text-xs text-teal-600 hover:underline flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Site
            </a>
            <button type="button" onClick={onToggleExpanded}
              className="flex items-center gap-1 rounded-lg border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-2 py-1 text-xs text-[var(--v2-ink-soft)] hover:text-[var(--v2-ink-strong)]">
              <BookOpen className="w-3 h-3" />
              {isExpanded ? 'Fechar guia' : 'Como configurar'}
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {entry.is_set && editValue.length === 0 && (
          <div className="mt-2">
            <code className="rounded bg-[rgba(15,23,42,0.06)] px-2 py-1 font-mono text-xs text-[var(--v2-ink-soft)]">
              {entry.masked_value}
            </code>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <input
              type={isShown ? 'text' : 'password'}
              value={editValue}
              onChange={(e) => onEdit(e.target.value)}
              placeholder={entry.is_set ? 'Nova chave (deixe vazio para manter a atual)' : entry.placeholder}
              autoComplete="new-password"
              className="w-full rounded-[1.05rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-2 pr-10 font-mono text-sm text-[var(--v2-ink-strong)] outline-none focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
            />
            <button type="button" onClick={onToggleShown}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--v2-ink-faint)] hover:text-[var(--v2-ink-strong)]">
              {isShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.62)] p-4">
          <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-[var(--v2-ink-strong)]">
            <BookOpen className="w-3 h-3" /> Guia de configuração — {entry.label}
          </p>
          <ol className="space-y-2">
            {entry.guide.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-[var(--v2-ink-strong)]">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
