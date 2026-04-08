import { describe, it, expect } from 'vitest'
import { applyOrigemFilter, toggleFilter, type DocumentFilterItem } from '../lib/document-filters'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<DocumentFilterItem> = {}): DocumentFilterItem {
  return {
    id: 'doc-1',
    document_type_id: 'parecer',
    tema: 'Tema teste',
    status: 'concluido',
    quality_score: 85,
    created_at: '2024-01-01T00:00:00.000Z',
    origem: 'web',
    ...overrides,
  }
}

const cadernoDocs: DocumentFilterItem[] = [
  makeDoc({ id: '1', origem: 'caderno', notebook_id: 'nb-1' }),
  makeDoc({ id: '2', origem: 'caderno', notebook_id: 'nb-2' }),
]

const webDocs: DocumentFilterItem[] = [
  makeDoc({ id: '3', origem: 'web' }),
  makeDoc({ id: '4', origem: 'web' }),
  makeDoc({ id: '5', origem: 'web' }),
]

const mixedDocs: DocumentFilterItem[] = [...cadernoDocs, ...webDocs]

// ── applyOrigemFilter ─────────────────────────────────────────────────────────

describe('applyOrigemFilter', () => {
  it('returns all items when origem is empty string (no filter)', () => {
    const result = applyOrigemFilter(mixedDocs, '')
    expect(result).toHaveLength(mixedDocs.length)
    expect(result).toBe(mixedDocs) // same reference — no copy when passthrough
  })

  it("filters to only 'caderno' docs when origem is 'caderno'", () => {
    const result = applyOrigemFilter(mixedDocs, 'caderno')
    expect(result).toHaveLength(2)
    result.forEach(d => expect(d.origem).toBe('caderno'))
  })

  it("filters to only 'web' docs when origem is 'web'", () => {
    const result = applyOrigemFilter(mixedDocs, 'web')
    expect(result).toHaveLength(3)
    result.forEach(d => expect(d.origem).toBe('web'))
  })

  it('returns empty array when no docs match the requested origem', () => {
    const result = applyOrigemFilter(webDocs, 'caderno')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty input regardless of filter', () => {
    expect(applyOrigemFilter([], 'caderno')).toHaveLength(0)
    expect(applyOrigemFilter([], '')).toHaveLength(0)
  })

  it('supports arbitrary origem values (e.g. whatsapp)', () => {
    const docs = [
      makeDoc({ id: 'w1', origem: 'whatsapp' }),
      makeDoc({ id: 'w2', origem: 'whatsapp' }),
      makeDoc({ id: 'x1', origem: 'web' }),
    ]
    const result = applyOrigemFilter(docs, 'whatsapp')
    expect(result).toHaveLength(2)
    result.forEach(d => expect(d.origem).toBe('whatsapp'))
  })
})

// ── toggleFilter ──────────────────────────────────────────────────────────────

describe('toggleFilter', () => {
  it('sets the filter when current is empty', () => {
    expect(toggleFilter('', 'caderno')).toBe('caderno')
    expect(toggleFilter('', 'web')).toBe('web')
  })

  it("clears the filter (returns '') when the same value is toggled off", () => {
    expect(toggleFilter('caderno', 'caderno')).toBe('')
    expect(toggleFilter('web', 'web')).toBe('')
  })

  it('replaces the current filter with a different value', () => {
    expect(toggleFilter('web', 'caderno')).toBe('caderno')
    expect(toggleFilter('caderno', 'web')).toBe('web')
  })

  it('mirrors the DocumentList handleOriginFilter/handleStatusFilter toggle pattern', () => {
    let originFilter = ''

    // First click — enable 'caderno' filter
    originFilter = toggleFilter(originFilter, 'caderno')
    expect(originFilter).toBe('caderno')

    // Second click on same chip — disable filter
    originFilter = toggleFilter(originFilter, 'caderno')
    expect(originFilter).toBe('')

    // Click on a different chip
    originFilter = toggleFilter(originFilter, 'web')
    expect(originFilter).toBe('web')
  })
})
