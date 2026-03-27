/**
 * ArtifactViewerModal — full-width modal that routes to the correct viewer
 * based on artifact type. Replaces the inline-expand ArtifactCard pattern.
 */

import { useState, useCallback, useEffect } from 'react'
import {
  X, Download, Copy, Check as CheckIcon, Trash2, RotateCcw,
  FileText, Map, CreditCard, BarChart3, Table, FileQuestion,
  Presentation, Mic, Video, PenTool, BookMarked, Sparkles,
} from 'lucide-react'
import type { StudioArtifact, StudioArtifactType } from '../../lib/firestore-service'
import { parseArtifactContent, type ParsedArtifact } from './artifact-parsers'

// Lazy-loaded viewers — will be created in subsequent steps
import FlashcardViewer from './FlashcardViewer'
import QuizPlayer from './QuizPlayer'
import PresentationViewer from './PresentationViewer'
import MindMapViewer from './MindMapViewer'
import DataTableViewer from './DataTableViewer'
import InfographicRenderer from './InfographicRenderer'
import AudioScriptViewer from './AudioScriptViewer'
import VideoScriptViewer from './VideoScriptViewer'
import ReportViewer from './ReportViewer'

// ── Icon map ────────────────────────────────────────────────────────────────

const ARTIFACT_ICONS: Record<StudioArtifactType, React.ElementType> = {
  resumo: FileText,
  relatorio: BarChart3,
  documento: FileText,
  guia_estruturado: BookMarked,
  cartoes_didaticos: CreditCard,
  teste: FileQuestion,
  apresentacao: Presentation,
  mapa_mental: Map,
  infografico: PenTool,
  tabela_dados: Table,
  audio_script: Mic,
  video_script: Video,
  outro: Sparkles,
}

const ARTIFACT_LABELS: Record<StudioArtifactType, string> = {
  resumo: 'Resumo',
  relatorio: 'Relatório',
  documento: 'Documento',
  guia_estruturado: 'Guia Estruturado',
  cartoes_didaticos: 'Cartões Didáticos',
  teste: 'Teste/Quiz',
  apresentacao: 'Apresentação',
  mapa_mental: 'Mapa Mental',
  infografico: 'Infográfico',
  tabela_dados: 'Tabela de Dados',
  audio_script: 'Roteiro de Áudio',
  video_script: 'Roteiro de Vídeo',
  outro: 'Outro',
}

// ── Markdown fallback renderer ──────────────────────────────────────────────

function renderMarkdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-100 rounded-lg p-3 my-2 overflow-x-auto"><code>$2</code></pre>')
  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-sm font-bold mt-4 mb-1">$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-5 mb-2">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-2">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3">$1</h1>')
  // Bold / Italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-xs">$1</code>')
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-brand-600 underline">$1</a>')
  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-4 border-gray-200" />')
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p class="my-2">')
  html = `<p class="my-2">${html}</p>`

  return html
}

// ── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])
  return (
    <button
      onClick={handleCopy}
      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
      title="Copiar conteúdo"
    >
      {copied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

// ── Viewer router ───────────────────────────────────────────────────────────

function ArtifactContent({ artifact, parsed }: { artifact: StudioArtifact; parsed: ParsedArtifact }) {
  switch (parsed.kind) {
    case 'flashcards':
      return <FlashcardViewer data={parsed.data} />
    case 'quiz':
      return <QuizPlayer data={parsed.data} />
    case 'presentation':
      return <PresentationViewer data={parsed.data} />
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
    case 'markdown': {
      // Use ReportViewer for text-heavy markdown artifacts
      const textTypes: StudioArtifactType[] = ['resumo', 'relatorio', 'documento', 'guia_estruturado']
      if (textTypes.includes(artifact.type)) {
        return <ReportViewer content={parsed.data} title={artifact.title} />
      }
      // Generic markdown fallback
      return (
        <div
          className="prose prose-sm max-w-none text-gray-700 [&_strong]:font-semibold [&_a]:text-brand-600 [&_a]:underline [&_pre]:my-2 [&_code]:text-xs"
          dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(parsed.data) }}
        />
      )
    }
    default:
      return (
        <div
          className="prose prose-sm max-w-none text-gray-700"
          dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(artifact.content) }}
        />
      )
  }
}

// ── Main Modal ──────────────────────────────────────────────────────────────

interface ArtifactViewerModalProps {
  artifact: StudioArtifact
  onClose: () => void
  onDelete: () => void
  onDownload: () => void
  onRegenerate?: () => void
}

export default function ArtifactViewerModal({
  artifact,
  onClose,
  onDelete,
  onDownload,
  onRegenerate,
}: ArtifactViewerModalProps) {
  const Icon = ARTIFACT_ICONS[artifact.type] || Sparkles
  const label = ARTIFACT_LABELS[artifact.type] || artifact.type
  const parsed = parseArtifactContent(artifact.type, artifact.content)

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleDelete = () => {
    if (window.confirm(`Excluir "${artifact.title}"? Esta ação é irreversível.`)) {
      onDelete()
    }
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return iso
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-[95vw] max-w-7xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-brand-50 rounded-lg">
              <Icon className="w-5 h-5 text-brand-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">{artifact.title}</h2>
              <p className="text-xs text-gray-500">
                {label} · {formatDate(artifact.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <CopyButton text={artifact.content} />
            <button
              onClick={onDownload}
              className="p-2 rounded-lg hover:bg-blue-50 text-gray-500 hover:text-blue-600 transition-colors"
              title="Baixar"
            >
              <Download className="w-4 h-4" />
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-2 rounded-lg hover:bg-purple-50 text-gray-500 hover:text-purple-600 transition-colors"
                title="Regenerar"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-500 transition-colors"
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <ArtifactContent artifact={artifact} parsed={parsed} />
        </div>
      </div>
    </div>
  )
}
