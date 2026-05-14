/**
 * ArtifactViewerModal — full-width modal that routes to the correct viewer
 * based on artifact type. Replaces the inline-expand ArtifactCard pattern.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Download, Copy, Check as CheckIcon, Trash2, RotateCcw,
  FileText, Map, CreditCard, BarChart3, Table, FileQuestion,
  Presentation, Mic, Video, PenTool, BookMarked, Sparkles, Image as ImageIcon,
  AlertTriangle, CheckCircle2, ChevronDown,
} from 'lucide-react'
import type { StudioArtifact, StudioArtifactType } from '../../lib/firestore-service'
import { parseArtifactContent, type ParsedArtifact, type ParsedPresentationV2 } from './artifact-parsers'
import {
  exportAsMarkdown,
  exportAsJSON,
  exportDataTableAsCSV,
  exportFlashcardsAsCSV,
  exportQuizAsText,
  exportPresentationAsText,
  exportPresentationAsPptx,
  exportPresentationV2AsPptx,
  exportAudioScriptAsText,
  exportVideoScriptAsText,
  exportFileFromUrl,
  exportPresentationImagesAsZip,
  formatPresentationV2ExportGateLabel,
  printAsPDF,
  resolvePresentationV2PrimaryExportIssue,
  summarizePresentationV2ExportReadiness,
} from './artifact-exporters'
import DraggablePanel from '../DraggablePanel'
import { useToast } from '../Toast'

// Lazy-loaded viewers — will be created in subsequent steps
import FlashcardViewer from './FlashcardViewer'
import QuizPlayer from './QuizPlayer'
import PresentationViewer from './PresentationViewer'
import PresentationV2Viewer, { type PresentationV2AssetReviewContext, type PresentationV2OperatorActionContext } from './PresentationV2Viewer'
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
  apresentacao_v2: Sparkles,
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
  apresentacao_v2: 'Apresentação v2',
  mapa_mental: 'Mapa Mental',
  infografico: 'Infográfico',
  tabela_dados: 'Tabela de Dados',
  audio_script: 'Resumo em Áudio',
  video_script: 'Vídeo',
  video_production: 'Produção de Vídeo',
  outro: 'Outro',
}

const PRESENTATION_V2_VISUAL_REPAIR_AGENTS = new Set([
  'presentation_v2_image_generator',
  'presentation_v2_visual_director',
  'presentation_v2_data_diagrammer',
])

function summarizeSlideList(slideNumbers: number[]) {
  const unique = Array.from(new Set(slideNumbers)).sort((left, right) => left - right)
  if (unique.length === 0) return ''
  return unique.length === 1 ? `slide ${unique[0]}` : `slides ${unique.join(', ')}`
}

function hasStoredPresentationV2Asset(data: ParsedPresentationV2, type: 'render' | 'chart' | 'diagram' | 'audio' | 'video') {
  const assets = data.assets || []
  return assets.some((asset) => asset.type === type && (asset.status === 'stored' || Boolean(asset.url || asset.storagePath)))
}

function hasStoredPresentationV2VisualAsset(data: ParsedPresentationV2) {
  const assets = data.assets || []
  return assets.some((asset) => (asset.type === 'render' || asset.type === 'chart' || asset.type === 'diagram') && (asset.status === 'stored' || Boolean(asset.url || asset.storagePath)))
}

type PresentationV2OperatorRecommendation = {
  tone: 'critical' | 'review' | 'ready'
  title: string
  summary: string
  ctaLabel?: string
  ctaAction?: PresentationV2ActionHandler
  ctaContext?: PresentationV2OperatorActionContext
  unavailableReason?: string
  context: string[]
}

type PresentationV2ActionHandler = (context?: PresentationV2OperatorActionContext) => void
type PresentationV2AssetReviewHandler = (context: PresentationV2AssetReviewContext) => void

function resolvePresentationV2OperatorRecommendation({
  data,
  exportReadiness,
  onRegenerate,
  onGenerateImage,
  onGenerateAudio,
  onGenerateVideo,
}: {
  data: ParsedPresentationV2
  exportReadiness: ReturnType<typeof summarizePresentationV2ExportReadiness>
  onRegenerate?: PresentationV2ActionHandler
  onGenerateImage?: PresentationV2ActionHandler
  onGenerateAudio?: PresentationV2ActionHandler
  onGenerateVideo?: PresentationV2ActionHandler
}): PresentationV2OperatorRecommendation {
  const slideRubric = data.deck.quality?.slideRubric || []
  const multimodalSlides = data.deck.quality?.multimodalAudit?.slides || []
  const visualRepairSlides = slideRubric.filter((entry) => (entry.recommendedAgents || []).some((agent) => PRESENTATION_V2_VISUAL_REPAIR_AGENTS.has(agent)))
  const rubricSlidesNeedingReview = slideRubric.filter((entry) => entry.status !== 'ok' || (entry.warnings?.length ?? 0) > 0 || (entry.repairHints?.length ?? 0) > 0)
  const multimodalSlidesNeedingReview = multimodalSlides.filter((entry) => entry.status !== 'ok' || (entry.warnings?.length ?? 0) > 0)
  const missingVisuals = !hasStoredPresentationV2VisualAsset(data)
  const missingAudio = !hasStoredPresentationV2Asset(data, 'audio')
  const missingVideo = !hasStoredPresentationV2Asset(data, 'video')
  const exportGate = formatPresentationV2ExportGateLabel(exportReadiness).toLowerCase()
  const context = [
    `Exportação: ${exportGate}`,
    rubricSlidesNeedingReview.length > 0 ? `Rubrica: ${summarizeSlideList(rubricSlidesNeedingReview.map((entry) => entry.slideNumber))}` : null,
    multimodalSlidesNeedingReview.length > 0 ? `Coerência: ${summarizeSlideList(multimodalSlidesNeedingReview.map((entry) => entry.slideNumber))}` : null,
    missingAudio ? 'Narração pendente' : 'Narração materializada',
    missingVideo ? 'Clipes pendentes' : 'Clipes materializados',
  ].filter(Boolean) as string[]

  if (missingVisuals && onGenerateImage) {
    return {
      tone: exportReadiness.canExportPptx === false ? 'critical' : 'review',
      title: 'Gerar slides visuais antes da próxima exportação',
      summary: 'O deck ainda não materializou os visuais finais. Gere os slides visuais para reduzir ruído de revisão no manifesto e na exportação.',
      ctaLabel: 'Gerar Slides Visuais',
      ctaAction: onGenerateImage,
      ctaContext: { source: 'modal_recommendation', action: 'visual' },
      context,
    }
  }

  if (visualRepairSlides.length > 0) {
    const slideLabel = summarizeSlideList(visualRepairSlides.map((entry) => entry.slideNumber))
    const firstHint = visualRepairSlides.flatMap((entry) => entry.repairHints || entry.warnings || []).find(Boolean)
    const repairVerb = visualRepairSlides.length === 1 ? 'ainda pede' : 'ainda pedem'
    return {
      tone: exportReadiness.canExportPptx === false ? 'critical' : 'review',
      title: 'Rodar reparo visual guiado antes da próxima exportação',
      summary: `${slideLabel} ${repairVerb} reforço visual no manifesto.${firstHint ? ` ${firstHint}` : ''}`,
      ctaLabel: onGenerateImage ? 'Gerar Slides Visuais' : undefined,
      ctaAction: onGenerateImage,
      ctaContext: { source: 'modal_recommendation', action: 'visual', slideNumber: visualRepairSlides[0]?.slideNumber, reason: firstHint },
      unavailableReason: onGenerateImage ? undefined : 'A geração visual não está disponível neste ambiente. Abra o notebook fora do modo smoke para executar o reparo visual.',
      context,
    }
  }

  if (rubricSlidesNeedingReview.length > 0) {
    const slideLabel = summarizeSlideList(rubricSlidesNeedingReview.map((entry) => entry.slideNumber))
    const firstHint = rubricSlidesNeedingReview.flatMap((entry) => entry.repairHints || entry.warnings || []).find(Boolean)
    const repairVerb = rubricSlidesNeedingReview.length === 1 ? 'tem' : 'têm'
    return {
      tone: exportReadiness.canExportPptx === false ? 'critical' : 'review',
      title: 'Reabrir briefing com reparo guiado',
      summary: `${slideLabel} ${repairVerb} pendências de roteiro, estrutura ou fala no manifesto.${firstHint ? ` ${firstHint}` : ''}`,
      ctaLabel: onRegenerate ? 'Revisar Briefing' : undefined,
      ctaAction: onRegenerate,
      ctaContext: { source: 'modal_recommendation', action: 'briefing', slideNumber: rubricSlidesNeedingReview[0]?.slideNumber, reason: firstHint },
      unavailableReason: onRegenerate ? undefined : 'A regeneração guiada não está disponível neste ambiente. Abra o artefato no notebook para reabrir o briefing com foco de reparo.',
      context,
    }
  }

  if (exportReadiness.canExportPptx === false) {
    return {
      tone: 'critical',
      title: 'Revisar pendências antes de exportar o PPTX',
      summary: resolvePresentationV2PrimaryExportIssue(exportReadiness) || 'O deck ainda possui bloqueios operacionais de acessibilidade ou conformidade.',
      context,
    }
  }

  if (missingAudio) {
    return {
      tone: multimodalSlidesNeedingReview.length > 0 ? 'review' : 'ready',
      title: 'Materializar a narração do deck',
      summary: 'A narração ainda não foi gerada. Produzir o TTS ajuda a fechar a revisão multimodal antes da exportação final.',
      ctaLabel: onGenerateAudio ? 'Gerar Narração' : undefined,
      ctaAction: onGenerateAudio,
      ctaContext: { source: 'modal_recommendation', action: 'audio' },
      unavailableReason: onGenerateAudio ? undefined : 'A geração de narração não está disponível neste ambiente. Execute esta etapa em um notebook com mídia habilitada.',
      context,
    }
  }

  if (missingVideo && multimodalSlidesNeedingReview.length > 0) {
    const slideLabel = summarizeSlideList(multimodalSlidesNeedingReview.map((entry) => entry.slideNumber))
    const multimodalVerb = multimodalSlidesNeedingReview.length === 1 ? 'ainda exige' : 'ainda exigem'
    return {
      tone: 'review',
      title: 'Fechar o alinhamento multimodal com clipes do deck',
      summary: `${slideLabel} ${multimodalVerb} alinhamento multimodal. Gerar os clipes da apresentação reduz a lacuna entre manifesto, narrativa e assets finais.`,
      ctaLabel: onGenerateVideo ? 'Gerar Clipes' : undefined,
      ctaAction: onGenerateVideo,
      ctaContext: { source: 'modal_recommendation', action: 'video', slideNumber: multimodalSlidesNeedingReview[0]?.slideNumber },
      unavailableReason: onGenerateVideo ? undefined : 'A geração de clipes não está disponível neste ambiente. Execute esta etapa fora do modo smoke.',
      context,
    }
  }

  if (exportReadiness.status === 'review') {
    return {
      tone: 'review',
      title: 'Deck pronto para revisão final do operador',
      summary: resolvePresentationV2PrimaryExportIssue(exportReadiness) || 'As principais superfícies estão prontas, mas ainda vale revisar a pendência prioritária antes da exportação final.',
      context,
    }
  }

  return {
    tone: 'ready',
    title: 'Deck pronto para a próxima etapa',
    summary: 'O manifesto já está consistente para exportação e para continuação da produção multimodal, se necessário.',
    context,
  }
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
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline">$1</a>')
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
      className="p-2 rounded-lg transition-colors"
      style={{ color: 'var(--v2-ink-faint)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.07)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      title="Copiar conteúdo"
    >
      {copied
        ? <CheckIcon className="w-4 h-4" style={{ color: 'var(--v2-accent-strong)' }} />
        : <Copy className="w-4 h-4" />
      }
    </button>
  )
}

// ── Viewer router ───────────────────────────────────────────────────────────

interface ArtifactContentProps {
  artifact: StudioArtifact
  parsed: ParsedArtifact
  onRegenerate?: PresentationV2ActionHandler
  onGenerateVideo?: PresentationV2ActionHandler
  onGenerateAudio?: PresentationV2ActionHandler
  onGenerateImage?: PresentationV2ActionHandler
  onReviewPresentationV2Asset?: PresentationV2AssetReviewHandler
}

function ArtifactContent({ artifact, parsed, onRegenerate, onGenerateVideo, onGenerateAudio, onGenerateImage, onReviewPresentationV2Asset }: ArtifactContentProps) {
  switch (parsed.kind) {
    case 'flashcards':
      return <FlashcardViewer data={parsed.data} />
    case 'quiz':
      return <QuizPlayer data={parsed.data} />
    case 'presentation':
      return <PresentationViewer data={parsed.data} />
    case 'presentation_v2':
      return (
        <PresentationV2Viewer
          data={parsed.data}
          onRegenerate={onRegenerate}
          onGenerateVideo={onGenerateVideo}
          onGenerateAudio={onGenerateAudio}
          onGenerateImage={onGenerateImage}
          onReviewAsset={onReviewPresentationV2Asset}
        />
      )
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
          className="prose prose-sm max-w-none text-gray-700 [&_strong]:font-semibold [&_a]:text-teal-600 [&_a]:underline [&_pre]:my-2 [&_code]:text-xs"
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
  onRegenerate?: PresentationV2ActionHandler
  onGenerateVideo?: PresentationV2ActionHandler
  onGenerateAudio?: PresentationV2ActionHandler
  onGenerateImage?: PresentationV2ActionHandler
  onReviewPresentationV2Asset?: PresentationV2AssetReviewHandler
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
  onGenerateImage,
  onReviewPresentationV2Asset,
  onOpenStudio,
}: ArtifactViewerModalProps) {
  const toast = useToast()
  const Icon = ARTIFACT_ICONS[artifact.type] || Sparkles
  const label = ARTIFACT_LABELS[artifact.type] || artifact.type
  const parsed = parseArtifactContent(artifact.type, artifact.content)
  const presentationV2ExportReadiness = parsed.kind === 'presentation_v2'
    ? summarizePresentationV2ExportReadiness(parsed.data)
    : null
  const presentationV2Recommendation = parsed.kind === 'presentation_v2' && presentationV2ExportReadiness
    ? resolvePresentationV2OperatorRecommendation({
        data: parsed.data,
        exportReadiness: presentationV2ExportReadiness,
        onRegenerate,
        onGenerateImage,
        onGenerateAudio,
        onGenerateVideo,
      })
    : null

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

  const getExportOptions = (): { label: string; action: () => void | Promise<void> }[] => {
    const options: { label: string; action: () => void | Promise<void> }[] = [
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
        options.push({ label: 'PowerPoint (.pptx)', action: () => void exportPresentationAsPptx(parsed.data, safeName) })
        options.push({ label: 'Texto Slides (.txt)', action: () => exportPresentationAsText(parsed.data, safeName) })
        if (parsed.data.slides.some(slide => slide.renderedImageUrl)) {
          options.push({ label: 'Slides em PNG (.zip)', action: () => void exportPresentationImagesAsZip(parsed.data, safeName) })
        }
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'presentation_v2':
        const exportGateLabel = presentationV2ExportReadiness
          ? formatPresentationV2ExportGateLabel(presentationV2ExportReadiness).toLowerCase()
          : ''
        options.push({
          label: exportGateLabel
            ? `PowerPoint v2 (.pptx) • ${exportGateLabel}`
            : 'PowerPoint v2 (.pptx)',
          action: () => {
            if (presentationV2ExportReadiness?.canExportPptx === false) {
              toast.error(
                'Exportação v2 bloqueada',
                resolvePresentationV2PrimaryExportIssue(presentationV2ExportReadiness) || 'Revise as pendências de acessibilidade e conformidade antes de exportar o PPTX.',
              )
              return
            }
            if (presentationV2ExportReadiness?.status === 'review') {
              toast.warning(
                'Exportação v2 com pendências',
                resolvePresentationV2PrimaryExportIssue(presentationV2ExportReadiness) || 'O deck ainda tem alertas de acessibilidade ou conformidade. O PPTX será gerado mesmo assim.',
              )
            }
            return exportPresentationV2AsPptx(parsed.data, safeName)
          },
        })
        options.push({ label: 'Texto Slides (.txt)', action: () => exportPresentationAsText(parsed.data.presentation, safeName) })
        if (parsed.data.presentation.slides.some(slide => slide.renderedImageUrl)) {
          options.push({ label: 'Slides em PNG (.zip)', action: () => void exportPresentationImagesAsZip(parsed.data.presentation, safeName) })
        }
        options.push({ label: 'Manifesto v2 (.json)', action: () => exportAsJSON(parsed.data.deck, safeName) })
        break
      case 'datatable':
        options.push({ label: 'CSV (.csv)', action: () => exportDataTableAsCSV(parsed.data, safeName) })
        if (parsed.data.renderedImageUrl) {
          options.push({ label: 'Imagem Final (.png)', action: () => void exportFileFromUrl(parsed.data.renderedImageUrl!, safeName, '.png') })
        }
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'audio_script':
        if (parsed.data.audioUrl) {
          options.push({ label: 'Audio Final (.mp3)', action: () => void exportFileFromUrl(parsed.data.audioUrl!, safeName, '.mp3') })
        }
        options.push({ label: 'Resumo em texto (.txt)', action: () => exportAudioScriptAsText(parsed.data, safeName) })
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'video_script':
        if (parsed.data.renderedVideoUrl) {
          options.push({ label: 'Video Final (.mp4)', action: () => void exportFileFromUrl(parsed.data.renderedVideoUrl!, safeName, '.mp4') })
        }
        options.push({ label: 'Planejamento em texto (.txt)', action: () => exportVideoScriptAsText(parsed.data, safeName) })
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'mindmap':
        if (parsed.data.renderedImageUrl) {
          options.push({ label: 'Imagem Final (.png)', action: () => void exportFileFromUrl(parsed.data.renderedImageUrl!, safeName, '.png') })
        }
        options.push({ label: 'JSON (.json)', action: () => exportAsJSON(parsed.data, safeName) })
        break
      case 'infographic':
        if (parsed.data.renderedImageUrl) {
          options.push({ label: 'Imagem Final (.png)', action: () => void exportFileFromUrl(parsed.data.renderedImageUrl!, safeName, '.png') })
        }
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
        <div
          className="flex items-center justify-between px-6 py-3"
          style={{
            borderBottom: '1px solid var(--v2-line-soft)',
            background: 'rgba(255,255,255,0.7)',
            fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
          }}
        >
          <p className="text-xs" style={{ color: 'var(--v2-ink-faint)' }}>
            {formatDate(artifact.created_at)}
          </p>

          <div className="flex items-center gap-1">
            <CopyButton text={artifact.content} />
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(s => !s)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-medium"
                style={{ color: 'var(--v2-ink-soft)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Exportar"
              >
                <Download className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showExportMenu && (
                <div
                  className="absolute right-0 top-full mt-1 w-52 rounded-xl py-1 z-10"
                  style={{
                    background: 'var(--v2-panel-strong)',
                    border: '1px solid var(--v2-line-soft)',
                    boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
                  }}
                >
                  {getExportOptions().map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        Promise.resolve(opt.action()).catch(error => {
                          console.error('Artifact export failed:', error)
                          toast.error('Falha na exportação', error instanceof Error ? error.message : 'O artefato não pôde ser exportado.')
                        })
                        setShowExportMenu(false)
                      }}
                      className="w-full text-left px-4 py-2 text-sm transition-colors"
                      style={{ color: 'var(--v2-ink-soft)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {onRegenerate && (
              <button
                onClick={() => onRegenerate(artifact.type === 'apresentacao_v2' ? { source: 'toolbar', action: 'briefing' } : undefined)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--v2-ink-faint)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Regenerar"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            {onGenerateVideo && (artifact.type === 'video_script' || artifact.type === 'apresentacao_v2') && (
              <button
                onClick={() => onGenerateVideo(artifact.type === 'apresentacao_v2' ? { source: 'toolbar', action: 'video' } : undefined)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors shadow-sm"
                title={artifact.type === 'apresentacao_v2' ? 'Gerar clipes da apresentação' : 'Gerar Vídeo Completo'}
              >
                <Video className="w-3.5 h-3.5" />
                {artifact.type === 'apresentacao_v2' ? 'Gerar Clipes' : 'Gerar Vídeo'}
              </button>
            )}
            {onGenerateAudio && (artifact.type === 'audio_script' || artifact.type === 'apresentacao_v2') && (
              <button
                onClick={() => onGenerateAudio(artifact.type === 'apresentacao_v2' ? { source: 'toolbar', action: 'audio' } : undefined)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                title={artifact.type === 'apresentacao_v2' ? 'Gerar narração da apresentação' : 'Gerar Resumo em Áudio'}
              >
                <Mic className="w-3.5 h-3.5" />
                {artifact.type === 'apresentacao_v2' ? 'Gerar Narração' : 'Gerar Resumo em Áudio'}
              </button>
            )}
            {onGenerateImage && ['apresentacao', 'apresentacao_v2', 'mapa_mental', 'infografico', 'tabela_dados'].includes(artifact.type) && (
              <button
                onClick={() => onGenerateImage(artifact.type === 'apresentacao_v2' ? { source: 'toolbar', action: 'visual' } : undefined)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shadow-sm"
                title={artifact.type === 'apresentacao' || artifact.type === 'apresentacao_v2' ? 'Gerar slides visuais' : 'Gerar imagem final'}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {artifact.type === 'apresentacao' || artifact.type === 'apresentacao_v2' ? 'Gerar Slides Visuais' : 'Gerar Imagem Final'}
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
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--v2-ink-faint)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = 'rgb(220,38,38)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--v2-ink-faint)' }}
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {presentationV2Recommendation && (
          <div
            className="mx-6 mt-4 rounded-2xl border p-4"
            style={{
              borderColor: presentationV2Recommendation.tone === 'critical'
                ? 'rgba(220,38,38,0.22)'
                : presentationV2Recommendation.tone === 'review'
                  ? 'rgba(217,119,6,0.24)'
                  : 'rgba(5,150,105,0.24)',
              background: presentationV2Recommendation.tone === 'critical'
                ? 'rgba(220,38,38,0.05)'
                : presentationV2Recommendation.tone === 'review'
                  ? 'rgba(217,119,6,0.06)'
                  : 'rgba(5,150,105,0.06)',
            }}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                  {presentationV2Recommendation.tone === 'ready'
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : <AlertTriangle className="h-3.5 w-3.5" />}
                  Próxima ação recomendada
                </div>
                <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>
                  {presentationV2Recommendation.title}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--v2-ink-soft)' }}>
                  {presentationV2Recommendation.summary}
                </p>
                {presentationV2Recommendation.unavailableReason && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--v2-ink-faint)' }}>
                    {presentationV2Recommendation.unavailableReason}
                  </p>
                )}
                {presentationV2Recommendation.context.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--v2-ink-muted)' }}>
                    {presentationV2Recommendation.context.map((item) => (
                      <span key={item} className="rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--v2-line-soft)' }}>
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {presentationV2Recommendation.ctaLabel && presentationV2Recommendation.ctaAction && (
                <button
                  onClick={() => presentationV2Recommendation.ctaAction?.(presentationV2Recommendation.ctaContext)}
                  aria-label={`Ação recomendada: ${presentationV2Recommendation.ctaLabel}`}
                  title={`Ação recomendada: ${presentationV2Recommendation.ctaLabel}`}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors"
                  style={{
                    background: presentationV2Recommendation.ctaLabel === 'Revisar Briefing'
                      ? 'rgb(124,58,237)'
                      : presentationV2Recommendation.ctaLabel === 'Gerar Narração'
                      ? 'rgb(5,150,105)'
                      : presentationV2Recommendation.ctaLabel === 'Gerar Clipes'
                        ? 'rgb(225,29,72)'
                        : 'rgb(217,119,6)',
                  }}
                >
                  {presentationV2Recommendation.ctaLabel === 'Revisar Briefing'
                    ? <RotateCcw className="h-3.5 w-3.5" />
                    : presentationV2Recommendation.ctaLabel === 'Gerar Narração'
                    ? <Mic className="h-3.5 w-3.5" />
                    : presentationV2Recommendation.ctaLabel === 'Gerar Clipes'
                      ? <Video className="h-3.5 w-3.5" />
                      : <ImageIcon className="h-3.5 w-3.5" />}
                  {presentationV2Recommendation.ctaLabel}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <ArtifactContent
            artifact={artifact}
            parsed={parsed}
            onRegenerate={onRegenerate}
            onGenerateVideo={onGenerateVideo}
            onGenerateAudio={onGenerateAudio}
            onGenerateImage={onGenerateImage}
            onReviewPresentationV2Asset={onReviewPresentationV2Asset}
          />
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit]"
            style={{ background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(8px)' }}
          >
            <div
              className="rounded-2xl p-6 max-w-sm w-full mx-4"
              style={{
                background: 'var(--v2-panel-strong)',
                border: '1px solid var(--v2-line-soft)',
                boxShadow: '0 24px 64px rgba(15,23,42,0.20)',
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="p-2 rounded-full"
                  style={{ background: 'rgba(239,68,68,0.10)' }}
                >
                  <Trash2 className="w-5 h-5" style={{ color: 'rgb(220,38,38)' }} />
                </div>
                <h3 className="text-base font-bold" style={{ color: 'var(--v2-ink-strong)' }}>Excluir artefato</h3>
              </div>
              <p className="text-sm mb-2" style={{ color: 'var(--v2-ink-soft)' }}>
                Tem certeza que deseja excluir <strong>&ldquo;{artifact.title}&rdquo;</strong>?
              </p>
              <p className="text-xs mb-6" style={{ color: 'rgb(239,68,68)' }}>
                Esta ação é irreversível.
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowDeleteConfirm(false)} className="v2-btn-secondary">
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="v2-btn-primary"
                  style={{ background: 'linear-gradient(135deg, rgb(220,38,38), rgb(185,28,28))' }}
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
