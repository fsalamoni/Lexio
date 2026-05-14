import { parseArtifactContent, type ParsedPresentation } from './artifact-parsers'
import type { UsageExecutionRecord } from './cost-analytics'
import {
  buildPresentationV2RegressionReportFromContent,
  type PresentationV2RegressionReport,
  type PresentationV2RegressionStatus,
  type PresentationV2RegressionThresholds,
} from './presentation-v2-regression-harness'

export interface PresentationV2GoldenBenchmarkCase {
  id: string
  label: string
  description?: string
  rawContent: string
  baselineLegacyContent?: string
  executions?: UsageExecutionRecord[]
  thresholds?: Partial<PresentationV2RegressionThresholds>
}

export interface PresentationV2LegacyBaselineMetrics {
  parseable: boolean
  title: string
  slideCount: number
  renderedSlideCount: number
  speakerNoteCoverage: number
  averageBulletsPerSlide: number
  totalSpeakerNoteChars: number
  findings: string[]
}

export interface PresentationV2BenchmarkDeltas {
  slideCountDelta: number
  visualAssetDelta: number
  speakerNoteCoverageDelta: number
  speakerNoteCharsDelta: number
}

export interface PresentationV2GoldenBenchmarkCaseReport {
  id: string
  label: string
  description?: string
  status: PresentationV2RegressionStatus
  regression: PresentationV2RegressionReport
  legacyBaseline?: PresentationV2LegacyBaselineMetrics
  deltas?: PresentationV2BenchmarkDeltas
}

export interface PresentationV2GoldenBenchmarkSummary {
  status: PresentationV2RegressionStatus
  totalCases: number
  passedCases: number
  reviewCases: number
  failedCases: number
  averageOverallScore: number
  averageDeckScore: number
  averageMultimodalScore: number
  averageExportScore: number
  totalTelemetryCalls: number
  totalCostUsd: number
  maxFallbackRate: number
  reports: PresentationV2GoldenBenchmarkCaseReport[]
  findings: string[]
}

