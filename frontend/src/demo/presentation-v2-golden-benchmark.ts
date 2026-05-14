import {
  formatPresentationV2BenchmarkReport,
  runPresentationV2GoldenBenchmark,
  type PresentationV2GoldenBenchmarkCase,
  type PresentationV2GoldenBenchmarkSummary,
} from '../lib/presentation-v2-benchmark'
import { getDemoResearchNotebooks } from './notebook-data'

export const DEMO_PRESENTATION_V2_GOLDEN_CASE_ID = 'demo-contractual-conciliation'

export function buildDemoPresentationV2GoldenCases(): PresentationV2GoldenBenchmarkCase[] {
  return getDemoResearchNotebooks().flatMap((notebook) => {
    const presentationV2Artifact = notebook.artifacts.find((artifact) => artifact.type === 'apresentacao_v2')
    if (!presentationV2Artifact) return []

    const legacyPresentationArtifact = notebook.artifacts.find((artifact) => artifact.type === 'apresentacao')

    return [{
      id: DEMO_PRESENTATION_V2_GOLDEN_CASE_ID,
      label: presentationV2Artifact.title,
      description: 'Smoke deterministico local para audiencia de conciliacao contratual, com baseline v1 no mesmo caderno.',
      rawContent: presentationV2Artifact.content,
      baselineLegacyContent: legacyPresentationArtifact?.content,
      executions: notebook.llm_executions || [],
      thresholds: {
        minDeckScore: 80,
        minMultimodalScore: 70,
        minExportScore: 75,
        minAltTextCoverage: 100,
        minSpeakerNoteChars: 40,
        minDesignSystemCoverage: 1,
        requireTelemetry: true,
        requireSourcePriority: true,
        requireNoRejectedVisualAssets: true,
        maxFailedExecutions: 0,
        maxFallbackRate: 0.4,
      },
    }]
  })
}

export function runDemoPresentationV2GoldenBenchmark(): PresentationV2GoldenBenchmarkSummary {
  return runPresentationV2GoldenBenchmark(buildDemoPresentationV2GoldenCases())
}

export function formatDemoPresentationV2GoldenBenchmarkReport(): string {
  return formatPresentationV2BenchmarkReport(runDemoPresentationV2GoldenBenchmark())
}
