import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight, BookOpen, Clock3, Download, FileStack, FolderOpen,
  Sparkles, Target, TrendingUp, UserCircle2,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import StatusBadge from '../../components/StatusBadge'
import { SkeletonCard } from '../../components/Skeleton'
import { useAuth } from '../../contexts/AuthContext'
import {
  buildCostSeries,
  computeDocsThisWeek,
  formatCost,
  formatDuration,
  useDashboardData,
} from '../../lib/dashboard-data'
import {
  buildDashboardPriorityActions,
  buildDashboardSignals,
  getFirstName,
  getGreetingForHour,
} from '../../lib/dashboard-v2'
import { DOCTYPE_SHORT_LABELS as DOCTYPE_LABELS } from '../../lib/constants'
import { buildWorkspaceDocumentDetailPath, buildWorkspaceShellPath } from '../../lib/workspace-routes'

const PERIOD_OPTIONS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
]

function DashboardTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-[1.25rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.94)] p-3 text-sm shadow-[var(--v2-shadow-soft)]">
      <p className="mb-1 font-medium text-[var(--v2-ink-strong)]">{label}</p>
      {payload.map((point: any) => (
        <p key={point.name} style={{ color: point.color }}>
          {point.name}: <strong>{typeof point.value === 'number' && point.name.includes('$') ? formatCost(point.value) : point.value}</strong>
        </p>
      ))}
    </div>
  )
}

function formatDia(dia: string) {
  try {
    return format(parseISO(dia), 'dd/MM', { locale: ptBR })
  } catch {
    return dia
  }
}

