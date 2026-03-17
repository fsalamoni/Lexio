import { useEffect, useMemo } from 'react'
import { X, DollarSign, Coins, Cpu, BrainCircuit } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { CostBreakdown, CostBreakdownItem } from '../lib/cost-analytics'

interface CostBreakdownModalProps {
  open: boolean
  breakdown: CostBreakdown | null
  loading?: boolean
  onClose: () => void
}

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

function HighlightCard({
  label,
  value,
  meta,
}: {
  label: string
  value: string
  meta: string
}) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <p className="mt-2 text-base font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{meta}</p>
    </div>
  )
}

function BreakdownTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string
  rows: CostBreakdownItem[]
  emptyLabel: string
}) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-6 text-sm text-gray-400">{emptyLabel}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2 text-left">Grupo</th>
                <th className="px-5 py-2 text-right">Chamadas</th>
                <th className="px-5 py-2 text-right">Entrada</th>
                <th className="px-5 py-2 text-right">Saída</th>
                <th className="px-5 py-2 text-right">Tokens</th>
                <th className="px-5 py-2 text-right">USD</th>
                <th className="px-5 py-2 text-right">R$</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.key} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-2.5 text-sm text-gray-800 max-w-[260px]">
                    <span className="block truncate" title={row.label}>{row.label}</span>
                  </td>
                  <td className="px-5 py-2.5 text-sm text-right text-gray-600">{fmtInt(row.calls)}</td>
                  <td className="px-5 py-2.5 text-sm text-right text-gray-600">{fmtInt(row.tokens_in)}</td>
                  <td className="px-5 py-2.5 text-sm text-right text-gray-600">{fmtInt(row.tokens_out)}</td>
                  <td className="px-5 py-2.5 text-sm text-right text-gray-600">{fmtInt(row.total_tokens)}</td>
                  <td className="px-5 py-2.5 text-sm text-right font-medium text-amber-700">{fmtUsd(row.cost_usd)}</td>
                  <td className="px-5 py-2.5 text-sm text-right font-medium text-emerald-700">{fmtBrl(row.cost_brl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function CostBreakdownModal({
  open,
  breakdown,
  loading = false,
  onClose,
}: CostBreakdownModalProps) {
  const byProvider = breakdown?.by_provider ?? []
  const byAgentFunction = breakdown?.by_agent_function ?? []

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  const modelCostChart = useMemo(() => breakdown?.by_model.slice(0, 8).map(row => ({
    name: row.label,
    usd: row.cost_usd,
    brl: row.cost_brl,
  })) ?? [], [breakdown])
  const modelTokensChart = useMemo(() => breakdown?.by_model.slice(0, 8).map(row => ({
    name: row.label,
    entrada: row.tokens_in,
    saida: row.tokens_out,
  })) ?? [], [breakdown])
  const functionCostChart = useMemo(() => breakdown?.by_function.slice(0, 8).map(row => ({
    name: row.label,
    brl: row.cost_brl,
  })) ?? [], [breakdown])
  const documentTypeTokensChart = useMemo(() => breakdown?.by_document_type.slice(0, 8).map(row => ({
    name: row.label,
    total: row.total_tokens,
  })) ?? [], [breakdown])
  const highlights = useMemo(() => {
    if (!breakdown || breakdown.total_cost_usd <= 0) return []

    const entries = [
      { label: 'Maior custo por API', row: breakdown.by_provider[0] },
      { label: 'Modelo mais oneroso', row: breakdown.by_model[0] },
      { label: 'Função mais onerosa', row: breakdown.by_function[0] },
      { label: 'Documento mais oneroso', row: breakdown.by_document_type[0] },
    ]

    return entries
      .filter((entry): entry is { label: string; row: CostBreakdownItem } => !!entry.row)
      .map(entry => ({
        label: entry.label,
        value: entry.row.label,
        meta: `${fmtBrl(entry.row.cost_brl)} · ${fmtPercent(entry.row.cost_usd / breakdown.total_cost_usd)} do custo`,
      }))
  }, [breakdown])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhamento de custos e tokens"
    >
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5 border-b bg-white">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Detalhamento de custos e tokens</h2>
            <p className="text-sm text-gray-500 mt-1">
              Visão consolidada por API, modelo, função, fase, tipo de documento e agentes.
            </p>
            {breakdown && (
              <p className="text-xs text-gray-400 mt-2">
                Tabelas ordenadas por maior custo, com apoio visual para identificar rapidamente os principais pontos de consumo.
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !breakdown ? (
            <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
              Carregando detalhamento...
            </div>
          ) : !breakdown ? (
            <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">
              Nenhum dado de custo/tokens disponível ainda.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
                {[
                  { label: 'Custo total (USD)', value: fmtUsd(breakdown.total_cost_usd), icon: DollarSign, color: 'text-amber-600' },
                  { label: 'Custo total (R$)', value: fmtBrl(breakdown.total_cost_brl), icon: BrainCircuit, color: 'text-emerald-600' },
                  { label: 'Tokens de entrada', value: fmtInt(breakdown.total_tokens_in), icon: Coins, color: 'text-sky-600' },
                  { label: 'Tokens de saída', value: fmtInt(breakdown.total_tokens_out), icon: Coins, color: 'text-fuchsia-600' },
                  { label: 'Tokens totais', value: fmtInt(breakdown.total_tokens), icon: Coins, color: 'text-violet-600' },
                  { label: 'Chamadas LLM', value: fmtInt(breakdown.total_calls), icon: Cpu, color: 'text-blue-600' },
                ].map(card => (
                  <div key={card.label} className="bg-white rounded-xl border p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{card.label}</span>
                      <card.icon className={`w-4 h-4 ${card.color}`} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                  </div>
                ))}
              </div>

              {highlights.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {highlights.map(item => (
                    <HighlightCard
                      key={item.label}
                      label={item.label}
                      value={item.value}
                      meta={item.meta}
                    />
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Custo por modelo (USD)</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={modelCostChart} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={value => fmtUsd(Number(value))} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [fmtUsd(value), 'USD']} />
                      <Bar dataKey="usd" fill="#d97706" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-1">Custo por modelo (R$)</h3>
                  <p className="text-xs text-gray-400 mb-4">
                    Conversão com cotação referencial de {breakdown.exchange_rate_brl.toFixed(2)} BRL/USD.
                  </p>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={modelCostChart} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={value => fmtBrl(Number(value))} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [fmtBrl(value), 'BRL']} />
                      <Bar dataKey="brl" fill="#059669" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Tokens por modelo</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={modelTokensChart} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={value => fmtInt(Number(value))} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [fmtInt(value), 'Tokens']} />
                      <Bar dataKey="entrada" stackId="tokens" fill="#0284c7" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="saida" stackId="tokens" fill="#c026d3" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Custo por função / modalidade (R$)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={functionCostChart} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={value => fmtBrl(Number(value))} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [fmtBrl(value), 'BRL']} />
                      <Bar dataKey="brl" fill="#7c3aed" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Tokens por tipo de documento</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={documentTypeTokensChart} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={value => fmtInt(Number(value))} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: number) => [fmtInt(value), 'Tokens']} />
                      <Bar dataKey="total" fill="#2563eb" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <BreakdownTable
                  title="Por API / provedor"
                  rows={byProvider}
                  emptyLabel="Nenhuma API/provedor com consumo registrado."
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <BreakdownTable
                  title="Por modelo"
                  rows={breakdown.by_model}
                  emptyLabel="Nenhum modelo com consumo registrado."
                />
                <BreakdownTable
                  title="Por função / modalidade"
                  rows={breakdown.by_function}
                  emptyLabel="Nenhuma função consolidada ainda."
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <BreakdownTable
                  title="Por tipo de documento"
                  rows={breakdown.by_document_type}
                  emptyLabel="Nenhum tipo de documento com consumo registrado."
                />
                <BreakdownTable
                  title="Por fase"
                  rows={breakdown.by_phase}
                  emptyLabel="Nenhuma fase consolidada ainda."
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <BreakdownTable
                  title="Por agente"
                  rows={breakdown.by_agent}
                  emptyLabel="Nenhum agente com consumo registrado."
                />
                <BreakdownTable
                  title="Agentes por função"
                  rows={byAgentFunction}
                  emptyLabel="Nenhum agente/função com consumo registrado."
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
