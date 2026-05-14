import { describe, expect, it } from 'vitest'

import { runPresentationV2GoldenBenchmark } from '../lib/presentation-v2-benchmark'
import {
  buildDemoPresentationV2GoldenCases,
  DEMO_PRESENTATION_V2_GOLDEN_CASE_ID,
  formatDemoPresentationV2GoldenBenchmarkReport,
  runDemoPresentationV2GoldenBenchmark,
} from './presentation-v2-golden-benchmark'

describe('Presentation v2 golden benchmark demo suite', () => {
  it('builds a strict golden case from the local demo notebook', () => {
    const cases = buildDemoPresentationV2GoldenCases()

    expect(cases).toHaveLength(1)
    expect(cases[0]).toEqual(expect.objectContaining({
      id: DEMO_PRESENTATION_V2_GOLDEN_CASE_ID,
      baselineLegacyContent: expect.any(String),
      rawContent: expect.any(String),
    }))
    expect(cases[0].executions?.some((execution) => execution.phase === 'presentation_v2_packager')).toBe(true)
  })

  it('passes the demo golden benchmark and reports v1/v2 deltas', () => {
    const summary = runDemoPresentationV2GoldenBenchmark()
    const [report] = summary.reports

    expect(summary.status).toBe('pass')
    expect(summary.totalCases).toBe(1)
    expect(summary.passedCases).toBe(1)
    expect(summary.failedCases).toBe(0)
    expect(summary.totalTelemetryCalls).toBeGreaterThan(0)
    expect(report.id).toBe(DEMO_PRESENTATION_V2_GOLDEN_CASE_ID)
    expect(report.regression.status).toBe('pass')
    expect(report.legacyBaseline?.parseable).toBe(true)
    expect(report.legacyBaseline?.slideCount).toBe(2)
    expect(report.deltas?.slideCountDelta).toBeGreaterThan(0)
    expect(report.deltas?.visualAssetDelta).toBeGreaterThan(0)
    expect(report.deltas?.speakerNoteCharsDelta).toBeGreaterThan(0)
    expect(report.regression.metrics.designSystemCoverage).toBe(1)
  })

  it('formats an operational benchmark report for release review', () => {
    const formatted = formatDemoPresentationV2GoldenBenchmarkReport()

    expect(formatted).toContain('Presentation v2 Golden Benchmark')
    expect(formatted).toContain('Status: PASS')
    expect(formatted).toContain('v1/v2 delta')
    expect(formatted).toContain('all golden cases passed')
  })

  it('fails explicitly when no golden cases are configured', () => {
    const summary = runPresentationV2GoldenBenchmark([])

    expect(summary.status).toBe('fail')
    expect(summary.totalCases).toBe(0)
    expect(summary.findings).toContain('Nenhum caso golden Presentation v2 foi configurado.')
  })
})
