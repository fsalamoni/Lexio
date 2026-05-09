// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentV3PipelineStep } from '../lib/document-v3-pipeline'

const v3Mocks = vi.hoisted(() => ({
  modalProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('./AgentTrailProgressModal', () => ({
  default: (props: Record<string, unknown>) => {
    v3Mocks.modalProps.push(props)
    return <div data-testid="agent-trail-v3-shell">{props.children as React.ReactNode}</div>
  },
}))

import AgentTrailProgressModalV3 from './AgentTrailProgressModalV3'

function makeAgent(overrides: Partial<DocumentV3PipelineStep>): DocumentV3PipelineStep {
  return {
    key: 'v3_request_parser',
    label: 'Parser da Solicitação',
    description: 'Extrai fatos e partes relevantes',
    phase: 'compreensao',
    status: 'active',
    executionState: 'running',
    runtimeMessage: 'Lendo narrativa do cliente',
    runtimeModel: 'Gemini',
    ...overrides,
  }
}

describe('AgentTrailProgressModalV3', () => {
  beforeEach(() => {
    v3Mocks.modalProps.length = 0
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('maps v3 agents into prefixed trail steps and exposes the cancel action while running', () => {
    const onCancel = vi.fn()

    render(
      <AgentTrailProgressModalV3
        isOpen
        title="Pipeline V3"
        subtitle="Documento V3"
        currentMessage="Executando pipeline"
        percent={41}
        agents={[
          makeAgent({}),
          makeAgent({
            key: 'v3_writer',
            label: 'Redator',
            description: 'Redige o documento final',
            phase: 'redacao',
            status: 'pending',
            executionState: 'queued',
            runtimeMessage: undefined,
            runtimeModel: '—',
          }),
        ]}
        isComplete={false}
        hasError={false}
        onClose={() => {}}
        onCancel={onCancel}
      >
        <span>Resumo adicional</span>
      </AgentTrailProgressModalV3>,
    )

    expect(screen.getByTestId('agent-trail-v3-shell')).toBeTruthy()
    expect(screen.getByText('Resumo adicional')).toBeTruthy()
    expect(screen.getByTestId('cancel-generation-button')).toBeTruthy()

    const captured = v3Mocks.modalProps[0]
    expect(captured.title).toBe('Pipeline V3')
    expect(captured.currentMessage).toBe('Executando pipeline')
    expect(captured.steps).toEqual([
      {
        key: 'v3_request_parser',
        label: 'Fase 1 — Compreensão · Parser da Solicitação',
        status: 'active',
        executionState: 'running',
        detail: 'Lendo narrativa do cliente',
        meta: 'Modelo: Gemini',
      },
      {
        key: 'v3_writer',
        label: 'Fase 4 — Redação · Redator',
        status: 'pending',
        executionState: 'queued',
        detail: 'Redige o documento final',
        meta: undefined,
      },
    ])

    fireEvent.click(screen.getByTestId('cancel-generation-button'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('hides the cancel action once the v3 pipeline is complete', () => {
    render(
      <AgentTrailProgressModalV3
        isOpen
        title="Pipeline V3"
        currentMessage="Concluído"
        percent={100}
        agents={[makeAgent({ status: 'completed', executionState: 'completed' })]}
        isComplete
        hasError={false}
        onClose={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.queryByTestId('cancel-generation-button')).toBeNull()
  })
})