import { parseArtifactContent, type ParsedPresentationV2 } from './artifact-parsers'
import { buildUsageSummary, type UsageExecutionRecord } from './cost-analytics'
import { auditPresentationV2ExportReadiness, auditPresentationV2MultimodalCoherence } from './presentation-generation-pipeline-v2'
import { evaluatePresentationV2Quality } from './quality-evaluator'
import type { PresentationV2Deck, PresentationV2SlideAsset } from './firestore-types'

export type PresentationV2RegressionStatus = 'pass' | 'review' | 'fail'

export interface PresentationV2RegressionFinding {
  id: string
  status: PresentationV2RegressionStatus
  message: string
}

export interface PresentationV2RegressionThresholds {
  minDeckScore: number
  minMultimodalScore: number
  minExportScore: number
  minAltTextCoverage: number
  minSpeakerNoteChars: number
  minDesignSystemCoverage: number
  requireSourcePriority: boolean
  requireNoRejectedVisualAssets: boolean
  requireTelemetry: boolean
  maxFailedExecutions: number
  maxFallbackRate: number
}

export interface PresentationV2RegressionTelemetrySummary {
  calls: number
  totalCostUsd: number
  totalTokens: number
  averageDurationMs: number | null
  failedExecutions: number
  cancelledExecutions: number
  retryingExecutions: number
  fallbackExecutions: number
  fallbackRate: number
  phases: string[]
}

export interface PresentationV2RegressionMetrics {
  slideCount: number
  deckScore: number
  multimodalScore: number
  exportScore: number
  altTextCoverage: number
  speakerNoteCoverage: number
  totalSpeakerNoteChars: number
  designSystemCoverage: number
  storedVisualAssets: number
  storedAudioAssets: number
  storedVideoAssets: number
  rejectedVisualAssets: number
  approvedVisualAssets: number
  operatorRevisionEvents: number
  sourcePriorityCount: number
  overallScore: number
}

export interface PresentationV2RegressionReport {
  status: PresentationV2RegressionStatus
  title: string
  metrics: PresentationV2RegressionMetrics
  telemetry: PresentationV2RegressionTelemetrySummary
  findings: PresentationV2RegressionFinding[]
}

export const PRESENTATION_V2_REGRESSION_DEFAULT_THRESHOLDS: PresentationV2RegressionThresholds = {
  minDeckScore: 80,
  minMultimodalScore: 70,
  minExportScore: 75,
  minAltTextCoverage: 95,
  minSpeakerNoteChars: 40,
  minDesignSystemCoverage: 0.8,
  requireSourcePriority: true,
  requireNoRejectedVisualAssets: true,
  requireTelemetry: false,
  maxFailedExecutions: 0,
  maxFallbackRate: 0.4,
}

const VISUAL_ASSET_TYPES = new Set<PresentationV2SlideAsset['type']>(['render', 'image', 'background', 'chart', 'diagram', 'video'])

function isStoredAsset(asset: PresentationV2SlideAsset): boolean {
  return asset.status === 'stored' || Boolean(asset.url) || Boolean(asset.storagePath)
}

function isVisualAsset(asset: PresentationV2SlideAsset): boolean {
  return VISUAL_ASSET_TYPES.has(asset.type)
}

function calculateStatus(findings: PresentationV2RegressionFinding[]): PresentationV2RegressionStatus {
  if (findings.some((finding) => finding.status === 'fail')) return 'fail'
  if (findings.some((finding) => finding.status === 'review')) return 'review'
  return 'pass'
}

