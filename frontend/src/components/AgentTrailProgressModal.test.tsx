// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const trailMocks = vi.hoisted(() => ({
  handoffStateMachineEnabled: false,
}))

vi.mock('../lib/feature-flags', () => ({
  isEnabled: (flag: string) => flag === 'FF_HANDOFF_STATE_MACHINE' ? trailMocks.handoffStateMachineEnabled : false,
}))

vi.mock('../lib/workspace-routes', () => ({
  buildWorkspaceSettingsPath: ({ preserveSearch }: { preserveSearch?: string }) => `/settings${preserveSearch ?? ''}`,
}))

vi.mock('./DraggablePanel', () => ({
  default: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) => (
    open ? <section data-testid="agent-trail-panel"><h1>{title}</h1>{children}</section> : null
  ),
}))

import AgentTrailProgressModal, { type TrailStep } from './AgentTrailProgressModal'

function renderModal(props?: Partial<React.ComponentProps<typeof AgentTrailProgressModal>>) {
  const defaultSteps: TrailStep[] = [
    { key: 'triagem', label: 'Triagem', status: 'completed', detail: 'Tema extraído' },
    { key: 'jurista', label: 'Jurista', status: 'active', detail: 'Analisando o caso', meta: 'Modelo: Sonnet' },
    { key: 'redator', label: 'Redator', status: 'pending', detail: 'Aguardando análise' },
  ]

  return render(
    <MemoryRouter initialEntries={['/documents/new?redesign_v2=1']}>
      <AgentTrailProgressModal
        isOpen
        title="Trilha de agentes"
        subtitle="Documento teste"
        currentMessage="Analisando teses centrais"
        percent={72}
        steps={defaultSteps}
        isComplete={false}
        hasError={false}
        onClose={() => {}}
        {...props}
      >
        <button type="button">Retomar fluxo</button>
      </AgentTrailProgressModal>
    </MemoryRouter>,
  )
}

describe('AgentTrailProgressModal', () => {
  beforeEach(() => {
    trailMocks.handoffStateMachineEnabled = false
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the legacy handoff summary, warnings, settings hint and preserved settings link', () => {
    renderModal({
      warning: 'Um fallback foi acionado na trilha.',
      settingsHint: 'Revise o modelo configurado para esta etapa.',
    })

    expect(screen.getByTestId('agent-trail-panel')).toBeTruthy()
    expect(screen.getByText('Trilha de agentes')).toBeTruthy()
    expect(screen.getByText('Documento teste')).toBeTruthy()
    expect(screen.getByText('Analisando teses centrais')).toBeTruthy()
    expect(screen.getAllByText('72%').length).toBeGreaterThan(0)
    expect(screen.getByText('Triagem → Jurista')).toBeTruthy()
    expect(screen.getByText('Triagem concluiu e passou o dossiê para Jurista.')).toBeTruthy()
    expect(screen.getByText(/em seguida:/i)).toBeTruthy()
    expect(screen.getAllByText('Modelo: Sonnet')).toHaveLength(2)
    expect(screen.getByText('1/3 etapas')).toBeTruthy()
    expect(screen.getByText('Um fallback foi acionado na trilha.')).toBeTruthy()
    expect(screen.getByText('Revise o modelo configurado para esta etapa.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retomar fluxo/i })).toBeTruthy()

    const settingsLink = screen.getByRole('link', { name: /abrir configurações/i })
    expect(settingsLink.getAttribute('href')).toBe('/settings?redesign_v2=1')
  })

  it('uses the handoff state machine message and clamps in-flight progress while waiting for I/O', () => {
    trailMocks.handoffStateMachineEnabled = true

    renderModal({
      currentMessage: 'Aguardando retorno do modelo',
      percent: 120,
      steps: [
        {
          key: 'pesquisador',
          label: 'Pesquisador',
          status: 'active',
          executionState: 'waiting_io',
          detail: 'Aguardando resposta do modelo',
        },
        {
          key: 'moderador',
          label: 'Moderador',
          status: 'pending',
          detail: 'Próxima mesa',
        },
      ],
    })

    expect(screen.getAllByText('99%').length).toBeGreaterThan(0)
    expect(screen.getByText('Pesquisador está aguardando resposta do modelo antes da próxima mesa.')).toBeTruthy()
    expect(screen.getAllByText('Pesquisador').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Moderador').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Aguardando resposta do modelo')).toHaveLength(2)
    expect(screen.getByText('0/2 etapas')).toBeTruthy()
  })
})