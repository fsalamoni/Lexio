import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'
import { IS_FIREBASE } from './firebase'
import { withTransientFirebaseAuthRetry } from './firebase-auth-retry'
import {
  buildUsageSummary,
  extractDocumentUsageExecutions,
  extractThesisSessionExecutions,
} from './cost-analytics'
import {
  getDashboardSnapshot,
  isFirestoreSessionInvalidError,
  type DocumentData,
  type ThesisAnalysisSessionData,
} from './firestore-service'

export interface DashboardStats {
  total_documents: number
  completed_documents: number
  processing_documents: number
  pending_review_documents: number
  average_quality_score: number | null
  total_cost_usd: number
  average_duration_ms: number | null
}

export interface DailyPoint {
  dia: string
  total: number
  concluidos: number
  custo: number
}

export interface AgentStat {
  agent_name: string
  chamadas: number
  custo_total: number
  tempo_medio_ms: number
}

export interface DashboardRecentDoc {
  id: string
  document_type_id: string
  tema: string | null
  status: string
  quality_score: number | null
  created_at: string
}

export interface TypeStat {
  document_type_id: string
  total: number
  avg_score: number | null
}

export { formatCost } from './currency-utils'

export function formatDuration(ms: number | null) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function buildCostSeries(daily: DailyPoint[]) {
  return daily.reduce<{ dia: string; custo_acumulado: number }[]>((acc, point) => {
    const previous = acc.length > 0 ? acc[acc.length - 1].custo_acumulado : 0
    const cost = typeof point.custo === 'number' ? point.custo : 0
    acc.push({ dia: point.dia, custo_acumulado: +(previous + cost).toFixed(5) })
    return acc
  }, [])
}

export function computeDocsThisWeek(daily: DailyPoint[]) {
  return daily.slice(-7).reduce((sum, point) => sum + (point.total || 0), 0)
}

export function getResumableDocument(recent: DashboardRecentDoc[]) {
  return recent.find((doc) => doc.status === 'processando' || doc.status === 'em_revisao' || doc.status === 'concluido') || null
}

const AUTH_ERROR_TOAST_COOLDOWN_MS = 6_000
const DEFAULT_RECENT_DOCUMENTS_LIMIT = 5

type DashboardSnapshot = {
  documents: DocumentData[]
  thesisSessions: ThesisAnalysisSessionData[]
}

export function buildDashboardStats(snapshot: DashboardSnapshot): DashboardStats {
  const executions = [
    ...snapshot.documents.flatMap((doc) => extractDocumentUsageExecutions(doc)),
    ...snapshot.thesisSessions.flatMap((session) => extractThesisSessionExecutions(session)),
  ]
  const usageSummary = buildUsageSummary(executions)
  const scores = snapshot.documents
    .map((doc) => doc.quality_score)
    .filter((score): score is number => score != null)
  const counts = snapshot.documents.reduce((acc, doc) => {
    if (doc.status === 'concluido' || doc.status === 'aprovado') acc.completed += 1
    if (doc.status === 'processando') acc.processing += 1
    if (doc.status === 'em_revisao' || doc.status === 'rascunho') acc.pendingReview += 1
    return acc
  }, {
    completed: 0,
    processing: 0,
    pendingReview: 0,
  })

  return {
    total_documents: snapshot.documents.length,
    completed_documents: counts.completed,
    processing_documents: counts.processing,
    pending_review_documents: counts.pendingReview,
    average_quality_score: scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    total_cost_usd: usageSummary.total_cost_usd,
    average_duration_ms: null,
  }
}

export function buildDashboardDailyPoints(snapshot: DashboardSnapshot, days: number): DailyPoint[] {
  const executions = [
    ...snapshot.documents.flatMap((doc) => extractDocumentUsageExecutions(doc)),
    ...snapshot.thesisSessions.flatMap((session) => extractThesisSessionExecutions(session)),
  ]
  const now = Date.now()
  const msPerDay = 86_400_000
  const cutoff = new Date(now - days * msPerDay).toISOString().slice(0, 10)
  const dayMap = new Map<string, { total: number; concluidos: number; custo: number }>()

  for (let i = days - 1; i >= 0; i -= 1) {
    const dia = new Date(now - i * msPerDay).toISOString().slice(0, 10)
    dayMap.set(dia, { total: 0, concluidos: 0, custo: 0 })
  }

  for (const doc of snapshot.documents) {
    if (!doc.created_at) continue
    const dia = doc.created_at.slice(0, 10)
    if (dia < cutoff) continue
    const entry = dayMap.get(dia)
    if (!entry) continue
    entry.total += 1
    if (doc.status === 'concluido' || doc.status === 'aprovado') entry.concluidos += 1
    if (typeof doc.llm_cost_usd === 'number') entry.custo += doc.llm_cost_usd
  }

  for (const execution of executions) {
    if (!execution.created_at) continue
    const dia = execution.created_at.slice(0, 10)
    if (dia < cutoff) continue
    const entry = dayMap.get(dia)
    if (entry) entry.custo += execution.cost_usd
  }

  return Array.from(dayMap.entries()).map(([dia, value]) => ({
    dia,
    total: value.total,
    concluidos: value.concluidos,
    custo: +value.custo.toFixed(6),
  }))
}

