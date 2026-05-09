// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioArtifact } from '../../lib/firestore-types'

const artifactViewerMocks = vi.hoisted(() => ({
  parseArtifactContent: vi.fn(),
  exportAsMarkdown: vi.fn(),
  exportAsJSON: vi.fn(),
  exportDataTableAsCSV: vi.fn(),
  exportFlashcardsAsCSV: vi.fn(),
  exportQuizAsText: vi.fn(),
  exportPresentationAsText: vi.fn(),
  exportPresentationAsPptx: vi.fn(),
  exportAudioScriptAsText: vi.fn(),
  exportVideoScriptAsText: vi.fn(),
  exportFileFromUrl: vi.fn(),
  exportPresentationImagesAsZip: vi.fn(),
  printAsPDF: vi.fn(),
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
  exportAudioScriptAsText: (...args: unknown[]) => artifactViewerMocks.exportAudioScriptAsText(...args),
  exportVideoScriptAsText: (...args: unknown[]) => artifactViewerMocks.exportVideoScriptAsText(...args),
  exportFileFromUrl: (...args: unknown[]) => artifactViewerMocks.exportFileFromUrl(...args),
  exportPresentationImagesAsZip: (...args: unknown[]) => artifactViewerMocks.exportPresentationImagesAsZip(...args),
  printAsPDF: (...args: unknown[]) => artifactViewerMocks.printAsPDF(...args),
}))

vi.mock('../DraggablePanel', () => ({
  default: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) => (
    open ? <section data-testid="artifact-viewer-panel"><h1>{title}</h1>{children}</section> : null
  ),
}))

vi.mock('./FlashcardViewer', () => ({ default: () => <div data-testid="flashcard-viewer" /> }))
vi.mock('./QuizPlayer', () => ({ default: () => <div data-testid="quiz-viewer" /> }))
vi.mock('./PresentationViewer', () => ({ default: () => <div data-testid="presentation-viewer" /> }))
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

describe('ArtifactViewerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})