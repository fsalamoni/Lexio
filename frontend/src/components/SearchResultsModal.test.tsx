// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResultItem } from '../pages/notebook/types'

import SearchResultsModal from './SearchResultsModal'

function makeItems(): SearchResultItem[] {
  return [
    {
      id: 'result-1',
      title: 'Acórdão 123',
      subtitle: 'STJ · 2026',
      snippet: 'Resumo da decisão colegiada.',
      fullContent: 'Conteúdo integral do acórdão para revisão detalhada.',
      metadata: { tribunal: 'STJ', relator: 'Min. Silva' },
      url: 'https://example.com/acordao-123',
      selected: false,
    },
    {
      id: 'result-2',
      title: 'Doutrina Aplicável',
      subtitle: 'Revista Jurídica',
      snippet: 'Trecho doutrinário relevante.',
      metadata: { autor: 'Maria Souza' },
      selected: true,
    },
  ]
}

describe('SearchResultsModal', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('supports selecting all results, expanding details, copying content, and confirming sources', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()

    render(
      <SearchResultsModal
        isOpen
        items={makeItems()}
        variant="external"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    expect(screen.getByText(/resultados da pesquisa externa/i)).toBeTruthy()
    expect(screen.getByText(/1 de 2 selecionado/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /selecionar todos/i }))

    expect(screen.getByText(/2 de 2 selecionado/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /adicionar 2 como fontes/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /ver detalhes/i }))
    expect(screen.getByText(/conteúdo integral do acórdão/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /copiar/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Conteúdo integral do acórdão para revisão detalhada.')

    fireEvent.click(screen.getByRole('button', { name: /adicionar 2 como fontes/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0]).toHaveLength(2)
    expect(onConfirm.mock.calls[0][0].map((item: SearchResultItem) => item.id)).toEqual(['result-1', 'result-2'])
  })

  it('resets expanded state and local selections when the modal is reopened with fresh items', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const items = makeItems()

    const view = render(
      <SearchResultsModal
        isOpen
        items={items}
        variant="jurisprudencia"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /selecionar todos/i }))
    fireEvent.click(screen.getByRole('button', { name: /ver detalhes/i }))

    expect(screen.getByText(/conteúdo integral do acórdão/i)).toBeTruthy()
    expect(screen.getByText(/2 de 2 selecionado/i)).toBeTruthy()

    view.rerender(
      <SearchResultsModal
        isOpen={false}
        items={items}
        variant="jurisprudencia"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    view.rerender(
      <SearchResultsModal
        isOpen
        items={items}
        variant="jurisprudencia"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    )

    expect(screen.getByText(/resultados da jurisprudência/i)).toBeTruthy()
    expect(screen.getByText(/1 de 2 selecionado/i)).toBeTruthy()
    expect(screen.queryByText(/conteúdo integral do acórdão/i)).toBeNull()
    expect(screen.getByRole('button', { name: /selecionar todos/i })).toBeTruthy()
  })
})