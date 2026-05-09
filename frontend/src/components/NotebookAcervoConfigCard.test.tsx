// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NotebookAcervoConfigCard from './NotebookAcervoConfigCard'

vi.mock('../lib/model-config', () => ({
  NOTEBOOK_ACERVO_AGENT_DEFS: Array.from({ length: 4 }, (_, index) => ({ key: `acervo-${index}` })),
  getDefaultNotebookAcervoModelMap: vi.fn(),
  loadNotebookAcervoModels: vi.fn(),
  resetNotebookAcervoModels: vi.fn(),
  saveNotebookAcervoModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: { emerald: { infoBox: 'tone-emerald' } },
  default: (props: { loadingMessage: string; sections: Array<{ title: string; subtitle: string; afterContent: React.ReactNode }> }) => (
    <div>
      <p>{props.loadingMessage}</p>
      <p>{props.sections[0].title}</p>
      <p>{props.sections[0].subtitle}</p>
      <div>{props.sections[0].afterContent}</div>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

describe('NotebookAcervoConfigCard', () => {
  it('wires the notebook-acervo metadata and recommendation copy into the shared config card', () => {
    render(<NotebookAcervoConfigCard />)

    expect(screen.getByText('Carregando configuração do Analisador de Acervo...')).toBeTruthy()
    expect(screen.getByText('Pipeline de Análise de Acervo')).toBeTruthy()
    expect(screen.getByText('4 agentes · análise e curadoria')).toBeTruthy()
    expect(screen.getByText(/Triagem/)).toBeTruthy()
    expect(screen.getByText('✦ Grátis')).toBeTruthy()
  })
})