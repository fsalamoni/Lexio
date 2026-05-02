// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import EffortPicker from './EffortPicker'

afterEach(() => cleanup())

describe('EffortPicker', () => {
  it('renders all three effort levels', () => {
    render(<EffortPicker value="medio" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Rápido' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Médio' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Profundo' })).toBeDefined()
  })

  it('invokes onChange with the clicked effort level', () => {
    const onChange = vi.fn()
    render(<EffortPicker value="medio" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Profundo' }))
    expect(onChange).toHaveBeenCalledWith('profundo')
  })

  it('disables every button when disabled is true', () => {
    render(<EffortPicker value="medio" onChange={() => {}} disabled />)
    for (const label of ['Rápido', 'Médio', 'Profundo']) {
      const btn = screen.getByRole('button', { name: label }) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    }
  })
})
