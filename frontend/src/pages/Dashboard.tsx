import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText, CheckCircle, Clock, DollarSign, TrendingUp,
  Activity, ChevronRight, Download, Plus, Upload, BookOpen, Search,
} from 'lucide-react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { SkeletonCard } from '../components/Skeleton'
import { IS_FIREBASE } from '../lib/firebase'
import {
  getStats as firestoreGetStats,
  getRecentDocuments,
  getDailyStats,
  getByTypeStats,
} from '../lib/firestore-service'
import { DOCTYPE_SHORT_LABELS as DOCTYPE_LABELS } from '../lib/constants'

interface Stats {
  total_documents: number
  completed_documents: number
  processing_documents: number
  pending_review_documents: number
  average_quality_score: number | null
  total_cost_usd: number
  average_duration_ms: number | null
}

interface DailyPoint {
  dia: string
  total: number
  concluidos: number
  custo: number
}

interface AgentStat {
  agent_name: string
  chamadas: number
  custo_total: number
  tempo_medio_ms: number
}

interface RecentDoc {
  id: string
  document_type_id: string
  tema: string | null
  status: string
  quality_score: number | null
  created_at: string
}

interface TypeStat {
  document_type_id: string
  total: number
  avg_score: number | null
}

function fmtCost(usd: number | null | undefined) {
  if (usd == null || isNaN(usd)) return '—'
  return usd < 0.001 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(4)}`
}

function fmtDuration(ms: number | null) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.name.includes('$')
            ? fmtCost(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

const PERIOD_OPTIONS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
]

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [agents, setAgents] = useState<AgentStat[]>([])
  const [recent, setRecent] = useState<RecentDoc[]>([])
  const [byType, setByType] = useState<TypeStat[]>([])
  const [loading, setLoading] = useState(true)
  const [periodDays, setPeriodDays] = useState(30)
  const [chartLoading, setChartLoading] = useState(false)
  const { userId } = useAuth()
  const toast = useToast()
  const shouldWaitForFirebaseUser = IS_FIREBASE && !userId

  useEffect(() => {
    if (shouldWaitForFirebaseUser) return
    setLoading(true)

    if (IS_FIREBASE && userId) {
      const p1 = firestoreGetStats(userId).then(s => setStats(s)).catch(() => toast.error('Erro ao carregar estatísticas'))
      const p2 = getRecentDocuments(userId, 5).then(docs => {
        setRecent(docs.filter(d => d.id).map(d => ({
          id: d.id as string,
          document_type_id: d.document_type_id,
          tema: d.tema ?? null,
          status: d.status,
          quality_score: d.quality_score ?? null,
          created_at: d.created_at,
        })))
      }).catch(() => toast.error('Erro ao carregar documentos recentes'))
      const p3 = getDailyStats(userId, periodDays).then(d => setDaily(d)).catch(() => {/* non-critical */})
      const p4 = getByTypeStats(userId).then(bt => setByType(bt)).catch(() => {/* non-critical */})
      Promise.all([p1, p2, p3, p4]).finally(() => setLoading(false))
    } else {
      const toArr = (v: unknown) => (Array.isArray(v) ? v : [])
      const p1 = api.get('/stats').then(r => { if (r.data && typeof r.data === 'object') setStats(r.data) }).catch(() => toast.error('Erro ao carregar estatísticas'))
      const p2 = api.get('/stats/daily', { params: { days: periodDays } }).then(r => setDaily(toArr(r.data))).catch(() => toast.error('Erro ao carregar histórico diário'))
      const p3 = api.get('/stats/agents').then(r => setAgents(toArr(r.data))).catch(() => toast.error('Erro ao carregar estatísticas de agentes'))
      const p4 = api.get('/stats/recent').then(r => setRecent(toArr(r.data))).catch(() => toast.error('Erro ao carregar documentos recentes'))
      const p5 = api.get('/stats/by-type').then(r => setByType(toArr(r.data))).catch(() => {/* non-critical */})
      Promise.all([p1, p2, p3, p4, p5]).finally(() => setLoading(false))
    }
  }, [shouldWaitForFirebaseUser, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload chart data when period changes (after initial load)
  useEffect(() => {
    if (loading) return
    if (shouldWaitForFirebaseUser) return
    setChartLoading(true)
    if (IS_FIREBASE && userId) {
      getDailyStats(userId, periodDays)
        .then(d => setDaily(d))
        .catch(() => toast.error('Erro ao carregar histórico'))
        .finally(() => setChartLoading(false))
    } else {
      api.get('/stats/daily', { params: { days: periodDays }, noCache: true } as any)
        .then(r => setDaily(Array.isArray(r.data) ? r.data : []))
        .catch(() => toast.error('Erro ao carregar histórico'))
        .finally(() => setChartLoading(false))
    }
  }, [periodDays, shouldWaitForFirebaseUser, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build cumulative cost series(guard against missing custo field)
  const costSeries = daily.reduce<{ dia: string; custo_acumulado: number }[]>((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].custo_acumulado : 0
    const custo = typeof d.custo === 'number' ? d.custo : 0
    acc.push({ dia: d.dia, custo_acumulado: +(prev + custo).toFixed(5) })
    return acc
  }, [])

  const formatDia = (dia: string) => {
    try { return format(parseISO(dia), 'dd/MM', { locale: ptBR }) }
    catch { return dia }
  }

  const handleExportCSV = () => {
    const rows = [
      ['Data', 'Total', 'Concluídos', 'Custo (USD)'],
      ...daily.map(d => [d.dia, d.total, d.concluidos, d.custo?.toFixed(5) ?? '0']),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lexio-stats-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-3">
          {daily.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          )}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setPeriodDays(opt.days)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                periodDays === opt.days
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Total de Documentos', value: stats.total_documents, icon: FileText, color: 'blue' },
            { label: 'Concluídos', value: stats.completed_documents, icon: CheckCircle, color: 'green' },
            { label: 'Em Revisão', value: stats.pending_review_documents, icon: Clock, color: 'blue' },
            {
              label: 'Score Médio',
              value: stats.average_quality_score != null ? `${stats.average_quality_score}/100` : '—',
              icon: Activity,
              color: 'purple',
            },
            {
              label: 'Custo Total',
              value: fmtCost(stats.total_cost_usd),
              icon: DollarSign,
              color: 'amber',
            },
          ].map(card => (
            <div
              key={card.label}
              className={`bg-white rounded-xl border p-5 text-left${card.label === 'Em Revisão' && stats.pending_review_documents > 0 ? ' border-blue-200 ring-1 ring-blue-100' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</span>
                <card.icon className={`w-4 h-4 ${card.label === 'Em Revisão' && stats.pending_review_documents > 0 ? 'text-blue-500' : 'text-gray-400'}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              {card.label === 'Total de Documentos' && stats.processing_documents > 0 && (
                <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {stats.processing_documents} em processamento
                </p>
              )}
              {card.label === 'Em Revisão' && stats.pending_review_documents > 0 && (
                <p className="text-xs text-blue-600 mt-1">Aguardando aprovação</p>
              )}
              {card.label === 'Custo Total' && stats.average_duration_ms && (
                <p className="text-xs text-gray-400 mt-1">
                  Tempo médio: {fmtDuration(stats.average_duration_ms)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Novo Documento', icon: Plus, to: '/documents/new', color: 'bg-brand-50 text-brand-700 border-brand-100' },
          { label: 'Upload de Acervo', icon: Upload, to: '/upload', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
          { label: 'Caderno de Pesquisa', icon: BookOpen, to: '/notebook', color: 'bg-violet-50 text-violet-700 border-violet-100' },
          { label: 'Banco de Teses', icon: Search, to: '/theses', color: 'bg-amber-50 text-amber-700 border-amber-100' },
        ].map(action => (
          <Link
            key={action.to}
            to={action.to}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:shadow-sm ${action.color}`}
          >
            <action.icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium">{action.label}</span>
          </Link>
        ))}
      </div>

      {/* Charts row */}
      {daily.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Docs per day */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-600" />
              Documentos por dia (últimos {periodDays} dias)
              {chartLoading && <span className="text-xs text-gray-400 font-normal ml-auto">Atualizando...</span>}
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={daily} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="dia"
                  tickFormatter={formatDia}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="concluidos" name="Concluídos" fill="#22c55e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="total" name="Total" fill="#e2e8f0" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cumulative cost */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-brand-600" />
              Custo acumulado (USD)
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={costSeries}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="dia"
                  tickFormatter={formatDia}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => `$${v.toFixed(3)}`}
                />
                <Tooltip
                  formatter={(v: number) => [fmtCost(v), 'Custo acumulado']}
                  labelFormatter={formatDia}
                />
                <Area
                  type="monotone"
                  dataKey="custo_acumulado"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fill="url(#costGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bottom row: recent docs + agent stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent documents */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="text-sm font-semibold text-gray-700">Documentos Recentes</h2>
            <Link to="/documents" className="text-xs text-brand-600 hover:underline flex items-center gap-0.5">
              Ver todos <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nenhum documento ainda</p>
              <Link
                to="/documents/new"
                className="mt-3 inline-block text-xs bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700"
              >
                Criar primeiro documento
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {recent.map(doc => (
                <Link
                  key={doc.id}
                  to={`/documents/${doc.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.tema || DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id}
                    </p>
                    <p className="text-xs text-gray-400">
                      {DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id} ·{' '}
                      {format(new Date(doc.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={doc.status} />
                    {doc.quality_score != null && (
                      <span className={`text-xs font-semibold ${
                        doc.quality_score >= 80 ? 'text-green-600'
                          : doc.quality_score >= 60 ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}>
                        {doc.quality_score}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Agent stats */}
        {agents.length > 0 && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-sm font-semibold text-gray-700">Agentes LLM — Custo por Fase</h2>
            </div>
            <div className="divide-y">
              {agents.slice(0, 8).map(a => (
                <div key={a.agent_name} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{a.agent_name}</p>
                    <p className="text-xs text-gray-400">
                      {a.chamadas} chamada{a.chamadas !== 1 ? 's' : ''} ·{' '}
                      {fmtDuration(a.tempo_medio_ms)} média
                    </p>
                  </div>
                  <span className="text-xs font-mono text-amber-700 flex-shrink-0">
                    {fmtCost(a.custo_total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats by document type */}
      {byType.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="text-sm font-semibold text-gray-700">Documentos por Tipo</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-2 text-left">Tipo</th>
                  <th className="px-5 py-2 text-right">Total</th>
                  <th className="px-5 py-2 text-right">Score Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byType.map(row => (
                  <tr key={row.document_type_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5 text-sm text-gray-800">
                      {DOCTYPE_LABELS[row.document_type_id] || row.document_type_id}
                    </td>
                    <td className="px-5 py-2.5 text-sm text-right text-gray-600 font-medium">{row.total}</td>
                    <td className="px-5 py-2.5 text-sm text-right">
                      {row.avg_score != null ? (
                        <span className={`font-semibold ${
                          row.avg_score >= 80 ? 'text-green-600'
                            : row.avg_score >= 60 ? 'text-amber-600'
                            : 'text-red-600'
                        }`}>{row.avg_score}/100</span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
