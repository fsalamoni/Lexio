// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import EmptyState from './EmptyState'

describe('EmptyState', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the default orchestration guidance and setup hint', () => {
    render(<EmptyState />)

    expect(screen.getByRole('heading', { name: /comece uma conversa/i })).toBeTruthy()
    expect(screen.getByText(/configure suas chaves em \/settings/i)).toBeTruthy()
    expect(screen.getByText(/resuma o último parecer que comecei a redigir/i)).toBeTruthy()
    expect(screen.getByText(/esboce a estrutura de uma petição inicial trabalhista/i)).toBeTruthy()
  })

  it('switches to the demo guidance when demo mode is enabled', () => {
    render(<EmptyState demo />)

    expect(screen.getByText(/você está em modo demo/i)).toBeTruthy()
    expect(screen.queryByText(/configure suas chaves em \/settings/i)).toBeNull()
  })
})