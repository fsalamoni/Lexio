import { useEffect, useRef, useState } from 'react'
import api from '../../../api/client'
import { useAuth } from '../../../contexts/AuthContext'
import { IS_FIREBASE } from '../../firebase'
import { withTransientFirebaseAuthRetry } from '../../firebase-auth-retry'
import {
  getDashboardSnapshot,
  isFirestoreSessionInvalidError,
} from '../../firestore-service'
import {
  buildDashboardDailyPoints,
  buildDashboardRecentDocuments,
  buildDashboardStats,
  buildDashboardTypeStats,
  type AgentStat,
  type DailyPoint,
  type DashboardRecentDoc,
  type DashboardSnapshot,
  type DashboardStats,
  type TypeStat,
} from './metrics'

export {
  buildDashboardDailyPoints,
  buildDashboardRecentDocuments,
  buildDashboardStats,
  buildDashboardTypeStats,
} from './metrics'

export type {
  AgentStat,
  DailyPoint,
  DashboardRecentDoc,
  DashboardSnapshot,
  DashboardStats,
  TypeStat,
} from './metrics'

export { formatCost } from '../../currency-utils'

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

export interface DashboardDataNotifications {
  error: (title: string, description?: string) => void
}

const noopDashboardNotifications: DashboardDataNotifications = {
  error: () => {},
}

export function useDashboardData(
  periodDays: number,
  notifications: DashboardDataNotifications = noopDashboardNotifications,
) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [agents, setAgents] = useState<AgentStat[]>([])
  const [recent, setRecent] = useState<DashboardRecentDoc[]>([])
  const [byType, setByType] = useState<TypeStat[]>([])
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)
  const [firebaseSnapshot, setFirebaseSnapshot] = useState<DashboardSnapshot | null>(null)
  const { userId, isReady } = useAuth()
  const toast = notifications
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