export function buildDashboardRecentDocuments(
  snapshot: DashboardSnapshot,
  limit = DEFAULT_RECENT_DOCUMENTS_LIMIT,
): DashboardRecentDoc[] {
  return snapshot.documents
    .filter((doc): doc is DocumentData & { id: string } => typeof doc.id === 'string' && doc.id.length > 0)
    .slice(0, limit)
    .map((doc) => ({
      id: doc.id,
      document_type_id: doc.document_type_id,
      tema: doc.tema ?? null,
      status: doc.status,
      quality_score: doc.quality_score ?? null,
      created_at: doc.created_at,
    }))
}

export function buildDashboardTypeStats(snapshot: DashboardSnapshot): TypeStat[] {
  const typeMap = new Map<string, { total: number; scores: number[] }>()

  for (const doc of snapshot.documents) {
    if (!doc.document_type_id) continue
    const entry = typeMap.get(doc.document_type_id) ?? { total: 0, scores: [] }
    entry.total += 1
    if (doc.quality_score != null) entry.scores.push(doc.quality_score)
    typeMap.set(doc.document_type_id, entry)
  }

  return Array.from(typeMap.entries()).map(([document_type_id, value]) => ({
    document_type_id,
    total: value.total,
    avg_score: value.scores.length > 0
      ? Math.round(value.scores.reduce((sum, score) => sum + score, 0) / value.scores.length)
      : null,
  }))
}

export function useDashboardData(periodDays: number) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [agents, setAgents] = useState<AgentStat[]>([])
  const [recent, setRecent] = useState<DashboardRecentDoc[]>([])
  const [byType, setByType] = useState<TypeStat[]>([])
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)
  const [firebaseSnapshot, setFirebaseSnapshot] = useState<DashboardSnapshot | null>(null)
  const { userId, isReady } = useAuth()
  const toast = useToast()
  const lastAuthErrorToastAtRef = useRef(0)
  const shouldWaitForFirebaseUser = IS_FIREBASE && (!isReady || !userId)

  const notifySessionInvalidOnce = () => {
    const now = Date.now()
    if (now - lastAuthErrorToastAtRef.current < AUTH_ERROR_TOAST_COOLDOWN_MS) return
    lastAuthErrorToastAtRef.current = now
    toast.error('Sessão inválida', 'Faça login novamente para continuar.')
  }

  useEffect(() => {
    if (shouldWaitForFirebaseUser) return
    setLoading(true)

    if (IS_FIREBASE && userId) {
      withTransientFirebaseAuthRetry(() => getDashboardSnapshot(userId))
        .then((snapshot) => {
          setFirebaseSnapshot(snapshot)
          setStats(buildDashboardStats(snapshot))
          setRecent(buildDashboardRecentDocuments(snapshot))
          setByType(buildDashboardTypeStats(snapshot))
          setDaily(buildDashboardDailyPoints(snapshot, periodDays))
        })
        .catch((error) => {
          setFirebaseSnapshot(null)
          if (isFirestoreSessionInvalidError(error)) {
            notifySessionInvalidOnce()
            return
          }
          toast.error('Erro ao carregar dashboard')
        })
        .finally(() => setLoading(false))
      return
    }

    setFirebaseSnapshot(null)
    const toArray = (value: unknown) => (Array.isArray(value) ? value : [])
    const statsPromise = api.get('/stats')
      .then((response) => {
        if (response.data && typeof response.data === 'object') setStats(response.data)
      })
      .catch(() => toast.error('Erro ao carregar estatisticas'))
    const dailyPromise = api.get('/stats/daily', { params: { days: periodDays } })
      .then((response) => setDaily(toArray(response.data)))
      .catch(() => toast.error('Erro ao carregar historico diario'))
    const agentsPromise = api.get('/stats/agents')
      .then((response) => setAgents(toArray(response.data)))
      .catch(() => toast.error('Erro ao carregar estatisticas de agentes'))
    const recentPromise = api.get('/stats/recent')
      .then((response) => setRecent(toArray(response.data)))
      .catch(() => toast.error('Erro ao carregar documentos recentes'))
    const byTypePromise = api.get('/stats/by-type')
      .then((response) => setByType(toArray(response.data)))
      .catch(() => {})
    Promise.all([statsPromise, dailyPromise, agentsPromise, recentPromise, byTypePromise]).finally(() => setLoading(false))
  }, [shouldWaitForFirebaseUser, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading) return
    if (shouldWaitForFirebaseUser) return
    setChartLoading(true)

    if (IS_FIREBASE && userId) {
      if (!firebaseSnapshot) {
        setDaily([])
        setChartLoading(false)
        return
      }
      setDaily(buildDashboardDailyPoints(firebaseSnapshot, periodDays))
      setChartLoading(false)
      return
    }

    api.get('/stats/daily', { params: { days: periodDays }, noCache: true } as never)
      .then((response) => setDaily(Array.isArray(response.data) ? response.data : []))
      .catch(() => toast.error('Erro ao carregar historico'))
      .finally(() => setChartLoading(false))
  }, [periodDays, shouldWaitForFirebaseUser, userId, loading, firebaseSnapshot]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    stats,
    daily,
    agents,
    recent,
    byType,
    loading,
    chartLoading,
  }
}
