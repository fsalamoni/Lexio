import { describe, expect, it } from 'vitest'

import type { PresentationV2Deck } from './firestore-types'
import { evaluatePresentationV2Quality } from './quality-evaluator'

function buildDeck(overrides: Partial<PresentationV2Deck> = {}): PresentationV2Deck {
  return {
    schemaVersion: 'presentation_v2.1',
    title: 'Estratégia de audiência',
    generationSpec: {
      request: 'Construir apresentação para aprovação da estratégia final.',
      objective: 'Obter aprovação da diretoria para a estratégia final do caso.',
      audience: 'Diretoria jurídica',
      slideCount: 2,
      depth: 'profunda',
      durationMinutes: 12,
      outputFormat: 'pptx',
      multimodal: { images: true, charts: true },
      constraints: ['Linguagem sóbria'],
      sourcePriority: ['Parecer interno', 'Matriz de risco'],
    },
    outline: {
      narrativeArc: 'Problema, tese e decisão.',
      sections: [
        { id: 'section-1', title: 'Contexto', purpose: 'Abrir a tese', slideNumbers: [1] },
        { id: 'section-2', title: 'Decisão', purpose: 'Fechar a recomendação', slideNumbers: [2] },
      ],
    },
    theme: {
      name: 'Lexio Premium',
      mood: 'institucional',
      palette: ['#0F172A', '#CBD5E1', '#0EA5E9'],
      layoutPrinciples: ['hierarquia clara', 'alto contraste'],
    },
    slides: [
      {
        id: 'slide-1',
        number: 1,
        sectionId: 'section-1',
        title: 'Janela de decisão',
        purpose: 'Abrir a tese principal.',
        layout: 'hero-left',
        bullets: [
          'O caso entrou em janela crítica de negociação com risco financeiro relevante.',
          'A tese escolhida reduz exposição sem sacrificar margem de acordo.',
          'A diretoria precisa decidir hoje sobre a linha final de audiência.',
        ],
        speakerNotes: 'Abrir pela urgência decisória, explicando por que a estratégia proposta concentra o melhor equilíbrio entre risco, custo e viabilidade negocial. Preparar a ponte para os fundamentos do slide seguinte.',
        transition: 'Na sequência, mostramos por que a tese é a opção com melhor relação risco-retorno.',
        visualBrief: 'Mesa executiva com documentos estratégicos e atmosfera institucional.',
        designNotes: ['Contraste alto', 'Título com peso editorial'],
      },
      {
        id: 'slide-2',
        number: 2,
        sectionId: 'section-2',
        title: 'Tese com melhor relação risco-retorno',
        purpose: 'Fechar a recomendação para aprovação.',
        layout: 'two-column-argument',
        bullets: [
          'A matriz compara custo provável, risco reputacional e tempo processual em três cenários.',
          'O cenário recomendado preserva caixa, reduz incerteza e sustenta narrativa consistente em audiência.',
          'A decisão pedida é autorizar a rodada final de negociação com parâmetros claros.',
        ],
        speakerNotes: 'Concluir a recomendação destacando a superioridade do cenário indicado, os custos evitados e a necessidade de decisão imediata da diretoria jurídica para a rodada final.',
        transition: 'Encerramos com a decisão pedida e os próximos passos imediatos.',
        visualBrief: 'Matriz comparativa sóbria com destaque do cenário recomendado.',
        designNotes: ['Comparativo limpo', 'Ênfase na decisão final'],
        chartSpec: { type: 'matrix', x: 'risco', y: 'retorno' },
        assets: [{ id: 'slide-2-chart', type: 'chart', status: 'planned', altText: 'Matriz risco-retorno' }],
      },
    ],
    assets: [{ id: 'slide-2-chart', type: 'chart', status: 'planned', altText: 'Matriz risco-retorno' }],
    quality: {},
    exportHints: { aspectRatio: '16:9', preferredExport: 'pptx', includeSpeakerNotes: true, useRenderedSlideFallback: true },
    revisionHistory: [],
    ...overrides,
  }
}

describe('evaluatePresentationV2Quality', () => {
  it('scores a complete premium deck above the repair threshold', () => {
    const result = evaluatePresentationV2Quality(buildDeck())

    expect(result.score).toBeGreaterThanOrEqual(82)
    expect(result.status).toBe('ok')
    expect(result.repairableSlides).toEqual([])
  })

  it('flags weak slides and recommends selective repair agents', () => {
    const weakDeck = buildDeck({
      slides: [
        {
          id: 'slide-1',
          number: 1,
          sectionId: '',
          title: 'Slide 1',
          purpose: '',
          layout: 'default',
          bullets: [
            'Mesmo argumento repetido.',
            'Mesmo argumento repetido.',
            'Mesmo argumento repetido.',
            'Mesmo argumento repetido.',
            'Mesmo argumento repetido.',
            'Mesmo argumento repetido.',
          ],
          speakerNotes: 'Breve.',
          transition: '',
          visualBrief: '',
          designNotes: [],
          assets: [{ id: 'slide-1-chart', type: 'chart', status: 'planned' }],
        },
      ],
      assets: [{ id: 'slide-1-chart', type: 'chart', status: 'planned' }],
      outline: {
        narrativeArc: 'Problema e decisão.',
        sections: [{ id: 'section-1', title: 'Contexto', purpose: 'Abrir tese', slideNumbers: [1] }],
      },
    })

    const result = evaluatePresentationV2Quality(weakDeck)
    const slide = result.slideRubric[0]

    expect(result.status).toBe('critical')
    expect(result.repairableSlides).toEqual([1])
    expect(slide.score).toBeLessThan(74)
    expect(slide.recommendedAgents).toEqual(expect.arrayContaining([
      'presentation_v2_slide_writer',
      'presentation_v2_content_architect',
      'presentation_v2_visual_director',
      'presentation_v2_data_diagrammer',
    ]))
    expect(slide.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Clareza'),
    ]))
    expect(slide.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'narrative_consistency', score: expect.any(Number) }),
    ]))
    expect(slide.categories.find(category => category.key === 'narrative_consistency')?.score).toBeLessThan(80)
  })
})