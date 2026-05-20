// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatOrchestratorConfigCard from './ChatOrchestratorConfigCard'

vi.mock('../lib/model-config', () => ({
  CHAT_ORCHESTRATOR_AGENT_DEFS: [
    ...Array.from({ length: 9 }, (_, index) => ({ key: `chat-${index}` })),
    { key: 'chat_image_generator' },
    { key: 'chat_audio_generator' },
    { key: 'chat_presentation_designer' },
    { key: 'chat_video_generator' },
  ],
  getDefaultChatOrchestratorModelMap: vi.fn(),
  loadChatOrchestratorModels: vi.fn(),
  resetChatOrchestratorModels: vi.fn(),
  saveChatOrchestratorModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: {
    indigo: { infoBox: 'tone-indigo' },
    purple: { infoBox: 'tone-purple' },
  },
  default: (props: { loadingMessage: string; sections: Array<{ title: string; subtitle: string; afterContent: React.ReactNode }> }) => (
    <div>
      <p>{props.loadingMessage}</p>
      {props.sections.map((section, index) => (
        <div key={index}>
          <p>{section.title}</p>
          <p>{section.subtitle}</p>
          <div>{section.afterContent}</div>
        </div>
      ))}
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
    expect(screen.getByText('9 agentes configuráveis · tools, super-skills, lotes paralelos e ações locais via sidecar')).toBeTruthy()
    expect(screen.getByText(/Como funciona:/)).toBeTruthy()
    expect(screen.getByText(/filesystem e shell/)).toBeTruthy()
  })

  it('splits the artifact-generation agents into their own capability-restricted section', () => {
    render(<ChatOrchestratorConfigCard />)

    expect(screen.getByText('Agentes Geradores de Artefatos')).toBeTruthy()
    expect(screen.getByText('4 agentes de mídia · cada um usa um modelo restrito à capacidade (imagem, áudio, vídeo)')).toBeTruthy()
    expect(screen.getByText(/Geração literal:/)).toBeTruthy()
  })
})
