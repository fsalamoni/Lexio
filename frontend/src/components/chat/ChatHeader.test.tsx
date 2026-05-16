// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ChatHeader from './ChatHeader'

vi.mock('../../lib/model-config', () => ({
  CHAT_ORCHESTRATOR_AGENT_DEFS: Array.from({ length: 16 }, (_, index) => ({ key: `chat-${index}` })),
}))

describe('ChatHeader', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the conversation title, search toggle, sidecar placeholder and cancel action while busy', () => {
    const onChangeEffort = vi.fn()
    const onCancel = vi.fn()
    const onToggleSearch = vi.fn()

    render(
      <ChatHeader
        conversation={{
          id: 'conv-1',
          title: 'Conversa estratégica',
          effort: 'medio',
          created_at: '2026-05-08T10:00:00.000Z',
          updated_at: '2026-05-08T10:00:00.000Z',
        }}
        effort="medio"
        onChangeEffort={onChangeEffort}
        busy
        onCancel={onCancel}
        onToggleSearch={onToggleSearch}
        showSearch
      />,
    )

    expect(screen.getByRole('heading', { name: 'Conversa estratégica' })).toBeTruthy()
    expect(screen.getByText(/16 agentes configuráveis/i)).toBeTruthy()
    expect(screen.getByText(/lotes paralelos/i)).toBeTruthy()
    expect(screen.getByText(/sidecar offline/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /buscar/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Pesquisa Profunda' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onToggleSearch).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onChangeEffort).not.toHaveBeenCalled()
  })

  it('falls back to the canonical title and hides optional controls when not provided', () => {
    const onChangeEffort = vi.fn()

    render(
      <ChatHeader
        conversation={null}
        effort="rapido"
        onChangeEffort={onChangeEffort}
        busy={false}
        onCancel={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /buscar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /cancelar/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Pesquisa Profunda' }))

    expect(onChangeEffort).toHaveBeenCalledWith('deep_research')
  })
})