/**
 * ProviderCatalogCard — generic per-provider model catalog browser.
 *
 * Renders one collapsible card for a single provider (Anthropic, OpenAI,
 * DeepSeek, etc.). When opened it fetches the provider's available model list
 * via `fetchProviderModels` and lets the user "Add" any of those models to
 * their personal catalog (which is the unified catalog shared by every agent
 * selector). Each model retains its `providerId`, so dispatch later goes to
 * the correct API.
 *
 * The card is only rendered when the user has the corresponding provider
 * enabled in their preferences, so no extra noise appears in the Admin Panel.
 *
 * The OpenRouter version of this card is the one historically rendered as
 * "Catálogo de Modelos" — it is kept untouched (`ModelCatalogCard.tsx`) and
 * we now expose a sibling card per non-OpenRouter provider.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronUp, Library, Plus, RefreshCw, Search, Filter,
  AlertCircle, CheckCircle2, ExternalLink, Cpu, Coins,
} from 'lucide-react'
import {
  fetchProviderModels,
  loadModelCatalog,
  saveModelCatalog,
} from '../lib/model-catalog'
import { PROVIDERS, apiKeyFieldForProvider, type ProviderId } from '../lib/providers'
import { loadApiKeyValues, loadProviderSettings } from '../lib/settings-store'
import type { ModelOption, ModelCapability } from '../lib/model-config'
import { useToast } from './Toast'
import { formatCost as fmtCost } from '../lib/currency-utils'

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  fast:     { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Rápido'      },
  balanced: { bg: 'bg-purple-50',  text: 'text-purple-700',  label: 'Equilibrado' },
  premium:  { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Premium'     },
}

const CAPABILITY_LABELS: Record<ModelCapability, { emoji: string; label: string; style: string }> = {
  text:  { emoji: '📝', label: 'Texto',  style: 'bg-[rgba(15,23,42,0.08)] text-[var(--v2-ink-soft)]' },
  image: { emoji: '🖼️', label: 'Imagem', style: 'bg-pink-100 text-pink-700' },
  audio: { emoji: '🎵', label: 'Áudio',  style: 'bg-cyan-100 text-cyan-700' },
  video: { emoji: '🎬', label: 'Vídeo',  style: 'bg-violet-100 text-violet-700' },
}

function fmt(tokens: number): string {
  if (!tokens) return '—'
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`
  if (tokens >= 1_000)     return `${Math.round(tokens / 1_000)}K`
  return String(tokens)
}

interface Props {
  providerId: ProviderId
  /** Default open state. Closed by default to keep the admin panel compact. */
  defaultOpen?: boolean
}

