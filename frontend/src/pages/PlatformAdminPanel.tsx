import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Activity, AlertTriangle, BarChart3, BookOpen, Brain, Database, DollarSign, FileText,
  FolderArchive, Settings2, Shield, Sparkles, Users,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { useAuth } from '../contexts/AuthContext'
import { IS_FIREBASE } from '../lib/firebase'
import {
  backfillNotebookSearchMemoryAcrossPlatform,
  getCurrentUserId,
  getPlatformCostBreakdown,
  getPlatformExecutionStateDaily,
  getPlatformFunctionWindowComparison,
  getPlatformExecutionStateWindowComparison,
  getPlatformDailyUsage,
  getPlatformOverview,
  getPlatformRecentAgentExecutions,
  getUserSettings,
  saveUserSettings,
  type PlatformAggregateRow,
  type PlatformDailyUsagePoint,
  type PlatformExecutionStateDailyPoint,
  type PlatformFunctionWindowComparisonRow,
  type PlatformExecutionStateWindowComparisonRow,
  type NotebookSearchMemoryBackfillReport,
  type PlatformUsageRow,
} from '../lib/firestore-service'
import { getExecutionStateLabel } from '../lib/cost-analytics'
import type { CostBreakdown, CostBreakdownItem, UsageExecutionRecord } from '../lib/cost-analytics'
import { V2EmptyState, V2PageHero } from '../components/v2/V2PagePrimitives'
import { buildWorkspaceSettingsPath } from '../lib/workspace-routes'
import { fmtUsd, fmtInt, fmtPercent } from '../lib/currency-utils'

const PIE_COLORS = ['#0f766e', '#2563eb', '#9333ea', '#d97706', '#dc2626', '#64748b']
const EXECUTIVE_INSET_CARD = 'rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] px-2.5 py-2'
const EXECUTIVE_PANEL_BUTTON = 'px-3 py-1.5 rounded-lg border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] text-xs font-medium text-[var(--v2-ink-soft)] hover:bg-[rgba(255,255,255,0.9)] disabled:cursor-not-allowed disabled:opacity-50'
const EXECUTIVE_INPUT = 'mt-1 w-full rounded-[0.95rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-2.5 py-2 text-sm text-[var(--v2-ink-strong)] outline-none transition focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]'
const EXECUTIVE_INPUT_COMPACT = 'mt-1 w-full rounded-[0.95rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-2 py-1 text-sm text-[var(--v2-ink-strong)] outline-none transition focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]'

