import { describe, expect, it } from 'vitest'

import { parseArtifactContent } from './artifact-parsers'
import { createUsageExecutionRecord } from './cost-analytics'
import type { PresentationV2Deck } from './firestore-types'
import {
  buildPresentationV2RegressionReport,
  buildPresentationV2RegressionReportFromContent,
} from './presentation-v2-regression-harness'
import { getDemoResearchNotebooks } from '../demo/notebook-data'

function getDemoPresentationV2() {
  const [notebook] = getDemoResearchNotebooks()
  const artifact = notebook.artifacts.find((item) => item.type === 'apresentacao_v2')
  if (!artifact) throw new Error('Demo Presentation v2 artifact not found')
  const parsed = parseArtifactContent('apresentacao_v2', artifact.content)
  if (parsed.kind !== 'presentation_v2') throw new Error('Demo Presentation v2 artifact is not parseable')
  return { notebook, artifact, parsed: parsed.data }
}

describe('Presentation v2 regression harness', () => {
  it('builds a deterministic smoke report from the demo notebook fixture', () => {
    const { notebook, artifact } = getDemoPresentationV2()

    const report = buildPresentationV2RegressionReportFromContent(artifact.content, {
      executions: notebook.llm_executions,
    })

    expect(report.title).toContain('Estrategia juridica')
    expect(report.metrics.slideCount).toBe(4)
    expect(report.metrics.storedVisualAssets).toBeGreaterThanOrEqual(6)
    expect(report.metrics.altTextCoverage).toBe(100)
    expect(report.metrics.totalSpeakerNoteChars).toBeGreaterThan(200)
    expect(report.metrics.designSystemCoverage).toBe(1)
    expect(report.metrics.sourcePriorityCount).toBeGreaterThan(0)
    expect(report.telemetry.calls).toBeGreaterThan(0)
    expect(report.telemetry.phases).toEqual(expect.arrayContaining([
      'presentation_v2_image_generator',
      'presentation_v2_orchestrator',
      'presentation_v2_packager',
    ]))
    expect(report.status).toBe('pass')
    expect(report.findings).toEqual([expect.objectContaining({ id: 'baseline', status: 'pass' })])
  })

  it('fails the gate when rejected visual assets remain in the manifesto', () => {
    const { parsed } = getDemoPresentationV2()
    const deck: PresentationV2Deck = {
      ...parsed.deck,
      assets: parsed.deck.assets.map((asset) => asset.id === 'slide-1-render'
        ? {
            ...asset,
            operatorReview: {
              status: 'rejected',
              at: '2026-05-14T10:00:00.000Z',
              source: 'viewer_asset',
              reason: 'Visual desalinhado no benchmark.',
            },
          }
        : asset),
    }

    const report = buildPresentationV2RegressionReport({
      ...parsed,
      deck,
      assets: deck.assets,
    })

    expect(report.status).toBe('fail')
    expect(report.metrics.rejectedVisualAssets).toBe(1)
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'export-blocked', status: 'fail' }),
      expect.objectContaining({ id: 'operator-rejected-assets', status: 'fail' }),
    ]))
  })

  it('preserves operator revision metadata through parsing and reports audit events', () => {
    const { parsed } = getDemoPresentationV2()
    const deck: PresentationV2Deck = {
      ...parsed.deck,
      revisionHistory: [
        ...(parsed.deck.revisionHistory || []),
        {
          at: '2026-05-14T11:00:00.000Z',
          agent: 'presentation_v2_operator',
          summary: 'Operador aprovou o visual final do slide 1.',
          slideNumbers: [1],
          operatorSource: 'viewer_asset',
          operatorAction: 'visual',
          operatorReason: 'Benchmark operator review.',
          assetTypes: ['render'],
        },
      ],
    }
    const rawContent = JSON.stringify(deck)
    const report = buildPresentationV2RegressionReportFromContent(rawContent, {
      executions: [createUsageExecutionRecord({
        source_type: 'presentation_pipeline_v2',
        source_id: 'artifact-1',
        phase: 'presentation_v2_reviewer',
        agent_name: 'Apresentação v2: Revisor Multimodal',
        model: 'demo/text-model',
        tokens_in: 100,
        tokens_out: 40,
        duration_ms: 300,
        execution_state: 'completed',
      })],
    })

    expect(report.metrics.operatorRevisionEvents).toBe(1)
    expect(report.telemetry.phases).toContain('presentation_v2_reviewer')
  })

  it('returns a hard failure for non-parseable Presentation v2 content', () => {
    const report = buildPresentationV2RegressionReportFromContent('nao e json', { title: 'Broken deck' })

    expect(report.status).toBe('fail')
    expect(report.title).toBe('Broken deck')
    expect(report.findings).toEqual([expect.objectContaining({ id: 'parse', status: 'fail' })])
  })
})
