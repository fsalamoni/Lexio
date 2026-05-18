// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThesisAnalystConfigCard from './ThesisAnalystConfigCard'

vi.mock('../lib/model-config', () => ({
  THESIS_ANALYST_AGENT_DEFS: Array.from({ length: 4 }, (_, index) => ({ key: `thesis-${index}` })),
  getDefaultThesisAnalystModelMap: vi.fn(),
  loadThesisAnalystModels: vi.fn(),
  resetThesisAnalystModels: vi.fn(),
  saveThesisAnalystModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: { teal: { infoBox: 'tone-teal' } },
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

describe('ThesisAnalystConfigCard', () => {
  it('wires the thesis pipeline metadata and local-inventory guidance into the shared config card', () => {
    render(<ThesisAnalystConfigCard />)

    expect(screen.getByText('Carregando configuração do Analista de Teses...')).toBeTruthy()
    expect(screen.getByText('Pipeline de Análise de Teses')).toBeTruthy()
    expect(screen.getByText('4 agentes LLM · inventário local · trilhas paralelas')).toBeTruthy()
    expect(screen.getByText(/Recomendação:/)).toBeTruthy()
    expect(screen.getByText('✦ Grátis')).toBeTruthy()
  })
})
