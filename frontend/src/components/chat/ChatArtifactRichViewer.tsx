import { useMemo } from 'react'
import type { ChatArtifactRef, StudioArtifactType } from '../../lib/firestore-types'
import {
  parseArtifactContent,
  AudioScriptViewer,
  DataTableViewer,
  FlashcardViewer,
  InfographicRenderer,
  MindMapViewer,
  PresentationViewer,
  QuizPlayer,
  ReportViewer,
  VideoScriptViewer,
} from '../artifacts'
import PresentationV2Viewer from '../artifacts/PresentationV2Viewer'

/**
 * Renders a chat artifact with the rich Research-Notebook viewers
 * (presentation, mind map, infographic, data table, quiz, flashcards, …).
 *
 * Loaded lazily by MessageStream so the heavy viewer chunk (charts, d3)
 * only ships when the user actually opens a structured artifact. Returns
 * `null` when the content cannot be parsed into a known structure, letting
 * the caller fall back to the plain-text preview.
 */
interface ChatArtifactRichViewerProps {
  artifact: ChatArtifactRef
  studioType: StudioArtifactType
}

const MARKDOWN_TEXT_TYPES: StudioArtifactType[] = ['resumo', 'relatorio', 'documento', 'guia_estruturado']

export default function ChatArtifactRichViewer({ artifact, studioType }: ChatArtifactRichViewerProps) {
  const parsed = useMemo(() => {
    const raw = String(artifact.content_preview ?? '').trim()
    if (!raw) return null
    try {
      return parseArtifactContent(studioType, raw)
    } catch {
      return null
    }
  }, [artifact.content_preview, studioType])

  if (!parsed) return null

  const body = renderViewer(parsed, studioType, artifact.title)
  if (!body) return null

  return (
    <div className="mt-2 max-h-[30rem] overflow-auto rounded-md border border-slate-200 bg-white p-2">
      {body}
    </div>
  )
}

function renderViewer(
  parsed: ReturnType<typeof parseArtifactContent>,
  studioType: StudioArtifactType,
  title: string,
): React.ReactNode {
  switch (parsed.kind) {
    case 'flashcards':
      return <FlashcardViewer data={parsed.data} />
    case 'quiz':
      return <QuizPlayer data={parsed.data} />
    case 'presentation':
      return <PresentationViewer data={parsed.data} />
    case 'presentation_v2':
      return <PresentationV2Viewer data={parsed.data} />
    case 'mindmap':
      return <MindMapViewer data={parsed.data} />
    case 'datatable':
      return <DataTableViewer data={parsed.data} />
    case 'infographic':
      return <InfographicRenderer data={parsed.data} />
    case 'audio_script':
      return <AudioScriptViewer data={parsed.data} />
    case 'video_script':
      return <VideoScriptViewer data={parsed.data} />
    case 'markdown':
      // Only render the rich report viewer for genuinely text-first types;
      // a structured type that fell back to markdown means a parse miss —
      // return null so the caller shows the raw preview instead.
      return MARKDOWN_TEXT_TYPES.includes(studioType)
        ? <ReportViewer content={parsed.data} title={title} pageMode={studioType === 'documento'} />
        : null
    default:
      return null
  }
}
