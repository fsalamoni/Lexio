// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ParsedPresentationV2 } from './artifact-parsers'
import PresentationV2Viewer from './PresentationV2Viewer'

vi.mock('./PresentationViewer', () => ({
  default: () => <div data-testid="presentation-viewer" />,
}))

vi.mock('./artifact-exporters', async () => {
  const actual = await vi.importActual<typeof import('./artifact-exporters')>('./artifact-exporters')
  return actual
})

afterEach(() => {
  cleanup()
})

describe('PresentationV2Viewer', () => {
  it('renders the design bible and repair-loop summary from the deck manifesto', () => {
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Estratégia de audiência',
        subtitle: 'Aprovação executiva',
        generationSpec: {
          request: 'Aprovar a estratégia final.',
          objective: 'Obter aprovação da diretoria.',
          audience: 'Diretoria jurídica',
          slideCount: 2,
          depth: 'profunda',
          durationMinutes: 12,
          language: 'pt-BR',
          constraints: ['Não expor dados pessoais', 'Visual de reunião executiva'],
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
          palette: ['#0F172A', '#FFFFFF', '#0EA5E9'],
          layoutPrinciples: ['Hierarquia clara'],
          designSystem: {
            narrativeMode: 'linear-decisorio',
            surfaceStyle: 'Superfícies limpas e institucionais.',
            contrastStrategy: 'Contraste alto entre títulos e fundo.',
            accentStrategy: 'Usar azul para chamadas de decisão.',
            hierarchyRules: ['Uma tese por slide.', 'Até 5 bullets por slide.'],
            layoutFamilies: [
              { id: 'hero', label: 'Hero / abertura', usage: 'Abrir seções', slideNumbers: [1] },
              { id: 'split', label: 'Split argumentativo', usage: 'Comparar argumentos', slideNumbers: [2] },
            ],
          },
        },
        slides: [
          { id: 'slide-1', number: 1, sectionId: 'section-1', title: 'Janela de decisão', layout: 'hero-left', bullets: ['Ponto 1'], speakerNotes: 'Nota 1' },
          { id: 'slide-2', number: 2, sectionId: 'section-2', title: 'Decisão recomendada', layout: 'two-column-argument', bullets: ['Ponto 2'], speakerNotes: 'Nota 2' },
        ],
        assets: [
          {
            id: 'slide-1-render',
            type: 'render',
            status: 'stored',
            model: 'demo/image-model',
            url: 'https://example.com/slide-1.png',
            mimeType: 'image/png',
            altText: 'Visual final do slide 1',
            qualityScore: 86,
            qualityWarnings: ['Brief visual específico ausente; a imagem pode sair genérica.'],
            retryCount: 1,
          },
          {
            id: 'deck-narration-audio',
            type: 'audio',
            status: 'stored',
            model: 'demo/tts-model',
            url: 'https://example.com/narracao.mp3',
            mimeType: 'audio/mpeg',
            altText: 'Narração completa da apresentação',
            qualityScore: 71,
            qualityWarnings: ['Duração estimada da narração ficou muito distante do tempo-alvo do deck.'],
          },
          {
            id: 'slide-2-video',
            type: 'video',
            status: 'stored',
            model: 'external/demo-video',
            url: 'https://example.com/slide-2.mp4',
            mimeType: 'video/mp4',
            altText: 'Clipe do slide 2',
            qualityScore: 68,
            qualityWarnings: ['Clipe gerado por fallback de cobertura, sem asset de vídeo explicitamente planejado no manifesto.'],
          },
        ],
        quality: {
          score: 88,
          warnings: ['Slide 1 ainda pede ajuste fino.'],
          accessibility: ['Revisar contraste do slide 2 antes da exportação.'],
          legalAccuracyNotes: ['Validar a citação normativa do slide 2 antes da circulação externa.'],
          deckRubric: { score: 84, status: 'repair', repairableSlides: [1] },
          slideRubric: [
            {
              slideNumber: 1,
              score: 78,
              status: 'repair',
              warnings: ['Slide 1 ainda precisa de uma tese visual mais específica.'],
              repairHints: ['Amarrar melhor o visual à tese central e ao lastro documental.'],
              recommendedAgents: ['presentation_v2_slide_writer'],
              categories: [],
            },
            {
              slideNumber: 2,
              score: 64,
              status: 'review',
              warnings: ['Revisar a costura entre a fala e o apoio visual do slide 2.'],
              repairHints: ['Priorizar um reparo parcial focado na coerência entre o clipe e a argumentação.'],
              recommendedAgents: ['presentation_v2_image_generator', 'presentation_v2_visual_director'],
              categories: [],
            },
          ],
          multimodalAudit: {
            score: 69,
            status: 'review',
            strengths: ['Deck já possui narração final persistida.'],
            warnings: ['Slides 2 ainda sem gráfico/diagrama planejado materializado.'],
            auditedAssetTypes: ['render', 'audio', 'video'],
            slides: [
              { slideNumber: 1, score: 78, status: 'ok', strengths: ['Slide 1 já possui visual final materializado.'], availableAssetTypes: ['render'] },
              { slideNumber: 2, score: 61, status: 'review', warnings: ['Slide 2 ainda não materializou o apoio analítico planejado (gráfico/diagrama).'], availableAssetTypes: ['render', 'video'] },
            ],
          },
          exportReadiness: {
            score: 64,
            status: 'review',
            visualAssetCount: 2,
            altTextCoverage: 50,
            blockingIssues: [],
            missingAltTextAssets: ['video:slide-2-video'],
            accessibilityNotes: ['Revisar contraste do slide 2 antes da exportação.'],
            legalAccuracyNotes: ['Validar a citação normativa do slide 2 antes da circulação externa.'],
            warnings: ['1 asset visual ainda sem alt text validado para exportação acessível.'],
          },
          repairSummary: ['Slide 1: reparo seletivo aplicado por presentation_v2_slide_writer.'],
        },
        revisionHistory: [
          {
            at: '2026-05-12T08:00:00.000Z',
            agent: 'presentation_v2_image_generator',
            summary: 'Critic de imagem indicou uma regeneração guiada para o slide 2.',
            repairKind: 'selective_repair',
            repairAgent: 'presentation_v2_image_generator',
            slideNumbers: [2],
          },
        ],
      },
      presentation: {
        title: 'Estratégia de audiência',
        slides: [
          { number: 1, title: 'Janela de decisão', bullets: ['Ponto 1'], speakerNotes: 'Nota 1' },
          { number: 2, title: 'Decisão recomendada', bullets: ['Ponto 2'], speakerNotes: 'Nota 2' },
        ],
      },
      assets: [
        {
          id: 'slide-1-render',
          type: 'render',
          status: 'stored',
          model: 'demo/image-model',
          url: 'https://example.com/slide-1.png',
          mimeType: 'image/png',
          altText: 'Visual final do slide 1',
          qualityScore: 86,
          qualityWarnings: ['Brief visual específico ausente; a imagem pode sair genérica.'],
          retryCount: 1,
        },
        {
          id: 'deck-narration-audio',
          type: 'audio',
          status: 'stored',
          model: 'demo/tts-model',
          url: 'https://example.com/narracao.mp3',
          mimeType: 'audio/mpeg',
          altText: 'Narração completa da apresentação',
          qualityScore: 71,
          qualityWarnings: ['Duração estimada da narração ficou muito distante do tempo-alvo do deck.'],
        },
        {
          id: 'slide-2-video',
          type: 'video',
          status: 'stored',
          model: 'external/demo-video',
          url: 'https://example.com/slide-2.mp4',
          mimeType: 'video/mp4',
          altText: 'Clipe do slide 2',
          qualityScore: 68,
          qualityWarnings: ['Clipe gerado por fallback de cobertura, sem asset de vídeo explicitamente planejado no manifesto.'],
        },
      ],
      qualityWarnings: ['Slide 1 ainda pede ajuste fino.'],
    }

    render(<PresentationV2Viewer data={data} />)

    expect(screen.getByText('Bíblia visual: linear-decisorio')).toBeTruthy()
    expect(screen.getByText('Famílias de layout')).toBeTruthy()
    expect(screen.getByText('Hero / abertura')).toBeTruthy()
    expect(screen.getByText('Rubrica do deck')).toBeTruthy()
    expect(screen.getAllByText(/84\/100/).length).toBeGreaterThan(0)
    expect(screen.getByText('em reparo · reparos sugeridos nos slides 1')).toBeTruthy()
    expect(screen.getByText('Ciclo de reparo')).toBeTruthy()
    expect(screen.getByText('Fila operacional')).toBeTruthy()
    expect(screen.getByText(/Slides priorizados para revisão seletiva e reparo parcial/)).toBeTruthy()
    expect(screen.getByText('Crítica visual')).toBeTruthy()
    expect(screen.getByText('Coerência multimodal')).toBeTruthy()
    expect(screen.getByText('Prontidão de exportação')).toBeTruthy()
    expect(screen.getByText(/em revisão .*2 slide\(s\) auditado\(s\)/)).toBeTruthy()
    expect(screen.getByText('em revisão · visual, narração, clipe · 2 slide(s) auditado(s).')).toBeTruthy()
    expect(screen.getByText('slide 2 · em revisão · 61/100')).toBeTruthy()
    expect(screen.getByText(/em revisão .*alt text 50% .*2 asset\(s\) visual\(is\) auditado\(s\)/)).toBeTruthy()
    expect(screen.getAllByText(/86\/100/).length).toBeGreaterThan(0)
    expect(screen.getByText('1 retry(s)')).toBeTruthy()
    expect(screen.getByText('Visuais gerados')).toBeTruthy()
    expect(screen.getByText('Narração')).toBeTruthy()
    expect(screen.getByText('Clipes')).toBeTruthy()
    expect(screen.getByText('Narração completa da apresentação')).toBeTruthy()
    expect(screen.getByText('Clipe do slide 2')).toBeTruthy()
    expect(screen.getAllByText('Duração estimada da narração ficou muito distante do tempo-alvo do deck.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Clipe gerado por fallback de cobertura, sem asset de vídeo explicitamente planejado no manifesto.').length).toBeGreaterThan(0)
    expect(screen.getByText('Slides 2 ainda sem gráfico/diagrama planejado materializado.')).toBeTruthy()
    expect(screen.getByText('1 asset visual ainda sem alt text validado para exportação acessível.')).toBeTruthy()
    expect(screen.getByText('Gate operacional')).toBeTruthy()
    expect(screen.getByText('liberado com revisão')).toBeTruthy()
    expect(screen.getByText('Pendência prioritária: Revisar contraste do slide 2 antes da exportação.')).toBeTruthy()
    expect(screen.getAllByText(/Revisar contraste do slide 2 antes da exportação\./).length).toBe(1)
    expect(screen.getByText('Acessibilidade')).toBeTruthy()
    expect(screen.getByText('Conformidade jurídica')).toBeTruthy()
    expect(screen.getByText('Fontes prioritárias')).toBeTruthy()
    expect(screen.getByText('Parecer interno')).toBeTruthy()
    expect(screen.getByText('Matriz de risco')).toBeTruthy()
    expect(screen.getByText('Restrições institucionais')).toBeTruthy()
    expect(screen.getByText('Não expor dados pessoais')).toBeTruthy()
    expect(screen.getByText('Visual de reunião executiva')).toBeTruthy()
    expect(screen.getByText('Validar a citação normativa do slide 2 antes da circulação externa.')).toBeTruthy()
    expect(screen.getByText('Slide 1: reparo seletivo aplicado por redator de slides.')).toBeTruthy()
    expect(screen.getAllByText('Ajustes sugeridos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Agentes sugeridos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Assets já presentes').length).toBeGreaterThan(0)
    expect(screen.getByText('Última intervenção')).toBeTruthy()
    expect(screen.getByText('Redator de slides')).toBeTruthy()
    expect(screen.getAllByText('Gerador de imagens').length).toBeGreaterThan(0)
    expect(screen.getByText('Diretor visual')).toBeTruthy()
    expect(screen.getByText('visual, clipe')).toBeTruthy()
    expect(screen.getByText('Gerador de imagens · crítica visual indicou uma regeneração guiada para o slide 2.')).toBeTruthy()
    expect(screen.queryByText(/presentation_v2_slide_writer/)).toBeNull()
    expect(screen.queryByText(/Critic de imagem/)).toBeNull()
    expect(screen.getAllByText('Brief visual específico ausente; a imagem pode sair genérica.').length).toBeGreaterThan(0)
    expect(screen.getByTestId('presentation-viewer')).toBeTruthy()
  })

  it('turns operational queue findings into actionable repair controls', () => {
    const onRegenerate = vi.fn()
    const onGenerateImage = vi.fn()
    const onGenerateAudio = vi.fn()
    const onGenerateVideo = vi.fn()
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck com fila acionável',
        generationSpec: {
          request: 'Preparar briefing executivo.',
          constraints: ['Visual institucional'],
          sourcePriority: ['Memorando interno'],
        },
        outline: {
          narrativeArc: 'Contexto, prova e decisão.',
          sections: [{ id: 'section-1', title: 'Contexto', purpose: 'Abrir', slideNumbers: [1, 2] }],
        },
        theme: {
          name: 'Lexio Premium',
        },
        slides: [
          { id: 'slide-1', number: 1, sectionId: 'section-1', title: 'Tese central', layout: 'hero', bullets: ['Ponto 1'], speakerNotes: 'Notas ainda genéricas.' },
          { id: 'slide-2', number: 2, sectionId: 'section-1', title: 'Prova visual', layout: 'evidence', bullets: ['Ponto 2'], speakerNotes: 'Notas completas para o slide.' },
        ],
        assets: [],
        quality: {
          deckRubric: { score: 66, status: 'repair', repairableSlides: [1, 2] },
          slideRubric: [
            {
              slideNumber: 1,
              score: 59,
              status: 'repair',
              warnings: ['Speaker notes do slide 1 ainda precisam de estrutura decisória.'],
              repairHints: ['Reescrever a fala com tese, prova e fechamento.'],
              recommendedAgents: ['presentation_v2_slide_writer'],
              categories: [],
            },
            {
              slideNumber: 2,
              score: 61,
              status: 'review',
              warnings: ['Apoio visual do slide 2 ainda está genérico.'],
              repairHints: ['Gerar visual e clipe alinhados à prova documental.'],
              recommendedAgents: ['presentation_v2_visual_director', 'presentation_v2_image_generator'],
              categories: [],
            },
          ],
          multimodalAudit: {
            score: 58,
            status: 'review',
            warnings: ['Slide 2 ainda não materializou os assets planejados.'],
            auditedAssetTypes: ['render', 'video'],
            slides: [
              {
                slideNumber: 2,
                score: 52,
                status: 'review',
                warnings: ['Slide 2 ainda sem gráfico/diagrama e sem clipe materializado.'],
                missingAssetTypes: ['chart/diagram', 'video'],
                availableAssetTypes: [],
              },
            ],
          },
        },
      },
      presentation: {
        title: 'Deck com fila acionável',
        slides: [
          { number: 1, title: 'Tese central', bullets: ['Ponto 1'], speakerNotes: 'Notas ainda genéricas.' },
          { number: 2, title: 'Prova visual', bullets: ['Ponto 2'], speakerNotes: 'Notas completas para o slide.' },
        ],
      },
      assets: [],
      qualityWarnings: [],
    }

    render(
      <PresentationV2Viewer
        data={data}
        onRegenerate={onRegenerate}
        onGenerateImage={onGenerateImage}
        onGenerateAudio={onGenerateAudio}
        onGenerateVideo={onGenerateVideo}
      />,
    )

    expect(screen.getAllByText('Ações disponíveis').length).toBeGreaterThan(0)
    expect(screen.getByText('Assets pendentes')).toBeTruthy()
    expect(screen.getByText('gráfico/diagrama, clipe')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Revisar briefing do slide 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gerar visuais do slide 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gerar clipes do slide 2' }))

    expect(onRegenerate).toHaveBeenCalledTimes(1)
    expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({
      source: 'viewer_queue',
      action: 'briefing',
      slideNumber: 1,
    }))
    expect(onGenerateImage).toHaveBeenCalledTimes(1)
    expect(onGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
      source: 'viewer_queue',
      action: 'visual',
      slideNumber: 2,
      assetTypes: ['chart/diagram', 'video'],
    }))
    expect(onGenerateVideo).toHaveBeenCalledTimes(1)
    expect(onGenerateVideo).toHaveBeenCalledWith(expect.objectContaining({
      source: 'viewer_queue',
      action: 'video',
      slideNumber: 2,
      assetTypes: ['chart/diagram', 'video'],
    }))
    expect(onGenerateAudio).not.toHaveBeenCalled()
  })

  it('lets the operator approve or reject stored visual and video assets', () => {
    const onReviewAsset = vi.fn()
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck com revisão de assets',
        generationSpec: { request: 'Revisar assets finais.' },
        outline: { narrativeArc: 'Teste', sections: [] },
        theme: { name: 'Lexio Premium' },
        slides: [
          {
            id: 'slide-1',
            number: 1,
            title: 'Slide visual',
            layout: 'hero',
            bullets: ['Ponto'],
            speakerNotes: 'Notas do slide 1.',
            assets: [{ id: 'slide-1-render', type: 'render', status: 'stored', url: 'https://example.com/slide-1.png', altText: 'Visual final do slide 1' }],
          },
          {
            id: 'slide-2',
            number: 2,
            title: 'Slide com clipe',
            layout: 'evidence',
            bullets: ['Ponto'],
            speakerNotes: 'Notas do slide 2.',
            assets: [{ id: 'slide-2-video', type: 'video', status: 'stored', url: 'https://example.com/slide-2.mp4', altText: 'Clipe do slide 2' }],
          },
        ],
        assets: [
          { id: 'slide-1-render', type: 'render', status: 'stored', url: 'https://example.com/slide-1.png', altText: 'Visual final do slide 1' },
          { id: 'slide-2-video', type: 'video', status: 'stored', url: 'https://example.com/slide-2.mp4', altText: 'Clipe do slide 2' },
        ],
      },
      presentation: {
        title: 'Deck com revisão de assets',
        slides: [
          { number: 1, title: 'Slide visual', bullets: ['Ponto'], speakerNotes: 'Notas do slide 1.' },
          { number: 2, title: 'Slide com clipe', bullets: ['Ponto'], speakerNotes: 'Notas do slide 2.' },
        ],
      },
      assets: [
        { id: 'slide-1-render', type: 'render', status: 'stored', url: 'https://example.com/slide-1.png', altText: 'Visual final do slide 1' },
        { id: 'slide-2-video', type: 'video', status: 'stored', url: 'https://example.com/slide-2.mp4', altText: 'Clipe do slide 2' },
      ],
      qualityWarnings: [],
    }

    render(<PresentationV2Viewer data={data} onReviewAsset={onReviewAsset} />)

    expect(screen.getAllByText('aguarda revisão do operador').length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: /Aprovar asset visual: Visual final do slide 1/i }))
    fireEvent.click(screen.getByRole('button', { name: /Rejeitar asset clipe: Clipe do slide 2/i }))

    expect(onReviewAsset).toHaveBeenCalledWith(expect.objectContaining({
      source: 'viewer_asset',
      assetId: 'slide-1-render',
      assetType: 'render',
      reviewDecision: 'approved',
      slideNumber: 1,
    }))
    expect(onReviewAsset).toHaveBeenCalledWith(expect.objectContaining({
      source: 'viewer_asset',
      assetId: 'slide-2-video',
      assetType: 'video',
      reviewDecision: 'rejected',
      slideNumber: 2,
    }))
  })

  it('highlights active export blockers when the manifesto is not releasable', () => {
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck bloqueado',
        generationSpec: {
          request: 'Teste',
          constraints: ['Visual sóbrio'],
          sourcePriority: [],
        },
        outline: {
          narrativeArc: 'Problema e decisão.',
          sections: [{ id: 'section-1', title: 'Contexto', purpose: 'Abrir', slideNumbers: [1] }],
        },
        theme: {
          name: 'Lexio Premium',
        },
        slides: [
          { id: 'slide-1', number: 1, sectionId: 'section-1', title: 'Slide 1', layout: 'hero', bullets: ['Ponto 1'], speakerNotes: 'Notas completas para exportação jurídica.' },
        ],
        assets: [],
        quality: {
          exportReadiness: {
            score: 58,
            status: 'critical',
            visualAssetCount: 1,
            altTextCoverage: 100,
            blockingIssues: ['Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.'],
            legalAccuracyNotes: ['Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.'],
            warnings: ['Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.'],
          },
        },
      },
      presentation: {
        title: 'Deck bloqueado',
        slides: [{ number: 1, title: 'Slide 1', bullets: ['Ponto 1'], speakerNotes: 'Notas completas para exportação jurídica.' }],
      },
      assets: [],
      qualityWarnings: [],
    }

    render(<PresentationV2Viewer data={data} />)

    expect(screen.getByText('bloqueado')).toBeTruthy()
    expect(screen.getByText('Bloqueios ativos')).toBeTruthy()
    expect(screen.getAllByText('Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.').length).toBeGreaterThan(0)
  })

  it('keeps the export readiness gate visible for clean decks with no findings', () => {
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck liberado',
        generationSpec: {
          request: 'Teste',
          constraints: ['Visual sóbrio'],
          sourcePriority: ['Parecer interno'],
        },
        outline: {
          narrativeArc: 'Problema e decisão.',
          sections: [],
        },
        theme: {
          name: 'Lexio Premium',
        },
        slides: [
          { id: 'slide-1', number: 1, title: 'Slide 1', layout: 'hero', bullets: ['Ponto 1'], speakerNotes: 'Notas completas e consistentes para sustentar a exportação final sem revisão adicional.' },
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
        title: 'Deck liberado',
        slides: [{ number: 1, title: 'Slide 1', bullets: ['Ponto 1'], speakerNotes: 'Notas completas e consistentes para sustentar a exportação final sem revisão adicional.' }],
      },
      assets: [],
      qualityWarnings: [],
    }

    render(<PresentationV2Viewer data={data} />)

    expect(screen.getByText('Prontidão de exportação')).toBeTruthy()
    expect(screen.getByText('liberado')).toBeTruthy()
    expect(screen.getByText('Sem pendências estruturadas de acessibilidade ou conformidade neste snapshot.')).toBeTruthy()
    expect(screen.getByText(/liberado .*alt text 100% .*0 asset\(s\) visual\(is\) auditado\(s\)/)).toBeTruthy()
  })

  it('normalizes export readiness from the manifesto when the persisted snapshot is stale', () => {
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck com snapshot defasado',
        generationSpec: {
          request: 'Teste',
          constraints: ['Visual sóbrio'],
          sourcePriority: [],
        },
        outline: {
          narrativeArc: 'Problema e decisão.',
          sections: [{ id: 'section-1', title: 'Contexto', purpose: 'Abrir', slideNumbers: [1] }],
        },
        theme: {
          name: 'Lexio Premium',
        },
        slides: [
          { id: 'slide-1', number: 1, sectionId: 'section-1', title: 'Slide 1', layout: 'evidence', bullets: ['Ponto 1'], speakerNotes: 'Notas completas para exportação jurídica.' },
        ],
        assets: [
          {
            id: 'slide-1-chart',
            type: 'chart',
            status: 'stored',
            url: 'https://example.com/chart.png',
            altText: 'Gráfico comparativo do risco contratual',
          },
        ],
        quality: {
          exportReadiness: {
            score: 82,
            status: 'review',
            visualAssetCount: 1,
            altTextCoverage: 100,
            blockingIssues: [],
            warnings: ['Snapshot antigo ainda não refletiu os novos bloqueios.'],
          },
        },
      },
      presentation: {
        title: 'Deck com snapshot defasado',
        slides: [{ number: 1, title: 'Slide 1', bullets: ['Ponto 1'], speakerNotes: 'Notas completas para exportação jurídica.' }],
      },
      assets: [
        {
          id: 'slide-1-chart',
          type: 'chart',
          status: 'stored',
          url: 'https://example.com/chart.png',
          altText: 'Gráfico comparativo do risco contratual',
        },
      ],
      qualityWarnings: [],
    }

    render(<PresentationV2Viewer data={data} />)

    expect(screen.getByText('bloqueado')).toBeTruthy()
    expect(screen.getByText('Bloqueios ativos')).toBeTruthy()
    expect(screen.getAllByText('Charts/diagramas materializados ainda sem fontes prioritárias explícitas no manifesto final.').length).toBeGreaterThan(0)
  })

  it('shows normalized export metrics when a persisted snapshot is stale and overly optimistic', () => {
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck com score defasado',
        generationSpec: {
          request: 'Teste',
          constraints: ['Visual sóbrio'],
          sourcePriority: ['Parecer interno'],
        },
        outline: {
          narrativeArc: 'Problema e decisão.',
          sections: [{ id: 'section-1', title: 'Contexto', purpose: 'Abrir', slideNumbers: [1] }],
        },
        theme: {
          name: 'Lexio Premium',
        },
        slides: [
          { id: 'slide-1', number: 1, sectionId: 'section-1', title: 'Slide 1', layout: 'hero', bullets: ['Ponto 1'], speakerNotes: 'Notas completas para sustentar a exportação final sem revisão adicional.' },
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
            warnings: [],
          },
        },
      },
      presentation: {
        title: 'Deck com score defasado',
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
    }

    render(<PresentationV2Viewer data={data} />)

    expect(screen.getByText('bloqueado')).toBeTruthy()
    expect(screen.getByText(/crítico .*alt text 0% .*1 asset\(s\) visual\(is\) auditado\(s\)/)).toBeTruthy()
    expect(screen.getByText('85/100')).toBeTruthy()
    expect(screen.getAllByText('1 asset(s) visual(is) ainda sem alt text validado para exportação acessível.').length).toBe(1)
  })

  it('does not show the clean export fallback when only the primary issue remains visible', () => {
    const data: ParsedPresentationV2 = {
      deck: {
        schemaVersion: 'presentation_v2.1',
        title: 'Deck com pendência única',
        generationSpec: {
          request: 'Teste',
          constraints: ['Visual sóbrio'],
          sourcePriority: ['Parecer interno'],
        },
        outline: {
          narrativeArc: 'Problema e decisão.',
          sections: [],
        },
        theme: {
          name: 'Lexio Premium',
        },
        slides: [
          { id: 'slide-1', number: 1, title: 'Slide 1', layout: 'hero', bullets: ['Ponto 1'], speakerNotes: 'Notas completas e consistentes para exportação.' },
        ],
        assets: [],
        quality: {
          exportReadiness: {
            score: 79,
            status: 'review',
            visualAssetCount: 0,
            altTextCoverage: 100,
            blockingIssues: [],
            missingAltTextAssets: [],
            accessibilityNotes: ['Revisar contraste da capa.'],
            legalAccuracyNotes: [],
            warnings: ['Revisar contraste da capa.'],
          },
        },
      },
      presentation: {
        title: 'Deck com pendência única',
        slides: [{ number: 1, title: 'Slide 1', bullets: ['Ponto 1'], speakerNotes: 'Notas completas e consistentes para exportação.' }],
      },
      assets: [],
      qualityWarnings: [],
    }

    render(<PresentationV2Viewer data={data} />)

    expect(screen.getByText('Pendência prioritária: Revisar contraste da capa.')).toBeTruthy()
    expect(screen.getAllByText(/Revisar contraste da capa\./).length).toBe(1)
    expect(screen.queryByText('Sem pendências estruturadas de acessibilidade ou conformidade neste snapshot.')).toBeNull()
  })
})
