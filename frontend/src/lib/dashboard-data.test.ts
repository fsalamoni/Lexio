import { describe, expect, it } from 'vitest'
import { buildCostSeries, computeDocsThisWeek, getResumableDocument, type DashboardRecentDoc } from './dashboard-data'

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
})