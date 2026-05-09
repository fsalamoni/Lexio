// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PresentationPipelineConfigCard from './PresentationPipelineConfigCard'

vi.mock('../lib/model-config', () => ({
  PRESENTATION_PIPELINE_AGENT_DEFS: Array.from({ length: 6 }, (_, index) => ({ key: `presentation-${index}` })),
  getDefaultPresentationPipelineModelMap: vi.fn(),
  loadPresentationPipelineModels: vi.fn(),
  resetPresentationPipelineModels: vi.fn(),
  savePresentationPipelineModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: { sky: { infoBox: 'tone-sky' } },
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

describe('PresentationPipelineConfigCard', () => {
  it('wires the presentation pipeline metadata and image-generation copy into the shared config card', () => {
    render(<PresentationPipelineConfigCard />)

    expect(screen.getByText('Carregando configuração do Pipeline de Apresentação...')).toBeTruthy()
    expect(screen.getByText('Trilha Multiagente de Apresentação')).toBeTruthy()
    expect(screen.getByText('6 agentes · criação de apresentação profissional')).toBeTruthy()
    expect(screen.getByText(/imagens reais dos slides/)).toBeTruthy()
    expect(screen.getByText(/Gerador de Imagens de Slides/)).toBeTruthy()
  })
})