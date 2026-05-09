// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JurisprudenceConfigModal from './JurisprudenceConfigModal'

vi.mock('../lib/datajud-service', () => ({
  DEFAULT_TRIBUNALS: [
    { alias: 'stj', name: 'Superior Tribunal de Justiça' },
    { alias: 'trf1', name: 'TRF1' },
  ],
  DATAJUD_GRAUS: [
    { value: 'primeiro', label: '1º grau' },
    { value: 'segundo', label: '2º grau' },
  ],
  TRIBUNAL_GROUPS: [
    {
      category: 'superiores',
      label: 'Superiores',
      tribunals: [{ alias: 'stj', name: 'Superior Tribunal de Justiça' }],
    },
    {
      category: 'federal',
      label: 'Federal',
      tribunals: [{ alias: 'trf1', name: 'Tribunal Regional Federal da 1ª Região' }],
    },
  ],
}))

vi.mock('../lib/constants', () => ({
  AREA_LABELS: {
    civil: 'Civil',
    penal: 'Penal',
  },
}))

afterEach(() => {
  cleanup()
})

describe('JurisprudenceConfigModal', () => {
  it('applies filters and emits the selected jurisprudence-search configuration', () => {
    const onSearch = vi.fn()

    render(
      <JurisprudenceConfigModal
        isOpen
        query="Tema original"
        onSearch={onSearch}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText('Pesquisa de Jurisprudência')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Filtros/i }))
    fireEvent.change(screen.getByPlaceholderText('Tema para buscar na jurisprudência...'), { target: { value: 'novo tema ' } })
    const dateInputs = document.querySelectorAll('input[type="date"]')
    const selects = document.querySelectorAll('select')
    fireEvent.change(dateInputs[0], { target: { value: '2025-01-01' } })
    fireEvent.change(dateInputs[1], { target: { value: '2025-02-01' } })
    fireEvent.change(selects[0], { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '1º grau' }))
    fireEvent.change(selects[1], { target: { value: 'civil' } })
    fireEvent.click(screen.getByRole('button', { name: /TRF1/i }))
    fireEvent.click(screen.getByRole('button', { name: /Pesquisar em 1 tribunal/i }))

    expect(onSearch).toHaveBeenCalledWith({
      query: 'novo tema',
      tribunals: [{ alias: 'stj', name: 'Superior Tribunal de Justiça' }],
      dateFrom: '2025-01-01',
      dateTo: '2025-02-01',
      graus: ['primeiro'],
      maxPerTribunal: 10,
      legalArea: 'civil',
    })
  })
})