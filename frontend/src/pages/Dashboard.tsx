import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
import StatusBadge from '../components/StatusBadge'
import { SkeletonCard } from '../components/Skeleton'
import { IS_FIREBASE, firebaseAuth } from '../lib/firebase'
import { DOCTYPE_SHORT_LABELS as DOCTYPE_LABELS } from '../lib/constants'
import {
  buildCostSeries,
  computeDocsThisWeek,
  formatCost as fmtCost,
  formatDuration as fmtDuration,
  getResumableDocument,
  useDashboardData,
} from '../lib/dashboard-data'
import {
  buildWorkspaceDocumentDetailPath,
  buildWorkspaceDocumentsPath,
  buildWorkspaceNewDocumentPath,
  buildWorkspaceShellPath,
  buildWorkspaceThesesPath,
  buildWorkspaceUploadPath,
} from '../lib/workspace-routes'

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
  const [periodDays, setPeriodDays] = useState(30)
  const location = useLocation()
  const { stats, daily, agents, recent, byType, loading, chartLoading } = useDashboardData(periodDays)
  const costSeries = buildCostSeries(daily)
  const docsThisWeek = computeDocsThisWeek(daily)
  const notebookWorkbenchPath = buildWorkspaceShellPath('/notebook', { preserveSearch: location.search })
  const documentsPath = buildWorkspaceDocumentsPath({ preserveSearch: location.search })
  const newDocumentPath = buildWorkspaceNewDocumentPath({ preserveSearch: location.search })
  const uploadPath = buildWorkspaceUploadPath({ preserveSearch: location.search })
  const thesesPath = buildWorkspaceThesesPath({ preserveSearch: location.search })

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
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {IS_FIREBASE && firebaseAuth?.currentUser && (
            <p className="text-sm text-gray-500 mt-0.5">
              {new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'}
              {firebaseAuth.currentUser.displayName ? `, ${firebaseAuth.currentUser.displayName.split(' ')[0]}` : ''}
            </p>
          )}
        </div>
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
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total de Documentos', value: stats.total_documents, icon: FileText, color: 'blue' },
            { label: 'Esta Semana', value: docsThisWeek, icon: TrendingUp, color: 'brand' },
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

      {/* Continue working — show most recent in-progress or review document */}
      {recent.length > 0 && (() => {
        const resumable = getResumableDocument(recent)
        if (!resumable) return null
        const statusLabel = resumable.status === 'processando' ? 'em processamento' : resumable.status === 'em_revisao' ? 'aguardando revisão' : 'concluído'
        return (
          <Link
            to={buildWorkspaceDocumentDetailPath(resumable.id, { preserveSearch: location.search })}
            className="flex items-center gap-4 rounded-xl border border-teal-100 bg-teal-50/50 px-5 py-3 hover:bg-teal-50 transition-colors group"
          >
            <Activity className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                Continuar: {resumable.tema || DOCTYPE_LABELS[resumable.document_type_id] || 'Documento'}
              </p>
              <p className="text-xs text-gray-500">
                {DOCTYPE_LABELS[resumable.document_type_id] || resumable.document_type_id} · {statusLabel} ·{' '}
                {format(new Date(resumable.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-teal-600 transition-colors flex-shrink-0" />
          </Link>
        )
      })()}

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Novo Documento', icon: Plus, to: newDocumentPath, color: 'bg-teal-50 text-teal-700 border-teal-100' },
          { label: 'Upload de Acervo', icon: Upload, to: uploadPath, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
          { label: 'Caderno de Pesquisa', icon: BookOpen, to: notebookWorkbenchPath, color: 'bg-violet-50 text-violet-700 border-violet-100' },
          { label: 'Banco de Teses', icon: Search, to: thesesPath, color: 'bg-amber-50 text-amber-700 border-amber-100' },
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
              <TrendingUp className="w-4 h-4 text-teal-600" />
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
              <DollarSign className="w-4 h-4 text-teal-600" />
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
            <Link to={documentsPath} className="text-xs text-teal-600 hover:underline flex items-center gap-0.5">
              Ver todos <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nenhum documento ainda</p>
              <Link
                to={newDocumentPath}
                className="mt-3 inline-block text-xs bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"
              >
                Criar primeiro documento
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {recent.map(doc => (
                <Link
                  key={doc.id}
                  to={buildWorkspaceDocumentDetailPath(doc.id, { preserveSearch: location.search })}
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
