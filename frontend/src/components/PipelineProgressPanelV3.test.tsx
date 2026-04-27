// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PipelineProgressPanelV3 from './PipelineProgressPanelV3'
import type { DocumentV3PipelineStep } from '../lib/document-v3-pipeline'

function makeStep(over: Partial<DocumentV3PipelineStep>): DocumentV3PipelineStep {
  return {
    key: 'v3_writer',
    label: 'Redator',
    description: 'descrição',
    phase: 'redacao',
    modelKey: 'v3_writer',
    status: 'completed',
    ...over,
  } as DocumentV3PipelineStep
}

describe('PipelineProgressPanelV3 — UX badges and per-phase summary (G)', () => {
  afterEach(() => cleanup())
  it('renders a retry badge when runtimeRetryCount > 0', () => {
    const agents: DocumentV3PipelineStep[] = [
      makeStep({
        key: 'v3_writer',
        label: 'Redator',
        runtimeRetryCount: 2,
        runtimeDurationMs: 4500,
        runtimeCostUsd: 0.012,
      }),
    ]
    render(
      <PipelineProgressPanelV3 agents={agents} percent={92} currentMessage="" isComplete={false} hasError={false} />,
    )
    const badge = screen.getByTestId('retry-badge-v3_writer')
    expect(badge.textContent).toMatch(/retry\s+2/i)
  })

  it('renders an "escalado" badge when runtimeUsedFallback is true', () => {
    const agents: DocumentV3PipelineStep[] = [
      makeStep({
        key: 'v3_writer',
        label: 'Redator',
        runtimeUsedFallback: true,
        runtimeFallbackFrom: 'anthropic/claude-sonnet-4',
      }),
    ]
    render(
      <PipelineProgressPanelV3 agents={agents} percent={92} currentMessage="" isComplete={false} hasError={false} />,
    )
    const badge = screen.getByTestId('escalated-badge-v3_writer')
    expect(badge.textContent?.toLowerCase()).toContain('escalado')
  })

  it('renders a phase-summary header (cost · duration)', () => {
    const agents: DocumentV3PipelineStep[] = [
      makeStep({
        key: 'v3_writer',
        label: 'Redator',
        runtimeCostUsd: 0.01,
        runtimeDurationMs: 12_000,
      }),
      makeStep({
        key: 'v3_writer_reviser',
        label: 'Revisor',
        runtimeCostUsd: 0.002,
        runtimeDurationMs: 6_000,
      }),
    ]
    render(
      <PipelineProgressPanelV3 agents={agents} percent={100} currentMessage="" isComplete hasError={false} />,
    )
    const summary = screen.getByTestId('phase-summary-redacao')
    expect(summary.textContent).toMatch(/\d+\s*s/)
  })
})
