// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatOrchestratorConfigCard from './ChatOrchestratorConfigCard'

vi.mock('../lib/model-config', () => ({
  CHAT_ORCHESTRATOR_AGENT_DEFS: Array.from({ length: 9 }, (_, index) => ({ key: `chat-${index}` })),
  getDefaultChatOrchestratorModelMap: vi.fn(),
  loadChatOrchestratorModels: vi.fn(),
  resetChatOrchestratorModels: vi.fn(),
  saveChatOrchestratorModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: { indigo: { infoBox: 'tone-indigo' } },
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

describe('ChatOrchestratorConfigCard', () => {
  it('wires the chat orchestrator metadata and routing copy into the shared config card', () => {
    render(<ChatOrchestratorConfigCard />)

    expect(screen.getByText('Carregando configuração do Orquestrador (Chat)...')).toBeTruthy()
    expect(screen.getByText('Trilha Multiagente do Chat')).toBeTruthy()
    expect(screen.getByText('9 agentes · conversa orquestrada com tools, super-skills e ações no PC')).toBeTruthy()
    expect(screen.getByText(/Como funciona:/)).toBeTruthy()
    expect(screen.getByText(/filesystem e shell/)).toBeTruthy()
  })
})