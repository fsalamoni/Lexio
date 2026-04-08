/**
 * ArtifactViewerModal — full-width modal that routes to the correct viewer
 * based on artifact type. Replaces the inline-expand ArtifactCard pattern.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Download, Copy, Check as CheckIcon, Trash2, RotateCcw,
  FileText, Map, CreditCard, BarChart3, Table, FileQuestion,
  Presentation, Mic, Video, PenTool, BookMarked, Sparkles,
  ChevronDown,
} from 'lucide-react'
import type { StudioArtifact, StudioArtifactType } from '../../lib/firestore-service'
import { parseArtifactContent, type ParsedArtifact } from './artifact-parsers'
import {
  exportAsMarkdown,
  exportAsJSON,
  exportDataTableAsCSV,
  exportFlashcardsAsCSV,
  exportQuizAsText,
  exportPresentationAsText,
  exportAudioScriptAsText,
  exportVideoScriptAsText,
  printAsPDF,
} from './artifact-exporters'
import DraggablePanel from '../DraggablePanel'

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
  video_production: Video,
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
  video_script: 'Gerador de Vídeo',
  video_production: 'Produção de Vídeo',
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
        return <ReportViewer content={parsed.data} title={artifact.title} pageMode={artifact.type === 'documento'} />
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
  onGenerateVideo?: () => void
  onGenerateAudio?: () => void
  onOpenStudio?: () => void
}

export default function ArtifactViewerModal({
  artifact,
  onClose,
  onDelete,
  onDownload,
  onRegenerate,
  onGenerateVideo,
  onGenerateAudio,
  onOpenStudio,
}: ArtifactViewerModalProps) {
  const Icon = ARTIFACT_ICONS[artifact.type] || Sparkles
  const label = ARTIFACT_LABELS[artifact.type] || artifact.type
  const parsed = parseArtifactContent(artifact.type, artifact.content)

  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // Close export menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

  const handleDelete = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDelete = () => {
    setShowDeleteConfirm(false)
    onDelete()
  }

  const safeName = artifact.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)

  const getExportOptions = (): { label: string; action: () => void }[] => {
    const options: { label: string; action: () => void }[] = [
      { label: 'Markdown (.md)', action: () => exportAsMarkdown(artifact.content, safeName) },
      { label: 'PDF (imprimir)', action: () => printAsPDF(renderMarkdownToHtml(artifact.content), artifact.title) },
    ]

    switch (parsed.kind) {
      case 'flashcards':
        options.push({ label: 'CSV Anki (.csv)', action: () => exportFlashcardsAsCSV(parsed.data, safeName) })
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'quiz':
        options.push({ label: 'Prova (.txt)', action: () => exportQuizAsText(parsed.data, safeName, false) })
        options.push({ label: 'Gabarito (.txt)', action: () => exportQuizAsText(parsed.data, safeName, true) })
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'presentation':
        options.push({ label: 'Texto Slides (.txt)', action: () => exportPresentationAsText(parsed.data, safeName) })
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'datatable':
        options.push({ label: 'CSV (.csv)', action: () => exportDataTableAsCSV(parsed.data, safeName) })
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'audio_script':
        options.push({ label: 'Roteiro (.txt)', action: () => exportAudioScriptAsText(parsed.data, safeName) })
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'video_script':
        options.push({ label: 'Storyboard (.txt)', action: () => exportVideoScriptAsText(parsed.data, safeName) })
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'mindmap':
      case 'infographic':
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
    }
    return options
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return iso
    }
  }

  return (
    <DraggablePanel
      open={true}
      onClose={onClose}
      title={`${label} — ${artifact.title}`}
      icon={<Icon size={16} />}
      initialWidth={1100}
      initialHeight={700}
      minWidth={500}
      minHeight={300}
    >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50/80">
          <p className="text-xs text-gray-500">
            {formatDate(artifact.created_at)}
          </p>

          <div className="flex items-center gap-1">
            <CopyButton text={artifact.content} />
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(s => !s)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 text-gray-500 hover:text-blue-600 transition-colors text-xs font-medium"
                title="Exportar"
              >
                <Download className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border py-1 z-10">
                  {getExportOptions().map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => { opt.action(); setShowExportMenu(false) }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-2 rounded-lg hover:bg-purple-50 text-gray-500 hover:text-purple-600 transition-colors"
                title="Regenerar"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            {onGenerateVideo && artifact.type === 'video_script' && (
              <button
                onClick={onGenerateVideo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors shadow-sm"
                title="Gerar Vídeo Completo"
              >
                <Video className="w-3.5 h-3.5" />
                Gerar Vídeo
              </button>
            )}
            {onGenerateAudio && artifact.type === 'audio_script' && (
              <button
                onClick={onGenerateAudio}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                title="Gerar Áudio Literal"
              >
                <Mic className="w-3.5 h-3.5" />
                Gerar Áudio
              </button>
            )}
            {onOpenStudio && artifact.type === 'video_script' && (
              <button
                onClick={onOpenStudio}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                title="Abrir Estúdio de Vídeo"
              >
                <Video className="w-3.5 h-3.5" />
                Abrir Estúdio
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-500 transition-colors"
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <ArtifactContent artifact={artifact} parsed={parsed} />
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 rounded-lg">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Excluir artefato</h3>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                Tem certeza que deseja excluir <strong>&ldquo;{artifact.title}&rdquo;</strong>?
              </p>
              <p className="text-xs text-red-500 mb-6">
                Esta ação é irreversível.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}
    </DraggablePanel>
  )
}
