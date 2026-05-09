// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContextDetailConfigCard from './ContextDetailConfigCard'

vi.mock('../lib/model-config', () => ({
  CONTEXT_DETAIL_AGENT_DEFS: [{ key: 'context-detail' }],
  getDefaultContextDetailModelMap: vi.fn(),
  loadContextDetailModels: vi.fn(),
  resetContextDetailModels: vi.fn(),
  saveContextDetailModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: { purple: { infoBox: 'tone-purple' } },
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

describe('ContextDetailConfigCard', () => {
  it('wires the context-detail section metadata and recommendations into the shared config card', () => {
    render(<ContextDetailConfigCard />)

    expect(screen.getByText('Carregando configuração do Detalhamento de Contexto...')).toBeTruthy()
    expect(screen.getByText('Agente de Detalhamento')).toBeTruthy()
    expect(screen.getByText('1 agente · acionado pelo usuário')).toBeTruthy()
    expect(screen.getByText(/Sobre este agente:/)).toBeTruthy()
    expect(screen.getByText('✦ Grátis')).toBeTruthy()
  })
})