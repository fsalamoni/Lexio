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

  it('parses presentation v2 manifests with assets and rendered slide images', () => {
    const parsed = parseArtifactContent('apresentacao_v2', JSON.stringify({
      schemaVersion: 'presentation_v2.1',
      title: 'Tese defensiva',
      generationSpec: {
        request: 'Gerar deck para cliente',
        slideCount: 2,
        durationMinutes: 12,
        multimodal: { images: true, charts: true },
      },
      outline: {
        narrativeArc: 'Contexto, risco e encaminhamento',
        sections: [
          { id: 'abertura', title: 'Abertura', purpose: 'situar o caso', slideNumbers: [1] },
          { id: 'fechamento', title: 'Fechamento', purpose: 'decisão', slideNumbers: [2] },
        ],
      },
      theme: {
        name: 'Lexio boardroom',
        mood: 'sóbrio e executivo',
        palette: ['#0f172a', '#ffffff', '#0f766e'],
      },
      slides: [
        {
          id: 'slide-1',
          number: 1,
          title: 'Síntese do caso',
          layout: 'hero',
          bullets: ['Fato crítico', 'Tese central'],
          speakerNotes: 'Abrir com o problema.',
          renderedImageUrl: 'https://storage.example/slide-1.png',
          assets: [
            { id: 'slide-1-render', type: 'render', status: 'stored', url: 'https://storage.example/slide-1.png' },
          ],
        },
        {
          id: 'slide-2',
          number: 2,
          title: 'Próximos passos',
          layout: 'bullets',
          bullets: ['Ajustar documentos', 'Preparar audiência'],
          speakerNotes: 'Fechar com encaminhamento.',
        },
      ],
      assets: [
        { id: 'slide-1-render', type: 'render', status: 'stored', url: 'https://storage.example/slide-1.png' },
      ],
      quality: {
        warnings: ['Validar jurisprudência citada'],
        multimodalAudit: {
          score: 73,
          status: 'review',
          warnings: ['Slide 2 ainda sem gráfico materializado.'],
          auditedAssetTypes: ['render', 'audio'],
          slides: [
            { slideNumber: 1, score: 82, status: 'ok' },
            { slideNumber: 2, score: 64, status: 'review', missingAssetTypes: ['chart/diagram'] },
          ],
        },
        exportReadiness: {
          score: 66,
          status: 'review',
          visualAssetCount: 1,
          altTextCoverage: 100,
          blockingIssues: ['Deck ainda aguarda aprovação jurídica formal.'],
          accessibilityNotes: ['Revisar contraste da capa antes do envio final.'],
          legalAccuracyNotes: ['Validar a ementa principal na revisão jurídica final.'],
          warnings: ['Coerência multimodal em status review (73/100).'],
        },
      },
      exportHints: { aspectRatio: '16:9', preferredExport: 'pptx' },
    }))

    expect(parsed.kind).toBe('presentation_v2')
    if (parsed.kind !== 'presentation_v2') {
      throw new Error('expected presentation_v2 artifact')
    }

    expect(parsed.data.deck.schemaVersion).toBe('presentation_v2.1')
    expect(parsed.data.presentation.slides).toHaveLength(2)
    expect(parsed.data.presentation.slides[0].renderedImageUrl).toBe('https://storage.example/slide-1.png')
    expect(parsed.data.assets[0]).toMatchObject({ id: 'slide-1-render', status: 'stored' })
    expect(parsed.data.deck.quality?.multimodalAudit?.score).toBe(73)
    expect(parsed.data.deck.quality?.multimodalAudit?.slides?.[1]).toMatchObject({
      slideNumber: 2,
      missingAssetTypes: ['chart/diagram'],
    })
    expect(parsed.data.deck.quality?.exportReadiness).toMatchObject({
      score: 66,
      altTextCoverage: 100,
      blockingIssues: ['Deck ainda aguarda aprovação jurídica formal.'],
      legalAccuracyNotes: ['Validar a ementa principal na revisão jurídica final.'],
    })
    expect(parsed.data.qualityWarnings).toEqual(['Validar jurisprudência citada'])
  })

  it('merges slide assets with deck-level assets when persisted deck omits duplicated slide assets', () => {
    const parsed = parseArtifactContent('apresentacao_v2', JSON.stringify({
      schemaVersion: 'presentation_v2.1',
      title: 'Deck compacto',
      generationSpec: { request: 'Teste' },
      outline: { narrativeArc: 'Teste', sections: [] },
      theme: { name: 'Tema' },
      slides: [
        {
          id: 'slide-1',
          number: 1,
          title: 'Slide 1',
          layout: 'hero',
          bullets: ['Ponto 1'],
          speakerNotes: 'Notas',
          assets: [
            { id: 'slide-1-render', type: 'render', status: 'stored', url: 'https://storage.example/slide-1.png' },
          ],
        },
      ],
      assets: [
        { id: 'deck-audio-1', type: 'audio', status: 'stored', url: 'https://storage.example/deck-audio.mp3' },
      ],
    }))

    expect(parsed.kind).toBe('presentation_v2')
    if (parsed.kind !== 'presentation_v2') {
      throw new Error('expected presentation_v2 artifact')
    }

    expect(parsed.data.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'slide-1-render', type: 'render' }),
      expect.objectContaining({ id: 'deck-audio-1', type: 'audio' }),
    ]))
  })
})
