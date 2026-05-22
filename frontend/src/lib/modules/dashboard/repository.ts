import {
  buildCostBreakdown,
  extractAcervoUsageExecutions,
  extractChatTurnExecutions,
  extractDocumentUsageExecutions,
  extractNotebookUsageExecutions,
  extractThesisSessionExecutions,
  type CostBreakdown,
  type UsageExecutionRecord,
} from '../../cost-analytics'
import type {
  AcervoDocumentData,
  ChatConversationData,
  ChatTurnData,
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
  listChatConversations: (uid: string, opts?: { startAfter?: string; limit?: number }) => Promise<{ items: ChatConversationData[]; hasMore?: boolean }>
  listChatTurns: (uid: string, conversationId: string) => Promise<{ items: ChatTurnData[] }>
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

  /**
   * Page through every chat conversation and flatten its turns' usage records.
   * Chat usage lives on turn documents (a subcollection), so — unlike documents
   * or notebooks — it needs an explicit fan-out to reach the cost breakdown.
   */
  async function loadChatTurnExecutions(uid: string): Promise<UsageExecutionRecord[]> {
    const conversations: ChatConversationData[] = []
    let cursor: string | undefined
    // 20 pages × 50 conversations is a safety bound against a runaway cursor,
    // not an expected limit — a normal user has far fewer conversations.
    for (let page = 0; page < 20; page++) {
      const { items, hasMore } = await deps.listChatConversations(uid, { startAfter: cursor, limit: 50 })
      conversations.push(...items)
      const lastId = items[items.length - 1]?.id
      if (!hasMore || !lastId) break
      cursor = lastId
    }
    const turnsByConversation = await Promise.all(
      conversations.map(conversation => conversation.id
        ? deps.listChatTurns(uid, conversation.id).then(result => result.items).catch(() => [] as ChatTurnData[])
        : Promise.resolve([] as ChatTurnData[])),
    )
    return turnsByConversation.flat().flatMap(turn => extractChatTurnExecutions(turn))
  }

  async function getCostBreakdown(uid: string): Promise<CostBreakdown> {
    const [{ items }, sessions, acervo, notebooks, chatExecutions] = await Promise.all([
      deps.listDocuments(uid),
      deps.listThesisAnalysisSessions(uid).catch(() => []),
      deps.listAcervoDocuments(uid).then(result => result.items).catch(() => [] as AcervoDocumentData[]),
      deps.listResearchNotebooks(uid).then(result => result.items).catch(() => [] as ResearchNotebookData[]),
      loadChatTurnExecutions(uid).catch(() => [] as UsageExecutionRecord[]),
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
      ...chatExecutions,
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