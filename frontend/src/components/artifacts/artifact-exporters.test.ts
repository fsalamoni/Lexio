// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedPresentationV2 } from './artifact-parsers'
import {
  buildPresentationV2AppendixReadinessLines,
  buildPresentationV2CoverNotes,
  buildPresentationV2SlideNotes,
  exportAsMarkdown,
  exportDataTableAsCSV,
  exportFileFromUrl,
  exportFlashcardsAsCSV,
  formatPresentationV2ExportStatusLabel,
  formatPresentationV2ExportGateLabel,
  formatPresentationV2StatusLabel,
  exportPresentationV2AsPptx,
  resolvePresentationV2SlideChrome,
  resolvePresentationV2PrimaryExportIssue,
  splitPresentationV2ExportReadinessMessages,
  summarizePresentationV2ExportReadiness,
  summarizePresentationV2DesignSystem,
} from './artifact-exporters'

const appendChildSpy = vi.spyOn(document.body, 'appendChild')
const removeChildSpy = vi.spyOn(document.body, 'removeChild')

describe('artifact-exporters', () => {
  let createObjectUrlMock: ReturnType<typeof vi.fn>
  let revokeObjectUrlMock: ReturnType<typeof vi.fn>
  let fetchMock: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    appendChildSpy.mockClear()
    removeChildSpy.mockClear()
    clickSpy = vi.fn()
    createObjectUrlMock = vi.fn().mockReturnValue('blob:lexio-test')
    revokeObjectUrlMock = vi.fn()
    fetchMock = vi.fn()

    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectUrlMock,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectUrlMock,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      configurable: true,
      writable: true,
    })

    appendChildSpy.mockImplementation((node: Node) => {
      if (node instanceof HTMLAnchorElement) {
        Object.defineProperty(node, 'click', { value: clickSpy, configurable: true })
      }
      return node
    })
    removeChildSpy.mockImplementation((node: Node) => node)
  })

  it('downloads markdown content with the expected filename', async () => {
    exportAsMarkdown('# Relatorio', 'meu-artefato')

    expect(createObjectUrlMock).toHaveBeenCalledTimes(1)
    const blob = createObjectUrlMock.mock.calls[0][0] as Blob
    expect(await blob.text()).toBe('# Relatorio')

    const anchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(anchor.download).toBe('meu-artefato.md')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:lexio-test')
  })

  it('exports structured CSV payloads for tables and flashcards', async () => {
    exportDataTableAsCSV({
      title: 'Tabela',
      columns: [
        { key: 'tema', label: 'Tema', align: 'left' },
        { key: 'valor', label: 'Valor', align: 'right' },
      ],
      rows: [{ tema: 'Receita', valor: '10,5' }],
    }, 'dados')

    exportFlashcardsAsCSV({
      title: 'Cards',
      categories: [
        {
          name: 'Civil',
          cards: [{ front: 'Pergunta', back: 'Resposta' }],
        },
      ],
    }, 'cards')

    const firstBlob = createObjectUrlMock.mock.calls[0][0] as Blob
    expect(await firstBlob.text()).toContain('"Tema","Valor"')
    expect(await firstBlob.text()).toContain('"Receita","10,5"')

    const secondBlob = createObjectUrlMock.mock.calls[1][0] as Blob
    expect(await secondBlob.text()).toContain('Front,Back,Tags')
    expect(await secondBlob.text()).toContain('"Pergunta","Resposta","Civil"')

    const downloads = appendChildSpy.mock.calls.map(([node]) => (node as HTMLAnchorElement).download)
    expect(downloads).toEqual(['dados.csv', 'cards_anki.csv'])
  })

  it('downloads a remote file using the MIME-derived extension', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['binary'], { type: 'audio/mpeg' }),
    } as Response)

    await exportFileFromUrl('https://example.com/audio', 'podcast', '.bin')

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/audio')
    const anchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(anchor.download).toBe('podcast.mp3')
  })

  it('downloads data URL files without using fetch', async () => {
    await exportFileFromUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E', 'slide', '.bin')

    expect(fetchMock).not.toHaveBeenCalled()
    const blob = createObjectUrlMock.mock.calls[0][0] as Blob
    expect(blob.type).toBe('image/svg+xml')
    expect(await blob.text()).toBe('<svg></svg>')
    const anchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(anchor.download).toBe('slide.bin')
  })

  it('summarizes the presentation v2 design system for downstream exports', () => {
    const summary = summarizePresentationV2DesignSystem({
      schemaVersion: 'presentation_v2.1',
      title: 'Deck v2',
      generationSpec: { request: 'Teste' },
      outline: { narrativeArc: 'Problema e decisão.', sections: [] },
      theme: {
        name: 'Lexio Premium',
        designSystem: {
          narrativeMode: 'linear-decisorio',
          surfaceStyle: 'Superfícies limpas',
          contrastStrategy: 'Contraste alto',
          accentStrategy: 'Acento teal',
          hierarchyRules: ['Uma tese por slide.'],
          layoutFamilies: [
            { id: 'hero', label: 'Hero / abertura', usage: 'Abrir seções', slideNumbers: [1] },
            { id: 'split', label: 'Split argumentativo', usage: 'Comparar opções', slideNumbers: [2, 3] },
          ],
        },
      },
      slides: [],
      assets: [],
    })

    expect(summary.narrativeMode).toBe('linear-decisorio')
    expect(summary.layoutFamilies).toEqual(['Hero / abertura (1)', 'Split argumentativo (2, 3)'])
    expect(summary.hierarchyRules).toEqual(['Uma tese por slide.'])
  })

  it('summarizes export readiness for accessibility and legal compliance in presentation v2', () => {
    const readiness = summarizePresentationV2ExportReadiness({
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck v2',
        generationSpec: { request: 'Teste' },
        outline: { narrativeArc: 'Problema e decisão.', sections: [] },
        theme: { name: 'Lexio Premium' },
        slides: [],
        assets: [],
        quality: {
          accessibility: ['Revisar contraste do slide 2 antes da exportação.'],
          legalAccuracyNotes: ['Validar a citação normativa do slide 4 na revisão final.'],
          multimodalAudit: { score: 68, status: 'review' },
        },
      },
      presentation: { title: 'Deck v2', slides: [] },
      assets: [
        {
          id: 'slide-1-render',
          type: 'render',
          status: 'stored',
          url: 'https://example.com/slide-1.png',
          altText: 'Visual final do slide 1',
        },
        {
          id: 'slide-2-chart',
          type: 'chart',
          status: 'stored',
          url: 'https://example.com/slide-2-chart.png',
        },
      ],
      qualityWarnings: [],
    })

    expect(readiness.status).toBe('critical')
    expect(readiness.canExportPptx).toBe(false)
    expect(readiness.altTextCoverage).toBe(50)
    expect(readiness.missingAltTextAssets).toEqual(['chart:slide-2-chart'])
    expect(readiness.blockingIssues).toEqual(expect.arrayContaining([
      expect.stringContaining('sem alt text validado'),
    ]))
    expect(readiness.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Coerência multimodal'),
      expect.stringContaining('sem alt text validado'),
      expect.stringContaining('Revisar contraste do slide 2'),
      expect.stringContaining('Validar a citação normativa do slide 4'),
    ]))
  })

  it('infers legal export blocking when analytical visuals have no source traceability', () => {
    const readiness = summarizePresentationV2ExportReadiness({
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck v2',
        generationSpec: {
          request: 'Teste',
          constraints: ['Linguagem sóbria'],
          sourcePriority: [],
        },
        outline: {
          narrativeArc: 'Problema e decisão.',
          sections: [{ id: 'section-1', title: 'Contexto', purpose: 'Abrir', slideNumbers: [1] }],
        },
        theme: { name: 'Lexio Premium' },
        slides: [
          {
            id: 'slide-1',
            number: 1,
            sectionId: 'section-1',
            title: 'Slide 1',
            layout: 'evidence',
            bullets: ['Ponto 1'],
            speakerNotes: 'Notas completas para exportação com amarração jurídica suficiente.',
            chartSpec: { type: 'bar' },
          },
        ],
        assets: [
          {
            id: 'slide-1-chart',
            type: 'chart',
            status: 'stored',
            url: 'https://example.com/chart-1.png',
            altText: 'Gráfico comparativo do risco contratual',
          },
        ],
        quality: {
          multimodalAudit: { score: 93, status: 'ok' },
          deckRubric: { score: 91, status: 'ok' },
          legalAccuracyNotes: [],
        },
      },
      presentation: {
        title: 'Deck v2',
        slides: [{ number: 1, title: 'Slide 1', bullets: ['Ponto 1'], speakerNotes: 'Notas completas para exportação com amarração jurídica suficiente.' }],
      },
      assets: [
        {
          id: 'slide-1-chart',
          type: 'chart',
          status: 'stored',
          url: 'https://example.com/chart-1.png',
          altText: 'Gráfico comparativo do risco contratual',
        },
      ],
      qualityWarnings: [],
    })

    expect(readiness.status).toBe('critical')
    expect(readiness.canExportPptx).toBe(false)
    expect(readiness.blockingIssues).toEqual([
      'Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.',
    ])
    expect(readiness.legalAccuracyNotes).toEqual(expect.arrayContaining([
      'Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.',
    ]))
  })

  it('normalizes stale snapshot metrics when the inferred audit is stricter', () => {
    const readiness = summarizePresentationV2ExportReadiness({
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck v2',
        generationSpec: {
          request: 'Teste',
          constraints: ['Visual sóbrio'],
          sourcePriority: ['Parecer interno'],
        },
        outline: {
          narrativeArc: 'Problema e decisão.',
          sections: [{ id: 'section-1', title: 'Contexto', purpose: 'Abrir', slideNumbers: [1] }],
        },
        theme: { name: 'Lexio Premium' },
        slides: [
          {
            id: 'slide-1',
            number: 1,
            sectionId: 'section-1',
            title: 'Slide 1',
            layout: 'hero',
            bullets: ['Ponto 1'],
            speakerNotes: 'Notas completas para sustentar a exportação final sem revisão adicional.',
          },
        ],
        assets: [],
        quality: {
          exportReadiness: {
            score: 96,
            status: 'ok',
            visualAssetCount: 0,
            altTextCoverage: 100,
            blockingIssues: [],
            missingAltTextAssets: [],
            accessibilityNotes: [],
            legalAccuracyNotes: [],
            warnings: [],
          },
        },
      },
      presentation: {
        title: 'Deck v2',
        slides: [{ number: 1, title: 'Slide 1', bullets: ['Ponto 1'], speakerNotes: 'Notas completas para sustentar a exportação final sem revisão adicional.' }],
      },
      assets: [
        {
          id: 'slide-1-render',
          type: 'render',
          status: 'stored',
          url: 'https://example.com/slide-1.png',
        },
      ],
      qualityWarnings: [],
    })

    expect(readiness.status).toBe('critical')
    expect(readiness.canExportPptx).toBe(false)
    expect(readiness.score).toBe(85)
    expect(readiness.visualAssetCount).toBe(1)
    expect(readiness.altTextCoverage).toBe(0)
    expect(readiness.missingAltTextAssets).toEqual(['render:slide-1-render'])
  })

  it('deduplicates operator-facing export readiness buckets for viewer and appendix surfaces', () => {
    const messages = splitPresentationV2ExportReadinessMessages({
      score: 72,
      status: 'critical',
      canExportPptx: false,
      visualAssetCount: 1,
      altTextCoverage: 0,
      missingAltTextAssets: ['render:slide-1-render'],
      blockingIssues: ['1 asset(s) visual(is) ainda sem alt text validado para exportação acessível.'],
      accessibilityNotes: [
        '1 asset(s) visual(is) ainda sem alt text validado para exportação acessível.',
        'Revisar contraste do slide 2 antes da exportação.',
      ],
      legalAccuracyNotes: [
        '1 asset(s) visual(is) ainda sem alt text validado para exportação acessível.',
        'Validar a citação normativa do slide 2 antes da circulação externa.',
      ],
      warnings: [
        '1 asset(s) visual(is) ainda sem alt text validado para exportação acessível.',
        'Revisar contraste do slide 2 antes da exportação.',
        'Validar a citação normativa do slide 2 antes da circulação externa.',
        'Rubrica do deck ainda exige reparos (84/100).',
      ],
    })

    expect(messages.blockingIssues).toEqual([
      '1 asset(s) visual(is) ainda sem alt text validado para exportação acessível.',
    ])
    expect(messages.accessibilityNotes).toEqual([
      'Revisar contraste do slide 2 antes da exportação.',
    ])
    expect(messages.legalAccuracyNotes).toEqual([
      'Validar a citação normativa do slide 2 antes da circulação externa.',
    ])
    expect(messages.warnings).toEqual([
      'Rubrica do deck ainda exige reparos (84/100).',
    ])
  })

  it('formats gate labels consistently across export surfaces', () => {
    expect(formatPresentationV2ExportGateLabel({
      score: 96,
      status: 'ok',
      canExportPptx: true,
      visualAssetCount: 0,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: [],
      legalAccuracyNotes: [],
      warnings: [],
    })).toBe('LIBERADO')

    expect(formatPresentationV2ExportGateLabel({
      score: 82,
      status: 'review',
      canExportPptx: true,
      visualAssetCount: 2,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: [],
      legalAccuracyNotes: [],
      warnings: ['Revisar contraste'],
    })).toBe('LIBERADO COM REVISÃO')

    expect(formatPresentationV2ExportGateLabel({
      score: 72,
      status: 'critical',
      canExportPptx: false,
      visualAssetCount: 2,
      altTextCoverage: 50,
      missingAltTextAssets: ['video:slide-2-video'],
      blockingIssues: ['Falta alt text'],
      accessibilityNotes: [],
      legalAccuracyNotes: [],
      warnings: ['Falta alt text'],
    })).toBe('BLOQUEADO')
  })

  it('formats localized status labels for viewer and export notes', () => {
    expect(formatPresentationV2StatusLabel('review', { okLabel: 'ok' })).toBe('em revisão')
    expect(formatPresentationV2StatusLabel('repair', { okLabel: 'ok' })).toBe('em reparo')
    expect(formatPresentationV2StatusLabel('critical', { okLabel: 'ok' })).toBe('crítico')
    expect(formatPresentationV2ExportStatusLabel({
      score: 78,
      status: 'review',
      canExportPptx: true,
      visualAssetCount: 2,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: [],
      legalAccuracyNotes: [],
      warnings: [],
    })).toBe('em revisão')
  })

  it('prioritizes accessibility and legal review issues over generic warnings', () => {
    expect(resolvePresentationV2PrimaryExportIssue({
      score: 81,
      status: 'review',
      canExportPptx: true,
      visualAssetCount: 2,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: ['Revisar contraste do slide 2 antes da exportação.'],
      legalAccuracyNotes: ['Validar a citação normativa do slide 2 antes da circulação externa.'],
      warnings: ['Rubrica do deck ainda exige reparos (89/100).'],
    })).toBe('Revisar contraste do slide 2 antes da exportação.')
  })

  it('ignores non-actionable accessibility notes when resolving the primary export issue', () => {
    expect(resolvePresentationV2PrimaryExportIssue({
      score: 78,
      status: 'review',
      canExportPptx: true,
      visualAssetCount: 6,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: ['Sem texto embutido em imagens criticas', 'Contraste alto', 'Paleta com apoio textual', 'Titulos curtos'],
      legalAccuracyNotes: ['Conteudo ficticio para smoke test local.'],
      warnings: ['Coerência multimodal ainda exige revisão (72/100).', 'Rubrica do deck ainda exige reparos (87/100).'],
    })).toBe('Coerência multimodal ainda exige revisão (72/100).')
  })

  it('blocks direct presentation v2 PPTX export calls when readiness is critical', async () => {
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck v2',
        generationSpec: {
          request: 'Teste',
          constraints: ['Linguagem sobria'],
          sourcePriority: [],
        },
        outline: {
          narrativeArc: 'Problema e decisao.',
          sections: [{ id: 'section-1', title: 'Contexto', purpose: 'Abrir', slideNumbers: [1] }],
        },
        theme: { name: 'Lexio Premium' },
        slides: [
          {
            id: 'slide-1',
            number: 1,
            sectionId: 'section-1',
            title: 'Slide 1',
            layout: 'evidence',
            bullets: ['Ponto 1'],
            speakerNotes: 'Notas completas para exportacao com amarracao juridica suficiente.',
            chartSpec: { type: 'bar' },
          },
        ],
        assets: [
          {
            id: 'slide-1-chart',
            type: 'chart',
            status: 'stored',
            url: 'https://example.com/chart-1.png',
            altText: 'Grafico comparativo do risco contratual',
          },
        ],
        quality: {
          multimodalAudit: { score: 93, status: 'ok' },
          deckRubric: { score: 91, status: 'ok' },
          legalAccuracyNotes: [],
        },
      },
      presentation: {
        title: 'Deck v2',
        slides: [{ number: 1, title: 'Slide 1', bullets: ['Ponto 1'], speakerNotes: 'Notas completas para exportacao com amarracao juridica suficiente.' }],
      },
      assets: [
        {
          id: 'slide-1-chart',
          type: 'chart',
          status: 'stored',
          url: 'https://example.com/chart-1.png',
          altText: 'Grafico comparativo do risco contratual',
        },
      ],
      qualityWarnings: [],
    }

    await expect(exportPresentationV2AsPptx(data, 'deck-v2')).rejects.toThrow(
      'Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.',
    )
  })

  it('builds PPTX manifesto notes with gate status and contractual traceability', () => {
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck v2',
        generationSpec: {
          request: 'Teste',
          objective: 'Aprovar estratégia de audiência',
          audience: 'Diretoria jurídica',
          durationMinutes: 12,
          constraints: ['Não expor dados pessoais', 'Visual sóbrio'],
          sourcePriority: ['Parecer interno', 'Matriz de risco'],
        },
        outline: {
          narrativeArc: 'Problema, tese e decisão.',
          sections: [{ id: 'section-1', title: 'Contexto', purpose: 'Abrir o caso', slideNumbers: [1] }],
        },
        theme: {
          name: 'Lexio Premium',
          designSystem: {
            narrativeMode: 'linear-decisorio',
            surfaceStyle: 'Superfícies limpas',
            contrastStrategy: 'Contraste alto',
            accentStrategy: 'Acento teal',
            hierarchyRules: ['Uma tese por slide.'],
            layoutFamilies: [{ id: 'hero', label: 'Hero / abertura', slideNumbers: [1] }],
          },
        },
        slides: [
          {
            id: 'slide-1',
            number: 1,
            sectionId: 'section-1',
            title: 'Slide 1',
            purpose: 'Abrir a tese do caso.',
            layout: 'hero',
            bullets: ['Ponto 1'],
            speakerNotes: 'Notas completas sobre a tese do caso e o próximo passo.',
            transition: 'Migrar para os riscos objetivos.',
            visualBrief: 'Abrir com visual institucional.',
            designNotes: ['Hierarchy forte', 'Uma mensagem principal'],
            assets: [
              {
                id: 'slide-1-render',
                type: 'render',
                status: 'stored',
                url: 'https://example.com/slide-1.png',
                altText: 'Visual final do slide 1',
                qualityWarnings: ['Revisar legenda secundária.'],
              },
            ],
          },
        ],
        assets: [
          {
            id: 'slide-1-render',
            type: 'render',
            status: 'stored',
            url: 'https://example.com/slide-1.png',
            altText: 'Visual final do slide 1',
          },
        ],
        quality: {
          deckRubric: { score: 89, status: 'repair' },
        },
      },
      presentation: {
        title: 'Deck v2',
        slides: [{ number: 1, title: 'Slide 1', bullets: ['Ponto 1'], speakerNotes: 'Notas completas sobre a tese do caso e o próximo passo.' }],
      },
      assets: [
        {
          id: 'slide-1-render',
          type: 'render',
          status: 'stored',
          url: 'https://example.com/slide-1.png',
          altText: 'Visual final do slide 1',
        },
      ],
      qualityWarnings: [],
    }

    const designSummary = summarizePresentationV2DesignSystem(data.deck)
    const exportReadiness = {
      score: 78,
      status: 'review' as const,
      canExportPptx: true,
      visualAssetCount: 1,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: ['Revisar contraste da capa.'],
      legalAccuracyNotes: ['Validar a citação normativa final.'],
      warnings: ['Rubrica do deck ainda exige reparos (89/100).'],
    }

    const coverNotes = buildPresentationV2CoverNotes(data, designSummary, exportReadiness)
    const slideNotes = buildPresentationV2SlideNotes({ data, slideNumber: 1, exportReadiness })
    const appendixLines = buildPresentationV2AppendixReadinessLines(data, designSummary, exportReadiness)

    expect(coverNotes).toContain('Modo narrativo: linear-decisorio')
    expect(coverNotes).toContain('Estilo de superfície: Superfícies limpas')
    expect(coverNotes).toContain('Estratégia de contraste: Contraste alto')
    expect(coverNotes).toContain('Famílias de layout: Hero / abertura (1)')
    expect(coverNotes).toContain('Gate de exportação: LIBERADO COM REVISÃO')
    expect(coverNotes).toContain('Pendência prioritária: Revisar contraste da capa.')
    expect(coverNotes).toContain('Fontes prioritárias: Parecer interno | Matriz de risco')
    expect(coverNotes).toContain('Restrições institucionais: Não expor dados pessoais | Visual sóbrio')

    expect(slideNotes).toContain('Gate do deck: LIBERADO COM REVISÃO')
    expect(slideNotes).toContain('Pendência prioritária do deck: Revisar contraste da capa.')
    expect(slideNotes).toContain('Seção: Contexto — Abrir o caso')
    expect(slideNotes).toContain('Fontes prioritárias do deck: Parecer interno | Matriz de risco')
    expect(slideNotes).toContain('Restrições institucionais do deck: Não expor dados pessoais | Visual sóbrio')
    expect(slideNotes).toContain('[render/stored] | alt: Visual final do slide 1 | aviso: Revisar legenda secundária.')

    expect(appendixLines).toEqual(expect.arrayContaining([
      'Status de exportação: em revisão',
      'Gate operacional: liberado com revisão',
      'Pendência prioritária: Revisar contraste da capa.',
      'Conformidade jurídica: Validar a citação normativa final.',
      'Fontes prioritárias: Parecer interno | Matriz de risco',
      'Restrições institucionais: Não expor dados pessoais | Visual sóbrio',
      'Rubrica do deck: 89/100 (em reparo)',
    ]))
    expect(appendixLines).not.toContain('Acessibilidade: Revisar contraste da capa.')
    expect(appendixLines.filter(line => line.includes('Revisar contraste da capa.'))).toHaveLength(1)
  })

  it('resolves distinct slide chrome geometry for different layout families', () => {
    const hero = resolvePresentationV2SlideChrome('hero')
    const split = resolvePresentationV2SlideChrome('split')
    const evidence = resolvePresentationV2SlideChrome('evidence')

    expect(hero.contentPanel.w).toBeLessThan(split.contentPanel.w)
    expect(evidence.sidePanel.w).toBeGreaterThan(split.sidePanel.w)
    expect(hero.title.fontSize).toBeGreaterThan(split.title.fontSize)
  })
})