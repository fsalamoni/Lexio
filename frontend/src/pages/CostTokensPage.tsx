import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DollarSign, Coins, Cpu, BrainCircuit, ChevronDown, ChevronUp,
  FileText, BookOpen, TrendingUp, Loader2, MessageCircleQuestion, Tags, Brain,
  Search, Video, Headphones, Layout,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { IS_FIREBASE } from '../lib/firebase'
import { getCostBreakdown as firestoreGetCostBreakdown } from '../lib/firestore-service'
import api from '../api/client'
import type { CostBreakdown, CostBreakdownItem } from '../lib/cost-analytics'

// ── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'lexio_cost_tokens_collapse_state'

function loadCollapseState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCollapseState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* quota exceeded — non-critical */ }
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtUsd(value: number) {
  return value < 0.001 ? `$${value.toFixed(5)}` : `$${value.toFixed(4)}`
}

function fmtBrl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtInt(value: number) {
  return value.toLocaleString('pt-BR')
}

function fmtPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

// ── Collapsible Section ──────────────────────────────────────────────────────

function CollapsibleSection({
  id,
  title,
  icon: Icon,
  iconColor,
  badge,
  children,
  collapseState,
  onToggle,
  defaultOpen = true,
}: {
  id: string
  title: string
  icon: React.ElementType
  iconColor?: string
  badge?: string
  children: React.ReactNode
  collapseState: Record<string, boolean>
  onToggle: (id: string) => void
  defaultOpen?: boolean
}) {
  const isOpen = collapseState[id] ?? defaultOpen
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${iconColor || 'text-brand-600'}`} />
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {badge && (
            <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{badge}</span>
          )}
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {isOpen && <div className="px-6 pb-6 space-y-5">{children}</div>}
    </div>
  )
}

// ── Collapsible Card ─────────────────────────────────────────────────────────

function CollapsibleCard({
  id,
  title,
  children,
  collapseState,
  onToggle,
  defaultOpen = true,
}: {
  id: string
  title: string
  children: React.ReactNode
  collapseState: Record<string, boolean>
  onToggle: (id: string) => void
  defaultOpen?: boolean
}) {
  const isOpen = collapseState[id] ?? defaultOpen
  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {isOpen && <div className="p-5">{children}</div>}
    </div>
  )
}

// ── Highlight Card ───────────────────────────────────────────────────────────

function HighlightCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <p className="mt-2 text-base font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{meta}</p>
    </div>
  )
}

// ── Breakdown Table ──────────────────────────────────────────────────────────

function BreakdownTable({ rows, emptyLabel, title }: { rows: CostBreakdownItem[]; emptyLabel: string; title?: string }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400 py-4">{emptyLabel}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] table-fixed" aria-label={title ? `Tabela de ${title}` : 'Tabela de detalhamento de custos'}>
        <thead className="sticky top-0 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="w-[30%] px-4 py-2 text-left">Grupo</th>
            <th className="w-[10%] px-4 py-2 text-right">Chamadas</th>
            <th className="w-[12%] px-4 py-2 text-right">Entrada</th>
            <th className="w-[12%] px-4 py-2 text-right">Saída</th>
            <th className="w-[12%] px-4 py-2 text-right">Tokens</th>
            <th className="w-[12%] px-4 py-2 text-right">USD</th>
            <th className="w-[12%] px-4 py-2 text-right">R$</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(row => (
            <tr key={row.key} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-2.5 text-sm text-gray-800">
                <span className="block truncate" title={row.label}>{row.label}</span>
              </td>
              <td className="px-4 py-2.5 text-sm text-right text-gray-600">{fmtInt(row.calls)}</td>
              <td className="px-4 py-2.5 text-sm text-right text-gray-600">{fmtInt(row.tokens_in)}</td>
              <td className="px-4 py-2.5 text-sm text-right text-gray-600">{fmtInt(row.tokens_out)}</td>
              <td className="px-4 py-2.5 text-sm text-right text-gray-600">{fmtInt(row.total_tokens)}</td>
              <td className="px-4 py-2.5 text-sm text-right font-medium text-amber-700">{fmtUsd(row.cost_usd)}</td>
              <td className="px-4 py-2.5 text-sm text-right font-medium text-emerald-700">{fmtBrl(row.cost_brl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Summary Cards Row ────────────────────────────────────────────────────────

function SummaryCards({ breakdown }: { breakdown: CostBreakdown }) {
  const cards = [
    { label: 'Custo total (USD)', value: fmtUsd(breakdown.total_cost_usd), icon: DollarSign, color: 'text-amber-600' },
    { label: 'Custo total (R$)', value: fmtBrl(breakdown.total_cost_brl), icon: BrainCircuit, color: 'text-emerald-600' },
    { label: 'Tokens de entrada', value: fmtInt(breakdown.total_tokens_in), icon: Coins, color: 'text-sky-600' },
    { label: 'Tokens de saída', value: fmtInt(breakdown.total_tokens_out), icon: Coins, color: 'text-fuchsia-600' },
    { label: 'Tokens totais', value: fmtInt(breakdown.total_tokens), icon: Coins, color: 'text-violet-600' },
    { label: 'Chamadas LLM', value: fmtInt(breakdown.total_calls), icon: Cpu, color: 'text-blue-600' },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map(card => (
        <div key={card.label} className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{card.label}</span>
            <card.icon className={`w-4 h-4 ${card.color}`} />
          </div>
          <p className="text-xl font-bold text-gray-900">{card.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Section-specific Breakdown ───────────────────────────────────────────────

function SectionBreakdown({
  sectionId,
  breakdown,
  collapseState,
  onToggle,
}: {
  sectionId: string
  breakdown: CostBreakdown
  collapseState: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  const hasCost = breakdown.total_cost_usd > 0
  const hasTokens = breakdown.total_tokens > 0

  const modelCostChart = useMemo(() => breakdown.by_model.slice(0, 8).map(row => ({
    name: row.label,
    usd: row.cost_usd,
    brl: row.cost_brl,
  })), [breakdown])

  const modelTokensChart = useMemo(() => breakdown.by_model.slice(0, 8).map(row => ({
    name: row.label,
    entrada: row.tokens_in,
    saida: row.tokens_out,
  })), [breakdown])

  return (
    <>
      <SummaryCards breakdown={breakdown} />

      {(hasCost || hasTokens) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {hasCost && modelCostChart.length > 0 && (
            <CollapsibleCard id={`${sectionId}_chart_model_cost`} title="Custo por modelo (USD / R$)" collapseState={collapseState} onToggle={onToggle}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-2">USD</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={modelCostChart} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={v => fmtUsd(Number(v))} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [fmtUsd(v), 'USD']} />
                      <Bar dataKey="usd" fill="#d97706" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">BRL (cotação ref. {breakdown.exchange_rate_brl.toFixed(2)})</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={modelCostChart} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={v => fmtBrl(Number(v))} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [fmtBrl(v), 'BRL']} />
                      <Bar dataKey="brl" fill="#059669" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CollapsibleCard>
          )}

          {hasTokens && modelTokensChart.length > 0 && (
            <CollapsibleCard id={`${sectionId}_chart_model_tokens`} title="Tokens por modelo" collapseState={collapseState} onToggle={onToggle}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={modelTokensChart} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tickFormatter={v => fmtInt(Number(v))} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmtInt(v), 'Tokens']} />
                  <Bar dataKey="entrada" stackId="tokens" fill="#0284c7" />
                  <Bar dataKey="saida" stackId="tokens" fill="#c026d3" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CollapsibleCard>
          )}
        </div>
      )}

      <CollapsibleCard id={`${sectionId}_tbl_provider`} title="Por API / provedor" collapseState={collapseState} onToggle={onToggle}>
        <BreakdownTable rows={breakdown.by_provider} emptyLabel="Nenhuma API/provedor com consumo registrado." />
      </CollapsibleCard>

      <CollapsibleCard id={`${sectionId}_tbl_model`} title="Por modelo" collapseState={collapseState} onToggle={onToggle}>
        <BreakdownTable rows={breakdown.by_model} emptyLabel="Nenhum modelo com consumo registrado." />
      </CollapsibleCard>

      <CollapsibleCard id={`${sectionId}_tbl_phase`} title="Por fase" collapseState={collapseState} onToggle={onToggle}>
        <BreakdownTable rows={breakdown.by_phase} emptyLabel="Nenhuma fase consolidada ainda." />
      </CollapsibleCard>

      <CollapsibleCard id={`${sectionId}_tbl_agent`} title="Por agente" collapseState={collapseState} onToggle={onToggle}>
        <BreakdownTable rows={breakdown.by_agent} emptyLabel="Nenhum agente com consumo registrado." />
      </CollapsibleCard>
    </>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CostTokensPage() {
  const { userId } = useAuth()
  const toast = useToast()
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapseState, setCollapseState] = useState<Record<string, boolean>>(loadCollapseState)

  const toggleCollapse = useCallback((id: string) => {
    setCollapseState(prev => {
      const next = { ...prev, [id]: prev[id] === undefined ? false : !prev[id] }
      saveCollapseState(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (IS_FIREBASE && !userId) {
      setLoading(false)
      return
    }

    const load = async () => {
      setLoading(true)
      try {
        if (IS_FIREBASE && userId) {
          setBreakdown(await firestoreGetCostBreakdown(userId))
        } else {
          const res = await api.get('/stats/cost-breakdown')
          setBreakdown(res.data as CostBreakdown)
        }
      } catch {
        toast.error('Erro ao carregar detalhamento de custos')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Split executions into document_generation, thesis_analysis, context_detail, acervo_classificador, acervo_ementa, caderno_pesquisa, notebook_acervo, video_pipeline, audio_pipeline and presentation_pipeline
  const { docBreakdown, thesisBreakdown, contextDetailBreakdown, acervoClassificadorBreakdown, acervoEmentaBreakdown, notebookBreakdown, notebookAcervoBreakdown, videoBreakdown, audioBreakdown, presentationBreakdown, highlights } = useMemo(() => {
    if (!breakdown) return { docBreakdown: null, thesisBreakdown: null, contextDetailBreakdown: null, acervoClassificadorBreakdown: null, acervoEmentaBreakdown: null, notebookBreakdown: null, notebookAcervoBreakdown: null, videoBreakdown: null, audioBreakdown: null, presentationBreakdown: null, highlights: [] }

    // We re-derive per-function breakdowns from the by_function data
    // but for deeper analysis we need the raw executions. Since CostBreakdown
    // doesn't carry raw executions, we build sub-breakdowns from the available data.
    // The by_agent_function data contains function-keyed agent entries.
    const docItems = breakdown.by_agent_function.filter(item => item.key.startsWith('document_generation::'))
    const thesisItems = breakdown.by_agent_function.filter(item => item.key.startsWith('thesis_analysis::'))
    const contextDetailItems = breakdown.by_agent_function.filter(item => item.key.startsWith('context_detail::'))
    const acervoClassificadorItems = breakdown.by_agent_function.filter(item => item.key.startsWith('acervo_classificador::'))
    const acervoEmentaItems = breakdown.by_agent_function.filter(item => item.key.startsWith('acervo_ementa::'))
    const notebookItems = breakdown.by_agent_function.filter(item => item.key.startsWith('caderno_pesquisa::'))
    const notebookAcervoItems = breakdown.by_agent_function.filter(item => item.key.startsWith('notebook_acervo::'))
    const videoItems = breakdown.by_agent_function.filter(item => item.key.startsWith('video_pipeline::'))
    const audioItems = breakdown.by_agent_function.filter(item => item.key.startsWith('audio_pipeline::'))
    const presentationItems = breakdown.by_agent_function.filter(item => item.key.startsWith('presentation_pipeline::'))

    // Build approximate sub-breakdowns using available summary data
    const docFunc = breakdown.by_function.find(f => f.key === 'document_generation')
    const thesisFunc = breakdown.by_function.find(f => f.key === 'thesis_analysis')
    const contextDetailFunc = breakdown.by_function.find(f => f.key === 'context_detail')
    const acervoClassificadorFunc = breakdown.by_function.find(f => f.key === 'acervo_classificador')
    const acervoEmentaFunc = breakdown.by_function.find(f => f.key === 'acervo_ementa')
    const notebookFunc = breakdown.by_function.find(f => f.key === 'caderno_pesquisa')
    const notebookAcervoFunc = breakdown.by_function.find(f => f.key === 'notebook_acervo')
    const videoFunc = breakdown.by_function.find(f => f.key === 'video_pipeline')
    const audioFunc = breakdown.by_function.find(f => f.key === 'audio_pipeline')
    const presentationFunc = breakdown.by_function.find(f => f.key === 'presentation_pipeline')

    const makeSub = (func: CostBreakdownItem | undefined, agentItems: CostBreakdownItem[], funcKey?: string): CostBreakdown | null => {
      if (!func && agentItems.length === 0) return null
      const costUsd = func?.cost_usd ?? agentItems.reduce((s, i) => s + i.cost_usd, 0)
      const costBrl = func?.cost_brl ?? agentItems.reduce((s, i) => s + i.cost_brl, 0)
      // Use per-function breakdowns when available so each section only shows
      // data from its own function (e.g. thesis analysis shows only thesis models,
      // acervo classificador shows only its own model/phase data). This ensures
      // free models (cost=0) are visible in the correct section without being
      // hidden behind paid-model data from other functions.
      const funcModels = (funcKey && breakdown.by_model_per_function?.[funcKey]) ?? breakdown.by_model
      const funcPhases = (funcKey && breakdown.by_phase_per_function?.[funcKey]) ?? breakdown.by_phase
      const funcProviders = (funcKey && breakdown.by_provider_per_function?.[funcKey]) ?? breakdown.by_provider
      return {
        total_cost_usd: costUsd,
        total_cost_brl: costBrl,
        exchange_rate_brl: breakdown.exchange_rate_brl,
        total_tokens_in: func?.tokens_in ?? agentItems.reduce((s, i) => s + i.tokens_in, 0),
        total_tokens_out: func?.tokens_out ?? agentItems.reduce((s, i) => s + i.tokens_out, 0),
        total_tokens: func?.total_tokens ?? agentItems.reduce((s, i) => s + i.total_tokens, 0),
        total_calls: func?.calls ?? agentItems.reduce((s, i) => s + i.calls, 0),
        by_provider: funcProviders,
        by_model: funcModels,
        by_function: func ? [func] : [],
        by_phase: funcPhases,
        by_agent: agentItems.map(item => ({
          ...item,
          key: item.key.replace(/^[^:]+::/, ''),
          label: item.label.replace(/^[^·]+·\s*/, ''),
        })),
        by_agent_function: agentItems,
        by_document_type: breakdown.by_document_type,
      }
    }

    const docBd = makeSub(docFunc, docItems, 'document_generation')
    const thesisBd = makeSub(thesisFunc, thesisItems, 'thesis_analysis')
    const contextDetailBd = makeSub(contextDetailFunc, contextDetailItems, 'context_detail')
    const acervoClassificadorBd = makeSub(acervoClassificadorFunc, acervoClassificadorItems, 'acervo_classificador')
    const acervoEmentaBd = makeSub(acervoEmentaFunc, acervoEmentaItems, 'acervo_ementa')
    const notebookBd = makeSub(notebookFunc, notebookItems, 'caderno_pesquisa')
    const notebookAcervoBd = makeSub(notebookAcervoFunc, notebookAcervoItems, 'notebook_acervo')
    const videoBd = makeSub(videoFunc, videoItems, 'video_pipeline')
    const audioBd = makeSub(audioFunc, audioItems, 'audio_pipeline')
    const presentationBd = makeSub(presentationFunc, presentationItems, 'presentation_pipeline')

    // Build highlights
    const hl: { label: string; value: string; meta: string }[] = []
    if (breakdown.total_cost_usd > 0) {
      const entries = [
        { label: 'Maior custo por API', row: breakdown.by_provider[0] },
        { label: 'Modelo mais oneroso', row: breakdown.by_model[0] },
        { label: 'Função mais onerosa', row: breakdown.by_function[0] },
        { label: 'Documento mais oneroso', row: breakdown.by_document_type[0] },
      ]
      for (const entry of entries) {
        if (entry.row) {
          hl.push({
            label: entry.label,
            value: entry.row.label,
            meta: `${fmtBrl(entry.row.cost_brl)} · ${fmtPercent(entry.row.cost_usd / breakdown.total_cost_usd)} do custo`,
          })
        }
      }
    }

    return { docBreakdown: docBd, thesisBreakdown: thesisBd, contextDetailBreakdown: contextDetailBd, acervoClassificadorBreakdown: acervoClassificadorBd, acervoEmentaBreakdown: acervoEmentaBd, notebookBreakdown: notebookBd, notebookAcervoBreakdown: notebookAcervoBd, videoBreakdown: videoBd, audioBreakdown: audioBd, presentationBreakdown: presentationBd, highlights: hl }
  }, [breakdown])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-amber-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Custos e Tokens</h1>
            <p className="text-gray-500">Carregando detalhamento...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <DollarSign className="w-8 h-8 text-amber-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custos e Tokens</h1>
          <p className="text-gray-500">
            Visão consolidada por API, modelo, função, fase, tipo de documento e agentes.
          </p>
        </div>
      </div>

      {!breakdown ? (
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
          Nenhum dado de custo/tokens disponível ainda.
        </div>
      ) : (
        <>
          {/* ── Section 1: General / Total Overview ─────────────────────── */}
          <CollapsibleSection
            id="section_general"
            title="Visão Geral — Custos e Tokens Totais"
            icon={TrendingUp}
            iconColor="text-brand-600"
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            <SummaryCards breakdown={breakdown} />

            {highlights.length > 0 && (
              <CollapsibleCard id="general_highlights" title="Destaques" collapseState={collapseState} onToggle={toggleCollapse}>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {highlights.map(item => (
                    <HighlightCard key={item.label} label={item.label} value={item.value} meta={item.meta} />
                  ))}
                </div>
              </CollapsibleCard>
            )}

            <CollapsibleCard id="general_tbl_provider" title="Por API / provedor" collapseState={collapseState} onToggle={toggleCollapse}>
              <BreakdownTable rows={breakdown.by_provider} emptyLabel="Nenhuma API/provedor com consumo registrado." />
            </CollapsibleCard>

            <CollapsibleCard id="general_tbl_model" title="Por modelo" collapseState={collapseState} onToggle={toggleCollapse}>
              <BreakdownTable rows={breakdown.by_model} emptyLabel="Nenhum modelo com consumo registrado." />
            </CollapsibleCard>

            <CollapsibleCard id="general_tbl_function" title="Por função / modalidade" collapseState={collapseState} onToggle={toggleCollapse}>
              <BreakdownTable rows={breakdown.by_function} emptyLabel="Nenhuma função consolidada ainda." />
            </CollapsibleCard>

            <CollapsibleCard id="general_tbl_doctype" title="Por tipo de documento" collapseState={collapseState} onToggle={toggleCollapse}>
              <BreakdownTable rows={breakdown.by_document_type} emptyLabel="Nenhum tipo de documento com consumo registrado." />
            </CollapsibleCard>

            <CollapsibleCard id="general_tbl_phase" title="Por fase" collapseState={collapseState} onToggle={toggleCollapse}>
              <BreakdownTable rows={breakdown.by_phase} emptyLabel="Nenhuma fase consolidada ainda." />
            </CollapsibleCard>

            <CollapsibleCard id="general_tbl_agent" title="Por agente" collapseState={collapseState} onToggle={toggleCollapse}>
              <BreakdownTable rows={breakdown.by_agent} emptyLabel="Nenhum agente com consumo registrado." />
            </CollapsibleCard>

            <CollapsibleCard id="general_tbl_agent_function" title="Agentes por função" collapseState={collapseState} onToggle={toggleCollapse}>
              <BreakdownTable rows={breakdown.by_agent_function} emptyLabel="Nenhum agente/função com consumo registrado." />
            </CollapsibleCard>
          </CollapsibleSection>

          {/* ── Section 2: Document Generation ─────────────────────────── */}
          <CollapsibleSection
            id="section_documents"
            title="Geração de Documentos"
            icon={FileText}
            iconColor="text-blue-600"
            badge={docBreakdown ? fmtUsd(docBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {docBreakdown ? (
              <SectionBreakdown
                sectionId="doc"
                breakdown={docBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para geração de documentos.</p>
            )}
          </CollapsibleSection>

          {/* ── Section 3: Thesis Analysis ─────────────────────────────── */}
          <CollapsibleSection
            id="section_thesis"
            title="Análise de Teses"
            icon={BookOpen}
            iconColor="text-purple-600"
            badge={thesisBreakdown ? fmtUsd(thesisBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {thesisBreakdown ? (
              <SectionBreakdown
                sectionId="thesis"
                breakdown={thesisBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para análise de teses.</p>
            )}
          </CollapsibleSection>

          {/* ── Section 4: Context Detail ──────────────────────────────── */}
          <CollapsibleSection
            id="section_context_detail"
            title="Detalhamento de Contexto"
            icon={MessageCircleQuestion}
            iconColor="text-purple-600"
            badge={contextDetailBreakdown ? fmtUsd(contextDetailBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {contextDetailBreakdown ? (
              <SectionBreakdown
                sectionId="context_detail"
                breakdown={contextDetailBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para detalhamento de contexto.</p>
            )}
          </CollapsibleSection>

          {/* ── Section 5: Acervo Classificador ──────────────────────── */}
          <CollapsibleSection
            id="section_acervo_classificador"
            title="Classificador de Acervo"
            icon={Tags}
            iconColor="text-teal-600"
            badge={acervoClassificadorBreakdown ? fmtUsd(acervoClassificadorBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {acervoClassificadorBreakdown ? (
              <SectionBreakdown
                sectionId="acervo_classificador"
                breakdown={acervoClassificadorBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para classificação de acervo.</p>
            )}
          </CollapsibleSection>

          {/* ── Section 6: Acervo Ementa ───────────────────────────── */}
          <CollapsibleSection
            id="section_acervo_ementa"
            title="Gerador de Ementas"
            icon={FileText}
            iconColor="text-blue-600"
            badge={acervoEmentaBreakdown ? fmtUsd(acervoEmentaBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {acervoEmentaBreakdown ? (
              <SectionBreakdown
                sectionId="acervo_ementa"
                breakdown={acervoEmentaBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para geração de ementas.</p>
            )}
          </CollapsibleSection>

          {/* ── Section 7: Caderno de Pesquisa ─────────────────────── */}
          <CollapsibleSection
            id="section_caderno_pesquisa"
            title="Caderno de Pesquisa"
            icon={Brain}
            iconColor="text-indigo-600"
            badge={notebookBreakdown ? fmtUsd(notebookBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {notebookBreakdown ? (
              <SectionBreakdown
                sectionId="caderno_pesquisa"
                breakdown={notebookBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para o caderno de pesquisa.</p>
            )}
          </CollapsibleSection>

          {/* ── Section 8: Notebook Acervo ─────────────────────────── */}
          <CollapsibleSection
            id="section_notebook_acervo"
            title="Analisador de Acervo (Caderno)"
            icon={Search}
            iconColor="text-teal-600"
            badge={notebookAcervoBreakdown ? fmtUsd(notebookAcervoBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {notebookAcervoBreakdown ? (
              <SectionBreakdown
                sectionId="notebook_acervo"
                breakdown={notebookAcervoBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para análise de acervo do caderno.</p>
            )}
          </CollapsibleSection>

          {/* ── Section 9: Video Pipeline ──────────────────────────── */}
          <CollapsibleSection
            id="section_video_pipeline"
            title="Pipeline de Vídeo"
            icon={Video}
            iconColor="text-rose-600"
            badge={videoBreakdown ? fmtUsd(videoBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {videoBreakdown ? (
              <SectionBreakdown
                sectionId="video_pipeline"
                breakdown={videoBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para pipeline de vídeo.</p>
            )}
          </CollapsibleSection>

          {/* ── Section 10: Audio Pipeline ─────────────────────────── */}
          <CollapsibleSection
            id="section_audio_pipeline"
            title="Pipeline de Áudio"
            icon={Headphones}
            iconColor="text-violet-600"
            badge={audioBreakdown ? fmtUsd(audioBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {audioBreakdown ? (
              <SectionBreakdown
                sectionId="audio_pipeline"
                breakdown={audioBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para pipeline de áudio.</p>
            )}
          </CollapsibleSection>

          {/* ── Section 11: Presentation Pipeline ──────────────────── */}
          <CollapsibleSection
            id="section_presentation_pipeline"
            title="Pipeline de Apresentação"
            icon={Layout}
            iconColor="text-amber-600"
            badge={presentationBreakdown ? fmtUsd(presentationBreakdown.total_cost_usd) : undefined}
            collapseState={collapseState}
            onToggle={toggleCollapse}
          >
            {presentationBreakdown ? (
              <SectionBreakdown
                sectionId="presentation_pipeline"
                breakdown={presentationBreakdown}
                collapseState={collapseState}
                onToggle={toggleCollapse}
              />
            ) : (
              <p className="text-sm text-gray-400 py-4">Nenhum dado de custo para pipeline de apresentação.</p>
            )}
          </CollapsibleSection>
        </>
      )}
    </div>
  )
}
