import { describe, expect, it } from 'vitest'
import { verifyDraftCitations } from './v3-agents/citation-verifier'

describe('verifyDraftCitations (post-write)', () => {
  it('flags citations present in the draft but absent from the verified research', () => {
    const draft = [
      'Conforme o REsp 1.234.567/SP, restou consolidada a tese.',
      'A Súmula 297 do STJ aplica-se ao caso.',
      'A Lei nº 8.078/1990 (CDC) rege a relação.',
    ].join(' ')
    const grounded = [
      'A Súmula 297 do STJ trata da incidência do CDC.',
      'A Lei nº 8.078/1990 disciplina a relação de consumo.',
    ].join(' ')

    const result = verifyDraftCitations(draft, [grounded])
    expect(result.unsupported.some(c => /REsp\s+1\.234\.567/.test(c))).toBe(true)
    // Súmula 297 and Lei nº 8.078/1990 must NOT be flagged as unsupported
    expect(result.unsupported.some(c => /Súmula\s+297/i.test(c))).toBe(false)
    expect(result.unsupported.some(c => /8\.078/.test(c))).toBe(false)
  })

  it('returns empty unsupported list when the draft has no citations', () => {
    const result = verifyDraftCitations('Texto puro sem citações jurídicas.', ['REsp 1/SP'])
    expect(result.unsupported).toEqual([])
    expect(result.detected).toEqual([])
  })

  it('handles undefined / null grounded sources gracefully', () => {
    const draft = 'Conforme HC 100.000/SP, ...'
    const result = verifyDraftCitations(draft, [undefined, null])
    expect(result.unsupported.length).toBe(1)
  })
})
