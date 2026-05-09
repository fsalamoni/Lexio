// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AcervoEmentaConfigCard from './AcervoEmentaConfigCard'

vi.mock('../lib/model-config', () => ({
  ACERVO_EMENTA_AGENT_DEFS: [{ key: 'ementa' }],
  getDefaultAcervoEmentaModelMap: vi.fn(),
  loadAcervoEmentaModels: vi.fn(),
  resetAcervoEmentaModels: vi.fn(),
  saveAcervoEmentaModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: { blue: { infoBox: 'tone-blue' } },
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

describe('AcervoEmentaConfigCard', () => {
  it('wires the ementa generator metadata and explanatory copy into the shared config card', () => {
    render(<AcervoEmentaConfigCard />)

    expect(screen.getByText('Carregando configuração do Gerador de Ementa...')).toBeTruthy()
    expect(screen.getByText('Agente Gerador de Ementa')).toBeTruthy()
    expect(screen.getByText('1 agente · acionado na indexação do acervo')).toBeTruthy()
    expect(screen.getByText(/Sobre este agente:/)).toBeTruthy()
    expect(screen.getByText(/busca semântica/)).toBeTruthy()
  })
})