import { useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'
import { IS_FIREBASE } from './firebase'
import {
  getStats as firestoreGetStats,
  getRecentDocuments,
  getDailyStats,
  getByTypeStats,
  isFirestoreSessionInvalidError,
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

const TRANSIENT_AUTH_ERROR_CODES = new Set(['unauthenticated', 'permission-denied'])
const AUTH_ERROR_TOAST_COOLDOWN_MS = 6_000

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  if ('code' in error && typeof error.code === 'string') {
    return error.code.replace(/^firestore\//, '')
  }
  return null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return ''
}

function isTransientAuthError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error)
  if (code && TRANSIENT_AUTH_ERROR_CODES.has(code)) return true
  const message = getErrorMessage(error)
  return /sessão do firebase não sincronizada|missing or insufficient permissions/i.test(message)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function withTransientAuthRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isTransientAuthError(error)) throw error
    await wait(700)
    return operation()
  }
}

export function useDashboardData(periodDays: number) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [agents, setAgents] = useState<AgentStat[]>([])
  const [recent, setRecent] = useState<DashboardRecentDoc[]>([])
  const [byType, setByType] = useState<TypeStat[]>([])
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)
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
      const statsPromise = withTransientAuthRetry(() => firestoreGetStats(userId))
        .then((value) => setStats(value))
        .catch((error) => {
          if (isFirestoreSessionInvalidError(error)) {
            notifySessionInvalidOnce()
            return
          }
          toast.error('Erro ao carregar estatisticas')
        })
      const recentPromise = withTransientAuthRetry(() => getRecentDocuments(userId, 5))
        .then((docs) => {
          setRecent(docs.filter((doc) => doc.id).map((doc) => ({
            id: doc.id as string,
            document_type_id: doc.document_type_id,
            tema: doc.tema ?? null,
            status: doc.status,
            quality_score: doc.quality_score ?? null,
            created_at: doc.created_at,
          })))
        })
        .catch((error) => {
          if (isFirestoreSessionInvalidError(error)) {
            notifySessionInvalidOnce()
            return
          }
          toast.error('Erro ao carregar documentos recentes')
        })
      const dailyPromise = withTransientAuthRetry(() => getDailyStats(userId, periodDays))
        .then((value) => setDaily(value))
        .catch((error) => {
          if (isFirestoreSessionInvalidError(error)) {
            notifySessionInvalidOnce()
          }
        })
      const byTypePromise = withTransientAuthRetry(() => getByTypeStats(userId))
        .then((value) => setByType(value))
        .catch((error) => {
          if (isFirestoreSessionInvalidError(error)) {
            notifySessionInvalidOnce()
          }
        })
      Promise.all([statsPromise, recentPromise, dailyPromise, byTypePromise]).finally(() => setLoading(false))
      return
    }

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
      withTransientAuthRetry(() => getDailyStats(userId, periodDays))
        .then((value) => setDaily(value))
        .catch((error) => {
          if (isFirestoreSessionInvalidError(error)) {
            notifySessionInvalidOnce()
            return
          }
          toast.error('Erro ao carregar historico')
        })
        .finally(() => setChartLoading(false))
      return
    }

    api.get('/stats/daily', { params: { days: periodDays }, noCache: true } as never)
      .then((response) => setDaily(Array.isArray(response.data) ? response.data : []))
      .catch(() => toast.error('Erro ao carregar historico'))
      .finally(() => setChartLoading(false))
  }, [periodDays, shouldWaitForFirebaseUser, userId, loading]) // eslint-disable-line react-hooks/exhaustive-deps

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