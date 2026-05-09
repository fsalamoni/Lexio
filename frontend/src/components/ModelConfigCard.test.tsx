// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ModelConfigCard from './ModelConfigCard'

vi.mock('../lib/model-config', () => ({
  PIPELINE_AGENT_DEFS: Array.from({ length: 6 }, (_, index) => ({ key: `pipeline-${index}` })),
  getDefaultModelMap: vi.fn(),
  loadAgentModels: vi.fn(),
  resetAgentModels: vi.fn(),
  saveAgentModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: { brand: { infoBox: 'tone-brand' } },
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

describe('ModelConfigCard', () => {
  it('wires the document-generation metadata and recommendation copy into the shared config card', () => {
    render(<ModelConfigCard />)

    expect(screen.getByText('Carregando configuração de modelos...')).toBeTruthy()
    expect(screen.getByText('Fluxo do Pipeline de Geração')).toBeTruthy()
    expect(screen.getByText('6 agentes · execução sequencial')).toBeTruthy()
    expect(screen.getByText(/Recomendação:/)).toBeTruthy()
    expect(screen.getByText('✦ Grátis')).toBeTruthy()
  })
})