function statusFromReports(reports: PresentationV2GoldenBenchmarkCaseReport[]): PresentationV2RegressionStatus {
  if (reports.some((report) => report.status === 'fail')) return 'fail'
  if (reports.some((report) => report.status === 'review')) return 'review'
  return 'pass'
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function countRenderedSlides(presentation: ParsedPresentation): number {
  return presentation.slides.filter((slide) => Boolean(slide.renderedImageUrl || slide.renderedImageStoragePath)).length
}

export function buildPresentationV2LegacyBaselineMetrics(
  rawContent: string | undefined,
  options: { minSpeakerNoteChars?: number } = {},
): PresentationV2LegacyBaselineMetrics | undefined {
  if (!rawContent) return undefined

  const parsed = parseArtifactContent('apresentacao', rawContent)
  if (parsed.kind !== 'presentation') {
    return {
      parseable: false,
      title: 'Apresentacao v1',
      slideCount: 0,
      renderedSlideCount: 0,
      speakerNoteCoverage: 0,
      averageBulletsPerSlide: 0,
      totalSpeakerNoteChars: 0,
      findings: ['Baseline v1 nao e parseavel.'],
    }
  }

  const minSpeakerNoteChars = options.minSpeakerNoteChars ?? 40
  const slides = parsed.data.slides
  const slidesWithSpeakerNotes = slides.filter((slide) => slide.speakerNotes.trim().length >= minSpeakerNoteChars)
  const totalBullets = slides.reduce((sum, slide) => sum + slide.bullets.length, 0)
  const totalSpeakerNoteChars = slides.reduce((sum, slide) => sum + slide.speakerNotes.trim().length, 0)
  const findings: string[] = []

  if (slides.length === 0) findings.push('Baseline v1 sem slides.')
  if (countRenderedSlides(parsed.data) < slides.length) findings.push('Baseline v1 tem slides sem render visual.')
  if (slidesWithSpeakerNotes.length < slides.length) findings.push('Baseline v1 tem speaker notes incompletas.')

  return {
    parseable: true,
    title: parsed.data.title || 'Apresentacao v1',
    slideCount: slides.length,
    renderedSlideCount: countRenderedSlides(parsed.data),
    speakerNoteCoverage: slides.length > 0 ? Math.round((slidesWithSpeakerNotes.length / slides.length) * 100) : 0,
    averageBulletsPerSlide: slides.length > 0 ? Math.round((totalBullets / slides.length) * 10) / 10 : 0,
    totalSpeakerNoteChars,
    findings,
  }
}

function buildDeltas(
  regression: PresentationV2RegressionReport,
  legacyBaseline?: PresentationV2LegacyBaselineMetrics,
): PresentationV2BenchmarkDeltas | undefined {
  if (!legacyBaseline?.parseable) return undefined

  return {
    slideCountDelta: regression.metrics.slideCount - legacyBaseline.slideCount,
    visualAssetDelta: regression.metrics.storedVisualAssets - legacyBaseline.renderedSlideCount,
    speakerNoteCoverageDelta: regression.metrics.speakerNoteCoverage - legacyBaseline.speakerNoteCoverage,
    speakerNoteCharsDelta: regression.metrics.totalSpeakerNoteChars - legacyBaseline.totalSpeakerNoteChars,
  }
}

export function runPresentationV2GoldenBenchmark(
  cases: PresentationV2GoldenBenchmarkCase[],
  options: { thresholds?: Partial<PresentationV2RegressionThresholds> } = {},
): PresentationV2GoldenBenchmarkSummary {
  const reports = cases.map((benchmarkCase) => {
    const regression = buildPresentationV2RegressionReportFromContent(benchmarkCase.rawContent, {
      title: benchmarkCase.label,
      executions: benchmarkCase.executions,
      thresholds: {
        requireTelemetry: true,
        ...(options.thresholds || {}),
        ...(benchmarkCase.thresholds || {}),
      },
    })
    const legacyBaseline = buildPresentationV2LegacyBaselineMetrics(benchmarkCase.baselineLegacyContent)

    return {
      id: benchmarkCase.id,
      label: benchmarkCase.label,
      description: benchmarkCase.description,
      status: regression.status,
      regression,
      legacyBaseline,
      deltas: buildDeltas(regression, legacyBaseline),
    }
  })

  const findings = reports.flatMap((report) => report.regression.findings
    .filter((finding) => finding.status !== 'pass')
    .map((finding) => `${report.id}: ${finding.message}`))

  if (reports.length === 0) findings.push('Nenhum caso golden Presentation v2 foi configurado.')

  const status = reports.length === 0 ? 'fail' : statusFromReports(reports)

  return {
    status,
    totalCases: reports.length,
    passedCases: reports.filter((report) => report.status === 'pass').length,
    reviewCases: reports.filter((report) => report.status === 'review').length,
    failedCases: reports.filter((report) => report.status === 'fail').length,
    averageOverallScore: average(reports.map((report) => report.regression.metrics.overallScore)),
    averageDeckScore: average(reports.map((report) => report.regression.metrics.deckScore)),
    averageMultimodalScore: average(reports.map((report) => report.regression.metrics.multimodalScore)),
    averageExportScore: average(reports.map((report) => report.regression.metrics.exportScore)),
    totalTelemetryCalls: reports.reduce((sum, report) => sum + report.regression.telemetry.calls, 0),
    totalCostUsd: roundCurrency(reports.reduce((sum, report) => sum + report.regression.telemetry.totalCostUsd, 0)),
    maxFallbackRate: reports.reduce((max, report) => Math.max(max, report.regression.telemetry.fallbackRate), 0),
    reports,
    findings,
  }
}

export function formatPresentationV2BenchmarkReport(summary: PresentationV2GoldenBenchmarkSummary): string {
  const lines = [
    '# Presentation v2 Golden Benchmark',
    '',
    `Status: ${summary.status.toUpperCase()}`,
    `Cases: ${summary.passedCases} pass, ${summary.reviewCases} review, ${summary.failedCases} fail (${summary.totalCases} total)`,
    `Scores: overall ${summary.averageOverallScore}/100, deck ${summary.averageDeckScore}/100, multimodal ${summary.averageMultimodalScore}/100, export ${summary.averageExportScore}/100`,
    `Telemetry: ${summary.totalTelemetryCalls} calls, US$ ${summary.totalCostUsd.toFixed(6)}, max fallback ${Math.round(summary.maxFallbackRate * 100)}%`,
    '',
  ]

  for (const report of summary.reports) {
    lines.push(`- ${report.label}: ${report.status.toUpperCase()} | overall ${report.regression.metrics.overallScore}/100 | ${report.regression.metrics.slideCount} slides | ${report.regression.metrics.storedVisualAssets} visual assets`)
    if (report.deltas) {
      const visualSign = report.deltas.visualAssetDelta >= 0 ? '+' : ''
      const slideSign = report.deltas.slideCountDelta >= 0 ? '+' : ''
      const speakerSign = report.deltas.speakerNoteCoverageDelta >= 0 ? '+' : ''
      lines.push(`  v1/v2 delta: ${slideSign}${report.deltas.slideCountDelta} slides, ${visualSign}${report.deltas.visualAssetDelta} visual assets, ${speakerSign}${report.deltas.speakerNoteCoverageDelta}pp speaker-note coverage`)
    } else if (report.legacyBaseline && !report.legacyBaseline.parseable) {
      lines.push('  v1/v2 delta: baseline v1 unavailable')
    }
    for (const finding of report.regression.findings.filter((item) => item.status !== 'pass')) {
      lines.push(`  ${finding.status.toUpperCase()}: ${finding.message}`)
    }
  }

  if (summary.findings.length === 0) {
    lines.push('', 'Findings: all golden cases passed deterministic release gates.')
  } else {
    lines.push('', 'Findings:')
    for (const finding of summary.findings) lines.push(`- ${finding}`)
  }

  return lines.join('\n')
}
