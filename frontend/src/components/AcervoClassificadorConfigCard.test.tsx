// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AcervoClassificadorConfigCard from './AcervoClassificadorConfigCard'

vi.mock('../lib/model-config', () => ({
  ACERVO_CLASSIFICADOR_AGENT_DEFS: [{ key: 'classificador' }],
  getDefaultAcervoClassificadorModelMap: vi.fn(),
  loadAcervoClassificadorModels: vi.fn(),
  resetAcervoClassificadorModels: vi.fn(),
  saveAcervoClassificadorModels: vi.fn(),
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

describe('AcervoClassificadorConfigCard', () => {
  it('wires the classifier section metadata and info box into the shared config card', () => {
    render(<AcervoClassificadorConfigCard />)

    expect(screen.getByText('Carregando configuração do Classificador de Acervo...')).toBeTruthy()
    expect(screen.getByText('Agente Classificador')).toBeTruthy()
    expect(screen.getByText('1 agente · acionado pelo usuário')).toBeTruthy()
    expect(screen.getByText(/Sobre este agente:/)).toBeTruthy()
    expect(screen.getByText('✦ Grátis')).toBeTruthy()
  })
})