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
import { useToast } from './Toast'

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmt(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`
  if (tokens >= 1_000)     return `${Math.round(tokens / 1_000)}K`
  return String(tokens)
}

function fmtCost(usd: number): string {
  if (usd === 0) return 'Grátis'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1)   return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
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
}

// ── Capability badges ─────────────────────────────────────────────────────────

const CAPABILITY_LABELS: Record<ModelCapability, { emoji: string; label: string; style: string }> = {
  text:  { emoji: '📝', label: 'Texto',  style: 'bg-gray-100 text-gray-700'    },
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
    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-100 ${alreadyInCatalog ? 'opacity-40' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">{opt.label}</span>
          {isFree && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">✦ GRÁTIS</span>}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PROVIDER_COLORS[opt.provider] ?? 'bg-gray-100 text-gray-700'}`}>{opt.provider}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tierStyle.bg} ${tierStyle.text}`}>{tierStyle.label}</span>
          <CapabilityBadges capabilities={opt.capabilities} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
          <span className="flex items-center gap-0.5"><Cpu className="w-3 h-3" /> {fmt(opt.contextWindow)}</span>
          <span className="flex items-center gap-0.5">
            <Coins className="w-3 h-3" />
            <span className={isFree ? 'text-green-600 font-semibold' : ''}>{fmtCost(opt.inputCost)}</span>
            {' / '}
            <span className={isFree ? 'text-green-600 font-semibold' : ''}>{fmtCost(opt.outputCost)}</span>
          </span>
          <span className="font-mono text-gray-400 truncate hidden sm:block">{model.id}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAdd(opt)}
        disabled={alreadyInCatalog}
        className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          justAdded
            ? 'bg-green-600 text-white'
            : 'text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed'
        }`}
      >
        {alreadyInCatalog
          ? (justAdded ? <><CheckCircle2 className="w-3 h-3" /> Adicionado</> : 'Já no catálogo')
          : <><Plus className="w-3 h-3" /> Adicionar</>
        }
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Adicionar Modelos ao Catálogo</h2>
            <p className="text-sm text-gray-500">
              {orModels.length > 0
                ? `${filtered.length} de ${orModels.length} modelos do OpenRouter`
                : 'Buscando modelos do OpenRouter...'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Manual add */}
        <div className="px-6 py-3 border-b bg-amber-50">
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
              className="flex-1 text-sm border border-amber-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none font-mono"
            />
            <button
              type="button"
              onClick={handleManualAdd}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
            >
              <PlusCircle className="w-4 h-4" /> Adicionar
            </button>
          </div>
          {manualError && <p className="text-xs text-red-600 mt-1">{manualError}</p>}
        </div>

        {/* Filters */}
        <div className="px-6 py-2 border-b bg-gray-50 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar modelo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
            {(['all', 'free', 'paid'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setPriceFilter(f)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  priceFilter === f ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
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
            className="flex items-center gap-1 text-xs text-purple-600 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Ver no OpenRouter
          </a>
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto">
          {loadingOR ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <RefreshCw className="w-8 h-8 mb-3 animate-spin" />
              <p className="text-sm">Carregando modelos do OpenRouter...</p>
            </div>
          ) : orError ? (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="w-8 h-8 mb-3 text-red-400" />
              <p className="text-sm text-red-600">{orError}</p>
              <p className="text-xs text-gray-400 mt-1">Você pode ainda adicionar modelos manualmente pelo ID acima.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
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
        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {justAddedIds.size > 0
              ? `${justAddedIds.size} modelo${justAddedIds.size !== 1 ? 's' : ''} adicionado${justAddedIds.size !== 1 ? 's' : ''} — salve o catálogo para confirmar.`
              : 'Após adicionar, salve o catálogo. Os modelos adicionados ficam disponíveis em todos os seletores de agentes.'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
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
      <div className="bg-white rounded-xl border p-6 mb-6">
        <p className="text-gray-400 text-sm">Carregando catálogo de modelos...</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border mb-6 overflow-hidden">
        {/* ── Header ── */}
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Library className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Catálogo de Modelos</h2>
              <p className="text-sm text-gray-500">
                {catalog.length} modelo{catalog.length !== 1 ? 's' : ''} disponíveis
                {' · '}
                {catalog.filter(m => m.isFree).length} gratuitos
                {' · '}
                Fonte de referência para todos os agentes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                Não salvo
              </span>
            )}
            {expanded
              ? <ChevronUp className="w-5 h-5 text-gray-400" />
              : <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </div>
        </button>

        {/* ── Expanded content ── */}
        {expanded && (
          <div className="px-6 pb-6">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar modelo..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>

              {/* Price filter */}
              <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5">
                {(['all', 'free', 'paid'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPriceFilter(f)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      priceFilter === f ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
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
                className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:ring-2 focus:ring-indigo-500"
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
                className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Todos os provedores</option>
                {allProviders.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              {/* Add button */}
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors ml-auto"
              >
                <Plus className="w-4 h-4" /> Adicionar modelo
              </button>
            </div>

            {/* Results summary */}
            <p className="text-xs text-gray-500 mb-3">
              Mostrando <strong>{filtered.length}</strong> de <strong>{catalog.length}</strong> modelos
              {(search || priceFilter !== 'all' || tierFilter !== 'all' || provFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setPriceFilter('all'); setTierFilter('all'); setProvFilter('all') }}
                  className="ml-2 text-indigo-600 hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </p>

            {/* ── Table ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[minmax(180px,1.5fr)_70px_140px_minmax(130px,1fr)_70px_70px_70px_40px] items-center gap-2 px-3 py-2 bg-gray-50 border-b text-[10px] font-semibold text-gray-500 uppercase tracking-wide overflow-x-auto min-w-[880px]">
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
              <div className="divide-y divide-gray-100 overflow-x-auto">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
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
                        className="grid grid-cols-[minmax(180px,1.5fr)_70px_140px_minmax(130px,1fr)_70px_70px_70px_40px] items-center gap-2 px-3 py-3 hover:bg-gray-50/70 transition-colors min-w-[880px]"
                      >
                        {/* Model name + badges */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 truncate">{model.label}</span>
                            {model.isFree && (
                              <span className="text-[9px] px-1 py-0.5 rounded-full bg-green-100 text-green-700 font-bold whitespace-nowrap">✦ GRÁTIS</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${provColor}`}>{model.provider}</span>
                            <CapabilityBadges capabilities={model.capabilities} />
                            <span className="text-[9px] text-gray-400 font-mono truncate max-w-[140px]" title={model.id}>{model.id}</span>
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
                          <p className="text-[9px] text-gray-400 mt-0.5 leading-tight truncate" title={best.agents.join(', ')}>
                            {best.agents.slice(0, 3).join(', ')}
                          </p>
                          <p className="text-[9px] text-gray-400 leading-tight truncate hidden xl:block" title={best.why}>
                            {best.why}
                          </p>
                        </div>

                        {/* Context window */}
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-mono font-semibold text-gray-700">{fmt(model.contextWindow)}</span>
                          <span className="text-[9px] text-gray-400">tokens</span>
                        </div>

                        {/* Input cost */}
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-mono font-semibold ${model.isFree ? 'text-green-600' : 'text-gray-700'}`}>
                            {fmtCost(model.inputCost)}
                          </span>
                          <span className="text-[9px] text-gray-400">/1M tkn</span>
                        </div>

                        {/* Output cost */}
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-mono font-semibold ${model.isFree ? 'text-green-600' : 'text-gray-700'}`}>
                            {fmtCost(model.outputCost)}
                          </span>
                          <span className="text-[9px] text-gray-400">/1M tkn</span>
                        </div>

                        {/* Delete */}
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemove(model.id)}
                            title={`Remover ${model.label} do catálogo`}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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

            <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-lg space-y-2">
              <p className="text-xs text-indigo-800 leading-relaxed">
                <strong>📊 Legenda de Adequação:</strong>
                {' '}
                <span className="font-semibold">Ex</span> = Extração (Triagem, Buscador, Fact-Checker) ·{' '}
                <span className="font-semibold">Sí</span> = Síntese (Compilador, Revisor, Moderador) ·{' '}
                <span className="font-semibold">Ra</span> = Raciocínio (Jurista, Pesquisador, Adv. do Diabo) ·{' '}
                <span className="font-semibold">Re</span> = Redação (Redator).
                {' '}Escala 1–5:
                {' '}<span className="bg-emerald-100 text-emerald-700 px-1 rounded text-[10px] font-bold">5</span> Excelente
                {' '}<span className="bg-green-100 text-green-700 px-1 rounded text-[10px]">4</span> Ótimo
                {' '}<span className="bg-yellow-100 text-yellow-700 px-1 rounded text-[10px]">3</span> Bom
                {' '}<span className="bg-orange-100 text-orange-600 px-1 rounded text-[10px]">2</span> Razoável
                {' '}<span className="bg-red-100 text-red-500 px-1 rounded text-[10px]">1</span> Não recomendado.
                {' '}Pontuações são estimativas — ajuste conforme sua experiência.
              </p>
              <div className="flex items-start gap-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg">
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
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t">
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Restaurar padrão
              </button>

              <button
                type="button"
                onClick={handleHealthCheck}
                disabled={checking || saving}
                title="Verificar quais modelos do catálogo ainda existem no OpenRouter"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors ml-auto"
              >
                <Download className="w-4 h-4" /> Adicionar do OpenRouter
              </button>

              {hasChanges && !saved && (
                <span className="text-xs text-amber-600">Alterações não salvas — os seletores de agentes serão atualizados ao salvar</span>
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
