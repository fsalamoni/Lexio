// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { PresentationV2Deck } from '../../lib/firestore-types'
import { buildPresentationV2BriefingSeedFromDeck } from './presentation-v2-briefing-seed'

function makeDeck(overrides: Partial<PresentationV2Deck> = {}): PresentationV2Deck {
  return {
    schemaVersion: 'presentation_v2.1',
    title: 'Deck de tese jurídica',
    generationSpec: {
      request: 'Gere uma apresentação v2 sobre a tese principal.',
      objective: 'Convencer a banca sobre a viabilidade da tese.',
      audience: 'Diretoria jurídica',
      slideCount: 3,
      depth: 'profunda',
      durationMinutes: 12,
      tone: 'institucional',
      visualStyle: 'editorial',
      outputFormat: 'pptx',
      multimodal: {
        images: true,
        audio: false,
        video: false,
        charts: true,
        diagrams: true,
      },
      constraints: ['Preservar nomenclatura do cliente.'],
      sourcePriority: ['Acórdão principal', 'Nota técnica'],
      clarifications: [
        {
          id: 'success',
          question: 'Qual é o critério de sucesso?',
          answer: 'A apresentação deve sustentar a decisão executiva.',
          category: 'content',
        },
      ],
    },
    outline: {
      narrativeArc: 'Problema, tese, prova, decisão',
      sections: [],
    },
    theme: {
      name: 'Lexio executivo',
      mood: 'sóbrio',
      accessibilityNotes: ['Manter contraste AA.'],
    },
    slides: [
      {
        id: 'slide-1',
        number: 1,
        title: 'Contexto decisório',
        layout: 'title-content',
        bullets: ['Contexto'],
        speakerNotes: 'Introdução',
      },
      {
        id: 'slide-2',
        number: 2,
        title: 'Tese central',
        layout: 'content',
        bullets: ['Tese'],
        speakerNotes: 'Tese',
      },
      {
        id: 'slide-3',
        number: 3,
        title: 'Decisão recomendada',
        layout: 'closing',
        bullets: ['Decisão'],
        speakerNotes: 'Fechamento',
      },
    ],
    assets: [],
    ...overrides,
  }
}

describe('buildPresentationV2BriefingSeedFromDeck', () => {
  it('injects manifest repair focus into regenerate briefing seeds', () => {
    const deck = makeDeck({
      quality: {
        deckRubric: {
          score: 73,
          status: 'repair',
          repairableSlides: [2],
          warnings: ['Narrativa ainda salta da tese para a conclusão.'],
        },
        slideRubric: [
          {
            slideNumber: 2,
            score: 61,
            status: 'repair',
            warnings: ['A fala não fecha a ponte lógica.'],
            repairHints: ['Reescreva a transição para explicitar o fundamento jurídico.'],
            recommendedAgents: ['presentation_v2_slide_writer', 'presentation_v2_content_architect'],
            categories: [],
          },
        ],
        multimodalAudit: {
          score: 78,
          status: 'review',
          slides: [
            {
              slideNumber: 2,
              score: 74,
              status: 'review',
              warnings: ['A visualização não conversa com a fala.'],
            },
          ],
        },
        exportReadiness: {
          score: 82,
          status: 'review',
          warnings: ['Rubrica pendente antes do PPTX final.'],
          accessibilityNotes: ['Confirmar contraste do slide 2.'],
          legalAccuracyNotes: ['Conferir ementa citada no slide 2.'],
        },
      },
      revisionHistory: [
        {
          at: '2026-05-14T20:30:00.000Z',
          agent: 'presentation_v2_reviewer',
          repairAgent: 'presentation_v2_slide_writer',
          repairKind: 'speaker_notes',
          slideNumbers: [2],
          summary: 'Reparo anterior melhorou a tese, mas manteve a transição fraca.',
        },
      ],
    })

    const seed = buildPresentationV2BriefingSeedFromDeck(deck)
    const repairAnswer = seed.clarificationAnswers.find((entry) => entry.id === 'presentation-v2-regenerate-repair-focus')

    expect(seed.constraints).toContain('Preservar nomenclatura do cliente.')
    expect(seed.constraints).toContain('Foco de reparo desta regeneração')
    expect(seed.constraints).toContain('Rubrica atual do deck: 73/100 (repair).')
    expect(seed.constraints).toContain('Slide 2 (Tese central): rubrica 61/100; multimodal 74/100.')
    expect(seed.constraints).toContain('Agentes sugeridos para Slide 2 (Tese central): Redator de Slides, Arquiteto de Conteúdo.')
    expect(seed.constraints).toContain('Gate de exportação: Confirmar contraste do slide 2.')
    expect(seed.constraints).toContain('Última intervenção registrada: Reparo anterior melhorou a tese, mas manteve a transição fraca.')
    expect(repairAnswer?.category).toBe('constraints')
    expect(repairAnswer?.answer).toContain('Foco de reparo desta regeneração')
    expect(seed.successCriteria).toBe('A apresentação deve sustentar a decisão executiva.')
    expect(seed.mediaRequirements.audio).toBe('disabled')
    expect(seed.mediaRequirements.images).toBe('optional')
  })

  it('uses repair focus as success criteria when the original deck did not define one', () => {
    const deck = makeDeck({
      generationSpec: {
        ...makeDeck().generationSpec,
        clarifications: [],
      },
      quality: {
        exportReadiness: {
          status: 'critical',
          blockingIssues: ['Falta evidência jurídica essencial no slide final.'],
        },
      },
    })

    const seed = buildPresentationV2BriefingSeedFromDeck(deck)

    expect(seed.successCriteria).toBe('Regeneração deve resolver as pendências priorizadas no manifesto atual sem descaracterizar o deck aprovado.')
    expect(seed.constraints).toContain('Gate de exportação: Falta evidência jurídica essencial no slide final.')
  })

  it('prioritizes a slide selected from the operator queue in the regenerate seed', () => {
    const seed = buildPresentationV2BriefingSeedFromDeck(makeDeck(), {
      focusSlideNumber: 3,
      focusAction: 'visual',
      focusReason: 'Operador pediu reparo visual a partir da fila operacional.',
    })
    const repairAnswer = seed.clarificationAnswers.find((entry) => entry.id === 'presentation-v2-regenerate-repair-focus')

    expect(seed.constraints).toContain('Comando do operador: priorize o Slide 3 (reparo visual/materializacao de assets).')
    expect(seed.constraints).toContain('Motivo do operador para o Slide 3: Operador pediu reparo visual a partir da fila operacional.')
    expect(seed.constraints).toContain('Slide 3 (Decisão recomendada): reparo recomendado pelo manifesto atual.')
    expect(repairAnswer?.answer).toContain('Comando do operador: priorize o Slide 3')
  })
})