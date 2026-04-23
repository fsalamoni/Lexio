import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Brain, Cpu, DollarSign, Landmark, Layers3, Scale, Wallet } from 'lucide-react'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { V2EmptyState, V2MetricGrid, V2PageHero } from '../components/v2/V2PagePrimitives'
import { useAuth } from '../contexts/AuthContext'
import { IS_FIREBASE } from '../lib/firebase'
import { getPlatformCostBreakdown } from '../lib/firestore-service'
import type { CostBreakdown, CostBreakdownItem } from '../lib/cost-analytics'
import { fmtUsd, fmtBrl, fmtInt } from '../lib/currency-utils'

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="v2-summary-card bg-[rgba(255,255,255,0.82)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--v2-ink-faint)]">{label}</span>
        <Icon className="w-4 h-4 text-[var(--v2-accent-strong)]" />
      </div>
      <p className="mt-2 text-lg font-bold text-[var(--v2-ink-strong)]">{value}</p>
    </div>
  )
}

function formatDurationMs(value?: number | null) {
  if (!value || value <= 0) return 'N/D'
  if (value < 1000) return `${Math.round(value)} ms`
  const seconds = value / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

function BreakdownTable({ title, rows, emptyLabel }: { title: string; rows: CostBreakdownItem[]; emptyLabel: string }) {
  return (
    <div className="v2-panel overflow-hidden">
      <div className="border-b border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.58)] px-5 py-3">
        <h2 className="text-sm font-semibold text-[var(--v2-ink-strong)]">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--v2-ink-faint)]">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px]">
            <thead className="bg-[rgba(255,255,255,0.74)] text-[11px] uppercase tracking-wide text-[var(--v2-ink-faint)]">
              <tr>
                <th className="px-5 py-2 text-left">Grupo</th>
                <th className="px-5 py-2 text-right">Chamadas</th>
                <th className="px-5 py-2 text-right">Entrada</th>
                <th className="px-5 py-2 text-right">Saída</th>
                <th className="px-5 py-2 text-right">Tokens</th>
                <th className="px-5 py-2 text-right">Duração média</th>
                <th className="px-5 py-2 text-right">USD</th>
                <th className="px-5 py-2 text-right">R$</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--v2-line-soft)]">
              {rows.map(row => (
                <tr key={row.key} className="hover:bg-[rgba(255,255,255,0.66)]">
                  <td className="px-5 py-3 text-sm text-[var(--v2-ink-strong)]">{row.label}</td>
                  <td className="px-5 py-3 text-sm text-right text-[var(--v2-ink-soft)]">{fmtInt(row.calls)}</td>
                  <td className="px-5 py-3 text-sm text-right text-[var(--v2-ink-soft)]">{fmtInt(row.tokens_in)}</td>
                  <td className="px-5 py-3 text-sm text-right text-[var(--v2-ink-soft)]">{fmtInt(row.tokens_out)}</td>
                  <td className="px-5 py-3 text-sm text-right text-[var(--v2-ink-soft)]">{fmtInt(row.total_tokens)}</td>
                  <td className="px-5 py-3 text-sm text-right text-[var(--v2-ink-soft)]">{formatDurationMs(row.avg_duration_ms)}</td>
                  <td className="px-5 py-3 text-sm text-right font-medium text-amber-700">{fmtUsd(row.cost_usd)}</td>
                  <td className="px-5 py-3 text-sm text-right font-medium text-emerald-700">{fmtBrl(row.cost_brl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PlatformCostsPage() {
  const toast = useToast()
  const { isReady, role } = useAuth()
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        if (!IS_FIREBASE) {
          throw new Error('Os custos agregados da plataforma estão disponíveis apenas no modo Firebase.')
        }
        setBreakdown(await getPlatformCostBreakdown())
      } catch (err) {
        console.error(err)
        const { humanizeError } = await import('../lib/error-humanizer')
        const h = humanizeError(err)
        toast.error('Erro ao carregar custos agregados da plataforma', h.detail || h.title)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const functionChart = useMemo(() => breakdown?.by_function.slice(0, 8).map(row => ({ label: row.label, usd: row.cost_usd })) ?? [], [breakdown])
  const providerChart = useMemo(() => breakdown?.by_provider.slice(0, 8).map(row => ({ label: row.label, usd: row.cost_usd })) ?? [], [breakdown])
  const executionStateChart = useMemo(() => breakdown?.by_execution_state?.slice(0, 8).map(row => ({ label: row.label, usd: row.cost_usd })) ?? [], [breakdown])

  if (!isReady) {
    return (
      <div className="space-y-6">
        <div className="v2-panel p-6">
          <Skeleton className="h-10 w-80" />
        </div>
        <div className="v2-panel p-6">
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    )
  }

  if (role !== 'admin') {
    return (
      <V2EmptyState
        icon={Scale}
        title="Acesso administrativo necessário"
        description="Esta leitura executiva consolida custos agregados da plataforma inteira e permanece restrita ao perfil administrativo."
      />
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="v2-panel p-6">
          <Skeleton className="h-10 w-80" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="v2-summary-card bg-[rgba(255,255,255,0.82)]">
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ))}
        </div>
        <div className="v2-panel p-6">
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <div className="v2-panel p-6">
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!breakdown) {
    return (
      <V2EmptyState
        icon={Wallet}
        title="Nenhum custo agregado disponivel"
        description="Assim que a plataforma acumular execucoes, esta superficie passa a consolidar custos, tokens, provedores e agentes em tempo real."
      />
    )
  }

  return (
    <div className="space-y-6">
      <V2PageHero
        eyebrow={<><Scale className="h-3.5 w-3.5" /> Custos agregados</>}
        title="Custos, tokens e pressao operacional da plataforma em camada executiva"
        description="Superficie agregada para acompanhar gasto total, distribuicao por provedor, peso de cada funcao e consumo por tipo de documento em toda a operacao."
        aside={(
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Leitura rapida</p>
            <div className="rounded-[1.4rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Maior funcao</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{breakdown.by_function[0]?.label || 'Sem dados'}</p>
            </div>
            <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.82)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Provedor lider</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{breakdown.by_provider[0]?.label || 'Sem dados'}</p>
            </div>
          </div>
        )}
      />

      <V2MetricGrid
        className="md:grid-cols-3 xl:grid-cols-6"
        items={[
          { label: 'USD', value: fmtUsd(breakdown.total_cost_usd), icon: DollarSign, tone: 'warm' },
          { label: 'BRL', value: fmtBrl(breakdown.total_cost_brl), icon: Landmark },
          { label: 'Tokens entrada', value: fmtInt(breakdown.total_tokens_in), icon: Brain },
          { label: 'Tokens saida', value: fmtInt(breakdown.total_tokens_out), icon: Brain },
          { label: 'Tokens totais', value: fmtInt(breakdown.total_tokens), icon: Layers3, tone: 'accent' },
          { label: 'Chamadas', value: fmtInt(breakdown.total_calls), icon: Cpu },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="v2-panel p-5">
          <h2 className="mb-4 text-lg font-semibold text-[var(--v2-ink-strong)]">Custo por funcao</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={functionChart} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={value => fmtUsd(Number(value))} />
              <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [fmtUsd(value), 'USD']} />
              <Bar dataKey="usd" fill="#d97706" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="v2-panel p-5">
          <h2 className="mb-4 text-lg font-semibold text-[var(--v2-ink-strong)]">Custo por provedor</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={providerChart} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={value => fmtUsd(Number(value))} />
              <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [fmtUsd(value), 'USD']} />
              <Bar dataKey="usd" fill="#2563eb" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="v2-panel p-5 xl:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-[var(--v2-ink-strong)]">Custo por estado de execução</h2>
          {executionStateChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={executionStateChart} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={value => fmtUsd(Number(value))} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [fmtUsd(value), 'USD']} />
                <Bar dataKey="usd" fill="#0f766e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-[var(--v2-ink-faint)]">Nenhum estado de execução consolidado ainda.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <BreakdownTable title="Por provedor" rows={breakdown.by_provider} emptyLabel="Nenhum provedor com consumo registrado." />
        <BreakdownTable title="Por modelo" rows={breakdown.by_model} emptyLabel="Nenhum modelo com consumo registrado." />
        <BreakdownTable title="Por função" rows={breakdown.by_function} emptyLabel="Nenhuma função com consumo registrado." />
        <BreakdownTable title="Por fase" rows={breakdown.by_phase} emptyLabel="Nenhuma fase com consumo registrado." />
        <BreakdownTable title="Por estado de execução" rows={breakdown.by_execution_state || []} emptyLabel="Nenhum estado de execução com consumo registrado." />
        <BreakdownTable title="Por agente" rows={breakdown.by_agent} emptyLabel="Nenhum agente com consumo registrado." />
        <BreakdownTable title="Por tipo de documento" rows={breakdown.by_document_type} emptyLabel="Nenhum tipo de documento com consumo registrado." />
      </div>
    </div>
  )
}