// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DeepResearchModal, type ResearchStats, type ResearchStep } from './DeepResearchModal'

function makeStats(overrides: Partial<ResearchStats> = {}): ResearchStats {
  return {
    sourcesFound: 4,
    urlsExamined: 7,
    tribunalsQueried: 3,
    tokensUsed: 1200,
    elapsedMs: 2300,
    ...overrides,
  }
}

describe('DeepResearchModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders active progress, stats, live log entries, and supports closable flows', () => {
    const onClose = vi.fn()
    const steps: ResearchStep[] = [
      { id: 'query', label: 'Consultando tribunais', status: 'done', substeps: ['TJSP consultado'] },
      { id: 'filter', label: 'Filtrando resultados', status: 'active', detail: 'Aplicando recortes temáticos', substeps: ['Recorte por tema aplicado'] },
      { id: 'rank', label: 'Ranqueando por relevância', status: 'pending', substeps: [] },
    ]

    const view = render(
      <DeepResearchModal
        isOpen
        onClose={onClose}
        title="Pesquisa jurisprudencial"
        subtitle="Tema: responsabilidade civil"
        variant="jurisprudencia"
        steps={steps}
        stats={makeStats()}
        canClose
      />,
    )

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/pesquisa jurisprudencial/i)).toBeTruthy()
    expect(screen.getByText(/tema: responsabilidade civil/i)).toBeTruthy()
    expect(screen.getAllByText(/filtrando resultados/i)).toHaveLength(2)
    expect(screen.getByText(/aplicando recortes temáticos/i)).toBeTruthy()
    expect(screen.getByText('Fontes')).toBeTruthy()
    expect(screen.getByText('URLs')).toBeTruthy()
    expect(screen.getByText('Tribunais')).toBeTruthy()
    expect(screen.getByText('Tokens')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getAllByText(/recorte por tema aplicado/i)).toHaveLength(2)
    expect(screen.getByRole('button', { name: /cancelar pesquisa/i })).toBeTruthy()
    expect(screen.getByText(/filtrando resultados\.\.\./i)).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = view.container.querySelector('[aria-hidden="true"]') as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('prevents closing when blocked and reports a completed run with errors', () => {
    const onClose = vi.fn()
    const steps: ResearchStep[] = [
      { id: 'search', label: 'Pesquisando na web', status: 'done', substeps: ['Busca executada'] },
      { id: 'analyze', label: 'Analisando fontes', status: 'error', detail: 'Uma fonte falhou na extração', substeps: ['Falha ao extrair uma fonte'] },
    ]

    const view = render(
      <DeepResearchModal
        isOpen
        onClose={onClose}
        title="Pesquisa profunda"
        variant="deep"
        steps={steps}
        stats={makeStats({ sourcesFound: 1, urlsExamined: 2, tribunalsQueried: 0, tokensUsed: 0, elapsedMs: 2100 })}
        canClose={false}
      />,
    )

    expect(screen.queryByRole('button', { name: /fechar|cancelar pesquisa/i })).toBeNull()
    expect(screen.getByText(/concluído com erros em 2s/i)).toBeTruthy()
    expect(screen.getByText(/uma fonte falhou na extração/i)).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    const backdrop = view.container.querySelector('[aria-hidden="true"]') as HTMLElement
    fireEvent.click(backdrop)

    expect(onClose).not.toHaveBeenCalled()
  })
})