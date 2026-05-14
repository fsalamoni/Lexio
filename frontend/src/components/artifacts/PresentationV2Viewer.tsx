import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Image, Layers3, Palette, RotateCcw, Sparkles, Video, Wand2 } from 'lucide-react'
import type { ElementType } from 'react'
import type { PresentationV2SlideAsset } from '../../lib/firestore-types'
import type { ParsedPresentationV2 } from './artifact-parsers'
import {
  formatPresentationV2ExportGateLabel,
  formatPresentationV2ExportStatusLabel,
  formatPresentationV2StatusLabel,
  removePresentationV2PrimaryExportIssueFromBuckets,
  resolvePresentationV2PrimaryExportIssue,
  splitPresentationV2ExportReadinessMessages,
  summarizePresentationV2ExportReadiness,
} from './artifact-exporters'
import PresentationViewer from './PresentationViewer'

export interface PresentationV2OperatorActionContext {
  source: 'viewer_queue' | 'modal_recommendation' | 'toolbar'
  action: 'briefing' | 'visual' | 'audio' | 'video'
  slideNumber?: number
  reason?: string
  assetTypes?: string[]
}

export interface PresentationV2AssetReviewContext {
  source: 'viewer_asset'
  assetId: string
  assetType: string
  reviewDecision: 'approved' | 'rejected'
  slideNumber?: number
  reason?: string
}

interface PresentationV2ViewerProps {
  data: ParsedPresentationV2
  onRegenerate?: (context?: PresentationV2OperatorActionContext) => void
  onGenerateImage?: (context?: PresentationV2OperatorActionContext) => void
  onGenerateAudio?: (context?: PresentationV2OperatorActionContext) => void
  onGenerateVideo?: (context?: PresentationV2OperatorActionContext) => void
  onReviewAsset?: (context: PresentationV2AssetReviewContext) => void
}

interface PresentationV2QueueAction {
  key: string
  label: string
  ariaLabel: string
  title: string
  tone: 'violet' | 'amber' | 'rose' | 'emerald'
  Icon: ElementType
  onClick: () => void
}

function Metric({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-panel-strong)' }}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{value}</div>
    </div>
  )
}

const PRESENTATION_V2_AGENT_LABELS: Record<string, { inline: string; short: string }> = {
  presentation_v2_slide_writer: { inline: 'redator de slides', short: 'Redator de slides' },
  presentation_v2_content_architect: { inline: 'arquiteto de conteúdo', short: 'Arquiteto de conteúdo' },
  presentation_v2_visual_director: { inline: 'diretor visual', short: 'Diretor visual' },
  presentation_v2_data_diagrammer: { inline: 'diagramador de dados', short: 'Diagramador de dados' },
  presentation_v2_image_generator: { inline: 'gerador de imagens', short: 'Gerador de imagens' },
  presentation_v2_audio_narrator: { inline: 'narrador TTS', short: 'Narrador TTS' },
  presentation_v2_video_generator: { inline: 'gerador de clipes', short: 'Gerador de clipes' },
  presentation_v2_reviewer: { inline: 'revisor final', short: 'Revisor final' },
}

const PRESENTATION_V2_ASSET_TYPE_LABELS: Record<string, string> = {
  render: 'visual',
  chart: 'gráfico',
  diagram: 'diagrama',
  'chart/diagram': 'gráfico/diagrama',
  audio: 'narração',
  video: 'clipe',
}

const PRESENTATION_V2_BRIEFING_REPAIR_AGENT_IDS = new Set([
  'presentation_v2_slide_writer',
  'presentation_v2_content_architect',
  'presentation_v2_reviewer',
])

const PRESENTATION_V2_VISUAL_REPAIR_AGENT_IDS = new Set([
  'presentation_v2_visual_director',
  'presentation_v2_data_diagrammer',
  'presentation_v2_image_generator',
])

const PRESENTATION_V2_VIDEO_REPAIR_AGENT_IDS = new Set([
  'presentation_v2_video_director',
  'presentation_v2_video_generator',
])

