// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hybridSearchMock = vi.hoisted(() => vi.fn())

vi.mock('../../lib/search-client', () => ({
  hybridSearch: (...args: unknown[]) => hybridSearchMock(...args),
}))

import SearchPanel from './SearchPanel'

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hybridSearchMock.mockResolvedValue({
      results: [
        {
          source: 'TRF1',
          content: 'Trecho relevante do julgado.',
          score: 0.82,
          origin: 'hybrid',
          origins: ['semantic', 'lexical'],
          process_number: '1234567-89.2026.4.01.3400',
        },
      ],
      stats: {
        query: 'licitação',
        semantic_count: 6,
        semantic_time_ms: 40,
        lexical_count: 4,
        lexical_time_ms: 55,
        fused_count: 1,
        total_time_ms: 95,
        semantic_weight: 0.5,
        lexical_weight: 0.5,
      },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('auto-searches the initial query, renders stats and notifies when a result is expanded', async () => {
    const onResultClick = vi.fn()

    render(
      <SearchPanel
        initialQuery="licitação"
        onResultClick={onResultClick}
      />,
    )

    await waitFor(() => {
      expect(hybridSearchMock).toHaveBeenCalledWith('licitação', expect.objectContaining({
        topK: 15,
        semanticWeight: 0.5,
        lexicalWeight: 0.5,
      }))
    })

    expect(await screen.findByText('TRF1')).toBeTruthy()
    expect(screen.getByText(/1 resultados/i)).toBeTruthy()
    expect(screen.getByText(/95ms/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /trf1/i }))

    await waitFor(() => {
      expect(screen.getAllByText(/trecho relevante do julgado/i)).toHaveLength(2)
    })
    expect(onResultClick).toHaveBeenCalledWith(expect.objectContaining({ source: 'TRF1' }))
  })

  it('attaches results to context and can clear the current query', async () => {
    const onAttachToContext = vi.fn()

    render(
      <SearchPanel
        initialQuery="licitação"
        onAttachToContext={onAttachToContext}
      />,
    )

    await screen.findByText('TRF1')

    fireEvent.click(screen.getByRole('button', { name: /anexar 1 resultado ao contexto do chat/i }))

    expect(onAttachToContext).toHaveBeenCalledWith([
      expect.objectContaining({ source: 'TRF1' }),
    ])

    fireEvent.click(screen.getByTitle(/limpar busca/i))

    expect((screen.getByPlaceholderText(/buscar na base jurídica/i) as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText('TRF1')).toBeNull()
  })

  it('shows the error state when the hybrid search fails', async () => {
    hybridSearchMock.mockRejectedValueOnce(new Error('Falha do backend'))

    render(<SearchPanel />)

    fireEvent.change(screen.getByPlaceholderText(/buscar na base jurídica/i), {
      target: { value: 'erro de busca' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }))

    expect(await screen.findByText(/erro na busca/i)).toBeTruthy()
    expect(screen.getByText(/falha do backend/i)).toBeTruthy()
  })
})