export default function ProviderCatalogCard({ providerId, defaultOpen = false }: Props) {
  const provider = PROVIDERS[providerId]
  const toast = useToast()
  const [open, setOpen] = useState(defaultOpen)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [catalog, setCatalog] = useState<ModelOption[]>([])
  const [search, setSearch] = useState('')
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [keys, providerSettings, currentCatalog] = await Promise.all([
        loadApiKeyValues(),
        loadProviderSettings(),
        loadModelCatalog(),
      ])
      const apiKey = keys[apiKeyFieldForProvider(providerId)] ?? ''
      const baseUrl = providerSettings[providerId]?.base_url
      const list = await fetchProviderModels(providerId, apiKey, baseUrl)
      setModels(list)
      setCatalog(currentCatalog)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar modelos do provedor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && models.length === 0 && !loading) {
      void loadAll()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const existingIds = useMemo(() => new Set(catalog.map(m => m.id)), [catalog])

  const filtered = useMemo(() => {
    const list = search.trim()
      ? models.filter(m =>
          m.label.toLowerCase().includes(search.toLowerCase()) ||
          m.id.toLowerCase().includes(search.toLowerCase()),
        )
      : models
    return list.slice(0, 200)
  }, [models, search])

  const handleAdd = async (model: ModelOption) => {
    if (existingIds.has(model.id)) return
    setSaving(true)
    try {
      const next = [...catalog, { ...model, providerId }]
      await saveModelCatalog(next)
      setCatalog(next)
      setJustAdded(prev => new Set(prev).add(model.id))
      toast.success('Modelo adicionado', `${model.label} foi incluído no seu Catálogo Pessoal.`)
    } catch (err) {
      toast.error('Erro ao salvar', err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[1.6rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.76)] mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-[rgba(15,23,42,0.04)]"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-[1rem] ${provider.color}`}>
            <Library className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--v2-ink-strong)]">
              Catálogo {provider.label}
            </h3>
            <p className="text-xs text-[var(--v2-ink-soft)]">
              {models.length > 0
                ? `${models.length} modelos disponíveis · clique em + para adicionar ao seu catálogo pessoal`
                : `Modelos disponíveis no ${provider.label}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={provider.consoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hidden sm:inline-flex items-center gap-1 text-xs text-[var(--v2-ink-soft)] hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Console
          </a>
          {open
            ? <ChevronUp className="w-4 h-4 text-[var(--v2-ink-faint)]" />
            : <ChevronDown className="w-4 h-4 text-[var(--v2-ink-faint)]" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5">
          <div className="flex items-center gap-2 mb-3 border-b border-[var(--v2-line-soft)] pb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--v2-ink-faint)]" />
              <input
                type="text"
                placeholder={`Buscar modelo de ${provider.label}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-[1rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] pl-8 pr-3 py-2 text-sm text-[var(--v2-ink-strong)] outline-none transition placeholder:text-[var(--v2-ink-faint)] focus:border-[rgba(99,102,241,0.35)] focus:ring-4 focus:ring-[rgba(99,102,241,0.12)]"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadAll()}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] text-[var(--v2-ink-strong)] hover:bg-white disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-[1.1rem] border border-red-200 bg-[rgba(254,226,226,0.72)] p-3 mb-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {loading && models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--v2-ink-faint)]">
              <RefreshCw className="w-8 h-8 mb-2 animate-spin" />
              <p className="text-sm">Carregando modelos...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--v2-ink-faint)]">
              <Filter className="w-7 h-7 mb-2" />
              <p className="text-sm">Nenhum modelo encontrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--v2-line-soft)] rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)] overflow-hidden">
              {filtered.map(model => {
                const tierStyle = TIER_STYLES[model.tier]
                const inCatalog = existingIds.has(model.id)
                const wasJustAdded = justAdded.has(model.id)
                return (
                  <div key={model.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[rgba(15,23,42,0.04)]">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--v2-ink-strong)] truncate">{model.label}</span>
                        {model.isFree && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">✦ GRÁTIS</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${provider.color}`}>{provider.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tierStyle.bg} ${tierStyle.text}`}>{tierStyle.label}</span>
                        {(model.capabilities ?? ['text']).map(cap => {
                          const cl = CAPABILITY_LABELS[cap]
                          return (
                            <span key={cap} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cl.style}`}>
                              {cl.emoji} {cl.label}
                            </span>
                          )
                        })}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[var(--v2-ink-soft)]">
                        <span className="flex items-center gap-0.5"><Cpu className="w-3 h-3" /> {fmt(model.contextWindow)}</span>
                        <span className="flex items-center gap-0.5">
                          <Coins className="w-3 h-3" />
                          <span className={model.isFree ? 'text-green-600 font-semibold' : ''}>{fmtCost(model.inputCost)}</span>
                          {' / '}
                          <span className={model.isFree ? 'text-green-600 font-semibold' : ''}>{fmtCost(model.outputCost)}</span>
                        </span>
                        <span className="hidden truncate font-mono text-[var(--v2-ink-faint)] sm:block">{model.id}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAdd(model)}
                      disabled={inCatalog || saving}
                      className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        wasJustAdded || inCatalog
                          ? 'bg-green-600 text-white'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                    >
                      {wasJustAdded || inCatalog
                        ? <><CheckCircle2 className="w-3 h-3" /> {inCatalog ? 'No catálogo' : 'Adicionado'}</>
                        : <><Plus className="w-3 h-3" /> Adicionar</>}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
