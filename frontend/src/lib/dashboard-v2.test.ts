import { describe, expect, it } from 'vitest'
import { buildDashboardPriorityActions, buildDashboardSignals, getFirstName, getGreetingForHour } from './dashboard-v2'

describe('dashboard-v2', () => {
  it('returns a contextual greeting for each time band', () => {
    expect(getGreetingForHour(8)).toBe('Bom dia')
    expect(getGreetingForHour(14)).toBe('Boa tarde')
    expect(getGreetingForHour(21)).toBe('Boa noite')
  })

  it('extracts the first user name from a full name string', () => {
    expect(getFirstName('Ana Maria Souza')).toBe('Ana')
    expect(getFirstName('')).toBe('')
    expect(getFirstName(null)).toBe('')
  })

  it('prioritizes resuming work and review queues before generic actions', () => {
    const actions = buildDashboardPriorityActions({
      stats: {
        total_documents: 10,
        completed_documents: 6,
        processing_documents: 1,
        pending_review_documents: 3,
        average_quality_score: 87,
        total_cost_usd: 1.25,
        average_duration_ms: 2100,
      },
      recent: [
        {
          id: 'doc-7',
          document_type_id: 'parecer',
          tema: 'Tema em revisao',
          status: 'em_revisao',
          quality_score: 80,
          created_at: '2026-04-18T10:00:00.000Z',
        },
      ],
      docsThisWeek: 4,
    })

    expect(actions.map((action) => action.key)).toEqual(['resume', 'review', 'research'])
    expect(actions[2]?.to).toBe('/notebook')
  })

  it('builds workspace signals from aggregate stats', () => {
    const signals = buildDashboardSignals({
      total_documents: 12,
      completed_documents: 9,
      processing_documents: 2,
      pending_review_documents: 1,
      average_quality_score: 91,
      total_cost_usd: 0.8765,
      average_duration_ms: 3200,
    })

    expect(signals[0].value).toBe('91/100')
    expect(signals[1].value).toBe('2 em processamento')
    expect(signals[2].value).toBe('R$\u00a05,00')
  })
})