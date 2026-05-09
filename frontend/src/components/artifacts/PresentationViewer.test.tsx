// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedPresentation } from './artifact-parsers'
import PresentationViewer from './PresentationViewer'

afterEach(() => {
  cleanup()
})

describe('PresentationViewer', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true,
    })
  })

  it('supports thumbnail navigation, notes, fullscreen, and slide editing persistence', () => {
    const onChange = vi.fn()
    const data: ParsedPresentation = {
      title: 'Apresentação Final',
      slides: [
        {
          number: 1,
          title: 'Slide inicial',
          bullets: ['Ponto A'],
          speakerNotes: 'Nota do primeiro slide.',
        },
        {
          number: 2,
          title: 'Slide final',
          bullets: ['Ponto B'],
          speakerNotes: '',
          visualSuggestion: 'Imagem de apoio',
        },
      ],
    }

    render(<PresentationViewer data={data} onChange={onChange} />)

    expect(screen.getByText('Apresentação Final')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ir para slide 2' }))
    expect(screen.getAllByText('Slide final').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
    expect(screen.getByRole('dialog', { name: 'Apresentacao em tela cheia' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sair da tela cheia' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ir para slide 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar notas' }))
    expect(screen.getByText('Notas do apresentador')).toBeTruthy()
    expect(screen.getByText('Nota do primeiro slide.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Editar slide' }))
    fireEvent.change(screen.getByDisplayValue('Slide inicial'), { target: { value: 'Slide inicial revisado' } })
    fireEvent.change(screen.getByDisplayValue('Ponto A'), { target: { value: 'Ponto A revisado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar edições' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      slides: [
        expect.objectContaining({ title: 'Slide inicial revisado', bullets: ['Ponto A revisado'] }),
        expect.objectContaining({ title: 'Slide final' }),
      ],
    }))
  })
})