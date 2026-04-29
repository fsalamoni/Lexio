import { describe, expect, it, vi } from 'vitest'
import type { UsageExecutionRecord } from './cost-analytics'
import {
  buildCostSeries,
  buildDashboardDailyPoints,
  buildDashboardRecentDocuments,
  buildDashboardStats,
  buildDashboardTypeStats,
  computeDocsThisWeek,
  getResumableDocument,
  type DashboardRecentDoc,
} from './dashboard-data'
import type { DocumentData, ThesisAnalysisSessionData } from './firestore-service'

function makeDoc(overrides: Partial<DashboardRecentDoc> = {}): DashboardRecentDoc {
  return {
    id: 'doc-1',
    document_type_id: 'parecer',
    tema: 'Tema teste',
    status: 'concluido',
    quality_score: 88,
    created_at: '2026-04-18T12:00:00.000Z',
    ...overrides,
  }
}

function makeExecution(overrides: Partial<UsageExecutionRecord> = {}): UsageExecutionRecord {
  return {
    source_type: 'document_generation',
    source_id: 'doc-1',
    function_key: 'document_generation',
    function_label: 'Geração de documentos',
    phase: 'redacao',
    phase_label: 'Redação',
    agent_name: 'writer',
    model: 'test-model',
    model_label: 'Test Model',
    tokens_in: 100,
    tokens_out: 50,
    total_tokens: 150,
    cost_usd: 0.25,
    duration_ms: 1200,
    created_at: '2026-04-18T12:00:00.000Z',
    execution_state: 'completed',
    ...overrides,
  }
}

function makeFirestoreDoc(overrides: Partial<DocumentData> = {}): DocumentData {
  return {
    id: 'doc-1',
    document_type_id: 'parecer',
    original_request: 'Pedido',
    status: 'concluido',
    created_at: '2026-04-18T12:00:00.000Z',
    llm_cost_usd: 0.4,
    llm_executions: [makeExecution()],
    ...overrides,
  }
}

function makeSession(overrides: Partial<ThesisAnalysisSessionData> = {}): ThesisAnalysisSessionData {
  return {
    id: 'session-1',
    created_at: '2026-04-18T12:00:00.000Z',
    total_theses_analyzed: 1,
    total_docs_analyzed: 1,
    total_new_docs: 1,
    suggestions_count: 1,
    accepted_count: 1,
    rejected_count: 0,
    executive_summary: 'Resumo',
    status: 'completed',
    llm_executions: [makeExecution({ cost_usd: 0.15 })],
    ...overrides,
  }
}

describe('dashboard-data', () => {
  it('builds a cumulative cost series preserving day order', () => {
    expect(buildCostSeries([
      { dia: '2026-04-16', total: 1, concluidos: 1, custo: 0.11 },
      { dia: '2026-04-17', total: 2, concluidos: 1, custo: 0.25 },
    ])).toEqual([
      { dia: '2026-04-16', custo_acumulado: 0.11 },
      { dia: '2026-04-17', custo_acumulado: 0.36 },
    ])
  })

  it('computes documents this week from the last 7 daily points', () => {
    const points = Array.from({ length: 10 }).map((_, index) => ({
      dia: `2026-04-${String(index + 1).padStart(2, '0')}`,
      total: index + 1,
      concluidos: index,
      custo: 0,
    }))

    expect(computeDocsThisWeek(points)).toBe(49)
  })

  it('returns the first resumable document when available', () => {
    const result = getResumableDocument([
      makeDoc({ id: 'a', status: 'erro' }),
      makeDoc({ id: 'b', status: 'em_revisao' }),
      makeDoc({ id: 'c', status: 'concluido' }),
    ])

    expect(result?.id).toBe('b')
  })

  it('returns null when there is no resumable document', () => {
    expect(getResumableDocument([makeDoc({ status: 'erro' })])).toBeNull()
  })

  it('builds Firebase dashboard stats from a single snapshot', () => {
    const stats = buildDashboardStats({
      documents: [
        makeFirestoreDoc({ id: 'a', status: 'concluido', quality_score: 90 }),
        makeFirestoreDoc({ id: 'b', status: 'processando', quality_score: null, llm_cost_usd: 0.1 }),
        makeFirestoreDoc({ id: 'c', status: 'em_revisao', quality_score: 70, llm_cost_usd: 0.2 }),
      ],
      thesisSessions: [makeSession()],
    })

    expect(stats).toMatchObject({
      total_documents: 3,
      completed_documents: 1,
      processing_documents: 1,
      pending_review_documents: 1,
      average_quality_score: 80,
    })
    expect(stats.total_cost_usd).toBeCloseTo(0.9, 6)
  })

  it('builds recent documents without refetching Firestore', () => {
    const recent = buildDashboardRecentDocuments({
      documents: [
        makeFirestoreDoc({ id: 'first', created_at: '2026-04-19T12:00:00.000Z' }),
        makeFirestoreDoc({ id: 'second', created_at: '2026-04-18T12:00:00.000Z' }),
      ],
      thesisSessions: [],
    })

    expect(recent.map((doc) => doc.id)).toEqual(['first', 'second'])
  })

  it('builds document type stats from the cached snapshot', () => {
    const byType = buildDashboardTypeStats({
      documents: [
        makeFirestoreDoc({ document_type_id: 'parecer', quality_score: 90 }),
        makeFirestoreDoc({ id: 'b', document_type_id: 'parecer', quality_score: 70 }),
        makeFirestoreDoc({ id: 'c', document_type_id: 'peticao', quality_score: null }),
      ],
      thesisSessions: [],
    })

    expect(byType).toEqual([
      { document_type_id: 'parecer', total: 2, avg_score: 80 },
      { document_type_id: 'peticao', total: 1, avg_score: null },
    ])
  })

  it('recomputes daily points from cached documents and sessions', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-04-20T12:00:00.000Z'))

      const daily = buildDashboardDailyPoints({
        documents: [
          makeFirestoreDoc({
            created_at: '2026-04-19T10:00:00.000Z',
            status: 'concluido',
            llm_cost_usd: 0.5,
            llm_executions: [makeExecution({ created_at: '2026-04-19T10:00:00.000Z', cost_usd: 0.25 })],
          }),
        ],
        thesisSessions: [
          makeSession({
            created_at: '2026-04-20T09:00:00.000Z',
            llm_executions: [makeExecution({ created_at: '2026-04-20T09:00:00.000Z', cost_usd: 0.1 })],
          }),
        ],
      }, 2)

      expect(daily).toEqual([
        { dia: '2026-04-19', total: 1, concluidos: 1, custo: 0.75 },
        { dia: '2026-04-20', total: 0, concluidos: 0, custo: 0.1 },
      ])
    } finally {
      vi.useRealTimers()
    }
  })
})