function fmtSignedNumber(value: number) {
  const rounded = Number(value.toFixed(2))
  if (rounded > 0) return `+${rounded}`
  return `${rounded}`
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

function formatDeltaPercent(value: number) {
  if (!Number.isFinite(value)) return 'N/D'
  const pct = value * 100
  const normalized = Math.abs(pct) < 0.05 ? 0 : pct
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(1)}%`
}

function getDeltaTone(value: number): string {
  if (value >= 0.15) return 'text-red-700'
  if (value >= 0.05) return 'text-amber-700'
  if (value <= -0.15) return 'text-emerald-700'
  if (value <= -0.05) return 'text-sky-700'
  return 'text-[var(--v2-ink-soft)]'
}

function formatExecutionTimestamp(value?: string) {
  if (!value) return 'N/D'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/D'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getExecutionStateTone(state?: string | null): string {
  if (!state) return 'bg-slate-100 border-slate-200 text-slate-700'
  if (state === 'completed') return 'bg-emerald-100 border-emerald-200 text-emerald-700'
  if (state === 'failed' || state === 'cancelled') return 'bg-red-100 border-red-200 text-red-700'
  if (state === 'retrying') return 'bg-amber-100 border-amber-200 text-amber-700'
  if (state === 'waiting_io') return 'bg-sky-100 border-sky-200 text-sky-700'
  if (state === 'persisting') return 'bg-indigo-100 border-indigo-200 text-indigo-700'
  return 'bg-violet-100 border-violet-200 text-violet-700'
}

type OperationalAlert = {
  id: string
  level: 'critical' | 'warning' | 'info'
  title: string
  description: string
}

type AlertImpactSummary = {
  critical: number
  warning: number
  info: number
}

type ExecutionFunctionReliabilityRow = {
  id: string
  functionLabel: string
  calls: number
  avgDurationMs: number
  retryRate: number
  fallbackRate: number
  waitingIoRate: number
  estimatedWasteUsd: number
}

type ExecutionTuningRecommendation = {
  id: string
  level: 'critical' | 'warning' | 'info'
  title: string
  description: string
  suggestedAction: string
}

type CalibrationDriftAlert = {
  id: string
  level: 'critical' | 'warning' | 'info'
  message: string
}

type DriftActionPlan = {
  id: string
  alertId: string
  level: 'critical' | 'warning' | 'info'
  title: string
  rationale: string
  thresholds: AlertThresholds
  policyPatch?: Partial<RecommendationPolicy>
}

type AlertThresholds = {
  discardTotalCritical7d: number
  discardTrendMultiplierWarning: number
  coverageWarningMin: number
  noUpdatesInfoDays: number
}

type AlertProfile = 'conservative' | 'balanced' | 'aggressive' | 'custom'
type ScaleProfile = 'small' | 'medium' | 'large'
type RecommendationRolloutMode = 'manual' | 'assisted'

type RecommendationPolicy = {
  recommendationWindowDays: number
  rolloutMode: RecommendationRolloutMode
}

type RecommendationHistoryEntry = {
  id: string
  createdAt: string
  action: 'recommendation_applied' | 'thresholds_saved'
  rolloutMode: RecommendationRolloutMode
  recommendationWindowDays: number
  scaleProfile: ScaleProfile
  recommendedThresholds?: AlertThresholds
  appliedThresholds: AlertThresholds
  impactCurrent?: AlertImpactSummary
  impactProjected?: AlertImpactSummary
}

const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  discardTotalCritical7d: 25,
  discardTrendMultiplierWarning: 2,
  coverageWarningMin: 0.6,
  noUpdatesInfoDays: 7,
}

const DEFAULT_RECOMMENDATION_POLICY: RecommendationPolicy = {
  recommendationWindowDays: 30,
  rolloutMode: 'manual',
}

const MAX_RECOMMENDATION_HISTORY_ENTRIES = 30

const ALERT_THRESHOLD_PRESETS: Record<Exclude<AlertProfile, 'custom'>, AlertThresholds> = {
  conservative: {
    discardTotalCritical7d: 15,
    discardTrendMultiplierWarning: 1.5,
    coverageWarningMin: 0.8,
    noUpdatesInfoDays: 5,
  },
  balanced: DEFAULT_ALERT_THRESHOLDS,
  aggressive: {
    discardTotalCritical7d: 40,
    discardTrendMultiplierWarning: 2.5,
    coverageWarningMin: 0.45,
    noUpdatesInfoDays: 10,
  },
}

function areThresholdsEqual(left: AlertThresholds, right: AlertThresholds): boolean {
  return left.discardTotalCritical7d === right.discardTotalCritical7d
    && left.discardTrendMultiplierWarning === right.discardTrendMultiplierWarning
    && left.coverageWarningMin === right.coverageWarningMin
    && left.noUpdatesInfoDays === right.noUpdatesInfoDays
}

function detectProfileFromThresholds(thresholds: AlertThresholds): AlertProfile {
  if (areThresholdsEqual(thresholds, ALERT_THRESHOLD_PRESETS.conservative)) return 'conservative'
  if (areThresholdsEqual(thresholds, ALERT_THRESHOLD_PRESETS.balanced)) return 'balanced'
  if (areThresholdsEqual(thresholds, ALERT_THRESHOLD_PRESETS.aggressive)) return 'aggressive'
  return 'custom'
}

function parseAlertThresholds(raw: unknown): AlertThresholds {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const numberOrDefault = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback

  return {
    discardTotalCritical7d: Math.max(1, Math.floor(numberOrDefault(data.memory_discard_total_7d_critical, DEFAULT_ALERT_THRESHOLDS.discardTotalCritical7d))),
    discardTrendMultiplierWarning: Math.max(1, numberOrDefault(data.memory_discard_trend_multiplier_warning, DEFAULT_ALERT_THRESHOLDS.discardTrendMultiplierWarning)),
    coverageWarningMin: Math.min(1, Math.max(0, numberOrDefault(data.memory_coverage_warning_min, DEFAULT_ALERT_THRESHOLDS.coverageWarningMin))),
    noUpdatesInfoDays: Math.max(1, Math.floor(numberOrDefault(data.memory_no_updates_days_info, DEFAULT_ALERT_THRESHOLDS.noUpdatesInfoDays))),
  }
}

function getRecommendationTone(level: ExecutionTuningRecommendation['level']): string {
  if (level === 'critical') return 'border-red-200 bg-red-50'
  if (level === 'warning') return 'border-amber-200 bg-amber-50'
  return 'border-sky-200 bg-sky-50'
}

function buildExecutionTuningRecommendations(input: {
  stateRows: Array<CostBreakdownItem & { callShare: number; costShare: number }>
  functionRows: ExecutionFunctionReliabilityRow[]
  sampleSize: number
}): ExecutionTuningRecommendation[] {
  const recommendations: ExecutionTuningRecommendation[] = []
  const waitingIo = input.stateRows.find(row => row.key === 'waiting_io')
  const retrying = input.stateRows.find(row => row.key === 'retrying')
  const noisiestFunction = input.functionRows[0]

  if (waitingIo && waitingIo.calls >= 6 && waitingIo.callShare >= 0.2 && (waitingIo.avg_duration_ms ?? 0) >= 12000) {
    recommendations.push({
      id: 'waiting-io-pressure',
      level: waitingIo.callShare >= 0.35 ? 'critical' : 'warning',
      title: 'Pressão elevada em waiting_io',
      description: `Waiting I/O responde por ${fmtPercent(waitingIo.callShare)} das chamadas com latência média de ${formatDurationMs(waitingIo.avg_duration_ms)}.`,
      suggestedAction: 'Recalibrar concorrência de mídia/acervo (VITE_VIDEO_IMAGE_BATCH_CONCURRENCY, VITE_VIDEO_TTS_BATCH_CONCURRENCY, VITE_NB_ACERVO_ANALISTA_CONCURRENCY) reduzindo um nível por janela de 24h.',
    })
  }

  if (retrying && retrying.calls >= 4 && retrying.callShare >= 0.08) {
    recommendations.push({
      id: 'retrying-pressure',
      level: retrying.callShare >= 0.15 ? 'critical' : 'warning',
      title: 'Volume de reprocessamento acima do alvo',
      description: `Execuções em retrying representam ${fmtPercent(retrying.callShare)} da amostra agregada por estado.`,
      suggestedAction: 'Priorizar auditoria dos modelos e fases com mais retry/fallback, reforçando modelos estáveis para etapas críticas de redação e síntese.',
    })
  }

  if (noisiestFunction && noisiestFunction.calls >= 5 && (noisiestFunction.retryRate >= 0.15 || noisiestFunction.fallbackRate >= 0.12)) {
    recommendations.push({
      id: 'function-noise-hotspot',
      level: noisiestFunction.retryRate >= 0.22 ? 'critical' : 'warning',
      title: `Hotspot de confiabilidade em ${noisiestFunction.functionLabel}`,
      description: `Retry ${fmtPercent(noisiestFunction.retryRate)} • Fallback ${fmtPercent(noisiestFunction.fallbackRate)} • Latência média ${formatDurationMs(noisiestFunction.avgDurationMs)}.`,
      suggestedAction: 'Aplicar mitigação focada por função: reduzir paralelismo local, revisar fallback do catálogo e revalidar prompts com maior taxa de repetição.',
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'stable-telemetry',
      level: 'info',
      title: 'Telemetria estável para tuning incremental',
      description: `Sem pressão crítica na janela atual (${fmtInt(input.sampleSize)} execuções recentes).`,
      suggestedAction: 'Manter monitoramento diário de waiting_io/retrying e reavaliar tuning apenas quando o share ultrapassar os limiares operacionais.',
    })
  }

  return recommendations
}

function StatCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone?: string }) {
  return (
    <div className="v2-summary-card bg-[rgba(255,255,255,0.82)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--v2-ink-faint)]">{label}</span>
        <Icon className={`w-4 h-4 ${tone || 'text-teal-600'}`} />
      </div>
      <p className="mt-2 text-lg font-bold text-[var(--v2-ink-strong)]">{value}</p>
    </div>
  )
}

function SimpleTable({ title, rows, emptyLabel }: { title: string; rows: Array<PlatformAggregateRow | PlatformUsageRow>; emptyLabel: string }) {
  return (
    <div className="v2-panel overflow-hidden">
      <div className="border-b border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.58)] px-5 py-3">
        <h2 className="text-sm font-semibold text-[var(--v2-ink-strong)]">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--v2-ink-faint)]">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead className="bg-[rgba(255,255,255,0.74)] text-[11px] uppercase tracking-wide text-[var(--v2-ink-faint)]">
              <tr>
                <th className="px-5 py-2 text-left">Item</th>
                <th className="px-5 py-2 text-right">Uso</th>
                <th className="px-5 py-2 text-right">Tokens</th>
                <th className="px-5 py-2 text-right">USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--v2-line-soft)]">
              {rows.map(row => (
                <tr key={row.key} className="hover:bg-[rgba(255,255,255,0.66)]">
                  <td className="px-5 py-3 text-sm text-[var(--v2-ink-strong)]">{row.label}</td>
                  <td className="px-5 py-3 text-sm text-right text-[var(--v2-ink-soft)]">{'calls' in row ? fmtInt(row.calls) : fmtInt(row.count)}</td>
                  <td className="px-5 py-3 text-sm text-right text-[var(--v2-ink-soft)]">{'total_tokens' in row ? fmtInt(row.total_tokens) : '0'}</td>
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
  const location = useLocation()
  const toast = useToast()
  const { isReady, role } = useAuth()
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getPlatformOverview>> | null>(null)
  const [daily, setDaily] = useState<PlatformDailyUsagePoint[]>([])
  const [platformBreakdown, setPlatformBreakdown] = useState<CostBreakdown | null>(null)
  const [recentExecutions, setRecentExecutions] = useState<UsageExecutionRecord[]>([])
  const [executionStateDaily, setExecutionStateDaily] = useState<PlatformExecutionStateDailyPoint[]>([])
  const [executionStateComparison, setExecutionStateComparison] = useState<PlatformExecutionStateWindowComparisonRow[]>([])
  const [executionFunctionComparison, setExecutionFunctionComparison] = useState<PlatformFunctionWindowComparisonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillReport, setBackfillReport] = useState<NotebookSearchMemoryBackfillReport | null>(null)
  const [alertThresholds, setAlertThresholds] = useState<AlertThresholds>(DEFAULT_ALERT_THRESHOLDS)
  const [alertProfile, setAlertProfile] = useState<AlertProfile>('balanced')
  const [scaleProfile, setScaleProfile] = useState<ScaleProfile>('medium')
  const [recommendationPolicy, setRecommendationPolicy] = useState<RecommendationPolicy>(DEFAULT_RECOMMENDATION_POLICY)
  const [recommendationHistory, setRecommendationHistory] = useState<RecommendationHistoryEntry[]>([])
  const [savingThresholds, setSavingThresholds] = useState(false)
  const [applyingDriftActionId, setApplyingDriftActionId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        if (!IS_FIREBASE) {
          throw new Error('O painel admin agregado está disponível apenas no modo Firebase.')
        }

        const [
          overviewData,
          dailyData,
          costBreakdown,
          recentAgentExecutions,
          stateDailyData,
          stateComparisonData,
          functionComparisonData,
        ] = await Promise.all([
          getPlatformOverview(),
          getPlatformDailyUsage(30),
          getPlatformCostBreakdown(),
          getPlatformRecentAgentExecutions(120),
          getPlatformExecutionStateDaily(14),
          getPlatformExecutionStateWindowComparison(7),
          getPlatformFunctionWindowComparison(7),
        ])
        setOverview(overviewData)
        setDaily(dailyData)
        setPlatformBreakdown(costBreakdown)
        setRecentExecutions(recentAgentExecutions)
        setExecutionStateDaily(stateDailyData)
        setExecutionStateComparison(stateComparisonData)
        setExecutionFunctionComparison(functionComparisonData)
        setScaleProfile(detectScaleProfile(overviewData.total_notebooks))

        const uid = getCurrentUserId()
        if (uid) {
          const settings = await getUserSettings(uid)
          const parsed = parseAlertThresholds(settings.platform_admin_alert_thresholds)
          setAlertThresholds(parsed)
          setRecommendationPolicy(parseRecommendationPolicy(settings.platform_admin_alert_recommendation_policy))
          setRecommendationHistory(parseRecommendationHistory(settings.platform_admin_alert_recommendation_history))
          const profileFromSettings = settings.platform_admin_alert_profile
          if (profileFromSettings === 'conservative' || profileFromSettings === 'balanced' || profileFromSettings === 'aggressive' || profileFromSettings === 'custom') {
            setAlertProfile(profileFromSettings)
          } else {
            setAlertProfile(detectProfileFromThresholds(parsed))
          }
        }
      } catch (err) {
        console.error(err)
        const { humanizeError } = await import('../lib/error-humanizer')
        const h = humanizeError(err)
        toast.error('Erro ao carregar painel administrativo da plataforma', h.detail || h.title)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        icon={Shield}
        title="Acesso administrativo necessário"
        description="Esta cabine executiva consolida indicadores agregados de usuários, custos, memória dedicada e governança da plataforma inteira, por isso permanece restrita ao perfil administrativo."
      />
    )
  }

  const functionChart = useMemo(() => overview?.functions_by_usage.slice(0, 8).map(row => ({
    label: row.label,
    calls: row.calls,
    usd: row.cost_usd,
  })) ?? [], [overview])

  const documentStatusChart = useMemo(() => overview?.documents_by_status.slice(0, 6) ?? [], [overview])
  const artifactChart = useMemo(() => overview?.artifacts_by_type.slice(0, 6) ?? [], [overview])
  const executionStateLatencyRows = useMemo(() => {
    if (!platformBreakdown?.by_execution_state || platformBreakdown.by_execution_state.length === 0) {
      return [] as Array<CostBreakdownItem & { callShare: number; costShare: number }>
    }

    return platformBreakdown.by_execution_state
      .filter(row => row.calls > 0)
      .map(row => ({
        ...row,
        callShare: platformBreakdown.total_calls > 0 ? row.calls / platformBreakdown.total_calls : 0,
        costShare: platformBreakdown.total_cost_usd > 0 ? row.cost_usd / platformBreakdown.total_cost_usd : 0,
      }))
      .sort((left, right) => (right.avg_duration_ms ?? 0) - (left.avg_duration_ms ?? 0))
  }, [platformBreakdown])

  const executionStateFunctionHotspots = useMemo(() => {
    if (!platformBreakdown?.by_execution_state_per_function) return [] as Array<{
      id: string
      functionLabel: string
      stateLabel: string
      calls: number
      avgDurationMs: number
      costUsd: number
    }>

    const functionLabels = new Map(platformBreakdown.by_function.map(row => [row.key, row.label]))
    const rows: Array<{
      id: string
      functionLabel: string
      stateLabel: string
      calls: number
      avgDurationMs: number
      costUsd: number
    }> = []

    Object.entries(platformBreakdown.by_execution_state_per_function).forEach(([functionKey, stateRows]) => {
      stateRows.forEach(stateRow => {
        const avgDurationMs = stateRow.avg_duration_ms ?? 0
        if (avgDurationMs <= 0 || stateRow.calls <= 0) return

        rows.push({
          id: `${functionKey}:${stateRow.key}`,
          functionLabel: functionLabels.get(functionKey) ?? functionKey,
          stateLabel: stateRow.label,
          calls: stateRow.calls,
          avgDurationMs,
          costUsd: stateRow.cost_usd,
        })
      })
    })

    return rows
      .sort((left, right) => right.avgDurationMs - left.avgDurationMs || right.calls - left.calls)
      .slice(0, 10)
  }, [platformBreakdown])

  const recentExecutionMetrics = useMemo(() => {
    if (recentExecutions.length === 0) {
      return {
        retries: 0,
        fallbacks: 0,
        waitingIo: 0,
        inFlight: 0,
        avgDurationMs: 0,
      }
    }

    const retries = recentExecutions.filter(item => (item.retry_count ?? 0) > 0).length
    const fallbacks = recentExecutions.filter(item => item.used_fallback === true).length
    const waitingIo = recentExecutions.filter(item => item.execution_state === 'waiting_io').length
    const inFlight = recentExecutions.filter(item => {
      const state = item.execution_state
      return state === 'queued' || state === 'running' || state === 'waiting_io' || state === 'retrying' || state === 'persisting'
    }).length
    const avgDurationMs = Math.round(recentExecutions.reduce((sum, item) => sum + item.duration_ms, 0) / recentExecutions.length)

    return {
      retries,
      fallbacks,
      waitingIo,
      inFlight,
      avgDurationMs,
    }
  }, [recentExecutions])

  const executionFunctionReliabilityRows = useMemo(() => {
    if (recentExecutions.length === 0) return [] as ExecutionFunctionReliabilityRow[]

    const grouped = new Map<string, {
      functionLabel: string
      calls: number
      retries: number
      fallbacks: number
      waitingIo: number
      totalDurationMs: number
      totalCostUsd: number
    }>()

    recentExecutions.forEach(execution => {
      const functionKey = execution.function_key || execution.function_label || 'unknown'
      const current = grouped.get(functionKey) ?? {
        functionLabel: execution.function_label || functionKey,
        calls: 0,
        retries: 0,
        fallbacks: 0,
        waitingIo: 0,
        totalDurationMs: 0,
        totalCostUsd: 0,
      }

      current.calls += 1
      current.retries += (execution.retry_count ?? 0) > 0 ? 1 : 0
      current.fallbacks += execution.used_fallback ? 1 : 0
      current.waitingIo += execution.execution_state === 'waiting_io' ? 1 : 0
      current.totalDurationMs += execution.duration_ms
      current.totalCostUsd += execution.cost_usd

      grouped.set(functionKey, current)
    })

    return Array.from(grouped.entries())
      .map(([functionKey, value]) => {
        const avgDurationMs = value.calls > 0 ? Math.round(value.totalDurationMs / value.calls) : 0
        const retryRate = value.calls > 0 ? value.retries / value.calls : 0
        const fallbackRate = value.calls > 0 ? value.fallbacks / value.calls : 0
        const waitingIoRate = value.calls > 0 ? value.waitingIo / value.calls : 0
        const estimatedWasteUsd = value.totalCostUsd * Math.min(1, retryRate + fallbackRate * 0.5)

        return {
          id: functionKey,
          functionLabel: value.functionLabel,
          calls: value.calls,
          avgDurationMs,
          retryRate,
          fallbackRate,
          waitingIoRate,
          estimatedWasteUsd,
        }
      })
      .sort((left, right) => {
        const leftScore = left.retryRate * 1.5 + left.fallbackRate + left.waitingIoRate * 1.2
        const rightScore = right.retryRate * 1.5 + right.fallbackRate + right.waitingIoRate * 1.2
        return rightScore - leftScore || right.calls - left.calls || right.avgDurationMs - left.avgDurationMs
      })
      .slice(0, 8)
  }, [recentExecutions])

  const executionTuningRecommendations = useMemo(() => buildExecutionTuningRecommendations({
    stateRows: executionStateLatencyRows,
    functionRows: executionFunctionReliabilityRows,
    sampleSize: recentExecutions.length,
  }), [executionFunctionReliabilityRows, executionStateLatencyRows, recentExecutions.length])

  const executionStateDailyRows = useMemo(() => {
    return executionStateDaily.map(point => {
      const waitingIo = point.states.find(state => state.key === 'waiting_io')
      const retrying = point.states.find(state => state.key === 'retrying')
      const inFlight = point.states.find(state => state.key === 'in_flight')
      const fallbackCalls = point.states.reduce((acc, state) => acc + Math.round(state.fallback_rate * state.calls), 0)
      const retryCalls = point.states.reduce((acc, state) => acc + Math.round(state.retry_rate * state.calls), 0)

      return {
        dia: point.dia,
        totalCalls: point.total_calls,
        waitingIoCalls: waitingIo?.calls ?? 0,
        retryingCalls: retrying?.calls ?? 0,
        inFlightCalls: inFlight?.calls ?? 0,
        fallbackRate: point.total_calls > 0 ? fallbackCalls / point.total_calls : 0,
        retryRate: point.total_calls > 0 ? retryCalls / point.total_calls : 0,
      }
    })
  }, [executionStateDaily])

  const executionWindowTotals = useMemo(() => {
    const currentCalls = executionStateComparison.reduce((acc, row) => acc + row.current_calls, 0)
    const previousCalls = executionStateComparison.reduce((acc, row) => acc + row.previous_calls, 0)
    const currentCost = executionStateComparison.reduce((acc, row) => acc + row.current_cost_usd, 0)
    const previousCost = executionStateComparison.reduce((acc, row) => acc + row.previous_cost_usd, 0)

    return {
      currentCalls,
      previousCalls,
      currentCost,
      previousCost,
      callsDeltaPct: previousCalls > 0 ? (currentCalls - previousCalls) / previousCalls : currentCalls > 0 ? 1 : 0,
      costDeltaPct: previousCost > 0 ? (currentCost - previousCost) / previousCost : currentCost > 0 ? 1 : 0,
    }
  }, [executionStateComparison])

  const executionStateWindowRecommendations = useMemo(() => {
    if (executionStateComparison.length === 0) return [] as ExecutionTuningRecommendation[]

    const recommendations: ExecutionTuningRecommendation[] = []
    const waitingIo = executionStateComparison.find(row => row.key === 'waiting_io')
    const retrying = executionStateComparison.find(row => row.key === 'retrying')
    const completed = executionStateComparison.find(row => row.key === 'completed')

    if (waitingIo && waitingIo.current_calls >= 12 && waitingIo.calls_delta_pct >= 0.2) {
      recommendations.push({
        id: 'window-waiting-io-growth',
        level: waitingIo.calls_delta_pct >= 0.35 ? 'critical' : 'warning',
        title: 'Waiting I/O cresceu no comparativo diário',
        description: `${waitingIo.label} subiu ${formatDeltaPercent(waitingIo.calls_delta_pct)} em volume e ${formatDeltaPercent(waitingIo.duration_delta_pct)} em latência média.`,
        suggestedAction: 'Reavaliar timeout, concorrência e fila das funções com maior espera por I/O.',
      })
    }

    if (retrying && retrying.current_calls >= 8 && retrying.current_retry_rate >= 0.18) {
      recommendations.push({
        id: 'window-retrying-risk',
        level: retrying.current_retry_rate >= 0.3 ? 'critical' : 'warning',
        title: 'Estado de retry em patamar elevado',
        description: `Retry médio atual em ${fmtPercent(retrying.current_retry_rate)} (janela anterior ${fmtPercent(retrying.previous_retry_rate)}).`,
        suggestedAction: 'Ajustar política de retries e priorizar fallback para rotas com maior taxa de repetição.',
      })
    }

    if (completed && completed.current_calls >= 20 && completed.duration_delta_pct >= 0.15) {
      recommendations.push({
        id: 'window-completed-latency-up',
        level: completed.duration_delta_pct >= 0.3 ? 'warning' : 'info',
        title: 'Latência de execuções concluídas subiu',
        description: `Execuções concluídas ficaram ${formatDeltaPercent(completed.duration_delta_pct)} mais lentas na janela atual.`,
        suggestedAction: 'Inspecionar funções com maior duração média e reforçar cache para fases de pesquisa repetitiva.',
      })
    }

    if (recommendations.length === 0) {
      recommendations.push({
        id: 'window-stable',
        level: 'info',
        title: 'Comparativo de janelas estável',
        description: 'Sem desvio operacional crítico por execution_state no comparativo atual versus janela anterior.',
        suggestedAction: 'Manter monitoramento diário e revisar recomendações automáticas apenas em caso de novo drift.',
      })
    }

    return recommendations.slice(0, 3)
  }, [executionStateComparison])

  const executionFunctionWindowRows = useMemo(() => {
    return executionFunctionComparison.slice(0, 10)
  }, [executionFunctionComparison])

  const executionFunctionWindowTotals = useMemo(() => {
    const currentCalls = executionFunctionComparison.reduce((acc, row) => acc + row.current_calls, 0)
    const previousCalls = executionFunctionComparison.reduce((acc, row) => acc + row.previous_calls, 0)
    const currentCost = executionFunctionComparison.reduce((acc, row) => acc + row.current_cost_usd, 0)
    const previousCost = executionFunctionComparison.reduce((acc, row) => acc + row.previous_cost_usd, 0)

    return {
      currentCalls,
      previousCalls,
      currentCost,
      previousCost,
      callsDeltaPct: previousCalls > 0 ? (currentCalls - previousCalls) / previousCalls : currentCalls > 0 ? 1 : 0,
      costDeltaPct: previousCost > 0 ? (currentCost - previousCost) / previousCost : currentCost > 0 ? 1 : 0,
    }
  }, [executionFunctionComparison])

  const executionFunctionWindowRecommendations = useMemo(() => {
    if (executionFunctionComparison.length === 0) return [] as ExecutionTuningRecommendation[]

    const recommendations: ExecutionTuningRecommendation[] = []
    const waitingIoHotspot = executionFunctionComparison.find(row => row.current_calls >= 8 && row.current_waiting_io_rate >= 0.2)
    const retryHotspot = executionFunctionComparison.find(row => row.current_calls >= 8 && row.current_retry_rate >= 0.18)
    const fallbackHotspot = executionFunctionComparison.find(row => row.current_calls >= 8 && row.current_fallback_rate >= 0.16)

    if (waitingIoHotspot) {
      recommendations.push({
        id: `function-window-waiting-io-${waitingIoHotspot.key}`,
        level: waitingIoHotspot.current_waiting_io_rate >= 0.3 ? 'critical' : 'warning',
        title: `Waiting I/O concentrado em ${waitingIoHotspot.label}`,
        description: `${waitingIoHotspot.label} apresenta waiting I/O em ${fmtPercent(waitingIoHotspot.current_waiting_io_rate)} com delta de chamadas ${formatDeltaPercent(waitingIoHotspot.calls_delta_pct)}.`,
        suggestedAction: 'Revisar timeout e concorrência desta função, além de reforçar cache de insumos repetitivos no estágio mais lento.',
      })
    }

    if (retryHotspot) {
      recommendations.push({
        id: `function-window-retry-${retryHotspot.key}`,
        level: retryHotspot.current_retry_rate >= 0.28 ? 'critical' : 'warning',
        title: `Retry acima do alvo em ${retryHotspot.label}`,
        description: `Retry atual ${fmtPercent(retryHotspot.current_retry_rate)} (janela anterior ${fmtPercent(retryHotspot.previous_retry_rate)}).`,
        suggestedAction: 'Ajustar política de reprocessamento e priorizar modelo fallback mais estável para esta função.',
      })
    }

    if (fallbackHotspot) {
      recommendations.push({
        id: `function-window-fallback-${fallbackHotspot.key}`,
        level: fallbackHotspot.current_fallback_rate >= 0.24 ? 'warning' : 'info',
        title: `Fallback elevado em ${fallbackHotspot.label}`,
        description: `Fallback atual ${fmtPercent(fallbackHotspot.current_fallback_rate)} com variação de custo ${formatDeltaPercent(fallbackHotspot.cost_delta_pct)}.`,
        suggestedAction: 'Revalidar catálogo/modelo primário desta função para reduzir swaps de fallback na janela seguinte.',
      })
    }

    if (recommendations.length === 0) {
      recommendations.push({
        id: 'function-window-stable',
        level: 'info',
        title: 'Comparativo por função sem hotspots críticos',
        description: 'Nenhuma função ultrapassou limiares de retry/fallback/waiting I/O no comparativo atual versus janela anterior.',
        suggestedAction: 'Manter acompanhamento diário e atuar apenas em funções que ultrapassarem os limiares operacionais.',
      })
    }

    return recommendations.slice(0, 3)
  }, [executionFunctionComparison])

  const memoryAlerts = useMemo(() => {
    if (!overview) return [] as OperationalAlert[]
    return buildMemoryAlerts(overview, daily, alertThresholds)
  }, [alertThresholds, daily, overview])

  const telemetryRecommendation = useMemo(() => {
    if (!overview) return null
    return buildTelemetryRecommendedThresholds(overview, daily, recommendationPolicy.recommendationWindowDays)
  }, [daily, overview, recommendationPolicy.recommendationWindowDays])

  const projectedAlertImpact = useMemo(() => {
    if (!overview || !telemetryRecommendation) return null

    const current = summarizeAlertImpact(buildMemoryAlerts(overview, daily, alertThresholds))
    const projected = summarizeAlertImpact(buildMemoryAlerts(overview, daily, telemetryRecommendation.thresholds))
    return {
      current,
      projected,
    }
  }, [alertThresholds, daily, overview, telemetryRecommendation])

  const calibrationHistoryMetrics = useMemo(() => {
    if (recommendationHistory.length === 0) {
      return {
        total: 0,
        manualSaves: 0,
        assistedApplies: 0,
        avgDeltaCritical: 0,
        avgDeltaWarning: 0,
        avgDeltaInfo: 0,
      }
    }

    let manualSaves = 0
    let assistedApplies = 0
    let totalDeltaCritical = 0
    let totalDeltaWarning = 0
    let totalDeltaInfo = 0

    recommendationHistory.forEach(entry => {
      if (entry.action === 'thresholds_saved' && entry.rolloutMode === 'manual') {
        manualSaves += 1
      }
      if (entry.action === 'recommendation_applied' && entry.rolloutMode === 'assisted') {
        assistedApplies += 1
      }

      const currentCritical = entry.impactCurrent?.critical ?? 0
      const projectedCritical = entry.impactProjected?.critical ?? currentCritical
      totalDeltaCritical += projectedCritical - currentCritical

      const currentWarning = entry.impactCurrent?.warning ?? 0
      const projectedWarning = entry.impactProjected?.warning ?? currentWarning
      totalDeltaWarning += projectedWarning - currentWarning

      const currentInfo = entry.impactCurrent?.info ?? 0
      const projectedInfo = entry.impactProjected?.info ?? currentInfo
      totalDeltaInfo += projectedInfo - currentInfo
    })

    return {
      total: recommendationHistory.length,
      manualSaves,
      assistedApplies,
      avgDeltaCritical: totalDeltaCritical / recommendationHistory.length,
      avgDeltaWarning: totalDeltaWarning / recommendationHistory.length,
      avgDeltaInfo: totalDeltaInfo / recommendationHistory.length,
    }
  }, [recommendationHistory])

  const calibrationDriftAlerts = useMemo(() => {
    const alerts: CalibrationDriftAlert[] = []
    if (recommendationHistory.length < 4) return alerts

    const recent = recommendationHistory.slice(0, 8)
    const avg = (values: number[]) => values.length > 0 ? values.reduce((acc, value) => acc + value, 0) / values.length : 0
    const recentDeltaCritical = avg(recent.map(item => {
      const current = item.impactCurrent?.critical ?? 0
      const projected = item.impactProjected?.critical ?? current
      return projected - current
    }))
    const recentDeltaWarning = avg(recent.map(item => {
      const current = item.impactCurrent?.warning ?? 0
      const projected = item.impactProjected?.warning ?? current
      return projected - current
    }))

    const manualOverrideRate = calibrationHistoryMetrics.total > 0
      ? calibrationHistoryMetrics.manualSaves / calibrationHistoryMetrics.total
      : 0

    if (recentDeltaCritical >= 1) {
      alerts.push({
        id: 'critical-delta-up',
        level: 'critical',
        message: `Delta crítico médio recente elevado (${recentDeltaCritical.toFixed(2)}). Avaliar thresholds para reduzir escalonamento de ruído.`,
      })
    }

    if (recentDeltaWarning >= 1.2) {
      alerts.push({
        id: 'warning-delta-up',
        level: 'warning',
        message: `Delta de atenção em alta (${recentDeltaWarning.toFixed(2)}). Recomendado revisar janela de recomendação e cobertura mínima.`,
      })
    }

    if (manualOverrideRate >= 0.6 && calibrationHistoryMetrics.total >= 6) {
      alerts.push({
        id: 'manual-override-rate',
        level: 'warning',
        message: `Override manual alto (${fmtPercent(manualOverrideRate)}). Investigar desalinhamento entre recomendação assistida e operação real.`,
      })
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'drift-stable',
        level: 'info',
        message: 'Sem desvios relevantes na trilha de calibração recente.',
      })
    }

    return alerts
  }, [calibrationHistoryMetrics, recommendationHistory])

  const rolloutGovernanceHealth = useMemo(() => {
    const total = calibrationHistoryMetrics.total
    if (total === 0) {
      return {
        label: 'Sem histórico suficiente',
        tone: 'bg-slate-100 border-slate-200 text-slate-700',
      }
    }

    const manualOverrideRate = calibrationHistoryMetrics.manualSaves / total
    if (manualOverrideRate >= 0.6) {
      return {
        label: `Atenção: override manual ${fmtPercent(manualOverrideRate)}`,
        tone: 'bg-amber-100 border-amber-300 text-amber-800',
      }
    }
    if (manualOverrideRate <= 0.25) {
      return {
        label: `Saudável: override manual ${fmtPercent(manualOverrideRate)}`,
        tone: 'bg-emerald-100 border-emerald-300 text-emerald-800',
      }
    }

    return {
      label: `Neutro: override manual ${fmtPercent(manualOverrideRate)}`,
      tone: 'bg-sky-100 border-sky-300 text-sky-800',
    }
  }, [calibrationHistoryMetrics])

  const currentAlertImpact = useMemo(() => {
    if (!overview) return null
    return summarizeAlertImpact(buildMemoryAlerts(overview, daily, alertThresholds))
  }, [alertThresholds, daily, overview])

  const driftActionPlans = useMemo(() => {
    if (!overview) return [] as DriftActionPlan[]

    const plans: DriftActionPlan[] = []
    const base = normalizeAlertThresholds(alertThresholds)

    for (const alert of calibrationDriftAlerts) {
      if (alert.id === 'critical-delta-up') {
        const nextThresholds = normalizeAlertThresholds({
          ...base,
          discardTotalCritical7d: Math.ceil(base.discardTotalCritical7d * 1.2),
        })
        if (!areThresholdsEqual(base, nextThresholds)) {
          plans.push({
            id: `plan-${alert.id}`,
            alertId: alert.id,
            level: 'critical',
            title: 'Reduzir ruído crítico por tolerância de descarte',
            rationale: 'Aumenta o limiar crítico de descartes para reduzir escalonamento por oscilações curtas.',
            thresholds: nextThresholds,
          })
        }
      }

      if (alert.id === 'warning-delta-up') {
        const nextThresholds = normalizeAlertThresholds({
          ...base,
          discardTrendMultiplierWarning: Number((base.discardTrendMultiplierWarning + 0.2).toFixed(2)),
          noUpdatesInfoDays: base.noUpdatesInfoDays + 1,
        })
        if (!areThresholdsEqual(base, nextThresholds)) {
          plans.push({
            id: `plan-${alert.id}`,
            alertId: alert.id,
            level: 'warning',
            title: 'Amortecer sensibilidade de tendência de atenção',
            rationale: 'Eleva o multiplicador de tendência e amplia a janela sem update para reduzir falsos positivos.',
            thresholds: nextThresholds,
          })
        }
      }

      if (alert.id === 'manual-override-rate') {
        const nextThresholds = normalizeAlertThresholds({
          ...base,
          coverageWarningMin: Number(Math.max(0.35, base.coverageWarningMin - 0.05).toFixed(2)),
        })
        const shouldChangePolicy = recommendationPolicy.rolloutMode !== 'manual'
        if (!areThresholdsEqual(base, nextThresholds) || shouldChangePolicy) {
          plans.push({
            id: `plan-${alert.id}`,
            alertId: alert.id,
            level: 'warning',
            title: 'Entrar em rollout manual temporário',
            rationale: 'Quando override manual está alto, forçar revisão manual evita autoajustes desalinhados.',
            thresholds: nextThresholds,
            policyPatch: shouldChangePolicy ? { rolloutMode: 'manual' } : undefined,
          })
        }
      }
    }

    return plans
  }, [alertThresholds, calibrationDriftAlerts, overview, recommendationPolicy.rolloutMode])

  const longitudinalCalibrationInsights = useMemo(() => {
    const groups = new Map<string, {
      recommendationWindowDays: number
      rolloutMode: RecommendationRolloutMode
      scaleProfile: ScaleProfile
      count: number
      manualActions: number
      assistedActions: number
      deltaCriticalSum: number
      deltaWarningSum: number
      deltaInfoSum: number
    }>()

    recommendationHistory.forEach(entry => {
      const key = `${entry.recommendationWindowDays}:${entry.rolloutMode}:${entry.scaleProfile}`
      const currentCritical = entry.impactCurrent?.critical ?? 0
      const projectedCritical = entry.impactProjected?.critical ?? currentCritical
      const currentWarning = entry.impactCurrent?.warning ?? 0
      const projectedWarning = entry.impactProjected?.warning ?? currentWarning
      const currentInfo = entry.impactCurrent?.info ?? 0
      const projectedInfo = entry.impactProjected?.info ?? currentInfo

      const existing = groups.get(key) || {
        recommendationWindowDays: entry.recommendationWindowDays,
        rolloutMode: entry.rolloutMode,
        scaleProfile: entry.scaleProfile,
        count: 0,
        manualActions: 0,
        assistedActions: 0,
        deltaCriticalSum: 0,
        deltaWarningSum: 0,
        deltaInfoSum: 0,
      }

      existing.count += 1
      if (entry.rolloutMode === 'manual') existing.manualActions += 1
      if (entry.rolloutMode === 'assisted') existing.assistedActions += 1
      existing.deltaCriticalSum += (projectedCritical - currentCritical)
      existing.deltaWarningSum += (projectedWarning - currentWarning)
      existing.deltaInfoSum += (projectedInfo - currentInfo)
      groups.set(key, existing)
    })

    return Array.from(groups.values())
      .map(group => {
        const avgDeltaCritical = group.count > 0 ? group.deltaCriticalSum / group.count : 0
        const avgDeltaWarning = group.count > 0 ? group.deltaWarningSum / group.count : 0
        const avgDeltaInfo = group.count > 0 ? group.deltaInfoSum / group.count : 0
        const manualRate = group.count > 0 ? group.manualActions / group.count : 0
        return {
          ...group,
          avgDeltaCritical,
          avgDeltaWarning,
          avgDeltaInfo,
          manualRate,
          healthLabel: manualRate >= 0.6
            ? 'atenção'
            : manualRate <= 0.25
              ? 'saudável'
              : 'neutro',
        }
      })
      .map(group => ({
        ...group,
        effectivenessScore: computeEffectivenessScore(group),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [recommendationHistory])

  const bestPolicyRecommendation = useMemo(() => {
    if (longitudinalCalibrationInsights.length < 2) return null
    const eligible = longitudinalCalibrationInsights.filter(i => i.count >= 3)
    if (eligible.length === 0) return null
    const best = eligible.reduce((prev, curr) =>
      curr.effectivenessScore > prev.effectivenessScore ? curr : prev
    )
    if (best.effectivenessScore < 40) return null
    const isCurrent = best.recommendationWindowDays === recommendationPolicy.recommendationWindowDays
      && best.rolloutMode === recommendationPolicy.rolloutMode
    return {
      ...best,
      isCurrent,
      label: `${best.recommendationWindowDays}d / ${best.rolloutMode === 'assisted' ? 'Assistido' : 'Manual'} / ${best.scaleProfile}`,
    }
  }, [longitudinalCalibrationInsights, recommendationPolicy])

  const appendRecommendationHistory = (entry: RecommendationHistoryEntry): RecommendationHistoryEntry[] => {
    return [entry, ...recommendationHistory].slice(0, MAX_RECOMMENDATION_HISTORY_ENTRIES)
  }

  const persistAlertConfiguration = async (
    thresholds: AlertThresholds,
    profile: AlertProfile,
    policy: RecommendationPolicy,
    successMessage: string,
    historyEntries?: RecommendationHistoryEntry[],
  ) => {
    const uid = getCurrentUserId()
    if (!uid) {
      toast.error('Usuário não autenticado para salvar configurações')
      return false
    }

    setSavingThresholds(true)
    try {
      await saveUserSettings(uid, {
        platform_admin_alert_thresholds: {
          memory_discard_total_7d_critical: thresholds.discardTotalCritical7d,
          memory_discard_trend_multiplier_warning: thresholds.discardTrendMultiplierWarning,
          memory_coverage_warning_min: thresholds.coverageWarningMin,
          memory_no_updates_days_info: thresholds.noUpdatesInfoDays,
        },
        platform_admin_alert_profile: profile,
        platform_admin_alert_recommendation_policy: {
          recommendation_window_days: policy.recommendationWindowDays,
          rollout_mode: policy.rolloutMode,
        },
        platform_admin_alert_recommendation_history: historyEntries?.map(entry => ({
          id: entry.id,
          created_at: entry.createdAt,
          action: entry.action,
          rollout_mode: entry.rolloutMode,
          recommendation_window_days: entry.recommendationWindowDays,
          scale_profile: entry.scaleProfile,
          recommended_thresholds: entry.recommendedThresholds
            ? {
                memory_discard_total_7d_critical: entry.recommendedThresholds.discardTotalCritical7d,
                memory_discard_trend_multiplier_warning: entry.recommendedThresholds.discardTrendMultiplierWarning,
                memory_coverage_warning_min: entry.recommendedThresholds.coverageWarningMin,
                memory_no_updates_days_info: entry.recommendedThresholds.noUpdatesInfoDays,
              }
            : undefined,
          applied_thresholds: {
            memory_discard_total_7d_critical: entry.appliedThresholds.discardTotalCritical7d,
            memory_discard_trend_multiplier_warning: entry.appliedThresholds.discardTrendMultiplierWarning,
            memory_coverage_warning_min: entry.appliedThresholds.coverageWarningMin,
            memory_no_updates_days_info: entry.appliedThresholds.noUpdatesInfoDays,
          },
          impact_current: entry.impactCurrent,
          impact_projected: entry.impactProjected,
        })),
      })
      if (historyEntries) {
        setRecommendationHistory(historyEntries)
      }
      toast.success(successMessage)
      return true
    } catch (error) {
      console.error(error)
      toast.error('Erro ao salvar configuração de alertas')
      return false
    } finally {
      setSavingThresholds(false)
    }
  }

  const saveAlertThresholds = async () => {
    const normalizedThresholds = normalizeAlertThresholds(alertThresholds)
    const historyEntry = telemetryRecommendation
      ? buildRecommendationHistoryEntry({
          action: 'thresholds_saved',
          rolloutMode: recommendationPolicy.rolloutMode,
          recommendationWindowDays: recommendationPolicy.recommendationWindowDays,
          scaleProfile,
          recommendedThresholds: telemetryRecommendation.thresholds,
          appliedThresholds: normalizedThresholds,
          impactCurrent: projectedAlertImpact?.current,
          impactProjected: projectedAlertImpact?.projected,
        })
      : null

    await persistAlertConfiguration(
      normalizedThresholds,
      detectProfileFromThresholds(normalizedThresholds),
      recommendationPolicy,
      'Thresholds e política de recomendação salvos',
      historyEntry ? appendRecommendationHistory(historyEntry) : undefined,
    )
  }

  const resetAlertThresholds = () => {
    setAlertThresholds(DEFAULT_ALERT_THRESHOLDS)
    setAlertProfile('balanced')
  }

  const applyThresholdPreset = (profile: Exclude<AlertProfile, 'custom'>) => {
    setAlertThresholds(ALERT_THRESHOLD_PRESETS[profile])
    setAlertProfile(profile)
  }

  const updateThresholds = (updater: (current: AlertThresholds) => AlertThresholds) => {
    setAlertThresholds(current => {
      const next = normalizeAlertThresholds(updater(current))
      setAlertProfile(detectProfileFromThresholds(next))
      return next
    })
  }

  const applyTelemetryRecommendation = async () => {
    if (!telemetryRecommendation) return

    const nextThresholds = normalizeAlertThresholds(telemetryRecommendation.thresholds)
    const nextProfile = detectProfileFromThresholds(nextThresholds)

    setAlertThresholds(nextThresholds)
    setScaleProfile(telemetryRecommendation.scaleProfile)
    setAlertProfile(nextProfile)

    if (recommendationPolicy.rolloutMode === 'assisted') {
      const historyEntry = buildRecommendationHistoryEntry({
        action: 'recommendation_applied',
        rolloutMode: recommendationPolicy.rolloutMode,
        recommendationWindowDays: recommendationPolicy.recommendationWindowDays,
        scaleProfile: telemetryRecommendation.scaleProfile,
        recommendedThresholds: telemetryRecommendation.thresholds,
        appliedThresholds: nextThresholds,
        impactCurrent: projectedAlertImpact?.current,
        impactProjected: projectedAlertImpact?.projected,
      })

      await persistAlertConfiguration(
        nextThresholds,
        nextProfile,
        recommendationPolicy,
        'Recomendação aplicada e salva em modo assistido',
        appendRecommendationHistory(historyEntry),
      )
      return
    }

    toast.success('Recomendação aplicada. Revise e salve para persistir.')
  }

  const applyDriftActionPlan = async (plan: DriftActionPlan) => {
    if (!overview || !currentAlertImpact) return
    if (savingThresholds || applyingDriftActionId) return

    const nextThresholds = normalizeAlertThresholds(plan.thresholds)
    const nextPolicy = {
      ...recommendationPolicy,
      ...(plan.policyPatch || {}),
    }

    if (areThresholdsEqual(nextThresholds, alertThresholds) && !plan.policyPatch) {
      toast.info('Ajuste sugerido já está aplicado.')
      return
    }

    setApplyingDriftActionId(plan.id)
    try {
      const projected = summarizeAlertImpact(buildMemoryAlerts(overview, daily, nextThresholds))
      const nextProfile = detectProfileFromThresholds(nextThresholds)

      setAlertThresholds(nextThresholds)
      setAlertProfile(nextProfile)
      if (plan.policyPatch) {
        setRecommendationPolicy(nextPolicy)
      }

      const historyEntry = buildRecommendationHistoryEntry({
        action: 'recommendation_applied',
        rolloutMode: nextPolicy.rolloutMode,
        recommendationWindowDays: nextPolicy.recommendationWindowDays,
        scaleProfile,
        recommendedThresholds: nextThresholds,
        appliedThresholds: nextThresholds,
        impactCurrent: currentAlertImpact,
        impactProjected: projected,
      })

      await persistAlertConfiguration(
        nextThresholds,
        nextProfile,
        nextPolicy,
        'Ajuste de drift aplicado e persistido com sucesso',
        appendRecommendationHistory(historyEntry),
      )
    } finally {
      setApplyingDriftActionId(null)
    }
  }

  const runSearchMemoryBackfill = async (dryRun: boolean) => {
    setBackfillLoading(true)
    try {
      const report = await backfillNotebookSearchMemoryAcrossPlatform({
        dryRun,
        maxNotebooks: 1200,
        chunkSize: 200,
      })
      setBackfillReport(report)
      toast.success(dryRun ? 'Diagnóstico de backfill concluído' : 'Backfill de memória dedicada concluído')

      if (!dryRun) {
        const [overviewData, dailyData, stateDailyData, stateComparisonData, functionComparisonData] = await Promise.all([
          getPlatformOverview(true),
          getPlatformDailyUsage(30, true),
          getPlatformExecutionStateDaily(14, true),
          getPlatformExecutionStateWindowComparison(7, true),
          getPlatformFunctionWindowComparison(7, true),
        ])
        setOverview(overviewData)
        setDaily(dailyData)
        setExecutionStateDaily(stateDailyData)
        setExecutionStateComparison(stateComparisonData)
        setExecutionFunctionComparison(functionComparisonData)
        setScaleProfile(detectScaleProfile(overviewData.total_notebooks))
      }
    } catch (error) {
      console.error(error)
      toast.error('Erro ao executar rotina de backfill da memória dedicada')
    } finally {
      setBackfillLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="v2-panel p-6">
          <Skeleton className="h-10 w-80" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="v2-summary-card bg-[rgba(255,255,255,0.82)]">
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ))}
        </div>
        <div className="v2-panel p-6">
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <div className="v2-panel p-6">
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!overview) {
    return (
      <V2EmptyState
        icon={Shield}
        title="Nenhum dado agregado disponivel"
        description="Assim que a plataforma acumular uso operacional, este painel passa a consolidar usuarios, pipelines, memoria dedicada e custos globais em tempo real."
      />
    )
  }

  return (
    <div className="space-y-6">
      <V2PageHero
        eyebrow={<><Shield className="h-3.5 w-3.5" /> Governanca da plataforma</>}
        title="Uso agregado, calibracao de memoria e sinais de risco sob uma unica cabine executiva"
        description="Monitore volume operacional, alertas de memoria dedicada, trilha de calibracao e indicadores de crescimento sem perder contexto sobre custos e qualidade da plataforma."
        aside={(
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Resumo rapido</p>
            <div className="rounded-[1.4rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Cobertura de memoria</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">
                {fmtInt(overview.notebooks_with_dedicated_search_memory)} / {fmtInt(overview.total_notebooks)}
              </p>
            </div>
            <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.82)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Alertas atuais</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{memoryAlerts.length.toLocaleString('pt-BR')}</p>
            </div>
          </div>
        )}
      />

      {overview.operational_warnings && overview.operational_warnings.length > 0 && (
        <div className="rounded-[1.35rem] border border-amber-200 bg-[rgba(217,119,6,0.08)] px-4 py-3 text-sm text-amber-900">
          {overview.operational_warnings[0]}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Usuários" value={fmtInt(overview.total_users)} tone="text-sky-600" />
        <StatCard icon={Activity} label="Usuários ativos (30d)" value={fmtInt(overview.active_users_30d)} tone="text-emerald-600" />
        <StatCard icon={Sparkles} label="Novos usuários (30d)" value={fmtInt(overview.new_users_30d)} tone="text-fuchsia-600" />
        <StatCard icon={DollarSign} label="Custo total" value={fmtUsd(overview.total_cost_usd)} tone="text-amber-600" />
        <StatCard icon={Brain} label="Chamadas LLM" value={fmtInt(overview.total_calls)} tone="text-violet-600" />
        <StatCard icon={BarChart3} label="Tokens totais" value={fmtInt(overview.total_tokens)} tone="text-indigo-600" />
        <StatCard icon={FileText} label="Documentos" value={fmtInt(overview.total_documents)} tone="text-teal-600" />
        <StatCard icon={Database} label="Qualidade média" value={overview.average_quality_score != null ? `${overview.average_quality_score}/100` : 'N/D'} tone="text-rose-600" />
        <StatCard
          icon={Database}
          label="Memória dedicada"
          value={`${fmtInt(overview.notebooks_with_dedicated_search_memory)} / ${fmtInt(overview.total_notebooks)}`}
          tone="text-cyan-600"
        />
        <StatCard
          icon={Activity}
          label="Descartes retenção"
          value={fmtInt(overview.total_search_memory_audits_dropped + overview.total_search_memory_saved_searches_dropped)}
          tone="text-orange-600"
        />
      </div>

      <div className="v2-panel p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Demonstração dos agentes trabalhando (telemetria real)</h2>
            <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">
              Amostra operacional das últimas execuções multiagentes com estado, duração, retries e fallback para auditoria rápida da trilha real.
            </p>
          </div>
          <span className="rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] px-2.5 py-1 text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">
            Amostra: {fmtInt(recentExecutions.length)} execuções
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Em andamento</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(recentExecutionMetrics.inFlight)}</p>
          </div>
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Retry detectado</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(recentExecutionMetrics.retries)}</p>
          </div>
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Fallbacks</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(recentExecutionMetrics.fallbacks)}</p>
          </div>
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Waiting I/O</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(recentExecutionMetrics.waitingIo)}</p>
          </div>
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Duração média</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{formatDurationMs(recentExecutionMetrics.avgDurationMs)}</p>
          </div>
        </div>

        {recentExecutions.length === 0 ? (
          <p className="text-xs text-[var(--v2-ink-soft)]">Nenhuma execução recente disponível para demonstração ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-xs">
              <thead className="bg-[rgba(255,255,255,0.74)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                <tr>
                  <th className="px-2 py-2 text-left">Quando</th>
                  <th className="px-2 py-2 text-left">Função</th>
                  <th className="px-2 py-2 text-left">Agente / fase</th>
                  <th className="px-2 py-2 text-left">Estado</th>
                  <th className="px-2 py-2 text-right">Duração</th>
                  <th className="px-2 py-2 text-right">Retry</th>
                  <th className="px-2 py-2 text-left">Fallback</th>
                  <th className="px-2 py-2 text-left">Modelo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--v2-line-soft)]">
                {recentExecutions.map((execution, index) => (
                  <tr key={`${execution.source_id}-${execution.phase}-${index}`} className="hover:bg-[rgba(255,255,255,0.66)]">
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">{formatExecutionTimestamp(execution.created_at)}</td>
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">{execution.function_label}</td>
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">
                      <p className="font-medium">{execution.agent_name || 'Não identificado'}</p>
                      <p className="text-[11px] text-[var(--v2-ink-faint)]">{execution.phase_label}</p>
                    </td>
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getExecutionStateTone(execution.execution_state)}`}>
                        {getExecutionStateLabel(execution.execution_state)}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{formatDurationMs(execution.duration_ms)}</td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{fmtInt(execution.retry_count ?? 0)}</td>
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">
                      {execution.used_fallback
                        ? `Sim${execution.fallback_from ? ` (${execution.fallback_from})` : ''}`
                        : 'Não'}
                    </td>
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">{execution.model_label || 'N/D'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="v2-panel p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Impacto de custo e latência por estado de execução</h2>
          <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">
            Base para tuning operacional por pipeline, com foco direto nos gargalos de `waiting_io` e `retrying`.
          </p>
        </div>

        {executionStateLatencyRows.length === 0 ? (
          <p className="text-xs text-[var(--v2-ink-soft)]">Ainda não há agregação por estado de execução para este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-xs">
              <thead className="bg-[rgba(255,255,255,0.74)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                <tr>
                  <th className="px-2 py-2 text-left">Estado</th>
                  <th className="px-2 py-2 text-right">Chamadas</th>
                  <th className="px-2 py-2 text-right">Latência média</th>
                  <th className="px-2 py-2 text-right">USD</th>
                  <th className="px-2 py-2 text-right">Share chamadas</th>
                  <th className="px-2 py-2 text-right">Share custo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--v2-line-soft)]">
                {executionStateLatencyRows.map(row => (
                  <tr key={row.key} className="hover:bg-[rgba(255,255,255,0.66)]">
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">{row.label}</td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{fmtInt(row.calls)}</td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{formatDurationMs(row.avg_duration_ms)}</td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{fmtUsd(row.cost_usd)}</td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{fmtPercent(row.callShare)}</td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{fmtPercent(row.costShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {executionStateFunctionHotspots.length > 0 && (
          <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">Top hotspots função + estado</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="bg-[rgba(255,255,255,0.74)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Função</th>
                    <th className="px-2 py-1.5 text-left">Estado</th>
                    <th className="px-2 py-1.5 text-right">Latência média</th>
                    <th className="px-2 py-1.5 text-right">Chamadas</th>
                    <th className="px-2 py-1.5 text-right">USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--v2-line-soft)]">
                  {executionStateFunctionHotspots.map(item => (
                    <tr key={item.id} className="hover:bg-[rgba(255,255,255,0.66)]">
                      <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{item.functionLabel}</td>
                      <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{item.stateLabel}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{formatDurationMs(item.avgDurationMs)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(item.calls)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtUsd(item.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {executionFunctionReliabilityRows.length > 0 && (
          <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">Confiabilidade recente por função (amostra operacional)</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[840px] text-xs">
                <thead className="bg-[rgba(255,255,255,0.74)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Função</th>
                    <th className="px-2 py-1.5 text-right">Chamadas</th>
                    <th className="px-2 py-1.5 text-right">Retry</th>
                    <th className="px-2 py-1.5 text-right">Fallback</th>
                    <th className="px-2 py-1.5 text-right">Waiting I/O</th>
                    <th className="px-2 py-1.5 text-right">Latência média</th>
                    <th className="px-2 py-1.5 text-right">USD sob risco*</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--v2-line-soft)]">
                  {executionFunctionReliabilityRows.map(item => (
                    <tr key={item.id} className="hover:bg-[rgba(255,255,255,0.66)]">
                      <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{item.functionLabel}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(item.calls)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(item.retryRate)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(item.fallbackRate)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(item.waitingIoRate)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{formatDurationMs(item.avgDurationMs)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtUsd(item.estimatedWasteUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-[var(--v2-ink-faint)]">*Estimativa heurística de custo potencialmente impactado por retries/fallbacks na amostra recente.</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">Plano automático de tuning por execution_state</p>
          {executionTuningRecommendations.map(recommendation => (
            <div key={recommendation.id} className={`rounded-lg border px-3 py-2 ${getRecommendationTone(recommendation.level)}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">
                {recommendation.level === 'critical' ? 'Prioridade alta' : recommendation.level === 'warning' ? 'Atenção' : 'Informativo'}
              </p>
              <p className="mt-0.5 text-sm font-medium text-[var(--v2-ink-strong)]">{recommendation.title}</p>
              <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">{recommendation.description}</p>
              <p className="mt-1 text-xs text-[var(--v2-ink-strong)]">Ação recomendada: {recommendation.suggestedAction}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-3 space-y-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">Comparativo diário por execution_state</p>
              <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">Janela atual de 7 dias versus janela imediatamente anterior para volume, custo e latência por estado.</p>
            </div>
            <span className="rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">
              Atualizado em tempo real
            </span>
          </div>

          {executionStateComparison.length === 0 ? (
            <p className="text-xs text-[var(--v2-ink-soft)]">Ainda não há base histórica suficiente para comparação entre janelas.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className={EXECUTIVE_INSET_CARD}>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Chamadas (7d atual)</p>
                  <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(executionWindowTotals.currentCalls)}</p>
                  <p className={`text-[11px] font-medium ${getDeltaTone(executionWindowTotals.callsDeltaPct)}`}>{formatDeltaPercent(executionWindowTotals.callsDeltaPct)}</p>
                </div>
                <div className={EXECUTIVE_INSET_CARD}>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Chamadas (7d anterior)</p>
                  <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(executionWindowTotals.previousCalls)}</p>
                  <p className="text-[11px] text-[var(--v2-ink-faint)]">Base de comparação</p>
                </div>
                <div className={EXECUTIVE_INSET_CARD}>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Custo (7d atual)</p>
                  <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtUsd(executionWindowTotals.currentCost)}</p>
                  <p className={`text-[11px] font-medium ${getDeltaTone(executionWindowTotals.costDeltaPct)}`}>{formatDeltaPercent(executionWindowTotals.costDeltaPct)}</p>
                </div>
                <div className={EXECUTIVE_INSET_CARD}>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Custo (7d anterior)</p>
                  <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtUsd(executionWindowTotals.previousCost)}</p>
                  <p className="text-[11px] text-[var(--v2-ink-faint)]">Base de comparação</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-xs">
                  <thead className="bg-[rgba(255,255,255,0.74)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Estado</th>
                      <th className="px-2 py-1.5 text-right">Chamadas atual</th>
                      <th className="px-2 py-1.5 text-right">Chamadas anterior</th>
                      <th className="px-2 py-1.5 text-right">Delta chamadas</th>
                      <th className="px-2 py-1.5 text-right">Delta latência</th>
                      <th className="px-2 py-1.5 text-right">Retry atual</th>
                      <th className="px-2 py-1.5 text-right">Fallback atual</th>
                      <th className="px-2 py-1.5 text-right">Delta custo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--v2-line-soft)]">
                    {executionStateComparison.map(row => (
                      <tr key={row.key} className="hover:bg-[rgba(255,255,255,0.66)]">
                        <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{row.label}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(row.current_calls)}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(row.previous_calls)}</td>
                        <td className={`px-2 py-1.5 text-right font-medium ${getDeltaTone(row.calls_delta_pct)}`}>{formatDeltaPercent(row.calls_delta_pct)}</td>
                        <td className={`px-2 py-1.5 text-right font-medium ${getDeltaTone(row.duration_delta_pct)}`}>{formatDeltaPercent(row.duration_delta_pct)}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(row.current_retry_rate)}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(row.current_fallback_rate)}</td>
                        <td className={`px-2 py-1.5 text-right font-medium ${getDeltaTone(row.cost_delta_pct)}`}>{formatDeltaPercent(row.cost_delta_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {executionStateDailyRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="bg-[rgba(255,255,255,0.74)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Dia</th>
                    <th className="px-2 py-1.5 text-right">Chamadas</th>
                    <th className="px-2 py-1.5 text-right">Waiting I/O</th>
                    <th className="px-2 py-1.5 text-right">Retrying</th>
                    <th className="px-2 py-1.5 text-right">In flight</th>
                    <th className="px-2 py-1.5 text-right">Retry médio</th>
                    <th className="px-2 py-1.5 text-right">Fallback médio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--v2-line-soft)]">
                  {executionStateDailyRows.slice(-7).reverse().map(point => (
                    <tr key={point.dia} className="hover:bg-[rgba(255,255,255,0.66)]">
                      <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{new Date(`${point.dia}T00:00:00Z`).toLocaleDateString('pt-BR')}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(point.totalCalls)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(point.waitingIoCalls)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(point.retryingCalls)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(point.inFlightCalls)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(point.retryRate)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(point.fallbackRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">Recomendações orientadas por janela diária</p>
            {executionStateWindowRecommendations.map(recommendation => (
              <div key={recommendation.id} className={`rounded-lg border px-3 py-2 ${getRecommendationTone(recommendation.level)}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">
                  {recommendation.level === 'critical' ? 'Prioridade alta' : recommendation.level === 'warning' ? 'Atenção' : 'Informativo'}
                </p>
                <p className="mt-0.5 text-sm font-medium text-[var(--v2-ink-strong)]">{recommendation.title}</p>
                <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">{recommendation.description}</p>
                <p className="mt-1 text-xs text-[var(--v2-ink-strong)]">Ação recomendada: {recommendation.suggestedAction}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-3 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">Comparativo diário por função</p>
                <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">Leitura de risco por função na janela atual versus anterior para orientar tuning fino sem regressão.</p>
              </div>
              <span className="rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">
                Janela 7d
              </span>
            </div>

            {executionFunctionWindowRows.length === 0 ? (
              <p className="text-xs text-[var(--v2-ink-soft)]">Sem dados suficientes para comparativo por função nesta janela.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className={EXECUTIVE_INSET_CARD}>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Chamadas (funções atual)</p>
                    <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(executionFunctionWindowTotals.currentCalls)}</p>
                    <p className={`text-[11px] font-medium ${getDeltaTone(executionFunctionWindowTotals.callsDeltaPct)}`}>{formatDeltaPercent(executionFunctionWindowTotals.callsDeltaPct)}</p>
                  </div>
                  <div className={EXECUTIVE_INSET_CARD}>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Chamadas (funções anterior)</p>
                    <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(executionFunctionWindowTotals.previousCalls)}</p>
                    <p className="text-[11px] text-[var(--v2-ink-faint)]">Base comparativa</p>
                  </div>
                  <div className={EXECUTIVE_INSET_CARD}>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Custo (funções atual)</p>
                    <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtUsd(executionFunctionWindowTotals.currentCost)}</p>
                    <p className={`text-[11px] font-medium ${getDeltaTone(executionFunctionWindowTotals.costDeltaPct)}`}>{formatDeltaPercent(executionFunctionWindowTotals.costDeltaPct)}</p>
                  </div>
                  <div className={EXECUTIVE_INSET_CARD}>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Custo (funções anterior)</p>
                    <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtUsd(executionFunctionWindowTotals.previousCost)}</p>
                    <p className="text-[11px] text-[var(--v2-ink-faint)]">Base comparativa</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1060px] text-xs">
                    <thead className="bg-[rgba(255,255,255,0.74)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Função</th>
                        <th className="px-2 py-1.5 text-right">Chamadas atual</th>
                        <th className="px-2 py-1.5 text-right">Chamadas anterior</th>
                        <th className="px-2 py-1.5 text-right">Delta chamadas</th>
                        <th className="px-2 py-1.5 text-right">Retry atual</th>
                        <th className="px-2 py-1.5 text-right">Fallback atual</th>
                        <th className="px-2 py-1.5 text-right">Waiting I/O atual</th>
                        <th className="px-2 py-1.5 text-right">Delta latência</th>
                        <th className="px-2 py-1.5 text-right">Delta custo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--v2-line-soft)]">
                      {executionFunctionWindowRows.map(row => (
                        <tr key={row.key} className="hover:bg-[rgba(255,255,255,0.66)]">
                          <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{row.label}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(row.current_calls)}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtInt(row.previous_calls)}</td>
                          <td className={`px-2 py-1.5 text-right font-medium ${getDeltaTone(row.calls_delta_pct)}`}>{formatDeltaPercent(row.calls_delta_pct)}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(row.current_retry_rate)}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(row.current_fallback_rate)}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(row.current_waiting_io_rate)}</td>
                          <td className={`px-2 py-1.5 text-right font-medium ${getDeltaTone(row.duration_delta_pct)}`}>{formatDeltaPercent(row.duration_delta_pct)}</td>
                          <td className={`px-2 py-1.5 text-right font-medium ${getDeltaTone(row.cost_delta_pct)}`}>{formatDeltaPercent(row.cost_delta_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">Recomendações orientadas por função</p>
              {executionFunctionWindowRecommendations.map(recommendation => (
                <div key={recommendation.id} className={`rounded-lg border px-3 py-2 ${getRecommendationTone(recommendation.level)}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">
                    {recommendation.level === 'critical' ? 'Prioridade alta' : recommendation.level === 'warning' ? 'Atenção' : 'Informativo'}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-[var(--v2-ink-strong)]">{recommendation.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">{recommendation.description}</p>
                  <p className="mt-1 text-xs text-[var(--v2-ink-strong)]">Ação recomendada: {recommendation.suggestedAction}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {memoryAlerts.length > 0 && (
        <div className="v2-panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Alertas operacionais da memória dedicada</h2>
          </div>
          <div className="space-y-2">
            {memoryAlerts.map(alert => (
              <div
                key={alert.id}
                className={`rounded-lg border px-3 py-2 ${
                  alert.level === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : alert.level === 'warning'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-sky-50 border-sky-200'
                }`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    alert.level === 'critical'
                      ? 'text-red-700'
                      : alert.level === 'warning'
                        ? 'text-amber-700'
                        : 'text-sky-700'
                  }`}
                >
                  {alert.level === 'critical' ? 'Crítico' : alert.level === 'warning' ? 'Atenção' : 'Informativo'}
                </p>
                <p className="mt-0.5 text-sm font-medium text-[var(--v2-ink-strong)]">{alert.title}</p>
                <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">{alert.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="v2-panel p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Configuração de Thresholds dos Alertas</h2>
            <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">Calibra sensibilidade dos alertas da memória dedicada conforme comportamento real da plataforma.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAlertThresholds}
              disabled={savingThresholds}
              className={EXECUTIVE_PANEL_BUTTON}
            >
              Restaurar defaults
            </button>
            <button
              onClick={() => { void saveAlertThresholds() }}
              disabled={savingThresholds}
              className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Salvar configuração
            </button>
            <button
              onClick={() => { void applyTelemetryRecommendation() }}
              disabled={!telemetryRecommendation || savingThresholds}
              className="px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-xs font-medium hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Aplicar recomendado
            </button>
          </div>
        </div>
        {telemetryRecommendation && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-sky-700 font-semibold">Recomendação assistida</p>
            <p className="text-xs text-sky-800 mt-1">
              Porte detectado: <span className="font-semibold">{telemetryRecommendation.scaleProfile}</span>. Sugestão baseada em cobertura e descarte recente na janela de <span className="font-semibold">{recommendationPolicy.recommendationWindowDays} dias</span>.
            </p>
          </div>
        )}
        {projectedAlertImpact && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-violet-700 font-semibold">Impacto estimado dos alertas</p>
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-violet-900">
              <p>
                Críticos: <span className="font-semibold">{projectedAlertImpact.current.critical}</span> → <span className="font-semibold">{projectedAlertImpact.projected.critical}</span>
              </p>
              <p>
                Atenção: <span className="font-semibold">{projectedAlertImpact.current.warning}</span> → <span className="font-semibold">{projectedAlertImpact.projected.warning}</span>
              </p>
              <p>
                Informativos: <span className="font-semibold">{projectedAlertImpact.current.info}</span> → <span className="font-semibold">{projectedAlertImpact.projected.info}</span>
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Janela da recomendação</p>
            <select
              value={recommendationPolicy.recommendationWindowDays}
              onChange={e => {
                const next = Number(e.target.value)
                setRecommendationPolicy(prev => ({ ...prev, recommendationWindowDays: [14, 30, 60, 90].includes(next) ? next : 30 }))
              }}
              className={EXECUTIVE_INPUT_COMPACT}
            >
              <option value={14}>14 dias</option>
              <option value={30}>30 dias</option>
              <option value={60}>60 dias</option>
              <option value={90}>90 dias</option>
            </select>
          </label>
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Modo de rollout</p>
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => setRecommendationPolicy(prev => ({ ...prev, rolloutMode: 'manual' }))}
                className={`px-2.5 py-1 rounded-full border text-[10px] font-medium transition-colors ${
                  recommendationPolicy.rolloutMode === 'manual'
                    ? 'bg-slate-100 border-slate-300 text-slate-800'
                    : 'bg-[var(--v2-panel-strong)] border-[var(--v2-line-soft)] text-[var(--v2-ink-soft)] hover:bg-[rgba(255,255,255,0.9)]'
                }`}
              >
                Manual
              </button>
              <button
                onClick={() => setRecommendationPolicy(prev => ({ ...prev, rolloutMode: 'assisted' }))}
                className={`px-2.5 py-1 rounded-full border text-[10px] font-medium transition-colors ${
                  recommendationPolicy.rolloutMode === 'assisted'
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                    : 'bg-[var(--v2-panel-strong)] border-[var(--v2-line-soft)] text-[var(--v2-ink-soft)] hover:bg-[rgba(255,255,255,0.9)]'
                }`}
              >
                Assistido
              </button>
            </div>
            <p className="mt-1 text-[10px] text-[var(--v2-ink-faint)]">
              {recommendationPolicy.rolloutMode === 'assisted'
                ? 'Assistido: aplicar recomendado também salva automaticamente.'
                : 'Manual: aplicar recomendado apenas prepara os valores para revisão.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'conservative', label: 'Conservador' },
            { key: 'balanced', label: 'Equilibrado' },
            { key: 'aggressive', label: 'Agressivo' },
          ].map(option => (
            <button
              key={option.key}
              onClick={() => applyThresholdPreset(option.key as Exclude<AlertProfile, 'custom'>)}
              className={`px-2.5 py-1 rounded-full border text-[10px] font-medium transition-colors ${
                alertProfile === option.key
                  ? 'bg-teal-100 border-teal-300 text-teal-800'
                  : 'bg-[var(--v2-panel-strong)] border-[var(--v2-line-soft)] text-[var(--v2-ink-soft)] hover:bg-[rgba(255,255,255,0.9)]'
              }`}
            >
              {option.label}
            </button>
          ))}
          <span className="text-[10px] text-[var(--v2-ink-faint)]">Perfil atual: {alertProfile === 'custom' ? 'Customizado' : alertProfile}</span>
          <span className="text-[10px] text-[var(--v2-ink-faint)]">Porte: {scaleProfile}</span>
          <span className="text-[10px] text-[var(--v2-ink-faint)]">Rollout: {recommendationPolicy.rolloutMode === 'assisted' ? 'Assistido' : 'Manual'}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          <label className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Crítico: descartes/janela</p>
            <input
              type="number"
              min={1}
              value={alertThresholds.discardTotalCritical7d}
              onChange={e => updateThresholds(prev => ({ ...prev, discardTotalCritical7d: Math.max(1, Number(e.target.value) || 1) }))}
              className={EXECUTIVE_INPUT_COMPACT}
            />
          </label>
          <label className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Atenção: multiplicador tendência</p>
            <input
              type="number"
              min={1}
              step={0.1}
              value={alertThresholds.discardTrendMultiplierWarning}
              onChange={e => updateThresholds(prev => ({ ...prev, discardTrendMultiplierWarning: Math.max(1, Number(e.target.value) || 1) }))}
              className={EXECUTIVE_INPUT_COMPACT}
            />
          </label>
          <label className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Atenção: cobertura mínima</p>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={alertThresholds.coverageWarningMin}
              onChange={e => updateThresholds(prev => ({ ...prev, coverageWarningMin: Math.min(1, Math.max(0, Number(e.target.value) || 0)) }))}
              className={EXECUTIVE_INPUT_COMPACT}
            />
          </label>
          <label className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Informativo: dias sem update</p>
            <input
              type="number"
              min={1}
              value={alertThresholds.noUpdatesInfoDays}
              onChange={e => updateThresholds(prev => ({ ...prev, noUpdatesInfoDays: Math.max(1, Number(e.target.value) || 1) }))}
              className={EXECUTIVE_INPUT_COMPACT}
            />
          </label>
        </div>
      </div>

      <div className="v2-panel p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Histórico de Calibração</h2>
            <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">Últimas decisões de recomendado vs aplicado para auditoria de rollout.</p>
          </div>
          <span className="text-[10px] text-[var(--v2-ink-faint)]">{fmtInt(recommendationHistory.length)} registros</span>
        </div>

        <div className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium w-fit ${rolloutGovernanceHealth.tone}`}>
          {rolloutGovernanceHealth.label}
        </div>

        <div className="space-y-2">
          {calibrationDriftAlerts.map(alert => (
            <div
              key={alert.id}
              className={`rounded-lg border px-3 py-2 text-xs ${
                alert.level === 'critical'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : alert.level === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-sky-50 border-sky-200 text-sky-800'
              }`}
            >
              <p>{alert.message}</p>
              {driftActionPlans.find(plan => plan.alertId === alert.id) && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] opacity-90">
                    {driftActionPlans.find(plan => plan.alertId === alert.id)?.rationale}
                  </p>
                  <button
                    onClick={() => {
                      const plan = driftActionPlans.find(item => item.alertId === alert.id)
                      if (plan) {
                        void applyDriftActionPlan(plan)
                      }
                    }}
                    disabled={savingThresholds || Boolean(applyingDriftActionId)}
                    className="rounded-md border border-current/25 bg-[rgba(255,255,255,0.82)] px-2 py-1 text-[10px] font-semibold hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {applyingDriftActionId === driftActionPlans.find(plan => plan.alertId === alert.id)?.id
                      ? 'Aplicando...'
                      : 'Aplicar ajuste'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v2-ink-faint)]">Validação longitudinal</p>
            <p className="text-[10px] text-[var(--v2-ink-faint)]">Janela × rollout × porte</p>
          </div>
          {longitudinalCalibrationInsights.length === 0 ? (
            <p className="text-xs text-[var(--v2-ink-soft)]">Sem histórico suficiente para comparação longitudinal.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[11px]">
                <thead className="bg-[rgba(255,255,255,0.74)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Janela</th>
                    <th className="px-2 py-1.5 text-left">Rollout</th>
                    <th className="px-2 py-1.5 text-left">Porte</th>
                    <th className="px-2 py-1.5 text-right">Amostras</th>
                    <th className="px-2 py-1.5 text-right">Delta crítico</th>
                    <th className="px-2 py-1.5 text-right">Delta atenção</th>
                    <th className="px-2 py-1.5 text-right">Override manual</th>
                    <th className="px-2 py-1.5 text-right">Efetividade</th>
                    <th className="px-2 py-1.5 text-left">Saúde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--v2-line-soft)]">
                  {longitudinalCalibrationInsights.map(item => (
                    <tr key={`${item.recommendationWindowDays}-${item.rolloutMode}-${item.scaleProfile}`} className="hover:bg-[rgba(255,255,255,0.66)]">
                      <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{item.recommendationWindowDays}d</td>
                      <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{item.rolloutMode === 'assisted' ? 'Assistido' : 'Manual'}</td>
                      <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{item.scaleProfile}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{item.count}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtSignedNumber(item.avgDeltaCritical)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtSignedNumber(item.avgDeltaWarning)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--v2-ink-strong)]">{fmtPercent(item.manualRate)}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${
                        item.effectivenessScore >= 70 ? 'text-emerald-700' : item.effectivenessScore >= 40 ? 'text-amber-700' : 'text-red-700'
                      }`}>{item.effectivenessScore}</td>
                      <td className="px-2 py-1.5 text-[var(--v2-ink-strong)]">{item.healthLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {bestPolicyRecommendation && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${
            bestPolicyRecommendation.isCurrent
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {bestPolicyRecommendation.isCurrent
                    ? 'Política atual é a mais efetiva'
                    : 'Política mais efetiva identificada'}
                </p>
                <p className="mt-0.5 text-[11px] opacity-90">
                  {bestPolicyRecommendation.label} — score {bestPolicyRecommendation.effectivenessScore}/100 com {bestPolicyRecommendation.count} amostras
                </p>
              </div>
              {!bestPolicyRecommendation.isCurrent && (
                <button
                  onClick={() => {
                    setRecommendationPolicy(prev => ({
                      ...prev,
                      recommendationWindowDays: bestPolicyRecommendation.recommendationWindowDays,
                      rolloutMode: bestPolicyRecommendation.rolloutMode,
                    }))
                    toast.success(`Política atualizada para ${bestPolicyRecommendation.label}`)
                  }}
                  className="shrink-0 rounded-md border border-current/25 bg-[rgba(255,255,255,0.82)] px-2 py-1 text-[10px] font-semibold hover:bg-white"
                >
                  Adotar política
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Ações manuais</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(calibrationHistoryMetrics.manualSaves)}</p>
          </div>
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Aplicações assistidas</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(calibrationHistoryMetrics.assistedApplies)}</p>
          </div>
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Delta médio crítico</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtSignedNumber(calibrationHistoryMetrics.avgDeltaCritical)}</p>
          </div>
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Delta médio atenção</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtSignedNumber(calibrationHistoryMetrics.avgDeltaWarning)}</p>
          </div>
          <div className={EXECUTIVE_INSET_CARD}>
            <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Delta médio info</p>
            <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtSignedNumber(calibrationHistoryMetrics.avgDeltaInfo)}</p>
          </div>
        </div>

        {recommendationHistory.length === 0 ? (
          <p className="text-xs text-[var(--v2-ink-soft)]">Nenhuma calibração registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-[rgba(255,255,255,0.74)] text-[var(--v2-ink-faint)] uppercase tracking-wide">
                <tr>
                  <th className="px-2 py-2 text-left">Quando</th>
                  <th className="px-2 py-2 text-left">Ação</th>
                  <th className="px-2 py-2 text-left">Rollout</th>
                  <th className="px-2 py-2 text-left">Janela</th>
                  <th className="px-2 py-2 text-left">Porte</th>
                  <th className="px-2 py-2 text-right">Crítico</th>
                  <th className="px-2 py-2 text-right">Atenção</th>
                  <th className="px-2 py-2 text-right">Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--v2-line-soft)]">
                {recommendationHistory.slice(0, 12).map(entry => (
                  <tr key={entry.id} className="hover:bg-[rgba(255,255,255,0.66)]">
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">{formatAuditTimestamp(entry.createdAt)}</td>
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">{entry.action === 'recommendation_applied' ? 'Aplicou recomendado' : 'Salvou configuração'}</td>
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">{entry.rolloutMode === 'assisted' ? 'Assistido' : 'Manual'}</td>
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">{entry.recommendationWindowDays}d</td>
                    <td className="px-2 py-2 text-[var(--v2-ink-strong)]">{entry.scaleProfile}</td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{fmtImpactDelta(entry.impactCurrent?.critical, entry.impactProjected?.critical)}</td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{fmtImpactDelta(entry.impactCurrent?.warning, entry.impactProjected?.warning)}</td>
                    <td className="px-2 py-2 text-right text-[var(--v2-ink-strong)]">{fmtImpactDelta(entry.impactCurrent?.info, entry.impactProjected?.info)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="v2-panel p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Backfill da Memória Dedicada</h2>
            <p className="mt-1 text-xs text-[var(--v2-ink-soft)]">
              Executa diagnóstico ou migração em lote de cadernos legados para `memory/search_memory`.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void runSearchMemoryBackfill(true) }}
              disabled={backfillLoading}
              className={EXECUTIVE_PANEL_BUTTON}
            >
              Diagnóstico
            </button>
            <button
              onClick={() => { void runSearchMemoryBackfill(false) }}
              disabled={backfillLoading}
              className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Executar backfill
            </button>
          </div>
        </div>

        {backfillReport && (
          <div className="grid grid-cols-2 lg:grid-cols-8 gap-2">
            <div className={EXECUTIVE_INSET_CARD}>
              <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Modo</p>
              <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{backfillReport.dry_run ? 'Dry-run' : 'Write'}</p>
            </div>
            <div className={EXECUTIVE_INSET_CARD}>
              <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Chunks</p>
              <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(backfillReport.chunks_processed)}</p>
            </div>
            <div className={EXECUTIVE_INSET_CARD}>
              <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Tam. chunk</p>
              <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(backfillReport.chunk_size)}</p>
            </div>
            <div className={EXECUTIVE_INSET_CARD}>
              <p className="text-[10px] uppercase tracking-wide text-[var(--v2-ink-faint)]">Escaneados</p>
              <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">{fmtInt(backfillReport.scanned)}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-700">Migrados</p>
              <p className="text-sm font-semibold text-emerald-800">{fmtInt(backfillReport.migrated)}</p>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-sky-700">Já dedicado</p>
              <p className="text-sm font-semibold text-sky-800">{fmtInt(backfillReport.already_dedicated)}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-amber-700">Sem legado</p>
              <p className="text-sm font-semibold text-amber-800">{fmtInt(backfillReport.empty_legacy)}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-red-700">Falhas</p>
              <p className="text-sm font-semibold text-red-800">{fmtInt(backfillReport.failed)}</p>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-violet-700">Limite</p>
              <p className="text-sm font-semibold text-violet-800">{backfillReport.reached_limit ? 'atingido' : 'não'}</p>
            </div>
          </div>
        )}
      </div>

      <div className="v2-panel p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50">
              <Settings2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--v2-ink-strong)]">Catálogo de Modelos do Usuário</h2>
              <p className="text-sm text-[var(--v2-ink-soft)]">
                Cada usuário mantém seu próprio catálogo persistido no Firestore. Para editar o seu catálogo e definir os modelos disponíveis nos seus seletores, use o atalho abaixo.
              </p>
            </div>
          </div>
          <Link
            to={buildWorkspaceSettingsPath({ preserveSearch: location.search, hash: 'section_model_catalog' })}
            className="v2-btn-primary"
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

      <div className="v2-panel p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[var(--v2-ink-strong)]">Atividade dos últimos 30 dias</h2>
          <p className="text-sm text-[var(--v2-ink-soft)]">Criação de conteúdo e uso da plataforma ao longo do tempo.</p>
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
        <div className="v2-panel p-5">
          <h2 className="mb-4 text-lg font-semibold text-[var(--v2-ink-strong)]">Uso por função</h2>
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

        <div className="v2-panel p-5">
          <h2 className="mb-4 text-lg font-semibold text-[var(--v2-ink-strong)]">Status dos documentos</h2>
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
        <div className="v2-panel p-5">
          <h2 className="mb-4 text-lg font-semibold text-[var(--v2-ink-strong)]">Origens dos documentos</h2>
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

        <div className="v2-panel p-5">
          <h2 className="mb-4 text-lg font-semibold text-[var(--v2-ink-strong)]">Artefatos do estúdio</h2>
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

function detectScaleProfile(totalNotebooks: number): ScaleProfile {
  if (totalNotebooks < 100) return 'small'
  if (totalNotebooks < 1000) return 'medium'
  return 'large'
}

function computeEffectivenessScore(group: {
  count: number
  manualActions: number
  assistedActions: number
  avgDeltaCritical: number
  avgDeltaWarning: number
  avgDeltaInfo: number
  manualRate: number
}): number {
  if (group.count === 0) return 0
  // Lower delta = better (less noise introduced by calibration)
  const criticalPenalty = Math.min(30, Math.abs(group.avgDeltaCritical) * 15)
  const warningPenalty = Math.min(20, Math.abs(group.avgDeltaWarning) * 8)
  // Low manual override rate = better adherence to recommendations
  const adherenceBonus = (1 - group.manualRate) * 25
  // More samples = more confidence
  const sampleBonus = Math.min(15, group.count * 2.5)
  // Assisted actions being high is a good signal
  const assistedRatio = group.count > 0 ? group.assistedActions / group.count : 0
  const assistedBonus = assistedRatio * 10
  const raw = 100 - criticalPenalty - warningPenalty + adherenceBonus + sampleBonus + assistedBonus
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeAlertThresholds(thresholds: AlertThresholds): AlertThresholds {
  return {
    discardTotalCritical7d: Math.max(1, Math.min(500, Math.floor(thresholds.discardTotalCritical7d))),
    discardTrendMultiplierWarning: Number(clamp(thresholds.discardTrendMultiplierWarning, 1, 6).toFixed(2)),
    coverageWarningMin: Number(clamp(thresholds.coverageWarningMin, 0, 1).toFixed(2)),
    noUpdatesInfoDays: Math.max(1, Math.min(30, Math.floor(thresholds.noUpdatesInfoDays))),
  }
}

function buildTelemetryRecommendedThresholds(
  overview: Awaited<ReturnType<typeof getPlatformOverview>>,
  daily: PlatformDailyUsagePoint[],
  windowDays: number,
): { scaleProfile: ScaleProfile; thresholds: AlertThresholds } {
  const scaleProfile = detectScaleProfile(overview.total_notebooks)

  const basePreset = scaleProfile === 'small'
    ? ALERT_THRESHOLD_PRESETS.conservative
    : scaleProfile === 'medium'
      ? ALERT_THRESHOLD_PRESETS.balanced
      : ALERT_THRESHOLD_PRESETS.aggressive

  const safeWindow = clamp(windowDays, 14, 90)
  const recent = daily.slice(-safeWindow)
  const previous = daily.slice(-safeWindow * 2, -safeWindow)
  const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0)
  const weightedMean = (values: number[]) => {
    if (values.length === 0) return 0
    const weighted = values.reduce((acc, value, index) => acc + value * (index + 1), 0)
    const totalWeight = values.reduce((acc, _value, index) => acc + (index + 1), 0)
    return totalWeight > 0 ? weighted / totalWeight : 0
  }

  const recentDiscardTotal = sum(recent.map(item => item.memoria_busca_descartes || 0))
  const recentDiscardAvg = weightedMean(recent.map(item => item.memoria_busca_descartes || 0))
  const previousDiscardAvg = previous.length > 0
    ? weightedMean(previous.map(item => item.memoria_busca_descartes || 0))
    : 0

  const recentUpdates = sum(recent.map(item => item.memoria_busca_atualizacoes || 0))
  const updateDensity = recent.length > 0 ? recentUpdates / recent.length : 0

  const criticalByRecentRate = recentDiscardAvg > 0
    ? Math.ceil(recentDiscardAvg * 7 * 1.8)
    : basePreset.discardTotalCritical7d

  const trendMultiplier = previousDiscardAvg > 0 && recentDiscardAvg > 0
    ? clamp((recentDiscardAvg / previousDiscardAvg) * 1.2, 1.3, 3)
    : basePreset.discardTrendMultiplierWarning

  const currentCoverage = overview.total_notebooks > 0
    ? overview.notebooks_with_dedicated_search_memory / overview.total_notebooks
    : basePreset.coverageWarningMin
  const coverageWarningMin = clamp(currentCoverage - 0.1, 0.35, 0.9)

  const noUpdatesInfoDays = updateDensity > 3
    ? Math.max(3, basePreset.noUpdatesInfoDays - 1)
    : updateDensity < 0.5
      ? Math.min(14, basePreset.noUpdatesInfoDays + 2)
      : basePreset.noUpdatesInfoDays

  return {
    scaleProfile,
    thresholds: {
      discardTotalCritical7d: Math.max(basePreset.discardTotalCritical7d, criticalByRecentRate),
      discardTrendMultiplierWarning: Number(trendMultiplier.toFixed(2)),
      coverageWarningMin: Number(coverageWarningMin.toFixed(2)),
      noUpdatesInfoDays,
    },
  }
}

function buildMemoryAlerts(
  overview: Awaited<ReturnType<typeof getPlatformOverview>>,
  daily: PlatformDailyUsagePoint[],
  thresholds: AlertThresholds,
): OperationalAlert[] {
  const alerts: OperationalAlert[] = []
  const recentWindow = daily.slice(-thresholds.noUpdatesInfoDays)
  const previousWindow = daily.slice(-thresholds.noUpdatesInfoDays * 2, -thresholds.noUpdatesInfoDays)

  const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0)
  const recentDiscardTotal = sum(recentWindow.map(item => item.memoria_busca_descartes || 0))
  const previousDiscardAvg = previousWindow.length > 0
    ? sum(previousWindow.map(item => item.memoria_busca_descartes || 0)) / previousWindow.length
    : 0
  const recentDiscardAvg = recentWindow.length > 0
    ? recentDiscardTotal / recentWindow.length
    : 0
  const recentUpdates = sum(recentWindow.map(item => item.memoria_busca_atualizacoes || 0))

  if (recentDiscardTotal >= thresholds.discardTotalCritical7d) {
    alerts.push({
      id: 'memory-discard-spike',
      level: 'critical',
      title: 'Descartes elevados na memória dedicada',
      description: `Na janela recente houve ${fmtInt(recentDiscardTotal)} descartes por retenção na memória de busca.`,
    })
  } else if (
    recentDiscardAvg > 0
    && previousDiscardAvg > 0
    && recentDiscardAvg >= previousDiscardAvg * thresholds.discardTrendMultiplierWarning
  ) {
    alerts.push({
      id: 'memory-discard-trend',
      level: 'warning',
      title: 'Crescimento acelerado de descartes',
      description: `A média diária de descartes superou ${thresholds.discardTrendMultiplierWarning.toFixed(1)}x da janela anterior (${recentDiscardAvg.toFixed(1)} vs ${previousDiscardAvg.toFixed(1)}).`,
    })
  }

  if (overview.total_notebooks > 0) {
    const coverage = overview.notebooks_with_dedicated_search_memory / overview.total_notebooks
    if (coverage < thresholds.coverageWarningMin) {
      alerts.push({
        id: 'memory-coverage-low',
        level: 'warning',
        title: 'Cobertura parcial da memória dedicada',
        description: `Apenas ${fmtInt(overview.notebooks_with_dedicated_search_memory)} de ${fmtInt(overview.total_notebooks)} cadernos usam armazenamento dedicado de busca.`,
      })
    }
  }

  if (overview.total_notebook_search_memory_docs > 0 && recentUpdates === 0) {
    alerts.push({
      id: 'memory-no-updates',
      level: 'info',
      title: 'Sem atualizações recentes da memória dedicada',
      description: `Nenhuma atualização de search_memory foi observada nos últimos ${thresholds.noUpdatesInfoDays} dias.`,
    })
  }

  return alerts
}

function summarizeAlertImpact(alerts: OperationalAlert[]): AlertImpactSummary {
  return alerts.reduce<AlertImpactSummary>((acc, alert) => {
    if (alert.level === 'critical') acc.critical += 1
    else if (alert.level === 'warning') acc.warning += 1
    else acc.info += 1
    return acc
  }, {
    critical: 0,
    warning: 0,
    info: 0,
  })
}

function parseRecommendationPolicy(raw: unknown): RecommendationPolicy {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const rawWindow = typeof data.recommendation_window_days === 'number'
    ? data.recommendation_window_days
    : DEFAULT_RECOMMENDATION_POLICY.recommendationWindowDays
  const recommendationWindowDays = [14, 30, 60, 90].includes(rawWindow)
    ? rawWindow
    : DEFAULT_RECOMMENDATION_POLICY.recommendationWindowDays

  const rolloutMode = data.rollout_mode === 'assisted' || data.rollout_mode === 'manual'
    ? data.rollout_mode
    : DEFAULT_RECOMMENDATION_POLICY.rolloutMode

  return {
    recommendationWindowDays,
    rolloutMode,
  }
}

function parseRecommendationHistory(raw: unknown): RecommendationHistoryEntry[] {
  if (!Array.isArray(raw)) return []

  const asThresholds = (value: unknown): AlertThresholds | undefined => {
    const parsed = parseAlertThresholds(value)
    if (!value || typeof value !== 'object') return undefined
    return parsed
  }

  const asImpact = (value: unknown): AlertImpactSummary | undefined => {
    if (!value || typeof value !== 'object') return undefined
    const data = value as Record<string, unknown>
    return {
      critical: typeof data.critical === 'number' ? data.critical : 0,
      warning: typeof data.warning === 'number' ? data.warning : 0,
      info: typeof data.info === 'number' ? data.info : 0,
    }
  }

  return raw
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const data = item as Record<string, unknown>
      const createdAt = typeof data.created_at === 'string' ? data.created_at : ''
      if (!createdAt) return null

      const action = data.action === 'recommendation_applied' || data.action === 'thresholds_saved'
        ? data.action
        : 'thresholds_saved'

      const rolloutMode = data.rollout_mode === 'assisted' || data.rollout_mode === 'manual'
        ? data.rollout_mode
        : 'manual'

      const scaleProfile = data.scale_profile === 'small' || data.scale_profile === 'medium' || data.scale_profile === 'large'
        ? data.scale_profile
        : 'medium'

      const recommendationWindowDays = typeof data.recommendation_window_days === 'number'
        ? data.recommendation_window_days
        : 30

      const appliedThresholds = asThresholds(data.applied_thresholds) || DEFAULT_ALERT_THRESHOLDS

      return {
        id: typeof data.id === 'string' && data.id.trim() ? data.id : `${Date.parse(createdAt) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt,
        action,
        rolloutMode,
        recommendationWindowDays,
        scaleProfile,
        recommendedThresholds: asThresholds(data.recommended_thresholds),
        appliedThresholds,
        impactCurrent: asImpact(data.impact_current),
        impactProjected: asImpact(data.impact_projected),
      } as RecommendationHistoryEntry
    })
    .filter((item): item is RecommendationHistoryEntry => Boolean(item))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_RECOMMENDATION_HISTORY_ENTRIES)
}

function buildRecommendationHistoryEntry(input: {
  action: RecommendationHistoryEntry['action']
  rolloutMode: RecommendationHistoryEntry['rolloutMode']
  recommendationWindowDays: number
  scaleProfile: RecommendationHistoryEntry['scaleProfile']
  recommendedThresholds?: AlertThresholds
  appliedThresholds: AlertThresholds
  impactCurrent?: AlertImpactSummary
  impactProjected?: AlertImpactSummary
}): RecommendationHistoryEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    action: input.action,
    rolloutMode: input.rolloutMode,
    recommendationWindowDays: input.recommendationWindowDays,
    scaleProfile: input.scaleProfile,
    recommendedThresholds: input.recommendedThresholds,
    appliedThresholds: input.appliedThresholds,
    impactCurrent: input.impactCurrent,
    impactProjected: input.impactProjected,
  }
}

function formatAuditTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtImpactDelta(current?: number, projected?: number): string {
  const currentSafe = typeof current === 'number' ? current : 0
  const projectedSafe = typeof projected === 'number' ? projected : currentSafe
  const delta = projectedSafe - currentSafe
  const signal = delta > 0 ? '+' : ''
  return `${currentSafe}→${projectedSafe} (${signal}${delta})`
}