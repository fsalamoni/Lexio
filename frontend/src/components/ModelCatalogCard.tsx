/**
 * ModelCatalogCard — Admin Panel section for managing the master model catalog.
 *
 * Features:
 * - Complete table of all models: name, profile, fit scores, best-for agents,
 *   context window, input/output costs
 * - "Adicionar do OpenRouter" — fetches the OR API and lets admin pick any model
 * - "Adicionar manualmente" — add by model ID for unlisted models
 * - Remove model from catalog
 * - Save persists to Firestore; all config cards refresh automatically
 * - Filters: search, free/paid, tier, provider
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  Library, ChevronDown, ChevronUp, Save, RotateCcw, Plus, Trash2,
  Search, AlertCircle, CheckCircle2, RefreshCw, X, Download,
  Cpu, Coins, Zap, Brain, Scale, FileText, Filter,
  ExternalLink, PlusCircle, Info, AlertTriangle,
} from 'lucide-react'
import {
  loadModelCatalog,
  saveModelCatalog,
  fetchOpenRouterModels,
  openRouterToModelOption,
  inferProviderFromId,
  inferTier,
  inferFitScores,
  getBestAgentInfo,
  type OpenRouterModel,
} from '../lib/model-catalog'
import { AVAILABLE_MODELS, FREE_TIER_RATE_LIMITS, type ModelOption, type ModelCapability, type AgentCategory } from '../lib/model-config'
import { runModelHealthCheck, formatHealthCheckMessage } from '../lib/model-health-check'
import { PROVIDER_ORDER, PROVIDERS, type ProviderId } from '../lib/providers'
import { loadProviderSettings, saveProviderSettings } from '../lib/settings-store'
import type { ProviderSettingsMap } from '../lib/firestore-types'
import { useToast } from './Toast'
import { formatCost as fmtCost } from '../lib/currency-utils'

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmt(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`
  if (tokens >= 1_000)     return `${Math.round(tokens / 1_000)}K`
  return String(tokens)
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  fast:     { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Rápido'      },
  balanced: { bg: 'bg-purple-50',  text: 'text-purple-700',  label: 'Equilibrado' },
  premium:  { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Premium'     },
}

const CATEGORY_ICONS: Record<AgentCategory, React.ElementType> = {
  extraction: Zap,
  synthesis:  Scale,
  reasoning:  Brain,
  writing:    FileText,
}

const CATEGORY_COLORS: Record<AgentCategory, string> = {
  extraction: 'text-emerald-600 bg-emerald-50',
  synthesis:  'text-blue-600    bg-blue-50',
  reasoning:  'text-purple-600  bg-purple-50',
  writing:    'text-orange-600  bg-orange-50',
}

const SCORE_COLORS = (n: number) =>
  n >= 9 ? 'bg-emerald-100 text-emerald-700 font-bold'
  : n >= 7 ? 'bg-green-100 text-green-700 font-semibold'
  : n >= 5 ? 'bg-yellow-100 text-yellow-700'
  : n >= 3 ? 'bg-orange-100 text-orange-600'
  : 'bg-red-100 text-red-500'

const PROVIDER_COLORS: Record<string, string> = {
  Anthropic: 'bg-orange-100 text-orange-700',
  Google:    'bg-blue-100   text-blue-700',
  OpenAI:    'bg-teal-100   text-teal-700',
  DeepSeek:  'bg-sky-100    text-sky-700',
  Meta:      'bg-indigo-100 text-indigo-700',
  Mistral:   'bg-rose-100   text-rose-700',
  Qwen:      'bg-violet-100 text-violet-700',
  xAI:       'bg-slate-100  text-slate-700',
  Cohere:    'bg-lime-100   text-lime-700',
  Microsoft: 'bg-cyan-100   text-cyan-700',
  NVIDIA:    'bg-green-100  text-green-700',
}

const V2_CATALOG_PANEL = 'rounded-[1.6rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.76)] shadow-[0_18px_48px_rgba(15,23,42,0.08)]'
const V2_CATALOG_INSET = 'rounded-[1.2rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)]'
const V2_CATALOG_FIELD = 'w-full rounded-[1rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] px-3 py-2 text-sm text-[var(--v2-ink-strong)] outline-none transition placeholder:text-[var(--v2-ink-faint)] focus:border-[rgba(99,102,241,0.35)] focus:ring-4 focus:ring-[rgba(99,102,241,0.12)]'
const V2_CATALOG_SELECT = 'rounded-[1rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.9)] px-3 py-2 text-sm text-[var(--v2-ink-strong)] outline-none transition focus:border-[rgba(99,102,241,0.35)] focus:ring-4 focus:ring-[rgba(99,102,241,0.12)]'
const V2_CATALOG_FILTER_GROUP = 'flex items-center gap-0.5 rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.82)] p-0.5'
const V2_CATALOG_BUTTON = 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const V2_CATALOG_BUTTON_PRIMARY = `${V2_CATALOG_BUTTON} bg-indigo-600 text-white shadow-[0_18px_38px_rgba(79,70,229,0.18)] hover:bg-indigo-700`
const V2_CATALOG_BUTTON_SECONDARY = `${V2_CATALOG_BUTTON} border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.84)] text-[var(--v2-ink-strong)] hover:bg-white`
const V2_CATALOG_BUTTON_WARM = `${V2_CATALOG_BUTTON} border border-amber-200 bg-[rgba(245,158,11,0.12)] text-amber-800 hover:bg-[rgba(245,158,11,0.18)]`
const V2_CATALOG_BUTTON_TINTED = `${V2_CATALOG_BUTTON} border border-indigo-200 bg-[rgba(99,102,241,0.1)] text-indigo-700 hover:bg-[rgba(99,102,241,0.16)]`
const V2_CATALOG_ICON_SURFACE = 'flex h-10 w-10 items-center justify-center rounded-[1rem] bg-[rgba(99,102,241,0.12)] text-indigo-600'
const V2_CATALOG_TABLE_HEADER = 'grid grid-cols-[minmax(180px,1.5fr)_70px_140px_minmax(130px,1fr)_70px_70px_70px_40px] items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)] overflow-x-auto min-w-[880px] border-b border-[var(--v2-line-soft)] bg-[rgba(15,23,42,0.05)]'
const V2_CATALOG_TABLE_ROW = 'grid grid-cols-[minmax(180px,1.5fr)_70px_140px_minmax(130px,1fr)_70px_70px_70px_40px] items-center gap-2 px-3 py-3 transition-colors min-w-[880px] hover:bg-[rgba(15,23,42,0.04)]'

// ── Capability badges ─────────────────────────────────────────────────────────

const CAPABILITY_LABELS: Record<ModelCapability, { emoji: string; label: string; style: string }> = {
  text:  { emoji: '📝', label: 'Texto',  style: 'bg-[rgba(15,23,42,0.08)] text-[var(--v2-ink-soft)]' },
  image: { emoji: '🖼️', label: 'Imagem', style: 'bg-pink-100 text-pink-700'    },
  audio: { emoji: '🎵', label: 'Áudio',  style: 'bg-cyan-100 text-cyan-700'    },
  video: { emoji: '🎬', label: 'Vídeo',  style: 'bg-violet-100 text-violet-700' },
}

function CapabilityBadges({ capabilities }: { capabilities?: ModelCapability[] }) {
  const caps = capabilities ?? ['text']
  return (
    <>
      {caps.map(cap => {
        const cl = CAPABILITY_LABELS[cap]
        return (
          <span key={cap} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cl.style}`}>
            {cl.emoji} {cl.label}
          </span>
        )
      })}
    </>
  )
}

// ── Score cells ───────────────────────────────────────────────────────────────

function ScoreCell({ score, label, title }: { score: number; label: string; title: string }) {
  return (
    <span
      className={`inline-flex flex-col items-center px-1.5 py-0.5 rounded text-[9px] leading-tight ${SCORE_COLORS(score)}`}
      title={`${title}: ${score}/10`}
    >
      <span className="font-bold text-[10px]">{score}</span>
      <span className="opacity-70">{label}</span>
    </span>
  )
}

function resolveCatalogProviderId(model: ModelOption): ProviderId {
  if (model.providerId && model.providerId in PROVIDERS) {
    return model.providerId as ProviderId
  }
  return 'openrouter'
}

function haveSameModelIds(a: ModelOption[], b: ModelOption[]): boolean {
  if (a.length !== b.length) return false
  const idsA = [...new Set(a.map(model => model.id))].sort()
  const idsB = [...new Set(b.map(model => model.id))].sort()
  if (idsA.length !== idsB.length) return false
  for (let i = 0; i < idsA.length; i += 1) {
    if (idsA[i] !== idsB[i]) return false
  }
  return true
}

// ── OR model row in the "Add" modal ───────────────────────────────────────────

function ORModelRow({
  model,
  onAdd,
  alreadyInCatalog,
  justAdded,
}: {
  model: OpenRouterModel
  onAdd: (m: ModelOption) => void
  alreadyInCatalog: boolean
  justAdded?: boolean
}) {
  const opt = openRouterToModelOption(model)
  const inputCost = parseFloat(model.pricing?.prompt ?? '0') * 1_000_000
  const isFree = inputCost === 0
  const tierStyle = TIER_STYLES[opt.tier]

  return (
    <div className={`flex items-center gap-3 border-b border-[var(--v2-line-soft)] px-4 py-3 transition-colors hover:bg-[rgba(15,23,42,0.04)] ${alreadyInCatalog ? 'opacity-40' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[var(--v2-ink-strong)] truncate">{opt.label}</span>
          {isFree && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">✦ GRÁTIS</span>}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PROVIDER_COLORS[opt.provider] ?? 'bg-[rgba(15,23,42,0.08)] text-[var(--v2-ink-soft)]'}`}>{opt.provider}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tierStyle.bg} ${tierStyle.text}`}>{tierStyle.label}</span>
          <CapabilityBadges capabilities={opt.capabilities} />
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[var(--v2-ink-soft)]">
          <span className="flex items-center gap-0.5"><Cpu className="w-3 h-3" /> {fmt(opt.contextWindow)}</span>
          <span className="flex items-center gap-0.5">
            <Coins className="w-3 h-3" />
            <span className={isFree ? 'text-green-600 font-semibold' : ''}>{fmtCost(opt.inputCost)}</span>
            {' / '}
            <span className={isFree ? 'text-green-600 font-semibold' : ''}>{fmtCost(opt.outputCost)}</span>
          </span>
          <span className="hidden truncate font-mono text-[var(--v2-ink-faint)] sm:block">{model.id}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAdd(opt)}
        disabled={alreadyInCatalog}
        className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
          justAdded
            ? 'bg-green-600 text-white'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed'
        }`}
      >
        {(() => {
          if (justAdded)        return <><CheckCircle2 className="w-3 h-3" /> Adicionado</>
          if (alreadyInCatalog) return 'Já no catálogo'
          return <><Plus className="w-3 h-3" /> Adicionar</>
        })()}
      </button>
    </div>
  )
}

// ── "Add from OpenRouter" modal ───────────────────────────────────────────────

function AddFromORModal({
  open,
  onClose,
  existingIds,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  existingIds: Set<string>
  onAdd: (m: ModelOption) => void
}) {
  const [orModels, setOrModels]     = useState<OpenRouterModel[]>([])
  const [loadingOR, setLoadingOR]   = useState(false)
  const [orError, setOrError]       = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all')
  const [manualId, setManualId]     = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setManualId('')
    setManualError(null)
    setJustAddedIds(new Set())
    setTimeout(() => searchRef.current?.focus(), 80)

    if (orModels.length === 0) {
      setLoadingOR(true)
      fetchOpenRouterModels()
        .then(setOrModels)
        .catch(e => setOrError(e instanceof Error ? e.message : 'Erro ao carregar modelos do OpenRouter'))
        .finally(() => setLoadingOR(false))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const filtered = useMemo(() => {
    if (!orModels.length) return []
    let list = orModels
    if (priceFilter === 'free') list = list.filter(m => parseFloat(m.pricing?.prompt ?? '1') === 0)
    if (priceFilter === 'paid') list = list.filter(m => parseFloat(m.pricing?.prompt ?? '0') > 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.id.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q),
      )
    }
    return list.slice(0, 120)
  }, [orModels, search, priceFilter])

  const handleManualAdd = () => {
    const id = manualId.trim()
    if (!id) return
    if (existingIds.has(id)) {
      setManualError('Este modelo já está no catálogo.')
      return
    }
    if (!id.includes('/')) {
      setManualError('Use o formato "provider/nome-do-modelo" (ex: openai/gpt-4o).')
      return
    }
    const tier = inferTier(id)
    const opt: ModelOption = {
      id,
      label: id.split('/').pop() ?? id,
      provider: inferProviderFromId(id),
      tier,
      description: 'Modelo adicionado manualmente',
      contextWindow: 128_000,
      inputCost: 0,
      outputCost: 0,
      isFree: false,
      agentFit: inferFitScores(tier, id),
    }
    onAdd(opt)
    setManualId('')
    setManualError(null)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.8rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.96)] shadow-[0_28px_80px_rgba(15,23,42,0.24)] backdrop-blur-xl`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--v2-line-soft)] bg-[linear-gradient(135deg,rgba(99,102,241,0.12),rgba(255,255,255,0.96)_60%,rgba(15,23,42,0.04))] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--v2-ink-strong)]">Adicionar Modelos ao Catálogo</h2>
            <p className="text-sm text-[var(--v2-ink-soft)]">
              {orModels.length > 0
                ? `${filtered.length} de ${orModels.length} modelos do OpenRouter`
                : 'Buscando modelos do OpenRouter...'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[var(--v2-ink-soft)] transition-colors hover:bg-[rgba(15,23,42,0.08)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Manual add */}
        <div className="border-b border-[var(--v2-line-soft)] bg-[rgba(245,158,11,0.08)] px-6 py-3">
          <p className="text-xs text-amber-700 font-medium mb-2">
            <Info className="w-3 h-3 inline mr-1" />
            Adicionar por ID (para modelos não listados abaixo):
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="ex: openai/gpt-5-turbo ou anthropic/claude-4-opus"
              value={manualId}
              onChange={e => { setManualId(e.target.value); setManualError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') handleManualAdd() }}
              className={`${V2_CATALOG_FIELD} flex-1 font-mono focus:border-amber-400 focus:ring-4 focus:ring-[rgba(245,158,11,0.12)]`}
            />
            <button
              type="button"
              onClick={handleManualAdd}
              className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
            >
              <PlusCircle className="w-4 h-4" /> Adicionar
            </button>
          </div>
          {manualError && <p className="text-xs text-red-600 mt-1">{manualError}</p>}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--v2-line-soft)] bg-[rgba(15,23,42,0.04)] px-6 py-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--v2-ink-faint)]" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar modelo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${V2_CATALOG_FIELD} pl-8 py-1.5 focus:border-[rgba(99,102,241,0.35)] focus:ring-[rgba(99,102,241,0.12)]`}
            />
          </div>
          <div className={V2_CATALOG_FILTER_GROUP}>
            {(['all', 'free', 'paid'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setPriceFilter(f)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  priceFilter === f ? 'bg-indigo-600 text-white shadow-[0_10px_24px_rgba(79,70,229,0.18)]' : 'text-[var(--v2-ink-soft)] hover:bg-[rgba(15,23,42,0.06)]'
                }`}
              >
                {f === 'all' ? 'Todos' : f === 'free' ? '✦ Grátis' : 'Pagos'}
              </button>
            ))}
          </div>
          <a
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Ver no OpenRouter
          </a>
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto">
          {loadingOR ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--v2-ink-faint)]">
              <RefreshCw className="w-8 h-8 mb-3 animate-spin" />
              <p className="text-sm">Carregando modelos do OpenRouter...</p>
            </div>
          ) : orError ? (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="w-8 h-8 mb-3 text-red-400" />
              <p className="text-sm text-red-600">{orError}</p>
              <p className="mt-1 text-xs text-[var(--v2-ink-faint)]">Você pode ainda adicionar modelos manualmente pelo ID acima.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--v2-ink-faint)]">
              <Filter className="w-8 h-8 mb-2" />
              <p className="text-sm">Nenhum modelo encontrado.</p>
            </div>
          ) : (
            filtered.map(m => (
              <ORModelRow
                key={m.id}
                model={m}
                onAdd={model => {
                  onAdd(model)
                  setJustAddedIds(prev => new Set(prev).add(model.id))
                }}
                alreadyInCatalog={existingIds.has(m.id)}
                justAdded={justAddedIds.has(m.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--v2-line-soft)] bg-[rgba(15,23,42,0.04)] px-6 py-3">
          <span className="text-xs text-[var(--v2-ink-soft)]">
            {justAddedIds.size > 0
              ? (() => { const pl = justAddedIds.size !== 1 ? 's' : ''; return `${justAddedIds.size} modelo${pl} adicionado${pl} — salve o catálogo para confirmar.` })()
              : 'Após adicionar, salve o catálogo. Os modelos adicionados ficam disponíveis em todos os seletores de agentes.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className={V2_CATALOG_BUTTON_SECONDARY}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ModelCatalogCard() {
  const toast = useToast()
  const [catalog, setCatalog]       = useState<ModelOption[]>([])
  const [original, setOriginal]     = useState<ModelOption[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [expanded, setExpanded]     = useState(false)
  const [search, setSearch]         = useState('')
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [provFilter, setProvFilter] = useState('all')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [checking, setChecking]     = useState(false)

  useEffect(() => {
    loadModelCatalog()
      .then(m => { setCatalog(m); setOriginal(m) })
      .catch(() => {
        setCatalog([...AVAILABLE_MODELS])
        setOriginal([...AVAILABLE_MODELS])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (window.location.hash === '#section_model_catalog') {
      setExpanded(true)
    }
  }, [])

  const hasChanges = JSON.stringify(catalog) !== JSON.stringify(original)

  const handleHealthCheck = useCallback(async () => {
    setChecking(true)
    try {
      const result = await runModelHealthCheck(true)
      const msg = formatHealthCheckMessage(result)
      if (result.removedModels.length > 0) {
        toast.warning(msg.title, msg.message)
        // Reload catalog after cleanup
        const fresh = await loadModelCatalog()
        setCatalog(fresh)
        setOriginal(fresh)
      } else {
        toast.success(msg.title, msg.message)
      }
    } catch (e) {
      toast.error('Erro na verificação', e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setChecking(false)
    }
  }, [toast])

  const allProviders = useMemo(
    () => [...new Set(catalog.map(m => m.provider))].sort(),
    [catalog],
  )

  const filtered = useMemo(() => {
    let list = catalog
    if (priceFilter === 'free') list = list.filter(m => m.isFree)
    if (priceFilter === 'paid') list = list.filter(m => !m.isFree)
    if (tierFilter !== 'all') list = list.filter(m => m.tier === tierFilter)
    if (provFilter !== 'all') list = list.filter(m => m.provider === provFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.label.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q),
      )
    }
    return list
  }, [catalog, search, priceFilter, tierFilter, provFilter])

  const handleAddModel = useCallback((model: ModelOption) => {
    setCatalog(prev => {
      if (prev.find(m => m.id === model.id)) return prev
      return [...prev, model]
    })
    setSaved(false)
  }, [])

  const handleRemove = (modelId: string) => {
    setCatalog(prev => prev.filter(m => m.id !== modelId))
    setSaved(false)
  }

  const handleReset = () => {
    setCatalog([...AVAILABLE_MODELS])
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveModelCatalog(catalog)

      const providerSettings = await loadProviderSettings()
      const nextSavedModelsByProvider = new Map<ProviderId, ModelOption[]>()
      for (const model of catalog) {
        const providerId = resolveCatalogProviderId(model)
        const current = nextSavedModelsByProvider.get(providerId) ?? []
        current.push({ ...model, providerId })
        nextSavedModelsByProvider.set(providerId, current)
      }

      const providerUpdates: ProviderSettingsMap = {}
      for (const providerId of PROVIDER_ORDER) {
        const currentEntry = providerSettings[providerId]
        const currentSaved = currentEntry?.saved_models ?? []
        const nextSaved = nextSavedModelsByProvider.get(providerId) ?? []

        if (!currentEntry && nextSaved.length === 0) continue
        if (haveSameModelIds(currentSaved, nextSaved)) continue

        providerUpdates[providerId] = {
          ...(currentEntry ?? { enabled: providerId === 'openrouter' }),
          saved_models: nextSaved,
          last_synced_at: new Date().toISOString(),
        }
      }

      if (Object.keys(providerUpdates).length > 0) {
        await saveProviderSettings(providerUpdates)
      }

      setOriginal([...catalog])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar o catálogo.')
    } finally {
      setSaving(false)
    }
  }

  const existingIds = useMemo(() => new Set(catalog.map(m => m.id)), [catalog])

  if (loading) {
    return (
      <div className={`${V2_CATALOG_PANEL} mb-6 p-6`}>
        <p className="text-sm text-[var(--v2-ink-faint)]">Carregando catálogo de modelos...</p>
      </div>
    )
  }

  return (
    <>
      <div className={`${V2_CATALOG_PANEL} mb-6 overflow-hidden`}>
        {/* ── Header ── */}
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-[rgba(15,23,42,0.04)]"
        >
          <div className="flex items-center gap-3">
            <div className={V2_CATALOG_ICON_SURFACE}>
              <Library className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--v2-ink-strong)]">Catálogo Pessoal</h2>
              <p className="text-sm text-[var(--v2-ink-soft)]">
                {catalog.length} modelo{catalog.length !== 1 ? 's' : ''} no seu catálogo
                {' · '}
                {catalog.filter(m => m.isFree).length} gratuitos
                {' · '}
                Agrega modelos de todos os provedores que você habilitou
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                Não salvo
              </span>
            )}
            {expanded
              ? <ChevronUp className="w-5 h-5 text-[var(--v2-ink-faint)]" />
              : <ChevronDown className="w-5 h-5 text-[var(--v2-ink-faint)]" />
            }
          </div>
        </button>

        {/* ── Expanded content ── */}
        {expanded && (
          <div className="px-6 pb-6">
            {/* Toolbar */}
            <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[var(--v2-line-soft)] pb-4">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--v2-ink-faint)]" />
                <input
                  type="text"
                  placeholder="Buscar modelo..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={`${V2_CATALOG_FIELD} pl-8`}
                />
              </div>

              {/* Price filter */}
              <div className={V2_CATALOG_FILTER_GROUP}>
                {(['all', 'free', 'paid'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPriceFilter(f)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                      priceFilter === f ? 'bg-indigo-600 text-white shadow-[0_10px_24px_rgba(79,70,229,0.18)]' : 'text-[var(--v2-ink-soft)] hover:bg-[rgba(15,23,42,0.06)]'
                    }`}
                  >
                    {f === 'all' ? 'Todos' : f === 'free' ? '✦ Grátis' : 'Pagos'}
                  </button>
                ))}
              </div>

              {/* Tier filter */}
              <select
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
                className={V2_CATALOG_SELECT}
              >
                <option value="all">Todos os tiers</option>
                <option value="fast">Rápido</option>
                <option value="balanced">Equilibrado</option>
                <option value="premium">Premium</option>
              </select>

              {/* Provider filter */}
              <select
                value={provFilter}
                onChange={e => setProvFilter(e.target.value)}
                className={V2_CATALOG_SELECT}
              >
                <option value="all">Todos os provedores</option>
                {allProviders.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              {/* Add button */}
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className={`${V2_CATALOG_BUTTON_PRIMARY} ml-auto`}
              >
                <Plus className="w-4 h-4" /> Adicionar modelo
              </button>
            </div>

            {/* Results summary */}
            <p className="mb-3 text-xs text-[var(--v2-ink-soft)]">
              Mostrando <strong>{filtered.length}</strong> de <strong>{catalog.length}</strong> modelos
              {(search || priceFilter !== 'all' || tierFilter !== 'all' || provFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setPriceFilter('all'); setTierFilter('all'); setProvFilter('all') }}
                  className="ml-2 font-semibold text-indigo-700 hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </p>

            {/* ── Table ── */}
            <div className={`${V2_CATALOG_INSET} overflow-hidden`}>
              {/* Table header */}
              <div className={V2_CATALOG_TABLE_HEADER}>
                <span>Modelo</span>
                <span>Perfil</span>
                <span className="text-center">Adequação /10 (Ex/Sí/Ra/Re)</span>
                <span>Melhor para</span>
                <span className="text-center">Contexto</span>
                <span className="text-center">Entrada</span>
                <span className="text-center">Saída</span>
                <span />
              </div>

              {/* Scrollable rows */}
              <div className="divide-y divide-[var(--v2-line-soft)] overflow-x-auto">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--v2-ink-faint)]">
                    <Filter className="w-7 h-7 mb-2" />
                    <p className="text-sm">Nenhum modelo encontrado com esses filtros.</p>
                  </div>
                ) : (
                  filtered.map(model => {
                    const tierStyle = TIER_STYLES[model.tier]
                    const best = getBestAgentInfo(model.agentFit)
                    const BestIcon = CATEGORY_ICONS[best.topCategory]
                    const provColor = PROVIDER_COLORS[model.provider] ?? 'bg-gray-100 text-gray-700'

                    return (
                      <div
                        key={model.id}
                        className={V2_CATALOG_TABLE_ROW}
                      >
                        {/* Model name + badges */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-[var(--v2-ink-strong)] truncate">{model.label}</span>
                            {model.isFree && (
                              <span className="text-[9px] px-1 py-0.5 rounded-full bg-green-100 text-green-700 font-bold whitespace-nowrap">✦ GRÁTIS</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${provColor}`}>{model.provider}</span>
                            <CapabilityBadges capabilities={model.capabilities} />
                            <span className="max-w-[140px] truncate font-mono text-[9px] text-[var(--v2-ink-faint)]" title={model.id}>{model.id}</span>
                          </div>
                          {/* Rate limits for free models */}
                          {model.isFree && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />
                              <span className="text-[9px] text-amber-700 font-medium">
                                {FREE_TIER_RATE_LIMITS.rpm} req/min · {FREE_TIER_RATE_LIMITS.rpd} req/dia
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Tier/profile */}
                        <div className="flex items-center justify-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${tierStyle.bg} ${tierStyle.text}`}>
                            {tierStyle.label}
                          </span>
                        </div>

                        {/* Fit scores (Extração / Síntese / Raciocínio / Redação) */}
                        <div className="flex items-center justify-center gap-1">
                          <ScoreCell score={model.agentFit.extraction} label="Ex" title="Extração" />
                          <ScoreCell score={model.agentFit.synthesis}  label="Sí" title="Síntese" />
                          <ScoreCell score={model.agentFit.reasoning}  label="Ra" title="Raciocínio" />
                          <ScoreCell score={model.agentFit.writing}    label="Re" title="Redação" />
                        </div>

                        {/* Best for */}
                        <div className="min-w-0">
                          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${CATEGORY_COLORS[best.topCategory]}`}>
                            <BestIcon className="w-2.5 h-2.5 flex-shrink-0" />
                            {best.categoryLabel}
                          </div>
                          <p className="mt-0.5 truncate text-[9px] leading-tight text-[var(--v2-ink-faint)]" title={best.agents.join(', ')}>
                            {best.agents.slice(0, 3).join(', ')}
                          </p>
                          <p className="hidden truncate text-[9px] leading-tight text-[var(--v2-ink-faint)] xl:block" title={best.why}>
                            {best.why}
                          </p>
                        </div>

                        {/* Context window */}
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-mono font-semibold text-[var(--v2-ink-strong)]">{fmt(model.contextWindow)}</span>
                          <span className="text-[9px] text-[var(--v2-ink-faint)]">tokens</span>
                        </div>

                        {/* Input cost */}
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-mono font-semibold ${model.isFree ? 'text-green-600' : 'text-[var(--v2-ink-strong)]'}`}>
                            {fmtCost(model.inputCost)}
                          </span>
                          <span className="text-[9px] text-[var(--v2-ink-faint)]">/1M tkn</span>
                        </div>

                        {/* Output cost */}
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-mono font-semibold ${model.isFree ? 'text-green-600' : 'text-[var(--v2-ink-strong)]'}`}>
                            {fmtCost(model.outputCost)}
                          </span>
                          <span className="text-[9px] text-[var(--v2-ink-faint)]">/1M tkn</span>
                        </div>

                        {/* Delete */}
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemove(model.id)}
                            title={`Remover ${model.label} do catálogo`}
                            className="rounded-full p-1.5 text-[var(--v2-ink-faint)] transition-colors hover:bg-[rgba(239,68,68,0.08)] hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="mt-3 space-y-2 rounded-[1.15rem] border border-indigo-200 bg-[rgba(99,102,241,0.08)] p-3">
              <p className="text-xs leading-relaxed text-indigo-900">
                <strong>📊 Legenda de Adequação:</strong>
                {' '}
                <span className="font-semibold">Ex</span> = Extração (Triagem, Buscador, Fact-Checker) ·{' '}
                <span className="font-semibold">Sí</span> = Síntese (Compilador, Revisor, Moderador) ·{' '}
                <span className="font-semibold">Ra</span> = Raciocínio (Jurista, Pesquisador, Adv. do Diabo) ·{' '}
                <span className="font-semibold">Re</span> = Redação (Redator).
                {' '}Escala 1–10:
                {' '}<span className="bg-emerald-100 text-emerald-700 px-1 rounded text-[10px] font-bold">9–10</span> Excelente
                {' '}<span className="bg-green-100 text-green-700 px-1 rounded text-[10px]">7–8</span> Ótimo
                {' '}<span className="bg-yellow-100 text-yellow-700 px-1 rounded text-[10px]">5–6</span> Bom
                {' '}<span className="bg-orange-100 text-orange-600 px-1 rounded text-[10px]">3–4</span> Razoável
                {' '}<span className="bg-red-100 text-red-500 px-1 rounded text-[10px]">1–2</span> Não recomendado.
                {' '}Pontuações são estimativas — ajuste conforme sua experiência.
              </p>
              <div className="flex items-start gap-1.5 rounded-[1rem] border border-amber-200 bg-[rgba(245,158,11,0.1)] p-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">
                  <strong>Limite tier gratuito (✦ GRÁTIS):</strong>{' '}
                  Os modelos gratuitos do OpenRouter estão sujeitos a{' '}
                  <strong>{FREE_TIER_RATE_LIMITS.rpm} requisições/minuto</strong>{' '}e{' '}
                  <strong>{FREE_TIER_RATE_LIMITS.rpd} requisições/dia</strong>{' '}
                  por conta. Erros 429 são esperados em uso intensivo ou pipelines multi-agente.
                  Para produção, use modelos pagos.
                </p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-[1.1rem] border border-red-200 bg-[rgba(254,226,226,0.72)] p-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--v2-line-soft)] pt-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className={V2_CATALOG_BUTTON_PRIMARY}
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saved ? 'Catálogo salvo!' : saving ? 'Salvando...' : 'Salvar Catálogo'}
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                title="Restaurar o catálogo padrão (modelos originais da plataforma)"
                className={V2_CATALOG_BUTTON_SECONDARY}
              >
                <RotateCcw className="w-4 h-4" /> Restaurar padrão
              </button>

              <button
                type="button"
                onClick={handleHealthCheck}
                disabled={checking || saving}
                title="Verificar quais modelos do catálogo ainda existem em seus respectivos provedores"
                className={V2_CATALOG_BUTTON_WARM}
              >
                {checking ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {checking ? 'Verificando...' : 'Verificar Disponibilidade'}
              </button>

              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className={`${V2_CATALOG_BUTTON_TINTED} ml-auto`}
              >
                <Download className="w-4 h-4" /> Adicionar do OpenRouter
              </button>

              {hasChanges && !saved && (
                <span className="text-xs font-semibold text-amber-700">Alterações não salvas — os seletores de agentes serão atualizados ao salvar</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add from OpenRouter modal */}
      <AddFromORModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        existingIds={existingIds}
        onAdd={handleAddModel}
      />
    </>
  )
}
