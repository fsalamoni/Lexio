// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentPipelineStep } from '../lib/document-pipeline'

import PipelineProgressPanel from './PipelineProgressPanel'

function makeAgents(): DocumentPipelineStep[] {
  const now = Date.now()
  return [
    {
      key: 'triagem',
      label: 'Triagem',
      description: 'Extração inicial',
      modelKey: 'triagem',
      status: 'completed',
      executionState: 'completed',
      startedAt: now - 30_000,
      completedAt: now - 20_000,
      runtimeMessage: 'Triagem concluída',
      runtimeModel: 'Haiku',
      runtimeCostUsd: 0.02,
    },
    {
      key: 'pesquisador',
      label: 'Pesquisador',
      description: 'Pesquisa jurídica',
      modelKey: 'pesquisador',
      status: 'active',
      executionState: 'running',
      startedAt: now - 5_000,
      runtimeMessage: 'Buscando jurisprudência',
      runtimeModel: 'Sonnet',
      runtimeRetryCount: 1,
      runtimeFallbackFrom: 'haiku',
      runtimeCostUsd: 0.03,
    },
    {
      key: 'redacao',
      label: 'Redator',
      description: 'Redação final',
      modelKey: 'redacao',
      status: 'pending',
      executionState: 'queued',
      runtimeMessage: 'Aguardando etapa anterior',
      runtimeModel: '—',
    },
  ]
}

describe('PipelineProgressPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders operational progress, warning and resume action for an in-flight pipeline', () => {
    const onResume = vi.fn()

    render(
      <PipelineProgressPanel
        agents={makeAgents()}
        percent={42}
        currentMessage="Buscando jurisprudência"
        isComplete={false}
        hasError={false}
        warning="Uma etapa precisou de fallback."
        resumeAction={{ label: 'Retomar execução', onClick: onResume }}
      />,
    )

    expect(screen.getByText(/gerando documento/i)).toBeTruthy()
    expect(screen.getByText(/buscando jurisprudência — 1\/3 etapas/i)).toBeTruthy()
    expect(screen.getByText(/custo/i)).toBeTruthy()
    expect(screen.getByText(/1 fallback/i)).toBeTruthy()
    expect(screen.getAllByText(/1 retry/i)).toHaveLength(2)
    expect(screen.getByText(/uma etapa precisou de fallback/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /retomar execução/i }))

    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('collapses and shows the completed state when the pipeline finishes', () => {
    render(
      <PipelineProgressPanel
        agents={makeAgents().map(agent => ({
          ...agent,
          status: 'completed',
          executionState: 'completed',
          completedAt: agent.completedAt ?? Date.now(),
          runtimeMessage: `${agent.label} concluído`,
        }))}
        percent={100}
        currentMessage="Finalizado"
        isComplete
        hasError={false}
      />,
    )

    expect(screen.getByText(/documento gerado com sucesso/i)).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /documento gerado com sucesso/i }))

    expect(screen.queryByText('Triagem')).toBeNull()
  })
})