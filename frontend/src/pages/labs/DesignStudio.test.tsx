// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DesignStudio from './DesignStudio'

const isEnabledMock = vi.fn()

vi.mock('../../lib/feature-flags', () => ({
  isEnabled: (key: string) => isEnabledMock(key),
}))

afterEach(() => cleanup())
beforeEach(() => isEnabledMock.mockReset())

describe('DesignStudio', () => {
  it('shows the gated state when FF_DESIGN_STUDIO is off', () => {
    isEnabledMock.mockReturnValue(false)
    render(<DesignStudio />)
    expect(screen.getByText(/FF_DESIGN_STUDIO/)).toBeDefined()
    expect(screen.queryByRole('button', { name: /Gerar design/ })).toBeNull()
  })

  it('renders the studio shell and every artifact kind when enabled', () => {
    isEnabledMock.mockReturnValue(true)
    render(<DesignStudio />)
    expect(screen.getByRole('button', { name: 'Gerar design' })).toBeDefined()
    for (const label of ['Slides', 'Site (web)', 'App (mobile)', 'Wireframe', 'Documento', 'Animação']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined()
    }
  })

  it('keeps generation disabled until a brief is provided, then renders a live preview', () => {
    isEnabledMock.mockReturnValue(true)
    render(<DesignStudio />)

    const generate = screen.getByRole('button', { name: 'Gerar design' }) as HTMLButtonElement
    expect(generate.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Briefing do design'), {
      target: { value: 'Landing page para escritório trabalhista' },
    })
    expect(generate.disabled).toBe(false)

    fireEvent.click(generate)

    const frame = screen.getByTitle('Amostra do design') as HTMLIFrameElement
    expect(frame).toBeDefined()
    expect(frame.getAttribute('srcdoc')).toContain('<!doctype html>')
    expect((screen.getByRole('button', { name: /Exportar HTML/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})
