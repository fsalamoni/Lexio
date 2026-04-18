import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Brain, Cpu, DollarSign, Landmark, Layers3, Scale, Wallet } from 'lucide-react'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { useAuth } from '../contexts/AuthContext'
import { IS_FIREBASE } from '../lib/firebase'
import { getPlatformCostBreakdown } from '../lib/firestore-service'
import type { CostBreakdown, CostBreakdownItem } from '../lib/cost-analytics'

function fmtUsd(value: number) {
  return value < 0.001 ? `$${value.toFixed(5)}` : `$${value.toFixed(4)}`
}

function fmtBrl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtInt(value: number) {
  return value.toLocaleString('pt-BR')
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
        <Icon className="w-4 h-4 text-brand-600" />
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function BreakdownTable({ title, rows, emptyLabel }: { title: string; rows: CostBreakdownItem[]; emptyLabel: string }) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-5 py-3 border-b bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50">
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
                <tr key={row.key} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-sm text-gray-800">{row.label}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">{fmtInt(row.calls)}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">{fmtInt(row.tokens_in)}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">{fmtInt(row.tokens_out)}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">{fmtInt(row.total_tokens)}</td>
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

  if (!isReady) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    )
  }

  if (role !== 'admin') {
    return <div className="text-sm text-gray-500">Acesso administrativo necessário.</div>
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  if (!breakdown) {
    return <div className="text-sm text-gray-500">Nenhum custo agregado disponível.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="w-8 h-8 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custos e Tokens da Plataforma</h1>
          <p className="text-gray-500">Visão agregada de gastos, tokens, modelos, agentes e provedores de toda a plataforma.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard icon={DollarSign} label="USD" value={fmtUsd(breakdown.total_cost_usd)} />
        <StatCard icon={Landmark} label="BRL" value={fmtBrl(breakdown.total_cost_brl)} />
        <StatCard icon={Brain} label="Tokens entrada" value={fmtInt(breakdown.total_tokens_in)} />
        <StatCard icon={Brain} label="Tokens saída" value={fmtInt(breakdown.total_tokens_out)} />
        <StatCard icon={Layers3} label="Tokens totais" value={fmtInt(breakdown.total_tokens)} />
        <StatCard icon={Cpu} label="Chamadas" value={fmtInt(breakdown.total_calls)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Custo por função</h2>
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

        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Custo por provedor</h2>
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
      </div>

      <div className="grid grid-cols-1 gap-6">
        <BreakdownTable title="Por provedor" rows={breakdown.by_provider} emptyLabel="Nenhum provedor com consumo registrado." />
        <BreakdownTable title="Por modelo" rows={breakdown.by_model} emptyLabel="Nenhum modelo com consumo registrado." />
        <BreakdownTable title="Por função" rows={breakdown.by_function} emptyLabel="Nenhuma função com consumo registrado." />
        <BreakdownTable title="Por fase" rows={breakdown.by_phase} emptyLabel="Nenhuma fase com consumo registrado." />
        <BreakdownTable title="Por agente" rows={breakdown.by_agent} emptyLabel="Nenhum agente com consumo registrado." />
        <BreakdownTable title="Por tipo de documento" rows={breakdown.by_document_type} emptyLabel="Nenhum tipo de documento com consumo registrado." />
      </div>
    </div>
  )
}