// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioArtifact } from '../../lib/firestore-types'
import type { ParsedPresentationV2 } from './artifact-parsers'

const artifactViewerMocks = vi.hoisted(() => ({
  parseArtifactContent: vi.fn(),
  exportAsMarkdown: vi.fn(),
  exportAsJSON: vi.fn(),
  exportDataTableAsCSV: vi.fn(),
  exportFlashcardsAsCSV: vi.fn(),
  exportQuizAsText: vi.fn(),
  exportPresentationAsText: vi.fn(),
  exportPresentationAsPptx: vi.fn(),
  exportPresentationV2AsPptx: vi.fn(),
  exportAudioScriptAsText: vi.fn(),
  exportVideoScriptAsText: vi.fn(),
  exportFileFromUrl: vi.fn(),
  exportPresentationImagesAsZip: vi.fn(),
  formatPresentationV2ExportGateLabel: vi.fn(),
  resolvePresentationV2PrimaryExportIssue: vi.fn(),
  summarizePresentationV2ExportReadiness: vi.fn(),
  presentationV2Viewer: vi.fn(),
  printAsPDF: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('./artifact-parsers', () => ({
  parseArtifactContent: (...args: unknown[]) => artifactViewerMocks.parseArtifactContent(...args),
}))

vi.mock('./artifact-exporters', () => ({
  exportAsMarkdown: (...args: unknown[]) => artifactViewerMocks.exportAsMarkdown(...args),
  exportAsJSON: (...args: unknown[]) => artifactViewerMocks.exportAsJSON(...args),
  exportDataTableAsCSV: (...args: unknown[]) => artifactViewerMocks.exportDataTableAsCSV(...args),
  exportFlashcardsAsCSV: (...args: unknown[]) => artifactViewerMocks.exportFlashcardsAsCSV(...args),
  exportQuizAsText: (...args: unknown[]) => artifactViewerMocks.exportQuizAsText(...args),
  exportPresentationAsText: (...args: unknown[]) => artifactViewerMocks.exportPresentationAsText(...args),
  exportPresentationAsPptx: (...args: unknown[]) => artifactViewerMocks.exportPresentationAsPptx(...args),
  exportPresentationV2AsPptx: (...args: unknown[]) => artifactViewerMocks.exportPresentationV2AsPptx(...args),
  exportAudioScriptAsText: (...args: unknown[]) => artifactViewerMocks.exportAudioScriptAsText(...args),
  exportVideoScriptAsText: (...args: unknown[]) => artifactViewerMocks.exportVideoScriptAsText(...args),
  exportFileFromUrl: (...args: unknown[]) => artifactViewerMocks.exportFileFromUrl(...args),
  exportPresentationImagesAsZip: (...args: unknown[]) => artifactViewerMocks.exportPresentationImagesAsZip(...args),
  formatPresentationV2ExportGateLabel: (...args: unknown[]) => artifactViewerMocks.formatPresentationV2ExportGateLabel(...args),
  resolvePresentationV2PrimaryExportIssue: (...args: unknown[]) => artifactViewerMocks.resolvePresentationV2PrimaryExportIssue(...args),
  summarizePresentationV2ExportReadiness: (...args: unknown[]) => artifactViewerMocks.summarizePresentationV2ExportReadiness(...args),
  printAsPDF: (...args: unknown[]) => artifactViewerMocks.printAsPDF(...args),
}))

vi.mock('../Toast', () => ({
  useToast: () => artifactViewerMocks.toast,
}))

vi.mock('../DraggablePanel', () => ({
  default: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) => (
    open ? <section data-testid="artifact-viewer-panel"><h1>{title}</h1>{children}</section> : null
  ),
}))

vi.mock('./FlashcardViewer', () => ({ default: () => <div data-testid="flashcard-viewer" /> }))
vi.mock('./QuizPlayer', () => ({ default: () => <div data-testid="quiz-viewer" /> }))
vi.mock('./PresentationViewer', () => ({ default: () => <div data-testid="presentation-viewer" /> }))
vi.mock('./PresentationV2Viewer', () => ({
  default: (props: {
    onRegenerate?: (context?: { source: string; action: string; slideNumber?: number }) => void
    onGenerateVideo?: (context?: { source: string; action: string; slideNumber?: number }) => void
    onGenerateAudio?: (context?: { source: string; action: string; slideNumber?: number }) => void
    onGenerateImage?: (context?: { source: string; action: string; slideNumber?: number }) => void
    onReviewAsset?: (context: { source: string; assetId: string; assetType: string; reviewDecision: string; slideNumber?: number }) => void
  }) => {
    artifactViewerMocks.presentationV2Viewer(props)
    return (
      <div data-testid="presentation-v2-viewer">
        {props.onRegenerate && <button type="button" onClick={() => props.onRegenerate?.({ source: 'viewer_queue', action: 'briefing', slideNumber: 1 })}>viewer-regenerate</button>}
        {props.onGenerateImage && <button type="button" onClick={() => props.onGenerateImage?.({ source: 'viewer_queue', action: 'visual', slideNumber: 1 })}>viewer-generate-image</button>}
        {props.onGenerateAudio && <button type="button" onClick={() => props.onGenerateAudio?.({ source: 'viewer_queue', action: 'audio', slideNumber: 1 })}>viewer-generate-audio</button>}
        {props.onGenerateVideo && <button type="button" onClick={() => props.onGenerateVideo?.({ source: 'viewer_queue', action: 'video', slideNumber: 1 })}>viewer-generate-video</button>}
        {props.onReviewAsset && <button type="button" onClick={() => props.onReviewAsset?.({ source: 'viewer_asset', assetId: 'slide-1-render', assetType: 'render', reviewDecision: 'approved', slideNumber: 1 })}>viewer-review-asset</button>}
      </div>
    )
  },
}))
vi.mock('./MindMapViewer', () => ({ default: () => <div data-testid="mindmap-viewer" /> }))
vi.mock('./DataTableViewer', () => ({ default: () => <div data-testid="datatable-viewer" /> }))
vi.mock('./InfographicRenderer', () => ({ default: () => <div data-testid="infographic-viewer" /> }))
vi.mock('./AudioScriptViewer', () => ({ default: ({ data }: { data: { title: string } }) => <div data-testid="audio-script-viewer">{data.title}</div> }))
vi.mock('./VideoScriptViewer', () => ({ default: ({ data }: { data: { title: string } }) => <div data-testid="video-script-viewer">{data.title}</div> }))
vi.mock('./ReportViewer', () => ({
  default: ({ title, pageMode }: { title: string; pageMode?: boolean }) => (
    <div data-testid="report-viewer">{title}:{pageMode ? 'page' : 'report'}</div>
  ),
}))

import ArtifactViewerModal from './ArtifactViewerModal'

function makeArtifact(overrides: Partial<StudioArtifact>): StudioArtifact {
  return {
    id: 'artifact-1',
    type: 'video_script',
    title: 'Roteiro Final',
    content: 'Conteúdo bruto do artefato',
    format: 'json',
    created_at: '2026-05-08T12:00:00.000Z',
    ...overrides,
  }
}

function makePresentationV2Data(overrides: {
  deck?: Partial<ParsedPresentationV2['deck']>
  presentation?: Partial<ParsedPresentationV2['presentation']>
  assets?: ParsedPresentationV2['assets']
  qualityWarnings?: ParsedPresentationV2['qualityWarnings']
} = {}): ParsedPresentationV2 {
  const base: ParsedPresentationV2 = {
    deck: {
      schemaVersion: 'presentation_v2.1',
      title: 'Deck v2 demo',
      outline: { narrativeArc: 'Teste', sections: [] },
      slides: [
        { id: 'slide-1', number: 1, title: 'Slide 1', layout: 'hero', bullets: ['Ponto 1'], speakerNotes: 'Notas do slide 1.' },
        { id: 'slide-2', number: 2, title: 'Slide 2', layout: 'evidence', bullets: ['Ponto 2'], speakerNotes: 'Notas do slide 2.' },
      ],
      assets: [],
      generationSpec: { request: 'Teste' },
      theme: { name: 'Tema' },
      quality: {},
    },
    presentation: {
      title: 'Deck v2 demo',
      slides: [
        { number: 1, title: 'Slide 1', bullets: ['Ponto 1'], speakerNotes: 'Notas do slide 1.' },
        { number: 2, title: 'Slide 2', bullets: ['Ponto 2'], speakerNotes: 'Notas do slide 2.' },
      ],
    },
    assets: [],
    qualityWarnings: [],
  }

  return {
    ...base,
    ...overrides,
    deck: {
      ...base.deck,
      ...overrides.deck,
      quality: {
        ...base.deck.quality,
        ...overrides.deck?.quality,
      },
    },
    presentation: {
      ...base.presentation,
      ...overrides.presentation,
    },
    assets: overrides.assets ?? base.assets,
    qualityWarnings: overrides.qualityWarnings ?? base.qualityWarnings,
  }
}

describe('ArtifactViewerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    artifactViewerMocks.summarizePresentationV2ExportReadiness.mockReturnValue({
      score: 94,
      status: 'ok',
      canExportPptx: true,
      visualAssetCount: 0,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: [],
      legalAccuracyNotes: [],
      warnings: [],
    })
    artifactViewerMocks.formatPresentationV2ExportGateLabel.mockReturnValue('LIBERADO')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('routes a video artifact to the right viewer and executes copy, export and destructive actions', async () => {
    artifactViewerMocks.parseArtifactContent.mockReturnValue({
      kind: 'video_script',
      data: {
        title: 'Vídeo aula',
        scenes: [],
        renderedVideoUrl: 'https://cdn.lexio.test/video.mp4',
      },
    })

    const onDelete = vi.fn()
    const onDownload = vi.fn()
    const onRegenerate = vi.fn()
    const onGenerateVideo = vi.fn()
    const onOpenStudio = vi.fn()

    render(
      <ArtifactViewerModal
        artifact={makeArtifact({ type: 'video_script', title: 'Roteiro Final' })}
        onClose={() => {}}
        onDelete={onDelete}
        onDownload={onDownload}
        onRegenerate={onRegenerate}
        onGenerateVideo={onGenerateVideo}
        onOpenStudio={onOpenStudio}
      />,
    )

    expect(screen.getByTestId('artifact-viewer-panel')).toBeTruthy()
    expect(screen.getByText(/vídeo — roteiro final/i)).toBeTruthy()
    expect(screen.getByTestId('video-script-viewer').textContent).toBe('Vídeo aula')

    fireEvent.click(screen.getByTitle('Copiar conteúdo'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Conteúdo bruto do artefato')

    fireEvent.click(screen.getByRole('button', { name: /gerar vídeo/i }))
    fireEvent.click(screen.getByRole('button', { name: /abrir estúdio/i }))
    fireEvent.click(screen.getByTitle('Regenerar'))

    expect(onGenerateVideo).toHaveBeenCalledTimes(1)
    expect(onOpenStudio).toHaveBeenCalledTimes(1)
    expect(onRegenerate).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle('Exportar'))

    expect(screen.getByText('Markdown (.md)')).toBeTruthy()
    expect(screen.getByText('PDF (imprimir)')).toBeTruthy()
    expect(screen.getByText('Video Final (.mp4)')).toBeTruthy()
    expect(screen.getByText('Planejamento em texto (.txt)')).toBeTruthy()
    expect(screen.getByText('JSON (.json)')).toBeTruthy()

    fireEvent.click(screen.getByText('Video Final (.mp4)'))

    await waitFor(() => {
      expect(artifactViewerMocks.exportFileFromUrl).toHaveBeenCalledWith(
        'https://cdn.lexio.test/video.mp4',
        'Roteiro_Final',
        '.mp4',
      )
    })

    fireEvent.click(screen.getByTitle('Excluir'))
    expect(screen.getByText(/tem certeza que deseja excluir/i)).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: /excluir/i })[1])
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('routes text-heavy markdown artifacts to ReportViewer in document page mode', () => {
    artifactViewerMocks.parseArtifactContent.mockReturnValue({
      kind: 'markdown',
      data: '# Documento\n\nConteúdo consolidado',
    })

    render(
      <ArtifactViewerModal
        artifact={makeArtifact({ type: 'documento', title: 'Petição Inicial', format: 'markdown' })}
        onClose={() => {}}
        onDelete={() => {}}
        onDownload={() => {}}
      />,
    )

    expect(screen.getByTestId('report-viewer').textContent).toBe('Petição Inicial:page')
  })

  it('keeps presentation v2 export available while hiding media actions when handlers are omitted', () => {
    artifactViewerMocks.parseArtifactContent.mockReturnValue({
      kind: 'presentation_v2',
      data: makePresentationV2Data({
        deck: {
          quality: {
            slideRubric: [
              {
                slideNumber: 2,
                score: 72,
                status: 'repair',
                warnings: ['Slide 2 ainda pede reforço visual.'],
                repairHints: ['Reforce a pertinência do visual ao lastro documental.'],
                recommendedAgents: ['presentation_v2_image_generator'],
                categories: [],
              },
            ],
            multimodalAudit: {
              score: 78,
              status: 'review',
              slides: [
                { slideNumber: 2, score: 68, status: 'review', warnings: ['Slide 2 ainda pede sincronismo entre apoio visual e narrativa.'], availableAssetTypes: ['render'] },
              ],
            },
          },
        },
        assets: [
          { id: 'slide-1-render', type: 'render', status: 'stored', url: 'https://cdn.lexio.test/slide-1.png' },
        ],
      }),
    })
    artifactViewerMocks.summarizePresentationV2ExportReadiness.mockReturnValue({
      score: 81,
      status: 'review',
      canExportPptx: true,
      visualAssetCount: 1,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: [],
      legalAccuracyNotes: [],
      warnings: ['Rubrica do deck ainda exige reparos.'],
    })
    artifactViewerMocks.formatPresentationV2ExportGateLabel.mockReturnValue('LIBERADO COM REVISÃO')

    render(
      <ArtifactViewerModal
        artifact={makeArtifact({ type: 'apresentacao_v2', title: 'Deck v2 demo' })}
        onClose={() => {}}
        onDelete={() => {}}
        onDownload={() => {}}
      />,
    )

    expect(screen.getByText(/apresentação v2 — deck v2 demo/i)).toBeTruthy()
    expect(screen.getByTestId('presentation-v2-viewer')).toBeTruthy()
    expect(screen.getByText('Próxima ação recomendada')).toBeTruthy()
    expect(screen.getByText('Rodar reparo visual guiado antes da próxima exportação')).toBeTruthy()
    expect(screen.getByText(/slide 2 ainda pede reforço visual no manifesto\. Reforce a pertinência do visual ao lastro documental\./)).toBeTruthy()
    expect(screen.getByText(/A geração visual não está disponível neste ambiente/i)).toBeTruthy()
    expect(screen.getByTitle('Exportar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /gerar clipes/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /gerar narração/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /gerar slides visuais/i })).toBeNull()
  })

  it('passes presentation v2 action handlers into the embedded viewer', () => {
    artifactViewerMocks.parseArtifactContent.mockReturnValue({
      kind: 'presentation_v2',
      data: makePresentationV2Data(),
    })

    const onRegenerate = vi.fn()
    const onGenerateImage = vi.fn()
    const onGenerateAudio = vi.fn()
    const onGenerateVideo = vi.fn()
    const onReviewPresentationV2Asset = vi.fn()

    render(
      <ArtifactViewerModal
        artifact={makeArtifact({ type: 'apresentacao_v2', title: 'Deck v2 demo' })}
        onClose={() => {}}
        onDelete={() => {}}
        onDownload={() => {}}
        onRegenerate={onRegenerate}
        onGenerateImage={onGenerateImage}
        onGenerateAudio={onGenerateAudio}
        onGenerateVideo={onGenerateVideo}
        onReviewPresentationV2Asset={onReviewPresentationV2Asset}
      />,
    )

    expect(artifactViewerMocks.presentationV2Viewer).toHaveBeenLastCalledWith(expect.objectContaining({
      onRegenerate,
      onGenerateImage,
      onGenerateAudio,
      onGenerateVideo,
      onReviewAsset: onReviewPresentationV2Asset,
    }))

    fireEvent.click(screen.getByRole('button', { name: 'viewer-regenerate' }))
    fireEvent.click(screen.getByRole('button', { name: 'viewer-generate-image' }))
    fireEvent.click(screen.getByRole('button', { name: 'viewer-generate-audio' }))
    fireEvent.click(screen.getByRole('button', { name: 'viewer-generate-video' }))
    fireEvent.click(screen.getByRole('button', { name: 'viewer-review-asset' }))

    expect(onRegenerate).toHaveBeenCalledTimes(1)
    expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({ source: 'viewer_queue', action: 'briefing', slideNumber: 1 }))
    expect(onGenerateImage).toHaveBeenCalledTimes(1)
    expect(onGenerateImage).toHaveBeenCalledWith(expect.objectContaining({ source: 'viewer_queue', action: 'visual', slideNumber: 1 }))
    expect(onGenerateAudio).toHaveBeenCalledTimes(1)
    expect(onGenerateAudio).toHaveBeenCalledWith(expect.objectContaining({ source: 'viewer_queue', action: 'audio', slideNumber: 1 }))
    expect(onGenerateVideo).toHaveBeenCalledTimes(1)
    expect(onGenerateVideo).toHaveBeenCalledWith(expect.objectContaining({ source: 'viewer_queue', action: 'video', slideNumber: 1 }))
    expect(onReviewPresentationV2Asset).toHaveBeenCalledTimes(1)
    expect(onReviewPresentationV2Asset).toHaveBeenCalledWith(expect.objectContaining({ source: 'viewer_asset', assetId: 'slide-1-render', reviewDecision: 'approved', slideNumber: 1 }))
  })

  it('surfaces the recommended presentation v2 CTA and executes the matching handler', () => {
    artifactViewerMocks.parseArtifactContent.mockReturnValue({
      kind: 'presentation_v2',
      data: makePresentationV2Data({
        deck: {
          quality: {
            slideRubric: [
              {
                slideNumber: 2,
                score: 71,
                status: 'repair',
                warnings: ['Slide 2 ainda pede reforço visual.'],
                repairHints: ['Reforce a pertinência do visual ao lastro documental.'],
                recommendedAgents: ['presentation_v2_image_generator'],
                categories: [],
              },
            ],
            multimodalAudit: {
              score: 76,
              status: 'review',
              slides: [
                { slideNumber: 2, score: 67, status: 'review', warnings: ['Slide 2 ainda pede sincronismo entre apoio visual e narrativa.'], availableAssetTypes: ['render'] },
              ],
            },
          },
        },
        assets: [
          { id: 'slide-1-render', type: 'render', status: 'stored', url: 'https://cdn.lexio.test/slide-1.png' },
        ],
      }),
    })
    artifactViewerMocks.summarizePresentationV2ExportReadiness.mockReturnValue({
      score: 79,
      status: 'review',
      canExportPptx: true,
      visualAssetCount: 1,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: ['Revisar contraste do slide 2 antes da exportação.'],
      legalAccuracyNotes: [],
      warnings: ['Rubrica do deck ainda exige reparos.'],
    })
    artifactViewerMocks.formatPresentationV2ExportGateLabel.mockReturnValue('LIBERADO COM REVISÃO')

    const onGenerateImage = vi.fn()

    render(
      <ArtifactViewerModal
        artifact={makeArtifact({ type: 'apresentacao_v2', title: 'Deck v2 demo' })}
        onClose={() => {}}
        onDelete={() => {}}
        onDownload={() => {}}
        onGenerateImage={onGenerateImage}
      />,
    )

    expect(screen.getByText('Próxima ação recomendada')).toBeTruthy()
    expect(screen.getByText('Rodar reparo visual guiado antes da próxima exportação')).toBeTruthy()
    expect(screen.getByText('Exportação: liberado com revisão')).toBeTruthy()
    expect(screen.getByText('Rubrica: slide 2')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Ação recomendada: Gerar Slides Visuais'))

    expect(onGenerateImage).toHaveBeenCalledTimes(1)
    expect(onGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
      source: 'modal_recommendation',
      action: 'visual',
      slideNumber: 2,
    }))
  })

  it('surfaces a briefing repair CTA for non-visual presentation v2 rubric issues', () => {
    artifactViewerMocks.parseArtifactContent.mockReturnValue({
      kind: 'presentation_v2',
      data: makePresentationV2Data({
        deck: {
          quality: {
            slideRubric: [
              {
                slideNumber: 1,
                score: 69,
                status: 'repair',
                warnings: ['Speaker notes ainda estão superficiais.'],
                repairHints: ['Reescreva a fala do slide com transição decisória mais clara.'],
                recommendedAgents: ['presentation_v2_slide_writer', 'presentation_v2_content_architect'],
                categories: [],
              },
            ],
            multimodalAudit: {
              score: 91,
              status: 'ok',
              slides: [],
            },
          },
        },
        assets: [
          { id: 'slide-1-render', type: 'render', status: 'stored', url: 'https://cdn.lexio.test/slide-1.png' },
        ],
      }),
    })
    artifactViewerMocks.summarizePresentationV2ExportReadiness.mockReturnValue({
      score: 84,
      status: 'review',
      canExportPptx: true,
      visualAssetCount: 1,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: [],
      legalAccuracyNotes: [],
      warnings: ['Rubrica do deck ainda exige reparos.'],
    })
    artifactViewerMocks.formatPresentationV2ExportGateLabel.mockReturnValue('LIBERADO COM REVISÃO')

    const onRegenerate = vi.fn()

    render(
      <ArtifactViewerModal
        artifact={makeArtifact({ type: 'apresentacao_v2', title: 'Deck v2 demo' })}
        onClose={() => {}}
        onDelete={() => {}}
        onDownload={() => {}}
        onRegenerate={onRegenerate}
      />,
    )

    expect(screen.getByText('Próxima ação recomendada')).toBeTruthy()
    expect(screen.getByText('Reabrir briefing com reparo guiado')).toBeTruthy()
    expect(screen.getByText(/slide 1 tem pendências de roteiro, estrutura ou fala no manifesto/i)).toBeTruthy()
    expect(screen.getByText('Rubrica: slide 1')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Ação recomendada: Revisar Briefing'))

    expect(onRegenerate).toHaveBeenCalledTimes(1)
    expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({
      source: 'modal_recommendation',
      action: 'briefing',
      slideNumber: 1,
    }))
  })

  it('blocks PowerPoint v2 export when export readiness is critical', async () => {
    artifactViewerMocks.parseArtifactContent.mockReturnValue({
      kind: 'presentation_v2',
      data: {
        deck: { schemaVersion: 'presentation_v2.1', title: 'Deck v2 demo', outline: { narrativeArc: 'Teste', sections: [] }, slides: [], assets: [], generationSpec: { request: 'Teste' }, theme: { name: 'Tema' } },
        presentation: { title: 'Deck v2 demo', slides: [] },
      },
    })
    artifactViewerMocks.summarizePresentationV2ExportReadiness.mockReturnValue({
      score: 62,
      status: 'critical',
      canExportPptx: false,
      visualAssetCount: 2,
      altTextCoverage: 50,
      missingAltTextAssets: ['video:slide-2-video'],
      blockingIssues: ['1 asset visual ainda sem alt text validado para exportação acessível.'],
      accessibilityNotes: [],
      legalAccuracyNotes: [],
      warnings: ['1 asset visual ainda sem alt text validado para exportação acessível.'],
    })
    artifactViewerMocks.formatPresentationV2ExportGateLabel.mockReturnValue('BLOQUEADO')
    artifactViewerMocks.resolvePresentationV2PrimaryExportIssue.mockReturnValue('1 asset visual ainda sem alt text validado para exportação acessível.')

    render(
      <ArtifactViewerModal
        artifact={makeArtifact({ type: 'apresentacao_v2', title: 'Deck v2 demo' })}
        onClose={() => {}}
        onDelete={() => {}}
        onDownload={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('Exportar'))
    fireEvent.click(screen.getByText(/PowerPoint v2 \(.pptx\) .*bloqueado/i))

    await waitFor(() => {
      expect(artifactViewerMocks.exportPresentationV2AsPptx).not.toHaveBeenCalled()
      expect(artifactViewerMocks.toast.error).toHaveBeenCalledWith(
        'Exportação v2 bloqueada',
        '1 asset visual ainda sem alt text validado para exportação acessível.',
      )
    })
  })

  it('warns but still exports PowerPoint v2 when readiness is review-only', async () => {
    artifactViewerMocks.parseArtifactContent.mockReturnValue({
      kind: 'presentation_v2',
      data: {
        deck: { schemaVersion: 'presentation_v2.1', title: 'Deck v2 demo', outline: { narrativeArc: 'Teste', sections: [] }, slides: [], assets: [], generationSpec: { request: 'Teste' }, theme: { name: 'Tema' } },
        presentation: { title: 'Deck v2 demo', slides: [] },
      },
    })
    artifactViewerMocks.summarizePresentationV2ExportReadiness.mockReturnValue({
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
    })
    artifactViewerMocks.formatPresentationV2ExportGateLabel.mockReturnValue('LIBERADO COM REVISÃO')
    artifactViewerMocks.resolvePresentationV2PrimaryExportIssue.mockReturnValue('Revisar contraste do slide 2 antes da exportação.')

    render(
      <ArtifactViewerModal
        artifact={makeArtifact({ type: 'apresentacao_v2', title: 'Deck v2 demo' })}
        onClose={() => {}}
        onDelete={() => {}}
        onDownload={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('Exportar'))
    fireEvent.click(screen.getByText(/PowerPoint v2 \(.pptx\) .*liberado com revisão/i))

    await waitFor(() => {
      expect(artifactViewerMocks.toast.warning).toHaveBeenCalledWith(
        'Exportação v2 com pendências',
        'Revisar contraste do slide 2 antes da exportação.',
      )
      expect(artifactViewerMocks.exportPresentationV2AsPptx).toHaveBeenCalledWith(
        expect.anything(),
        'Deck_v2_demo',
      )
    })
  })

  it('shows the canonical gate label for clean PowerPoint v2 exports', async () => {
    artifactViewerMocks.parseArtifactContent.mockReturnValue({
      kind: 'presentation_v2',
      data: {
        deck: { schemaVersion: 'presentation_v2.1', title: 'Deck v2 demo', outline: { narrativeArc: 'Teste', sections: [] }, slides: [], assets: [], generationSpec: { request: 'Teste' }, theme: { name: 'Tema' } },
        presentation: { title: 'Deck v2 demo', slides: [] },
      },
    })
    artifactViewerMocks.summarizePresentationV2ExportReadiness.mockReturnValue({
      score: 94,
      status: 'ok',
      canExportPptx: true,
      visualAssetCount: 0,
      altTextCoverage: 100,
      missingAltTextAssets: [],
      blockingIssues: [],
      accessibilityNotes: [],
      legalAccuracyNotes: [],
      warnings: [],
    })
    artifactViewerMocks.formatPresentationV2ExportGateLabel.mockReturnValue('LIBERADO')

    render(
      <ArtifactViewerModal
        artifact={makeArtifact({ type: 'apresentacao_v2', title: 'Deck v2 demo' })}
        onClose={() => {}}
        onDelete={() => {}}
        onDownload={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('Exportar'))

    expect(screen.getByText(/PowerPoint v2 \(.pptx\) .*liberado/i)).toBeTruthy()
  })
})