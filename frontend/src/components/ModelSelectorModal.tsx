/**
 * ModelSelectorModal — Rich model selection dialog for the Admin Panel.
 *
 * Features:
 * - Lists all 45+ OpenRouter models with full metadata
 * - Filters: Free/Paid, Provider, Tier
 * - Search by name / provider
 * - Sort by: Adequação (fit score for this agent), Custo, Contexto
 * - Displays: context window, input/output cost, fit score (★) per agent category
 * - Free-tier badge
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  X,
  Search,
  Filter,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Cpu,
  Coins,
  AlignLeft,
} from 'lucide-react'
import {
  AVAILABLE_MODELS,
  type ModelOption,
  type AgentCategory,
} from '../lib/model-config'
import { useCatalogModels } from '../lib/model-catalog'

// ── Types ──────────────────────────────────────────────────────────────────────

type SortKey = 'fit' | 'cost' | 'context'
type PriceFilter = 'all' | 'free' | 'paid'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (modelId: string) => void
  currentModelId: string
  agentCategory: AgentCategory
  agentLabel: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TIER_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  fast:     { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Rápido'      },
  balanced: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  label: 'Equilibrado' },
  premium:  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   label: 'Premium'     },
}

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

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  extraction: 'Extração',
  synthesis:  'Síntese',
  reasoning:  'Raciocínio',
  writing:    'Redação',
}

const SCORE_COLORS = (n: number) =>
  n >= 9 ? 'bg-emerald-100 text-emerald-700 font-bold'
  : n >= 7 ? 'bg-green-100 text-green-700 font-semibold'
  : n >= 5 ? 'bg-yellow-100 text-yellow-700'
  : n >= 3 ? 'bg-orange-100 text-orange-600'
  : 'bg-red-100 text-red-500'

/** Compact score badge: shows numeric value with colour coding */
function ScoreBadge({
  score, label, highlighted,
}: { score: number; label: string; highlighted: boolean }) {
  return (
    <span
      className={`inline-flex flex-col items-center px-1 py-0.5 rounded text-[9px] leading-tight ${
        highlighted ? `ring-2 ring-offset-0 ring-purple-400 ${SCORE_COLORS(score)}` : SCORE_COLORS(score)
      }`}
      title={`${label}: ${score}/10`}
    >
      <span className="font-bold text-[10px]">{score}</span>
      <span className="opacity-70">{label}</span>
    </span>
  )
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`
  if (tokens >= 1_000)     return `${tokens / 1_000}K`
  return String(tokens)
}

function formatCost(usd: number): string {
  if (usd === 0) return 'Grátis'
  if (usd < 1)   return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ModelSelectorModal({
  open, onClose, onSelect, currentModelId, agentCategory, agentLabel,
}: Props) {
  const catalogModels = useCatalogModels()
  const [search,      setSearch]      = useState('')
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all')
  const [tierFilter,  setTierFilter]  = useState<string>('all')
  const [provFilter,  setProvFilter]  = useState<string>('all')
  const [sortBy,      setSortBy]      = useState<SortKey>('fit')
  const [sortAsc,     setSortAsc]     = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50)
      setSearch('')
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const allProviders = useMemo(
    () => [...new Set(catalogModels.map(m => m.provider))].sort(),
    [catalogModels],
  )

  const filtered = useMemo<ModelOption[]>(() => {
    let list = catalogModels

    // Price filter
    if (priceFilter === 'free') list = list.filter(m => m.isFree)
    if (priceFilter === 'paid') list = list.filter(m => !m.isFree)

    // Tier filter
    if (tierFilter !== 'all') list = list.filter(m => m.tier === tierFilter)

    // Provider filter
    if (provFilter !== 'all') list = list.filter(m => m.provider === provFilter)

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.label.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q),
      )
    }

    // Sort
    const multiplier = sortAsc ? 1 : -1
    list = [...list].sort((a, b) => {
      if (sortBy === 'fit') {
        return multiplier * (a.agentFit[agentCategory] - b.agentFit[agentCategory])
      }
      if (sortBy === 'cost') {
        const costA = a.inputCost + a.outputCost
        const costB = b.inputCost + b.outputCost
        return multiplier * (costA - costB)
      }
      // context
      return multiplier * (a.contextWindow - b.contextWindow)
    })

    return list
  }, [search, priceFilter, tierFilter, provFilter, sortBy, sortAsc, agentCategory, catalogModels])

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(a => !a)
    else { setSortBy(key); setSortAsc(false) }
  }

  if (!open) return null

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Selecionar Modelo</h2>
            <p className="text-sm text-gray-500">
              Agente: <strong>{agentLabel}</strong>
              {' · '}
              <span className="text-purple-600">Categoria: {CATEGORY_LABELS[agentCategory]}</span>
              {' · '}
              <span className="text-gray-400">{filtered.length} modelo{filtered.length !== 1 ? 's' : ''}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Filters & Search ── */}
        <div className="px-6 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar modelo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            />
          </div>

          {/* Price filter */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {(['all', 'free', 'paid'] as PriceFilter[]).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setPriceFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  priceFilter === f
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
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
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="all">Todos os provedores</option>
            {allProviders.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* ── Column headers (sort) ── */}
        <div className="px-6 py-2 border-b bg-white grid grid-cols-[1fr_148px_auto_auto_auto] items-center gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <span>Modelo</span>
          <SortButton label="Adequação /10" icon={<Cpu className="w-3 h-3" />} sortKey="fit" current={sortBy} asc={sortAsc} onClick={toggleSort} />
          <SortButton label="Contexto"  icon={<AlignLeft className="w-3 h-3" />} sortKey="context" current={sortBy} asc={sortAsc} onClick={toggleSort} />
          <SortButton label="Entrada"   icon={<Coins className="w-3 h-3" />} sortKey="cost" current={sortBy} asc={sortAsc} onClick={toggleSort} />
          <span className="min-w-[70px] text-center">Saída</span>
        </div>

        {/* ── Model list ── */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Filter className="w-8 h-8 mb-2" />
              <p className="text-sm">Nenhum modelo encontrado com esses filtros.</p>
            </div>
          ) : (
            filtered.map(model => {
              const isCurrent = model.id === currentModelId
              const tierStyle = TIER_STYLES[model.tier]
              const provColor = PROVIDER_COLORS[model.provider] ?? 'bg-gray-100 text-gray-700'

              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => { onSelect(model.id); onClose() }}
                  className={`w-full px-6 py-3 grid grid-cols-[1fr_148px_auto_auto_auto] items-center gap-3 text-left transition-colors hover:bg-purple-50/50 ${
                    isCurrent ? 'bg-purple-50 border-l-4 border-purple-500' : ''
                  }`}
                >
                  {/* Model info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">{model.label}</span>
                      {model.isFree && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold whitespace-nowrap">
                          ✦ GRÁTIS
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> atual
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${provColor}`}>
                        {model.provider}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${tierStyle.bg} ${tierStyle.text} ${tierStyle.border}`}>
                        {tierStyle.label}
                      </span>
                      <span className="text-[10px] text-gray-400 truncate hidden sm:block">{model.description}</span>
                    </div>
                  </div>

                  {/* All 4 fit scores — agent category highlighted */}
                  <div className="flex items-center justify-center gap-1">
                    <ScoreBadge score={model.agentFit.extraction} label="Ex" highlighted={agentCategory === 'extraction'} />
                    <ScoreBadge score={model.agentFit.synthesis}  label="Sí" highlighted={agentCategory === 'synthesis'}  />
                    <ScoreBadge score={model.agentFit.reasoning}  label="Ra" highlighted={agentCategory === 'reasoning'}  />
                    <ScoreBadge score={model.agentFit.writing}    label="Re" highlighted={agentCategory === 'writing'}    />
                  </div>

                  {/* Context window */}
                  <div className="flex flex-col items-center min-w-[64px]">
                    <span className="flex items-center gap-1 text-xs font-mono font-semibold text-gray-700">
                      <Cpu className="w-3 h-3 text-gray-400" />
                      {formatContext(model.contextWindow)}
                    </span>
                    <span className="text-[10px] text-gray-400">tokens</span>
                  </div>

                  {/* Input cost */}
                  <div className="flex flex-col items-center min-w-[64px]">
                    <span className={`text-xs font-mono font-semibold ${model.isFree ? 'text-green-600' : 'text-gray-700'}`}>
                      {formatCost(model.inputCost)}
                    </span>
                    <span className="text-[10px] text-gray-400">/1M entrada</span>
                  </div>

                  {/* Output cost */}
                  <div className="flex flex-col items-center min-w-[70px]">
                    <span className={`text-xs font-mono font-semibold ${model.isFree ? 'text-green-600' : 'text-gray-700'}`}>
                      {formatCost(model.outputCost)}
                    </span>
                    <span className="text-[10px] text-gray-400">/1M saída</span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            <strong>Adequação /10</strong> — escala global absoluta: ≥9 excelente · 7-8 bom · 5-6 adequado · ≤4 fraco.
            Coluna destacada = categoria desta função ({CATEGORY_LABELS[agentCategory]}).
            Preços em USD/1M tokens (OpenRouter).
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sort button helper ─────────────────────────────────────────────────────────

function SortButton({
  label, icon, sortKey, current, asc, onClick,
}: {
  label: string
  icon: React.ReactNode
  sortKey: SortKey
  current: SortKey
  asc: boolean
  onClick: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1 min-w-[64px] justify-center px-2 py-1 rounded-md transition-colors ${
        active ? 'text-purple-600 bg-purple-50' : 'hover:bg-gray-100'
      }`}
    >
      {icon}
      <span>{label}</span>
      {active
        ? (asc
          ? <ChevronUp className="w-3 h-3" />
          : <ChevronDown className="w-3 h-3" />)
        : <ChevronDown className="w-3 h-3 opacity-30" />
      }
    </button>
  )
}
