// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ParsedDataTable } from './artifact-parsers'
import DataTableViewer from './DataTableViewer'

function buildDataTable(rows: ParsedDataTable['rows']): ParsedDataTable {
  return {
    title: 'Panorama Financeiro',
    columns: [
      { key: 'tema', label: 'Tema', align: 'left' },
      { key: 'valor', label: 'Valor', align: 'right' },
    ],
    rows,
    summary: { tema: 'Total', valor: 78 },
    legend: 'Valores em milhares de reais.',
    footnotes: ['Fonte: base consolidada.'],
  }
}

describe('DataTableViewer', () => {
  afterEach(() => {
    cleanup()
  })

  it('sorts numerically, paginates rows, and filters by the search term', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      tema: `Item ${String(index + 1).padStart(2, '0')}`,
      valor: 12 - index,
    }))
    const { container } = render(<DataTableViewer data={buildDataTable(rows)} />)

    const readBodyRows = () => Array.from(container.querySelectorAll('tbody tr')).map(row => row.textContent || '')

    fireEvent.click(screen.getByText('Valor'))
    expect(readBodyRows()[0]).toContain('Item 12')

    fireEvent.click(screen.getByText('Valor'))
    expect(readBodyRows()[0]).toContain('Item 01')

    fireEvent.click(screen.getByTitle('Proxima'))
    expect(screen.getByText('Item 11')).toBeTruthy()
    expect(screen.getByText('Item 12')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('Buscar na tabela...'), {
      target: { value: 'Item 12' },
    })

    expect(screen.getByText('Item 12')).toBeTruthy()
    expect(screen.queryByText('Item 11')).toBeNull()
  })

  it('supports edit mode, saves changed rows, and renders summary metadata', () => {
    const onChange = vi.fn()
    render(<DataTableViewer data={buildDataTable([{ tema: 'Receita', valor: 50 }])} onChange={onChange} />)

    expect(screen.getByText('Legenda:')).toBeTruthy()
    expect(screen.getByText('Valores em milhares de reais.')).toBeTruthy()
    expect(screen.getByText('Fonte: base consolidada.')).toBeTruthy()
    expect(screen.getByText('Total')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByDisplayValue('Receita'), { target: { value: 'Receita líquida' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      rows: [{ tema: 'Receita líquida', valor: 50 }],
    }))
  })
})