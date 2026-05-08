import {
  buildUsageSummary,
  extractDocumentUsageExecutions,
  extractThesisSessionExecutions,
} from '../../cost-analytics'
import type { DocumentData, ThesisAnalysisSessionData } from '../../firestore-types'

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

export type DashboardSnapshot = {
  documents: DocumentData[]
  thesisSessions: ThesisAnalysisSessionData[]
}

const DEFAULT_RECENT_DOCUMENTS_LIMIT = 5

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