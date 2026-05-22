// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import TrailTimeline from './TrailTimeline'
import type { TrailStep } from '../../lib/chat-orchestrator/trail-projection'

afterEach(cleanup)

function step(overrides: Partial<TrailStep> & Pick<TrailStep, 'id' | 'kind' | 'actor'>): TrailStep {
  return {
    ts: '2026-05-21T12:00:00.000Z',
    status: 'done',
    sourceEventCount: 1,
    ...overrides,
  }
}

describe('TrailTimeline', () => {
  it('renders nothing for an empty step list', () => {
    const { container } = render(<TrailTimeline steps={[]} live={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one card per step, with thought collapsed by default and grouped counts disclosed', () => {
    const { container } = render(
      <TrailTimeline
        live={false}
        steps={[
          step({
            id: 's1',
            kind: 'orchestrator_decision',
            actor: 'Orquestrador',
            decision: { tool: 'generate_image' },
            thought: { stream: 'Raciocínio do orquestrador' },
          }),
          step({
            id: 's2',
            kind: 'agent_invocation',
            actor: 'chat_image_generator',
            action: 'Gerou a imagem',
            sourceEventCount: 3,
          }),
        ]}
      />,
    )

    expect(screen.getAllByText('Orquestrador').length).toBeGreaterThan(0)
    expect(screen.getByText('chat_image_generator')).toBeTruthy()
    // Thought renders inside a collapsed <details> the user can expand —
    // nothing is hidden from the DOM, it just starts closed.
    const details = container.querySelector('details')
    expect(details).toBeTruthy()
    expect(details?.hasAttribute('open')).toBe(false)
    expect(screen.getByText('Raciocínio do orquestrador')).toBeTruthy()
    // The decision renders as a tool name, never as a raw JSON "Passo".
    expect(screen.getByText('generate_image')).toBeTruthy()
    expect(screen.getByText(/3 eventos agrupados/)).toBeTruthy()
    expect(screen.getByText(/2 ocorrências/)).toBeTruthy()
  })

  it('renders a grouped super-skill occurrence as a single card', () => {
    render(
      <TrailTimeline
        live={false}
        steps={[
          step({ id: 's1', kind: 'super_skill', actor: 'generate_image', action: 'imagem pronta', sourceEventCount: 2 }),
        ]}
      />,
    )

    expect(screen.getAllByText('generate_image')).toHaveLength(1)
    expect(screen.getByText('imagem pronta')).toBeTruthy()
  })
})
