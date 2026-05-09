import { describe, expect, it } from 'vitest'
import { parseArtifactContent } from './artifact-parsers'

describe('artifact-parsers barrel', () => {
  it('re-exports parseArtifactContent for structured artifacts', () => {
    const parsed = parseArtifactContent('tabela_dados', JSON.stringify({
      title: 'Panorama',
      columns: [
        { key: 'tema', label: 'Tema' },
        { key: 'valor', label: 'Valor', align: 'right' },
      ],
      rows: [
        { tema: 'A', valor: 10 },
        { tema: 'B', valor: 20 },
      ],
      summary: { tema: 'Total', valor: 30 },
    }))

    expect(parsed.kind).toBe('datatable')
    if (parsed.kind !== 'datatable') {
      throw new Error('expected datatable artifact')
    }

    expect(parsed.data.title).toBe('Panorama')
    expect(parsed.data.columns[1]).toMatchObject({ key: 'valor', label: 'Valor', align: 'right' })
    expect(parsed.data.rows).toHaveLength(2)
    expect(parsed.data.summary).toEqual({ tema: 'Total', valor: 30 })
  })

  it('falls back to markdown when JSON content is invalid for the declared type', () => {
    const raw = '{"title":"Quebrado"}'
    const parsed = parseArtifactContent('apresentacao', raw)

    expect(parsed).toEqual({ kind: 'markdown', data: raw })
  })
})