function humanizePresentationV2AgentId(agentId: string) {
  const normalized = agentId.replace(/^presentation_v2_/, '').replace(/_/g, ' ').trim()
  if (!normalized) return 'Agente v2'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatPresentationV2AgentLabel(agentId: string) {
  return PRESENTATION_V2_AGENT_LABELS[agentId]?.short || humanizePresentationV2AgentId(agentId)
}

function formatPresentationV2OperatorText(value: string) {
  let formatted = value.replace(/\bcritic de imagem\b/gi, 'crítica visual')

  for (const [agentId, labels] of Object.entries(PRESENTATION_V2_AGENT_LABELS)) {
    formatted = formatted.replace(new RegExp(agentId, 'gi'), labels.inline)
  }

  return formatted
}

function formatPresentationV2AssetTypeLabel(assetType: string) {
  return PRESENTATION_V2_ASSET_TYPE_LABELS[assetType] || assetType
}

function getPresentationV2StatusPriority(status?: string) {
  if (status === 'critical') return 0
  if (status === 'repair') return 1
  if (status === 'review') return 2
  if (status === 'ok') return 3
  return 2
}

function getPresentationV2QueueActionStyle(tone: PresentationV2QueueAction['tone']) {
  switch (tone) {
    case 'violet':
      return { background: 'rgb(124,58,237)', color: '#ffffff' }
    case 'rose':
      return { background: 'rgb(225,29,72)', color: '#ffffff' }
    case 'emerald':
      return { background: 'rgb(5,150,105)', color: '#ffffff' }
    case 'amber':
    default:
      return { background: 'rgb(217,119,6)', color: '#ffffff' }
  }
}

function getPresentationV2AssetReviewStyle(status?: string) {
  if (status === 'approved') return { label: 'aprovado pelo operador', background: 'rgba(5,150,105,0.12)', color: '#047857' }
  if (status === 'rejected') return { label: 'rejeitado pelo operador', background: 'rgba(225,29,72,0.12)', color: '#be123c' }
  return { label: 'aguarda revisão do operador', background: 'rgba(217,119,6,0.12)', color: '#b45309' }
}

function buildPresentationV2QueueActions(
  item: {
    slideNumber: number
    actionItems: string[]
    recommendedAgentIds: string[]
    rawMissingAssetTypes: string[]
  },
  handlers: Pick<PresentationV2ViewerProps, 'onRegenerate' | 'onGenerateImage' | 'onGenerateAudio' | 'onGenerateVideo'>,
): PresentationV2QueueAction[] {
  const joinedFindings = item.actionItems.join(' ')
  const hasBriefingRepair = item.recommendedAgentIds.some((agentId) => PRESENTATION_V2_BRIEFING_REPAIR_AGENT_IDS.has(agentId))
    || /speaker|fala|roteiro|estrutura|transi[cç][aã]o|tese|prova|narrativa|densidade|clareza/i.test(joinedFindings)
  const hasVisualRepair = item.recommendedAgentIds.some((agentId) => PRESENTATION_V2_VISUAL_REPAIR_AGENT_IDS.has(agentId))
    || item.rawMissingAssetTypes.some((assetType) => assetType === 'render' || assetType === 'chart' || assetType === 'diagram' || assetType === 'chart/diagram')
    || /visual|imagem|gr[aá]fico|diagrama|layout|hierarquia|contraste/i.test(joinedFindings)
  const hasAudioRepair = item.rawMissingAssetTypes.includes('audio')
    || /narra[cç][aã]o|tts|[aá]udio/i.test(joinedFindings)
  const hasVideoRepair = item.recommendedAgentIds.some((agentId) => PRESENTATION_V2_VIDEO_REPAIR_AGENT_IDS.has(agentId))
    || item.rawMissingAssetTypes.includes('video')
    || /clipe|v[ií]deo|motion/i.test(joinedFindings)
  const actions: PresentationV2QueueAction[] = []

  if (hasBriefingRepair && handlers.onRegenerate) {
    actions.push({
      key: 'briefing',
      label: 'Revisar briefing',
      ariaLabel: `Revisar briefing do slide ${item.slideNumber}`,
      title: `Reabrir briefing com foco de reparo no slide ${item.slideNumber}`,
      tone: 'violet',
      Icon: RotateCcw,
      onClick: () => handlers.onRegenerate?.({
        source: 'viewer_queue',
        action: 'briefing',
        slideNumber: item.slideNumber,
        reason: item.actionItems[0],
        assetTypes: item.rawMissingAssetTypes,
      }),
    })
  }
  if (hasVisualRepair && handlers.onGenerateImage) {
    actions.push({
      key: 'visual',
      label: 'Gerar visuais',
      ariaLabel: `Gerar visuais do slide ${item.slideNumber}`,
      title: `Materializar ou reparar os visuais ligados ao slide ${item.slideNumber}`,
      tone: 'amber',
      Icon: Wand2,
      onClick: () => handlers.onGenerateImage?.({
        source: 'viewer_queue',
        action: 'visual',
        slideNumber: item.slideNumber,
        reason: item.actionItems[0],
        assetTypes: item.rawMissingAssetTypes,
      }),
    })
  }
  if (hasAudioRepair && handlers.onGenerateAudio) {
    actions.push({
      key: 'audio',
      label: 'Gerar narração',
      ariaLabel: `Gerar narração relacionada ao slide ${item.slideNumber}`,
      title: `Materializar narração com atenção ao slide ${item.slideNumber}`,
      tone: 'emerald',
      Icon: Clock3,
      onClick: () => handlers.onGenerateAudio?.({
        source: 'viewer_queue',
        action: 'audio',
        slideNumber: item.slideNumber,
        reason: item.actionItems[0],
        assetTypes: item.rawMissingAssetTypes,
      }),
    })
  }
  if (hasVideoRepair && handlers.onGenerateVideo) {
    actions.push({
      key: 'video',
      label: 'Gerar clipes',
      ariaLabel: `Gerar clipes do slide ${item.slideNumber}`,
      title: `Materializar clipes ligados ao slide ${item.slideNumber}`,
      tone: 'rose',
      Icon: Video,
      onClick: () => handlers.onGenerateVideo?.({
        source: 'viewer_queue',
        action: 'video',
        slideNumber: item.slideNumber,
        reason: item.actionItems[0],
        assetTypes: item.rawMissingAssetTypes,
      }),
    })
  }

  return actions
}

export default function PresentationV2Viewer({ data, onRegenerate, onGenerateImage, onGenerateAudio, onGenerateVideo, onReviewAsset }: PresentationV2ViewerProps) {
  const { deck, presentation, assets, qualityWarnings } = data
  const storedAssets = assets.filter(asset => asset.status === 'stored' || asset.url || asset.storagePath).length
  const plannedAssets = assets.length
  const renderedVisualAssets = assets.filter(asset => asset.type === 'render' && asset.url)
  const audioAssets = assets.filter(asset => asset.type === 'audio' && asset.url)
  const videoAssets = assets.filter(asset => asset.type === 'video' && asset.url)
  const structuredVisualAssets = assets.filter(asset => (asset.type === 'chart' || asset.type === 'diagram') && asset.url)
  const duration = deck.generationSpec.durationMinutes ? `${deck.generationSpec.durationMinutes} min` : 'A definir'
  const palette = deck.theme.palette?.filter(Boolean).slice(0, 8) || []
  const slideCount = presentation.slides.length || deck.slides.length
  const designSystem = deck.theme.designSystem
  const deckRubric = deck.quality?.deckRubric
  const slideRubric = deck.quality?.slideRubric || []
  const repairSummary = deck.quality?.repairSummary || []
  const repairableSlides = deckRubric?.repairableSlides || []
  const renderQualityAssets = renderedVisualAssets.filter(asset => typeof asset.qualityScore === 'number' || (asset.qualityWarnings?.length ?? 0) > 0)
  const averageRenderScore = renderQualityAssets.length > 0
    ? Math.round(renderQualityAssets.reduce((sum, asset) => sum + (asset.qualityScore || 0), 0) / renderQualityAssets.length)
    : null
  const totalRenderRetries = renderedVisualAssets.reduce((sum, asset) => sum + (asset.retryCount || 0), 0)
  const renderWarnings = Array.from(new Set(renderedVisualAssets.flatMap(asset => asset.qualityWarnings || []))).slice(0, 4)
  const alignedMediaAssets = [...audioAssets, ...videoAssets].filter(asset => typeof asset.qualityScore === 'number' || (asset.qualityWarnings?.length ?? 0) > 0)
  const averageAlignedMediaScore = alignedMediaAssets.length > 0
    ? Math.round(alignedMediaAssets.reduce((sum, asset) => sum + (asset.qualityScore || 0), 0) / alignedMediaAssets.length)
    : null
  const mediaAlignmentWarnings = Array.from(new Set(alignedMediaAssets.flatMap(asset => asset.qualityWarnings || []))).slice(0, 4)
  const multimodalAudit = deck.quality?.multimodalAudit
  const multimodalSlidesNeedingReview = (multimodalAudit?.slides || []).filter(slide => slide.status !== 'ok' || (slide.warnings?.length ?? 0) > 0)
  const multimodalWarnings = (multimodalAudit?.warnings?.length ? multimodalAudit.warnings : mediaAlignmentWarnings).slice(0, 4)
  const multimodalStrengths = (multimodalAudit?.strengths || []).slice(0, 2)
  const multimodalScore = multimodalAudit?.score ?? averageAlignedMediaScore
  const exportReadiness = summarizePresentationV2ExportReadiness(data)
  const exportReadinessMessages = splitPresentationV2ExportReadinessMessages(exportReadiness)
  const exportPrimaryIssue = resolvePresentationV2PrimaryExportIssue(exportReadiness)
  const detailedExportReadinessMessages = removePresentationV2PrimaryExportIssueFromBuckets(
    exportReadinessMessages,
    exportPrimaryIssue,
  )
  const exportBlockingIssues = exportReadinessMessages.blockingIssues.slice(0, 4)
  const exportReadinessWarnings = detailedExportReadinessMessages.warnings.slice(0, 4)
  const exportAccessibilityNotes = detailedExportReadinessMessages.accessibilityNotes.slice(0, 3)
  const exportLegalNotes = detailedExportReadinessMessages.legalAccuracyNotes.slice(0, 3)
  const exportSourcePriority = (deck.generationSpec.sourcePriority || []).slice(0, 4)
  const exportConstraints = (deck.generationSpec.constraints || []).slice(0, 4)
  const exportGateLabel = formatPresentationV2ExportGateLabel(exportReadiness).toLowerCase()
  const exportGateTone = exportGateLabel === 'bloqueado'
    ? { label: exportGateLabel, background: 'rgba(220,38,38,0.12)', color: '#b91c1c' }
    : exportGateLabel === 'liberado com revisão'
      ? { label: exportGateLabel, background: 'rgba(217,119,6,0.12)', color: '#b45309' }
      : { label: exportGateLabel, background: 'rgba(5,150,105,0.12)', color: '#047857' }
  const resolveAssetSlideNumber = (assetId: string) => {
    const slide = deck.slides.find(item => (item.assets || []).some(asset => asset.id === assetId))
    if (slide) return slide.number
    const [, rawSlideNumber] = assetId.match(/slide-(\d+)/i) || []
    const parsedSlideNumber = Number(rawSlideNumber)
    return Number.isFinite(parsedSlideNumber) ? parsedSlideNumber : undefined
  }
  const renderAssetReviewControls = (asset: PresentationV2SlideAsset) => {
    const reviewStyle = getPresentationV2AssetReviewStyle(asset.operatorReview?.status)
    const slideNumber = resolveAssetSlideNumber(asset.id)
    const assetTypeLabel = formatPresentationV2AssetTypeLabel(asset.type)
    const assetLabel = asset.altText || `${assetTypeLabel} ${asset.id}`

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: reviewStyle.background, color: reviewStyle.color }}>
          {reviewStyle.label}
        </span>
        {onReviewAsset && (
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors hover:bg-emerald-50"
              style={{ borderColor: 'rgba(5,150,105,0.35)', color: '#047857' }}
              aria-label={`Aprovar asset ${assetTypeLabel}: ${assetLabel}`}
              title={`Aprovar ${assetTypeLabel}`}
              onClick={() => onReviewAsset({
                source: 'viewer_asset',
                assetId: asset.id,
                assetType: asset.type,
                reviewDecision: 'approved',
                slideNumber,
                reason: asset.qualityWarnings?.[0],
              })}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aprovar
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors hover:bg-rose-50"
              style={{ borderColor: 'rgba(225,29,72,0.35)', color: '#be123c' }}
              aria-label={`Rejeitar asset ${assetTypeLabel}: ${assetLabel}`}
              title={`Rejeitar ${assetTypeLabel}`}
              onClick={() => onReviewAsset({
                source: 'viewer_asset',
                assetId: asset.id,
                assetType: asset.type,
                reviewDecision: 'rejected',
                slideNumber,
                reason: asset.qualityWarnings?.[0],
              })}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Rejeitar
            </button>
          </>
        )}
      </div>
    )
  }
  const slideRubricByNumber = new Map(slideRubric.map(entry => [entry.slideNumber, entry]))
  const multimodalAuditByNumber = new Map((multimodalAudit?.slides || []).map(entry => [entry.slideNumber, entry]))
  const repairableSlideSet = new Set(repairableSlides)
  const latestRevisionBySlide = new Map<number, NonNullable<ParsedPresentationV2['deck']['revisionHistory']>[number]>()

  for (const entry of [...(deck.revisionHistory || [])].reverse()) {
    for (const slideNumber of entry.slideNumbers || []) {
      if (!latestRevisionBySlide.has(slideNumber)) {
        latestRevisionBySlide.set(slideNumber, entry)
      }
    }
  }

  const formattedQualityWarnings = qualityWarnings.map(formatPresentationV2OperatorText)
  const formattedRepairSummary = repairSummary.map(formatPresentationV2OperatorText)
  const formattedRenderWarnings = renderWarnings.map(formatPresentationV2OperatorText)
  const formattedMultimodalStrengths = multimodalStrengths.map(formatPresentationV2OperatorText)
  const formattedMultimodalWarnings = multimodalWarnings.map(formatPresentationV2OperatorText)
  const multimodalAuditedAssetTypes = (multimodalAudit?.auditedAssetTypes || []).map(formatPresentationV2AssetTypeLabel)
  const formattedExportPrimaryIssue = exportPrimaryIssue ? formatPresentationV2OperatorText(exportPrimaryIssue) : null
  const formattedExportBlockingIssues = exportBlockingIssues.map(formatPresentationV2OperatorText)
  const formattedExportReadinessWarnings = exportReadinessWarnings.map(formatPresentationV2OperatorText)
  const formattedExportAccessibilityNotes = exportAccessibilityNotes.map(formatPresentationV2OperatorText)
  const formattedExportLegalNotes = exportLegalNotes.map(formatPresentationV2OperatorText)
  const operatorQueue = Array.from(new Set([
    ...repairableSlides,
    ...slideRubric
      .filter((slide) => slide.status !== 'ok'
        || (slide.warnings?.length ?? 0) > 0
        || (slide.repairHints?.length ?? 0) > 0
        || (slide.recommendedAgents?.length ?? 0) > 0)
      .map(slide => slide.slideNumber),
    ...multimodalSlidesNeedingReview.map(slide => slide.slideNumber),
  ]))
    .map((slideNumber) => {
      const slideManifest = deck.slides.find((slide) => slide.number === slideNumber)
      const presentationSlide = presentation.slides.find((slide) => slide.number === slideNumber)
      const rubricEntry = slideRubricByNumber.get(slideNumber)
      const multimodalEntry = multimodalAuditByNumber.get(slideNumber)
      const latestRevision = latestRevisionBySlide.get(slideNumber)
      const actionItems = Array.from(new Set([
        ...(rubricEntry?.warnings || []),
        ...(rubricEntry?.repairHints || []),
        ...(multimodalEntry?.warnings || []),
        ...(!rubricEntry && repairableSlideSet.has(slideNumber)
          ? ['Slide abaixo do limiar da rubrica do deck e elegível para reparo parcial.']
          : []),
      ].map(formatPresentationV2OperatorText).filter(Boolean)))
      const recommendedAgents = Array.from(new Set((rubricEntry?.recommendedAgents || []).map(formatPresentationV2AgentLabel)))
      const recommendedAgentIds = Array.from(new Set(rubricEntry?.recommendedAgents || []))
      const availableAssetTypes = Array.from(new Set((multimodalEntry?.availableAssetTypes || []).map(formatPresentationV2AssetTypeLabel)))
      const rawMissingAssetTypes = Array.from(new Set(multimodalEntry?.missingAssetTypes || []))
      const missingAssetTypes = rawMissingAssetTypes.map(formatPresentationV2AssetTypeLabel)
      const latestRevisionAgent = latestRevision?.repairAgent
        ? formatPresentationV2AgentLabel(latestRevision.repairAgent)
        : latestRevision?.agent
          ? formatPresentationV2AgentLabel(latestRevision.agent)
          : undefined

      return {
        slideNumber,
        title: slideManifest?.title || presentationSlide?.title || `Slide ${slideNumber}`,
        rubricScore: rubricEntry?.score,
        rubricStatus: rubricEntry?.status,
        multimodalScore: multimodalEntry?.score,
        multimodalStatus: multimodalEntry?.status,
        actionItems,
        recommendedAgents,
        recommendedAgentIds,
        availableAssetTypes,
        missingAssetTypes,
        rawMissingAssetTypes,
        latestRevisionAgent,
        latestRevisionSummary: latestRevision?.summary ? formatPresentationV2OperatorText(latestRevision.summary) : undefined,
      }
    })
    .filter(item => item.actionItems.length > 0
      || item.recommendedAgents.length > 0
      || item.latestRevisionSummary
      || (item.rubricStatus && item.rubricStatus !== 'ok')
      || (item.multimodalStatus && item.multimodalStatus !== 'ok'))
    .sort((left, right) => {
      const leftPriority = Math.min(
        getPresentationV2StatusPriority(left.rubricStatus),
        getPresentationV2StatusPriority(left.multimodalStatus),
      )
      const rightPriority = Math.min(
        getPresentationV2StatusPriority(right.rubricStatus),
        getPresentationV2StatusPriority(right.multimodalStatus),
      )

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority
      }

      const leftScore = Math.min(left.rubricScore ?? 999, left.multimodalScore ?? 999)
      const rightScore = Math.min(right.rubricScore ?? 999, right.multimodalScore ?? 999)

      if (leftScore !== rightScore) {
        return leftScore - rightScore
      }

      return left.slideNumber - right.slideNumber
    })

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-bg-elevated)' }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(124,58,237,0.10)', color: '#6d28d9' }}>
              <Sparkles className="h-3.5 w-3.5" />
              Manifesto v2
            </div>
            <h3 className="mt-3 text-lg font-semibold leading-snug" style={{ color: 'var(--v2-ink-strong)' }}>{deck.title || presentation.title}</h3>
            {deck.subtitle && <p className="mt-1 text-sm" style={{ color: 'var(--v2-ink-muted)' }}>{deck.subtitle}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
            <Metric icon={Layers3} label="Slides" value={slideCount} />
            <Metric icon={Clock3} label="Duração" value={duration} />
            <Metric icon={Image} label="Assets" value={`${storedAssets}/${plannedAssets}`} />
            <Metric icon={CheckCircle2} label="Versão" value={deck.schemaVersion} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-panel)' }}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
              <Palette className="h-3.5 w-3.5" />
              Direção visual
            </div>
            <p className="mt-2 text-sm" style={{ color: 'var(--v2-ink-muted)' }}>
              {deck.theme.mood || 'Sem mood definido'}
            </p>
            {designSystem?.narrativeMode && (
              <p className="mt-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                Bíblia visual: {designSystem.narrativeMode}
              </p>
            )}
            {palette.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {palette.map((color, index) => (
                  <span key={`${color}-${index}`} className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--v2-line-soft)', color: 'var(--v2-ink-muted)' }}>
                    <span className="h-3 w-3 rounded-full border" style={{ background: color, borderColor: 'rgba(15,23,42,0.18)' }} />
                    {color}
                  </span>
                ))}
              </div>
            )}
            {designSystem?.layoutFamilies && designSystem.layoutFamilies.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                  Famílias de layout
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {designSystem.layoutFamilies.map((family) => (
                    <span key={family.id} className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--v2-line-soft)', color: 'var(--v2-ink-muted)' }}>
                      <span className="font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{family.label}</span>
                      <span>slides {family.slideNumbers.join(', ')}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {designSystem?.hierarchyRules && designSystem.hierarchyRules.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                  Regras de hierarquia
                </div>
                <ul className="space-y-1 text-sm" style={{ color: 'var(--v2-ink-muted)' }}>
                  {designSystem.hierarchyRules.slice(0, 4).map((rule, index) => <li key={index}>{rule}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3" style={{ borderColor: qualityWarnings.length ? 'rgba(245,158,11,0.42)' : 'var(--v2-line-soft)', background: qualityWarnings.length ? 'rgba(245,158,11,0.07)' : 'var(--v2-panel)' }}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: qualityWarnings.length ? '#b45309' : 'var(--v2-ink-faint)' }}>
              <AlertTriangle className="h-3.5 w-3.5" />
              Qualidade
            </div>
            {deckRubric?.score != null && (
              <div className="mt-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--v2-line-soft)', background: 'rgba(15,23,42,0.03)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>Rubrica do deck</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{deckRubric.score}/100</span>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                  {formatPresentationV2StatusLabel(deckRubric.status, { okLabel: 'ok', fallbackLabel: 'ok' })}{repairableSlides.length > 0 ? ` · reparos sugeridos nos slides ${repairableSlides.join(', ')}` : ' · nenhum slide abaixo do limiar.'}
                </p>
              </div>
            )}
            {qualityWarnings.length ? (
              <ul className="mt-2 space-y-1 text-sm" style={{ color: '#92400e' }}>
                {formattedQualityWarnings.slice(0, 4).map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm" style={{ color: 'var(--v2-ink-muted)' }}>Sem alertas estruturais no manifesto.</p>
            )}
            {repairSummary.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                  Ciclo de reparo
                </div>
                <ul className="space-y-1 text-sm" style={{ color: 'var(--v2-ink-muted)' }}>
                  {formattedRepairSummary.slice(0, 4).map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </div>
            )}
            {renderQualityAssets.length > 0 && (
              <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--v2-line-soft)', background: 'rgba(14,165,233,0.05)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>Crítica visual</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{averageRenderScore != null ? `${averageRenderScore}/100` : 'sem score'}</span>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                  {renderQualityAssets.length} visual(is) auditado(s){totalRenderRetries > 0 ? ` · ${totalRenderRetries} retry(s) interno(s)` : ' · sem retries adicionais'}.
                </p>
                {renderWarnings.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {formattedRenderWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                )}
              </div>
            )}
            {(multimodalAudit || alignedMediaAssets.length > 0) && (
              <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--v2-line-soft)', background: 'rgba(15,118,110,0.06)' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>Coerência multimodal</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{multimodalScore != null ? `${multimodalScore}/100` : 'sem score'}</span>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                  {multimodalAudit
                    ? `${formatPresentationV2StatusLabel(multimodalAudit.status, { okLabel: 'ok', fallbackLabel: 'em revisão' })} · ${multimodalAuditedAssetTypes.join(', ') || 'sem assets persistidos'} · ${(multimodalAudit.slides || []).length} slide(s) auditado(s).`
                    : `${alignedMediaAssets.length} asset(s) multimodal(is) auditado(s) para alinhamento com o deck.`}
                </p>
                {multimodalStrengths.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {formattedMultimodalStrengths.map((strength, index) => <li key={index}>{strength}</li>)}
                  </ul>
                )}
                {multimodalWarnings.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {formattedMultimodalWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                )}
                {multimodalSlidesNeedingReview.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--v2-ink-muted)' }}>
                    {multimodalSlidesNeedingReview.slice(0, 4).map((slide) => (
                      <span key={slide.slideNumber} className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--v2-line-soft)' }}>
                        slide {slide.slideNumber} · {formatPresentationV2StatusLabel(slide.status, { okLabel: 'ok', fallbackLabel: 'em revisão' })} · {slide.score}/100
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--v2-line-soft)', background: 'rgba(217,119,6,0.06)' }}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>Prontidão de exportação</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>
                  {typeof exportReadiness.score === 'number'
                    ? `${exportReadiness.score}/100`
                    : formatPresentationV2ExportStatusLabel(exportReadiness)}
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                {`${formatPresentationV2ExportStatusLabel(exportReadiness)} · alt text ${typeof exportReadiness.altTextCoverage === 'number' ? `${exportReadiness.altTextCoverage}%` : 'N/A'} · ${exportReadiness.visualAssetCount || 0} asset(s) visual(is) auditado(s).`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--v2-ink-muted)' }}>
                <span className="font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                  Gate operacional
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 font-semibold uppercase tracking-wide"
                  style={{ background: exportGateTone.background, color: exportGateTone.color }}
                >
                  {exportGateTone.label}
                </span>
              </div>
              {formattedExportPrimaryIssue && exportBlockingIssues.length === 0 && (
                <p className="mt-2 text-xs font-medium" style={{ color: 'var(--v2-ink-muted)' }}>
                  Pendência prioritária: {formattedExportPrimaryIssue}
                </p>
              )}
              {exportBlockingIssues.length === 0
                && exportReadinessWarnings.length === 0
                && exportAccessibilityNotes.length === 0
                && exportLegalNotes.length === 0
                && !exportPrimaryIssue && (
                <p className="mt-2 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                  Sem pendências estruturadas de acessibilidade ou conformidade neste snapshot.
                </p>
              )}
              {exportBlockingIssues.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                    Bloqueios ativos
                  </div>
                  <ul className="space-y-1 text-xs" style={{ color: '#92400e' }}>
                    {formattedExportBlockingIssues.map((issue, index) => <li key={index}>{issue}</li>)}
                  </ul>
                </div>
              )}
              {exportReadinessWarnings.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                  {formattedExportReadinessWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>
              )}
              {exportAccessibilityNotes.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                    Acessibilidade
                  </div>
                  <ul className="space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {formattedExportAccessibilityNotes.map((note, index) => <li key={index}>{note}</li>)}
                  </ul>
                </div>
              )}
              {exportLegalNotes.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                    Conformidade jurídica
                  </div>
                  <ul className="space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {formattedExportLegalNotes.map((note, index) => <li key={index}>{note}</li>)}
                  </ul>
                </div>
              )}
              {exportSourcePriority.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                    Fontes prioritárias
                  </div>
                  <ul className="space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {exportSourcePriority.map((item, index) => <li key={index}>{item}</li>)}
                  </ul>
                </div>
              )}
              {exportConstraints.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                    Restrições institucionais
                  </div>
                  <ul className="space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {exportConstraints.map((item, index) => <li key={index}>{item}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {operatorQueue.length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-bg-elevated)' }}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
            <Sparkles className="h-3.5 w-3.5" />
            Fila operacional
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--v2-ink-muted)' }}>
            Slides priorizados para revisão seletiva e reparo parcial antes da próxima exportação ou nova rodada de geração.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {operatorQueue.map((item) => {
              const queueActions = buildPresentationV2QueueActions(item, {
                onRegenerate,
                onGenerateImage,
                onGenerateAudio,
                onGenerateVideo,
              })

              return (
              <div key={item.slideNumber} className="rounded-lg border p-3" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-panel)' }}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>
                      Slide {item.slideNumber}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>{item.title}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--v2-ink-muted)' }}>
                    {(item.rubricScore != null || item.rubricStatus) && (
                      <span className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--v2-line-soft)' }}>
                        rubrica {formatPresentationV2StatusLabel(item.rubricStatus, { okLabel: 'ok', fallbackLabel: 'em revisão' })}{item.rubricScore != null ? ` · ${item.rubricScore}/100` : ''}
                      </span>
                    )}
                    {(item.multimodalScore != null || item.multimodalStatus) && (
                      <span className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--v2-line-soft)' }}>
                        multimodal {formatPresentationV2StatusLabel(item.multimodalStatus, { okLabel: 'ok', fallbackLabel: 'em revisão' })}{item.multimodalScore != null ? ` · ${item.multimodalScore}/100` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {item.actionItems.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                      Ajustes sugeridos
                    </div>
                    <ul className="space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                      {item.actionItems.slice(0, 4).map((action, index) => <li key={`${item.slideNumber}-action-${index}`}>{action}</li>)}
                    </ul>
                  </div>
                )}

                {item.recommendedAgents.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                      Agentes sugeridos
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--v2-ink-muted)' }}>
                      {item.recommendedAgents.map((agent) => (
                        <span key={`${item.slideNumber}-${agent}`} className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--v2-line-soft)' }}>
                          {agent}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {item.availableAssetTypes.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                      Assets já presentes
                    </div>
                    <p className="text-xs" style={{ color: 'var(--v2-ink-muted)' }}>{item.availableAssetTypes.join(', ')}</p>
                  </div>
                )}

                {item.missingAssetTypes.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                      Assets pendentes
                    </div>
                    <p className="text-xs" style={{ color: 'var(--v2-ink-muted)' }}>{item.missingAssetTypes.join(', ')}</p>
                  </div>
                )}

                {item.latestRevisionSummary && (
                  <div className="mt-3 space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                      Última intervenção
                    </div>
                    <p className="text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                      {item.latestRevisionAgent ? `${item.latestRevisionAgent} · ${item.latestRevisionSummary}` : item.latestRevisionSummary}
                    </p>
                  </div>
                )}

                {queueActions.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                      Ações disponíveis
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {queueActions.map(({ key, label, ariaLabel, title, tone, Icon, onClick }) => (
                        <button
                          key={`${item.slideNumber}-${key}`}
                          type="button"
                          onClick={onClick}
                          aria-label={ariaLabel}
                          title={title}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm transition-opacity hover:opacity-90"
                          style={getPresentationV2QueueActionStyle(tone)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )})}
          </div>
        </div>
      )}

      {renderedVisualAssets.length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-bg-elevated)' }}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
            <Image className="h-3.5 w-3.5" />
            Visuais gerados
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {renderedVisualAssets.map(asset => (
              <figure key={asset.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-panel)' }}>
                <img src={asset.url} alt={asset.altText || asset.id} className="aspect-video w-full rounded-md object-cover" />
                <figcaption className="mt-2 truncate text-xs font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{asset.altText || 'Visual final do slide'}</figcaption>
                <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--v2-ink-faint)' }}>{asset.model || asset.providerLabel || 'Render v2'}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--v2-ink-muted)' }}>
                  {typeof asset.qualityScore === 'number' && (
                    <span className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--v2-line-soft)' }}>score {asset.qualityScore}/100</span>
                  )}
                  {typeof asset.retryCount === 'number' && asset.retryCount > 0 && (
                    <span className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--v2-line-soft)' }}>{asset.retryCount} retry(s)</span>
                  )}
                </div>
                {renderAssetReviewControls(asset)}
                {asset.qualityWarnings?.length ? (
                  <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {asset.qualityWarnings.slice(0, 3).map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                ) : null}
              </figure>
            ))}
          </div>
        </div>
      )}

      {audioAssets.length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-bg-elevated)' }}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
            <Clock3 className="h-3.5 w-3.5" />
            Narração
          </div>
          <div className="mt-3 space-y-3">
            {audioAssets.map(asset => (
              <div key={asset.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-panel)' }}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{asset.altText || 'Narração da apresentação'}</p>
                    <p className="mt-1 truncate text-xs" style={{ color: 'var(--v2-ink-faint)' }}>{asset.model || asset.providerLabel || 'TTS'}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--v2-ink-muted)' }}>
                      {typeof asset.qualityScore === 'number' && (
                        <span className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--v2-line-soft)' }}>score {asset.qualityScore}/100</span>
                      )}
                    </div>
                  </div>
                  <audio controls src={asset.url} className="w-full sm:w-[320px]" />
                </div>
                {asset.qualityWarnings?.length ? (
                  <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {asset.qualityWarnings.slice(0, 3).map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {videoAssets.length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-bg-elevated)' }}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
            <Image className="h-3.5 w-3.5" />
            Clipes
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {videoAssets.map(asset => (
              <div key={asset.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-panel)' }}>
                <video controls src={asset.url} className="aspect-video w-full rounded-md bg-black" />
                <p className="mt-2 truncate text-xs font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{asset.altText || 'Clipe da apresentação'}</p>
                <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--v2-ink-faint)' }}>{asset.model || asset.providerLabel || 'Vídeo externo'}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--v2-ink-muted)' }}>
                  {typeof asset.qualityScore === 'number' && (
                    <span className="rounded-full border px-2 py-0.5" style={{ borderColor: 'var(--v2-line-soft)' }}>score {asset.qualityScore}/100</span>
                  )}
                </div>
                {renderAssetReviewControls(asset)}
                {asset.qualityWarnings?.length ? (
                  <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--v2-ink-muted)' }}>
                    {asset.qualityWarnings.slice(0, 3).map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {structuredVisualAssets.length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-bg-elevated)' }}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
            <BarChart3 className="h-3.5 w-3.5" />
            Dados e diagramas
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {structuredVisualAssets.map(asset => (
              <figure key={asset.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--v2-line-soft)', background: 'var(--v2-panel)' }}>
                <img src={asset.url} alt={asset.altText || asset.id} className="aspect-video w-full rounded-md object-cover" />
                <figcaption className="mt-2 truncate text-xs font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{asset.altText || (asset.type === 'chart' ? 'Gráfico da apresentação' : 'Diagrama da apresentação')}</figcaption>
                <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--v2-ink-faint)' }}>{asset.model || 'browser/svg-data-render'}</p>
                {renderAssetReviewControls(asset)}
              </figure>
            ))}
          </div>
        </div>
      )}

      <PresentationViewer data={presentation} />
    </div>
  )
}
