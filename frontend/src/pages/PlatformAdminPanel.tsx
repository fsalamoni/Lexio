import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, BarChart3, BookOpen, Brain, Database, DollarSign, FileText,
  FolderArchive, Settings2, Shield, Sparkles, Users,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { IS_FIREBASE } from '../lib/firebase'
import {
  getPlatformDailyUsage,
  getPlatformOverview,
  type PlatformAggregateRow,
  type PlatformDailyUsagePoint,
  type PlatformUsageRow,
} from '../lib/firestore-service'

const PIE_COLORS = ['#0f766e', '#2563eb', '#9333ea', '#d97706', '#dc2626', '#64748b']

function fmtUsd(value: number) {
  return value < 0.001 ? `$${value.toFixed(5)}` : `$${value.toFixed(4)}`
}

function fmtInt(value: number) {
  return value.toLocaleString('pt-BR')
}

function StatCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone?: string }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
        <Icon className={`w-4 h-4 ${tone || 'text-brand-600'}`} />
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function SimpleTable({ title, rows, emptyLabel }: { title: string; rows: Array<PlatformAggregateRow | PlatformUsageRow>; emptyLabel: string }) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-5 py-3 border-b bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead className="text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50">
              <tr>
                <th className="px-5 py-2 text-left">Item</th>
                <th className="px-5 py-2 text-right">Uso</th>
                <th className="px-5 py-2 text-right">Tokens</th>
                <th className="px-5 py-2 text-right">USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.key} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-sm text-gray-800">{row.label}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">{'calls' in row ? fmtInt(row.calls) : fmtInt(row.count)}</td>
                  <td className="px-5 py-3 text-sm text-right text-gray-600">{'total_tokens' in row ? fmtInt(row.total_tokens) : '0'}</td>
                  <td className="px-5 py-3 text-sm text-right font-medium text-amber-700">{'cost_usd' in row ? fmtUsd(row.cost_usd) : '$0.0000'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PlatformAdminPanel() {
  const toast = useToast()
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getPlatformOverview>> | null>(null)
  const [daily, setDaily] = useState<PlatformDailyUsagePoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        if (!IS_FIREBASE) {
          throw new Error('O painel admin agregado está disponível apenas no modo Firebase.')
        }

        const [overviewData, dailyData] = await Promise.all([
          getPlatformOverview(),
          getPlatformDailyUsage(30),
        ])
        setOverview(overviewData)
        setDaily(dailyData)
      } catch (err) {
        console.error(err)
        toast.error('Erro ao carregar painel administrativo da plataforma')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const functionChart = useMemo(() => overview?.functions_by_usage.slice(0, 8).map(row => ({
    label: row.label,
    calls: row.calls,
    usd: row.cost_usd,
  })) ?? [], [overview])

  const documentStatusChart = useMemo(() => overview?.documents_by_status.slice(0, 6) ?? [], [overview])
  const artifactChart = useMemo(() => overview?.artifacts_by_type.slice(0, 6) ?? [], [overview])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    )
  }

  if (!overview) {
    return <div className="text-sm text-gray-500">Nenhum dado agregado disponível.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Painel Administrativo da Plataforma</h1>
          <p className="text-gray-500">Visão agregada de uso, produção, pipelines, agentes, estúdio e custos globais.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Usuários" value={fmtInt(overview.total_users)} tone="text-sky-600" />
        <StatCard icon={Activity} label="Usuários ativos (30d)" value={fmtInt(overview.active_users_30d)} tone="text-emerald-600" />
        <StatCard icon={Sparkles} label="Novos usuários (30d)" value={fmtInt(overview.new_users_30d)} tone="text-fuchsia-600" />
        <StatCard icon={DollarSign} label="Custo total" value={fmtUsd(overview.total_cost_usd)} tone="text-amber-600" />
        <StatCard icon={Brain} label="Chamadas LLM" value={fmtInt(overview.total_calls)} tone="text-violet-600" />
        <StatCard icon={BarChart3} label="Tokens totais" value={fmtInt(overview.total_tokens)} tone="text-indigo-600" />
        <StatCard icon={FileText} label="Documentos" value={fmtInt(overview.total_documents)} tone="text-brand-600" />
        <StatCard icon={Database} label="Qualidade média" value={overview.average_quality_score != null ? `${overview.average_quality_score}/100` : 'N/D'} tone="text-rose-600" />
      </div>

      <div className="bg-white rounded-xl border p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <Settings2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Catálogo de Modelos do Usuário</h2>
              <p className="text-sm text-gray-500">
                Cada usuário mantém seu próprio catálogo persistido no Firestore. Para editar o seu catálogo e definir os modelos disponíveis nos seus seletores, use o atalho abaixo.
              </p>
            </div>
          </div>
          <Link
            to="/settings#section_model_catalog"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Brain className="w-4 h-4" />
            Abrir meu catálogo
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard icon={FileText} label="Documentos concluídos" value={fmtInt(overview.completed_documents)} />
        <StatCard icon={FileText} label="Em processamento" value={fmtInt(overview.processing_documents)} />
        <StatCard icon={FileText} label="Em revisão/rascunho" value={fmtInt(overview.pending_review_documents)} />
        <StatCard icon={BookOpen} label="Teses" value={fmtInt(overview.total_theses)} />
        <StatCard icon={FolderArchive} label="Acervo" value={fmtInt(overview.total_acervo_documents)} />
        <StatCard icon={Brain} label="Cadernos / artefatos" value={`${fmtInt(overview.total_notebooks)} / ${fmtInt(overview.total_artifacts)}`} />
      </div>

      <div className="bg-white rounded-xl border p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Atividade dos últimos 30 dias</h2>
          <p className="text-sm text-gray-500">Criação de conteúdo e uso da plataforma ao longo do tempo.</p>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={value => fmtInt(Number(value))} />
            <Tooltip />
            <Bar dataKey="documentos" fill="#2563eb" radius={[6, 6, 0, 0]} />
            <Bar dataKey="cadernos" fill="#9333ea" radius={[6, 6, 0, 0]} />
            <Bar dataKey="uploads_acervo" fill="#0f766e" radius={[6, 6, 0, 0]} />
            <Bar dataKey="sessoes_teses" fill="#d97706" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Uso por função</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={functionChart} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={value => fmtUsd(Number(value))} />
              <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number, name) => [name === 'usd' ? fmtUsd(value) : fmtInt(value), name === 'usd' ? 'USD' : 'Chamadas']} />
              <Bar dataKey="usd" fill="#d97706" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Status dos documentos</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={documentStatusChart} dataKey="count" nameKey="label" innerRadius={70} outerRadius={105} paddingAngle={3}>
                {documentStatusChart.map((entry, index) => <Cell key={entry.key} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value: number) => fmtInt(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SimpleTable title="Top modelos" rows={overview.top_models} emptyLabel="Nenhum modelo utilizado ainda." />
        <SimpleTable title="Top agentes" rows={overview.top_agents} emptyLabel="Nenhum agente utilizado ainda." />
        <SimpleTable title="Top provedores" rows={overview.top_providers} emptyLabel="Nenhum provedor utilizado ainda." />
        <SimpleTable title="Funções mais usadas" rows={overview.functions_by_usage} emptyLabel="Nenhuma função executada ainda." />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Origens dos documentos</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={overview.documents_by_origin}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={value => fmtInt(Number(value))} />
              <Tooltip formatter={(value: number) => fmtInt(value)} />
              <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Artefatos do estúdio</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={artifactChart} dataKey="count" nameKey="label" innerRadius={65} outerRadius={100} paddingAngle={3}>
                {artifactChart.map((entry, index) => <Cell key={entry.key} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value: number) => fmtInt(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}