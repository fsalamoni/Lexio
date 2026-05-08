import {
  buildCostBreakdown,
  extractAcervoUsageExecutions,
  extractDocumentUsageExecutions,
  extractNotebookUsageExecutions,
  extractThesisSessionExecutions,
  type CostBreakdown,
} from '../../cost-analytics'
import type {
  AcervoDocumentData,
  DocumentData,
  ResearchNotebookData,
  ThesisAnalysisSessionData,
} from '../../firestore-types'
import {
  buildDashboardDailyPoints,
  buildDashboardStats,
  buildDashboardTypeStats,
  type DailyPoint,
  type DashboardSnapshot,
  type DashboardStats,
  type TypeStat,
} from './metrics'

export type DashboardRepositoryDependencies = {
  listDocuments: (uid: string, opts?: { limit?: number }) => Promise<{ items: DocumentData[]; total?: number }>
  listThesisAnalysisSessions: (uid: string) => Promise<ThesisAnalysisSessionData[]>
  listAcervoDocuments: (uid: string) => Promise<{ items: AcervoDocumentData[]; total?: number }>
  listResearchNotebooks: (uid: string) => Promise<{ items: ResearchNotebookData[]; total?: number }>
}

export function createDashboardRepository(deps: DashboardRepositoryDependencies) {
  async function getDashboardSnapshot(uid: string): Promise<DashboardSnapshot> {
    const [{ items }, thesisSessions] = await Promise.all([
      deps.listDocuments(uid),
      deps.listThesisAnalysisSessions(uid).catch(() => []),
    ])

    return {
      documents: items,
      thesisSessions,
    }
  }

  async function getStats(uid: string): Promise<DashboardStats> {
    return buildDashboardStats(await getDashboardSnapshot(uid))
  }

  async function getDailyStats(uid: string, days = 30): Promise<DailyPoint[]> {
    return buildDashboardDailyPoints(await getDashboardSnapshot(uid), days)
  }

  async function getByTypeStats(uid: string): Promise<TypeStat[]> {
    const { items } = await deps.listDocuments(uid)
    return buildDashboardTypeStats({ documents: items, thesisSessions: [] })
  }

  async function getRecentDocuments(uid: string, count = 5): Promise<DocumentData[]> {
    const { items } = await deps.listDocuments(uid, { limit: count })
    return items
  }

  async function getCostBreakdown(uid: string): Promise<CostBreakdown> {
    const [{ items }, sessions, acervo, notebooks] = await Promise.all([
      deps.listDocuments(uid),
      deps.listThesisAnalysisSessions(uid).catch(() => []),
      deps.listAcervoDocuments(uid).then(result => result.items).catch(() => [] as AcervoDocumentData[]),
      deps.listResearchNotebooks(uid).then(result => result.items).catch(() => [] as ResearchNotebookData[]),
    ])

    const executions = [
      ...items.flatMap(doc => extractDocumentUsageExecutions(doc)),
      ...sessions.flatMap(session => extractThesisSessionExecutions(session)),
      ...acervo.flatMap(acervoDoc => extractAcervoUsageExecutions({
        id: acervoDoc.id,
        filename: acervoDoc.filename,
        created_at: acervoDoc.created_at,
        llm_executions: acervoDoc.llm_executions,
      })),
      ...notebooks.flatMap(notebook => extractNotebookUsageExecutions({
        id: notebook.id,
        title: notebook.title,
        created_at: notebook.created_at,
        llm_executions: notebook.llm_executions,
        usage_summary: notebook.usage_summary,
      })),
    ]

    return buildCostBreakdown(executions)
  }

  return {
    getStats,
    getDailyStats,
    getByTypeStats,
    getRecentDocuments,
    getDashboardSnapshot,
    getCostBreakdown,
  }
}