export default function DashboardV2() {
  const [periodDays, setPeriodDays] = useState(30)
  const location = useLocation()
  const { fullName } = useAuth()
  const { stats, daily, agents, recent, byType, loading, chartLoading } = useDashboardData(periodDays)
  const docsThisWeek = computeDocsThisWeek(daily)
  const costSeries = buildCostSeries(daily)
  const greeting = getGreetingForHour(new Date().getHours())
  const firstName = getFirstName(fullName)
  const priorityActions = buildDashboardPriorityActions({ stats, recent, docsThisWeek })
  const signals = buildDashboardSignals(stats)

  const resolveActionPath = (to: string) => {
    return to.startsWith('/') ? buildWorkspaceShellPath(to, { preserveSearch: location.search }) : to
  }

  const handleExportCSV = () => {
    const rows = [
      ['Data', 'Total', 'Concluidos', 'Custo (USD)'],
      ...daily.map((point) => [point.dia, point.total, point.concluidos, point.custo?.toFixed(5) ?? '0']),
    ]
    const csv = rows.map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `lexio-workspace-v2-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <section className="v2-panel p-6 lg:p-8">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="v2-panel overflow-hidden p-6 lg:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-end">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.74)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--v2-ink-soft)]">
              <Sparkles className="h-3.5 w-3.5" />
              Dashboard V2
            </div>
            <div className="space-y-3">
              <h1 className="v2-display text-4xl leading-tight text-[var(--v2-ink-strong)]">{greeting}{firstName ? `, ${firstName}` : ''}. O workspace agora nasce para agir.</h1>
              <p className="max-w-3xl text-sm leading-7 text-[var(--v2-ink-soft)] sm:text-[15px]">
                Esta superficie transforma o dashboard em hub operacional: prioridade do dia, retomada de fluxos,
                sinais de qualidade e acesso direto aos workbenches principais.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {priorityActions.map((action) => (
                <Link
                  key={action.key}
                  to={resolveActionPath(action.to)}
                  className={`rounded-[1.6rem] border px-4 py-4 transition-transform hover:-translate-y-0.5 ${
                    action.tone === 'teal'
                      ? 'border-teal-200 bg-teal-50/70 text-teal-950'
                      : action.tone === 'amber'
                        ? 'border-amber-200 bg-amber-50/75 text-amber-950'
                        : 'border-slate-200 bg-white/85 text-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{action.title}</p>
                      <p className="mt-2 text-sm leading-6 opacity-80">{action.description}</p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.72)] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Sinais do workspace</p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Pulso da operacao</h2>
              </div>
              <button onClick={handleExportCSV} className="v2-btn-secondary">
                <Download className="h-4 w-4" />
                Exportar CSV
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {signals.map((signal) => (
                <div key={signal.label} className="rounded-[1.2rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--v2-ink-faint)]">{signal.label}</p>
                  <p className={`mt-2 text-lg font-semibold ${signal.emphasis === 'good' ? 'text-emerald-700' : signal.emphasis === 'warn' ? 'text-amber-700' : 'text-[var(--v2-ink-strong)]'}`}>
                    {signal.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {stats && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Documentos totais', value: stats.total_documents, helper: `${stats.completed_documents} concluidos`, icon: FileStack },
            { label: 'Esta semana', value: docsThisWeek, helper: `${stats.processing_documents} em andamento`, icon: TrendingUp },
            { label: 'Revisao pendente', value: stats.pending_review_documents, helper: 'Fila do workspace', icon: Clock3 },
            { label: 'Custo acumulado', value: formatCost(stats.total_cost_usd), helper: `Tempo medio ${formatDuration(stats.average_duration_ms)}`, icon: Target },
          ].map((card) => (
            <div key={card.label} className="v2-panel px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--v2-ink-strong)]">{card.value}</p>
                  <p className="mt-2 text-sm text-[var(--v2-ink-soft)]">{card.helper}</p>
                </div>
                <card.icon className="h-5 w-5 text-[var(--v2-accent-strong)]" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Novo documento', to: '/documents/new', icon: FileStack },
          { label: 'Abrir workbench principal', to: '/notebook', icon: BookOpen },
          { label: 'Biblioteca e acervo', to: '/upload', icon: FolderOpen },
          { label: 'Ajustar perfil', to: '/profile', icon: UserCircle2 },
        ].map((action) => (
          <Link
            key={action.to}
            to={resolveActionPath(action.to)}
            className="v2-panel flex items-center gap-3 px-5 py-4 hover:-translate-y-0.5"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(15,118,110,0.12)] text-[var(--v2-accent-strong)]">
              <action.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{action.label}</p>
              <p className="text-xs text-[var(--v2-ink-soft)]">Abrir superficie correspondente</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="v2-panel overflow-hidden p-5 lg:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Andamento</p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">Fluxo recente e fila de retomada</h2>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-[rgba(15,23,42,0.06)] p-1">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setPeriodDays(option.days)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${periodDays === option.days ? 'bg-white text-[var(--v2-ink-strong)] shadow-sm' : 'text-[var(--v2-ink-soft)]'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              {recent.length === 0 ? (
                <div className="rounded-[1.6rem] border border-dashed border-[var(--v2-line-strong)] bg-[rgba(255,255,255,0.7)] px-5 py-10 text-center text-sm text-[var(--v2-ink-soft)]">
                  Ainda nao existem documentos no seu workspace. O proximo passo mais valioso e iniciar um documento ou um notebook.
                </div>
              ) : (
                recent.map((doc) => (
                  <Link
                    key={doc.id}
                    to={buildWorkspaceDocumentDetailPath(doc.id, { preserveSearch: location.search })}
                    className="flex items-center gap-4 rounded-[1.4rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.8)] px-4 py-4 hover:-translate-y-0.5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(15,118,110,0.1)] text-[var(--v2-accent-strong)]">
                      <FileStack className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">
                        {doc.tema || DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id}
                      </p>
                      <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">
                        {DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id} · {format(new Date(doc.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge status={doc.status} />
                      {doc.quality_score != null && (
                        <span className="text-xs font-semibold text-[var(--v2-ink-soft)]">{doc.quality_score}/100</span>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Sinal do periodo</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--v2-ink-strong)]">{docsThisWeek}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--v2-ink-soft)]">documentos iniciados ou movimentados nos ultimos 7 dias.</p>
              </div>
              {byType.slice(0, 3).map((row) => (
                <div key={row.document_type_id} className="rounded-[1.5rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)] p-4">
                  <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{DOCTYPE_LABELS[row.document_type_id] || row.document_type_id}</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-2xl font-semibold text-[var(--v2-ink-strong)]">{row.total}</p>
                    <p className="text-xs text-[var(--v2-ink-soft)]">Score medio {row.avg_score != null ? `${row.avg_score}/100` : '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {daily.length > 0 && (
            <div className="v2-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Volume</p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Documentos por dia</h2>
                </div>
                {chartLoading && <span className="text-xs text-[var(--v2-ink-faint)]">Atualizando...</span>}
              </div>
              <div className="mt-5 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                    <XAxis dataKey="dia" tickFormatter={formatDia} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<DashboardTooltip />} />
                    <Bar dataKey="concluidos" name="Concluidos" fill="#0f766e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" name="Total" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {costSeries.length > 0 && (
            <div className="v2-panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Custos</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Curva acumulada</h2>
              <div className="mt-5 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={costSeries}>
                    <defs>
                      <linearGradient id="v2CostGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                    <XAxis dataKey="dia" tickFormatter={formatDia} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `$${value.toFixed(3)}`} />
                    <Tooltip formatter={(value: number) => [formatCost(value), 'Custo acumulado']} labelFormatter={formatDia} />
                    <Area type="monotone" dataKey="custo_acumulado" stroke="#d97706" strokeWidth={2} fill="url(#v2CostGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {agents.length > 0 && (
            <div className="v2-panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Agentes</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--v2-ink-strong)]">Fases com maior custo</h2>
              <div className="mt-5 space-y-3">
                {agents.slice(0, 5).map((agent) => (
                  <div key={agent.agent_name} className="rounded-[1.2rem] bg-[rgba(255,255,255,0.78)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{agent.agent_name}</p>
                        <p className="text-xs text-[var(--v2-ink-soft)]">{agent.chamadas} chamada(s) · {formatDuration(agent.tempo_medio_ms)} media</p>
                      </div>
                      <span className="text-xs font-semibold text-amber-700">{formatCost(agent.custo_total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}