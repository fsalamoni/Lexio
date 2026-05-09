// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ParsedFlashcards } from './artifact-parsers'
import FlashcardViewer from './FlashcardViewer'

afterEach(() => {
  cleanup()
})

describe('FlashcardViewer', () => {
  it('supports flipping cards, marking study results, and filtering by category', () => {
    const data: ParsedFlashcards = {
      title: 'Revisao',
      categories: [
        {
          name: 'Civil',
          cards: [
            { front: 'Contrato', back: 'Acordo entre partes', difficulty: 'basico', tip: 'Pense em bilateralidade.' },
            { front: 'Dano moral', back: 'Lesão extrapatrimonial', difficulty: 'intermediario' },
          ],
        },
        {
          name: 'Administrativo',
          cards: [
            { front: 'Licitação', back: 'Procedimento competitivo', difficulty: 'avancado' },
          ],
        },
      ],
    }

    render(<FlashcardViewer data={data} />)

    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(screen.getByText('Contrato')).toBeTruthy()
    expect(screen.getByText('Básico')).toBeTruthy()

    fireEvent.click(screen.getByText('Contrato'))
    expect(screen.getByText('Acordo entre partes')).toBeTruthy()
    expect(screen.getByText('💡 Pense em bilateralidade.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Sei \(1\)/ }))
    expect(screen.getByText('2 / 3')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()

    fireEvent.click(screen.getByTitle('Filtros'))
    fireEvent.click(screen.getByRole('button', { name: 'Administrativo' }))

    expect(screen.getByText('1 / 1')).toBeTruthy()
    expect(screen.getByText('Licitação')).toBeTruthy()
    expect(screen.queryByText('Dano moral')).toBeNull()
  })
})