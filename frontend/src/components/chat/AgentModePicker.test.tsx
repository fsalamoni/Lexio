// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AgentModePicker from './AgentModePicker'

afterEach(() => cleanup())

describe('AgentModePicker', () => {
  it('renders all three agent modes as segmented buttons', () => {
    render(<AgentModePicker value="ask" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Automático' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Perguntar' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Planejar' })).toBeDefined()
  })

  it('marks the active mode with aria-pressed', () => {
    render(<AgentModePicker value="plan" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Planejar' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Automático' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('invokes onChange with the clicked mode', () => {
    const onChange = vi.fn()
    render(<AgentModePicker value="ask" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Automático' }))
    expect(onChange).toHaveBeenCalledWith('auto')
  })

  it('invokes onChange from the compact mobile select', () => {
    const onChange = vi.fn()
    render(<AgentModePicker value="ask" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Modo de execução do agente'), { target: { value: 'plan' } })
    expect(onChange).toHaveBeenCalledWith('plan')
  })

  it('disables every control when disabled is true', () => {
    render(<AgentModePicker value="ask" onChange={() => {}} disabled />)
    for (const label of ['Automático', 'Perguntar', 'Planejar']) {
      const btn = screen.getByRole('button', { name: label }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    }
    expect((screen.getByLabelText('Modo de execução do agente') as HTMLSelectElement).disabled).toBe(true)
  })

  it('surfaces the configured target repository as a scope hint', () => {
    render(<AgentModePicker value="plan" onChange={() => {}} targetRepo="fsalamoni/Lexio" />)
    const active = screen.getByRole('button', { name: 'Planejar' })
    expect(active.getAttribute('title')).toContain('escopo: fsalamoni/Lexio')
  })
})
