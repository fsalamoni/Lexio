// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ResearchNotebookConfigCard from './ResearchNotebookConfigCard'

vi.mock('../lib/model-config', () => ({
  RESEARCH_NOTEBOOK_AGENT_DEFS: [
    { key: 'notebook_pesquisador' },
    { key: 'notebook_analista' },
    { key: 'notebook_assistente' },
    { key: 'notebook_pesquisador_externo' },
    { key: 'notebook_pesquisador_externo_profundo' },
    { key: 'notebook_pesquisador_jurisprudencia' },
    { key: 'notebook_ranqueador_jurisprudencia' },
    { key: 'studio_pesquisador' },
    { key: 'studio_escritor' },
    { key: 'studio_roteirista' },
    { key: 'studio_visual' },
    { key: 'studio_revisor' },
  ],
  getDefaultResearchNotebookModelMap: vi.fn(),
  loadResearchNotebookModels: vi.fn(),
  resetResearchNotebookModels: vi.fn(),
  saveResearchNotebookModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: {
    indigo: { infoBox: 'tone-indigo' },
    purple: { infoBox: 'tone-purple' },
  },
  default: (props: {
    loadingMessage: string
    sections: Array<{ title: string; subtitle: string; beforeContent?: React.ReactNode }>
    afterSections?: React.ReactNode
  }) => (
    <div>
      <p>{props.loadingMessage}</p>
      {props.sections.map(section => (
        <div key={section.title}>
          <p>{section.title}</p>
          <p>{section.subtitle}</p>
          <div>{section.beforeContent}</div>
        </div>
      ))}
      <div>{props.afterSections}</div>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

describe('ResearchNotebookConfigCard', () => {
  it('splits research and studio agents into dedicated sections and renders their guidance copy', () => {
    render(<ResearchNotebookConfigCard />)

    expect(screen.getByText('Carregando configuração do Caderno de Pesquisa...')).toBeTruthy()
    expect(screen.getAllByText('Pesquisa & Análise').length).toBe(2)
    expect(screen.getByText('7 agentes')).toBeTruthy()
    expect(screen.getAllByText('Estúdio de Criação').length).toBe(2)
    expect(screen.getByText('5 agentes · pipeline multi-agente')).toBeTruthy()
    expect(screen.getByText(/Pesquisadores de Fontes:/)).toBeTruthy()
    expect(screen.getByText(/Pipeline do Estúdio:/)).toBeTruthy()
    expect(screen.getByText(/Saída visual real:/)).toBeTruthy()
    expect(screen.getByText(/O Caderno de Pesquisa conta com 12/)).toBeTruthy()
  })
})