function pushFinding(
  findings: PresentationV2RegressionFinding[],
  id: string,
  status: PresentationV2RegressionStatus,
  message: string,
) {
  findings.push({ id, status, message })
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function resolveDesignSystemCoverage(deck: PresentationV2Deck): number {
  const slideNumbers = new Set(deck.slides.map((slide) => slide.number))
  if (slideNumbers.size === 0) return 0

  const coveredSlideNumbers = new Set(
    (deck.theme.designSystem?.layoutFamilies || [])
      .flatMap((family) => family.slideNumbers)
      .filter((slideNumber) => slideNumbers.has(slideNumber)),
  )

  return coveredSlideNumbers.size / slideNumbers.size
}

export function summarizePresentationV2RegressionTelemetry(executions: UsageExecutionRecord[]): PresentationV2RegressionTelemetrySummary {
  const v2Executions = executions.filter((execution) => (
    execution.source_type === 'presentation_pipeline_v2'
    || execution.function_key === 'presentation_pipeline_v2'
    || execution.phase.startsWith('presentation_v2_')
  ))
  const usage = buildUsageSummary(v2Executions)
  const totalDuration = v2Executions.reduce((sum, execution) => sum + Math.max(0, execution.duration_ms || 0), 0)
  const fallbackExecutions = v2Executions.filter((execution) => execution.used_fallback).length

  return {
    calls: v2Executions.length,
    totalCostUsd: usage.total_cost_usd,
    totalTokens: usage.total_tokens,
    averageDurationMs: v2Executions.length > 0 ? Math.round(totalDuration / v2Executions.length) : null,
    failedExecutions: v2Executions.filter((execution) => execution.execution_state === 'failed').length,
    cancelledExecutions: v2Executions.filter((execution) => execution.execution_state === 'cancelled').length,
    retryingExecutions: v2Executions.filter((execution) => execution.execution_state === 'retrying' || (execution.retry_count ?? 0) > 0).length,
    fallbackExecutions,
    fallbackRate: v2Executions.length > 0 ? fallbackExecutions / v2Executions.length : 0,
    phases: Array.from(new Set(v2Executions.map((execution) => execution.phase))).sort(),
  }
}

function buildParseFailureReport(rawTitle = 'Apresentacao v2'): PresentationV2RegressionReport {
  const telemetry = summarizePresentationV2RegressionTelemetry([])
  return {
    status: 'fail',
    title: rawTitle,
    metrics: {
      slideCount: 0,
      deckScore: 0,
      multimodalScore: 0,
      exportScore: 0,
      altTextCoverage: 0,
      speakerNoteCoverage: 0,
      totalSpeakerNoteChars: 0,
      designSystemCoverage: 0,
      storedVisualAssets: 0,
      storedAudioAssets: 0,
      storedVideoAssets: 0,
      rejectedVisualAssets: 0,
      approvedVisualAssets: 0,
      operatorRevisionEvents: 0,
      sourcePriorityCount: 0,
      overallScore: 0,
    },
    telemetry,
    findings: [{ id: 'parse', status: 'fail', message: 'Conteudo nao e um manifesto Presentation v2 parseavel.' }],
  }
}

export function buildPresentationV2RegressionReport(
  data: ParsedPresentationV2,
  options: {
    executions?: UsageExecutionRecord[]
    thresholds?: Partial<PresentationV2RegressionThresholds>
  } = {},
): PresentationV2RegressionReport {
  const thresholds = {
    ...PRESENTATION_V2_REGRESSION_DEFAULT_THRESHOLDS,
    ...(options.thresholds || {}),
  }
  const deck = data.deck
  const deterministicQuality = evaluatePresentationV2Quality(deck)
  const multimodalAudit = auditPresentationV2MultimodalCoherence({ ...deck, assets: data.assets })
  const exportReadiness = auditPresentationV2ExportReadiness({ ...deck, assets: data.assets })
  const telemetry = summarizePresentationV2RegressionTelemetry(options.executions || [])
  const storedAssets = data.assets.filter(isStoredAsset)
  const visualAssets = storedAssets.filter(isVisualAsset)
  const visualAssetsWithAltText = visualAssets.filter((asset) => Boolean(asset.altText?.trim()))
  const speakerNotesReady = deck.slides.filter((slide) => slide.speakerNotes.trim().length >= thresholds.minSpeakerNoteChars)
  const designSystemCoverage = resolveDesignSystemCoverage(deck)
  const rejectedVisualAssets = visualAssets.filter((asset) => asset.operatorReview?.status === 'rejected')
  const approvedVisualAssets = visualAssets.filter((asset) => asset.operatorReview?.status === 'approved')
  const deckScore = roundScore(deck.quality?.deckRubric?.score ?? deck.quality?.score ?? deterministicQuality.score)
  const multimodalScore = roundScore(multimodalAudit.score ?? deck.quality?.multimodalAudit?.score ?? 0)
  const exportScore = roundScore(exportReadiness.score ?? deck.quality?.exportReadiness?.score ?? 0)
  const altTextCoverage = visualAssets.length > 0
    ? Math.round((visualAssetsWithAltText.length / visualAssets.length) * 100)
    : 100
  const speakerNoteCoverage = deck.slides.length > 0
    ? Math.round((speakerNotesReady.length / deck.slides.length) * 100)
    : 0
  const totalSpeakerNoteChars = deck.slides.reduce((sum, slide) => sum + slide.speakerNotes.trim().length, 0)
  const sourcePriorityCount = (deck.generationSpec.sourcePriority || []).filter(Boolean).length
  const operatorRevisionEvents = (deck.revisionHistory || []).filter((entry) => entry.operatorSource || entry.operatorAction).length
  const overallScore = roundScore([
    deckScore,
    multimodalScore,
    exportScore,
    altTextCoverage,
    speakerNoteCoverage,
    designSystemCoverage * 100,
  ].reduce((sum, value) => sum + value, 0) / 6)
  const findings: PresentationV2RegressionFinding[] = []

  if (deckScore < thresholds.minDeckScore) {
    pushFinding(findings, 'deck-score', 'review', `Rubrica do deck em ${deckScore}/100; alvo minimo ${thresholds.minDeckScore}.`)
  }
  if (multimodalScore < thresholds.minMultimodalScore) {
    pushFinding(findings, 'multimodal-score', 'review', `Coerencia multimodal em ${multimodalScore}/100; alvo minimo ${thresholds.minMultimodalScore}.`)
  }
  if (exportReadiness.status === 'critical' || exportReadiness.blockingIssues?.length) {
    pushFinding(findings, 'export-blocked', 'fail', `Gate de exportacao bloqueado: ${(exportReadiness.blockingIssues || ['sem detalhe']).join(' | ')}`)
  } else if (exportScore < thresholds.minExportScore) {
    pushFinding(findings, 'export-score', 'review', `Prontidao de exportacao em ${exportScore}/100; alvo minimo ${thresholds.minExportScore}.`)
  }
  if (altTextCoverage < thresholds.minAltTextCoverage) {
    pushFinding(findings, 'alt-text', 'fail', `Cobertura de alt text em ${altTextCoverage}%; alvo minimo ${thresholds.minAltTextCoverage}%.`)
  }
  if (speakerNoteCoverage < 100) {
    pushFinding(findings, 'speaker-notes', 'review', `${speakerNotesReady.length}/${deck.slides.length} slides tem speaker notes com pelo menos ${thresholds.minSpeakerNoteChars} caracteres.`)
  }
  if (designSystemCoverage < thresholds.minDesignSystemCoverage) {
    pushFinding(findings, 'design-system', 'review', `Design system cobre ${Math.round(designSystemCoverage * 100)}% dos slides; alvo minimo ${Math.round(thresholds.minDesignSystemCoverage * 100)}%.`)
  }
  if (thresholds.requireSourcePriority && sourcePriorityCount === 0) {
    pushFinding(findings, 'source-priority', 'fail', 'Manifesto sem fontes prioritarias explicitas para benchmark juridico.')
  }
  if (thresholds.requireNoRejectedVisualAssets && rejectedVisualAssets.length > 0) {
    pushFinding(findings, 'operator-rejected-assets', 'fail', `${rejectedVisualAssets.length} asset(s) visual(is) rejeitado(s) pelo operador ainda estao no manifesto.`)
  }
  if (thresholds.requireTelemetry && telemetry.calls === 0) {
    pushFinding(findings, 'telemetry-missing', 'fail', 'Nenhuma execucao Presentation v2 foi encontrada para calibracao de custo/latencia.')
  } else if (!thresholds.requireTelemetry && telemetry.calls === 0) {
    pushFinding(findings, 'telemetry-missing', 'review', 'Benchmark sem execucoes v2 anexadas; smoke estrutural segue valido, mas custo/latencia nao foram calibrados.')
  }
  if (telemetry.failedExecutions > thresholds.maxFailedExecutions) {
    pushFinding(findings, 'telemetry-failed', 'fail', `${telemetry.failedExecutions} execucao(oes) v2 falharam; maximo permitido ${thresholds.maxFailedExecutions}.`)
  }
  if (telemetry.cancelledExecutions > 0) {
    pushFinding(findings, 'telemetry-cancelled', 'review', `${telemetry.cancelledExecutions} execucao(oes) v2 foram canceladas.`)
  }
  if (telemetry.fallbackRate > thresholds.maxFallbackRate) {
    pushFinding(findings, 'telemetry-fallback-rate', 'review', `Fallback rate v2 em ${Math.round(telemetry.fallbackRate * 100)}%; alvo maximo ${Math.round(thresholds.maxFallbackRate * 100)}%.`)
  }

  if (findings.length === 0) {
    pushFinding(findings, 'baseline', 'pass', 'Manifesto Presentation v2 passou nos gates determinísticos do benchmark.')
  }

  return {
    status: calculateStatus(findings),
    title: deck.title || 'Apresentacao v2',
    metrics: {
      slideCount: deck.slides.length,
      deckScore,
      multimodalScore,
      exportScore,
      altTextCoverage,
      speakerNoteCoverage,
      totalSpeakerNoteChars,
      designSystemCoverage,
      storedVisualAssets: visualAssets.length,
      storedAudioAssets: storedAssets.filter((asset) => asset.type === 'audio').length,
      storedVideoAssets: storedAssets.filter((asset) => asset.type === 'video').length,
      rejectedVisualAssets: rejectedVisualAssets.length,
      approvedVisualAssets: approvedVisualAssets.length,
      operatorRevisionEvents,
      sourcePriorityCount,
      overallScore,
    },
    telemetry,
    findings,
  }
}

export function buildPresentationV2RegressionReportFromContent(
  rawContent: string,
  options: {
    executions?: UsageExecutionRecord[]
    thresholds?: Partial<PresentationV2RegressionThresholds>
    title?: string
  } = {},
): PresentationV2RegressionReport {
  const parsed = parseArtifactContent('apresentacao_v2', rawContent)
  if (parsed.kind !== 'presentation_v2') {
    return buildParseFailureReport(options.title)
  }

  return buildPresentationV2RegressionReport(parsed.data, options)
}
