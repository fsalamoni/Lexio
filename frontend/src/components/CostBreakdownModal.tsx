import { useMemo } from 'react'
import { DollarSign, Coins, Cpu, BrainCircuit } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { CostBreakdown, CostBreakdownItem } from '../lib/cost-analytics'
import DraggablePanel from './DraggablePanel'
import { fmtUsd, fmtBrl, fmtInt, fmtPercent } from '../lib/currency-utils'

interface CostBreakdownModalProps {
  open: boolean
  breakdown: CostBreakdown | null
  loading?: boolean
  onClose: () => void
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
    <div className="bg-white rounded-xl border p-5" style={{ background: 'var(--v2-panel-strong)', border: '1px solid var(--v2-line-soft)', borderRadius: '0.75rem' }}>
      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>{label}</span>
      <p className="mt-2 text-base font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{value}</p>
      <p className="mt-1 text-xs" style={{ color: 'var(--v2-ink-faint)' }}>{meta}</p>
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
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)' }}>
      <div className="px-5 py-4 border-b" style={{ background: 'rgba(255,255,255,0.55)', borderColor: 'var(--v2-line-soft)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-6 text-sm" style={{ color: 'var(--v2-ink-faint)' }}>{emptyLabel}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed" aria-label={`Tabela de ${title}`}>
            <thead className="sticky top-0 text-[11px] uppercase tracking-wide" style={{ background: 'rgba(255,255,255,0.55)', color: 'var(--v2-ink-faint)' }}>
              <tr>
                <th className="w-[34%] px-5 py-2 text-left">Grupo</th>
                <th className="w-[11%] px-5 py-2 text-right">Chamadas</th>
                <th className="w-[11%] px-5 py-2 text-right">Entrada</th>
                <th className="w-[11%] px-5 py-2 text-right">Saída</th>
                <th className="w-[11%] px-5 py-2 text-right">Tokens</th>
                <th className="w-[11%] px-5 py-2 text-right">USD</th>
                <th className="w-[11%] px-5 py-2 text-right">R$</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--v2-line-soft)' }}>
              {rows.map(row => (
                <tr key={row.key} className="transition-colors" style={{ cursor: 'default' }}>
                  <td className="px-5 py-2.5 text-sm" style={{ color: 'var(--v2-ink-strong)' }}>
                    <span className="block truncate" aria-hidden="true" title={row.label}>{row.label}</span>
                    <span className="sr-only">{row.label}</span>
                  </td>
                  <td className="px-5 py-2.5 text-sm text-right" style={{ color: 'var(--v2-ink-soft)' }}>{fmtInt(row.calls)}</td>
                  <td className="px-5 py-2.5 text-sm text-right" style={{ color: 'var(--v2-ink-soft)' }}>{fmtInt(row.tokens_in)}</td>
                  <td className="px-5 py-2.5 text-sm text-right" style={{ color: 'var(--v2-ink-soft)' }}>{fmtInt(row.tokens_out)}</td>
                  <td className="px-5 py-2.5 text-sm text-right" style={{ color: 'var(--v2-ink-soft)' }}>{fmtInt(row.total_tokens)}</td>
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
    <DraggablePanel
      open={open}
      onClose={onClose}
      title="Detalhamento de custos e tokens"
      icon={<DollarSign size={16} />}
      initialWidth={1100}
      initialHeight={700}
      minWidth={500}
      minHeight={300}
      className="bg-gray-50"
    >
      <div className="p-4 border-b" style={{ background: 'rgba(255,255,255,0.6)', borderColor: 'var(--v2-line-soft)' }}>
        <p className="text-sm" style={{ color: 'var(--v2-ink-soft)' }}>
          Visão consolidada por API, modelo, função, fase, tipo de documento e agentes.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading && !breakdown ? (
          <div className="rounded-xl border p-10 text-center text-sm" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)', color: 'var(--v2-ink-faint)' }}>
            Carregando detalhamento...
          </div>
        ) : !breakdown ? (
          <div className="rounded-xl border p-10 text-center text-sm" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)', color: 'var(--v2-ink-faint)' }}>
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
                  <div key={card.label} className="rounded-xl border p-5" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>{card.label}</span>
                      <card.icon className={`w-4 h-4 ${card.color}`} />
                    </div>
                    <p className="text-2xl font-bold" style={{ color: 'var(--v2-ink-strong)' }}>{card.value}</p>
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
                <div className="rounded-xl border p-5" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)' }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--v2-ink-strong)' }}>Custo por modelo (USD)</h3>
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

                <div className="rounded-xl border p-5" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)' }}>
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--v2-ink-strong)' }}>Custo por modelo (R$)</h3>
                  <p className="text-xs mb-4" style={{ color: 'var(--v2-ink-faint)' }}>
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
                <div className="rounded-xl border p-5" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)' }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--v2-ink-strong)' }}>Tokens por modelo</h3>
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

                <div className="rounded-xl border p-5" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)' }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--v2-ink-strong)' }}>Custo por função / modalidade (R$)</h3>
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
                <div className="rounded-xl border p-5" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)' }}>
                  <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--v2-ink-strong)' }}>Tokens por tipo de documento</h3>
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
    </DraggablePanel>
  )
}
