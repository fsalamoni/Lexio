// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AudioPipelineConfigCard from './AudioPipelineConfigCard'

vi.mock('../lib/model-config', () => ({
  AUDIO_PIPELINE_AGENT_DEFS: Array.from({ length: 6 }, (_, index) => ({ key: `audio-${index}` })),
  getDefaultAudioPipelineModelMap: vi.fn(),
  loadAudioPipelineModels: vi.fn(),
  resetAudioPipelineModels: vi.fn(),
  saveAudioPipelineModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: { violet: { infoBox: 'tone-violet' } },
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

describe('AudioPipelineConfigCard', () => {
  it('wires the audio pipeline metadata and info copy into the shared config card', () => {
    render(<AudioPipelineConfigCard />)

    expect(screen.getByText('Carregando configuração do Pipeline de Áudio...')).toBeTruthy()
    expect(screen.getByText('Trilha Multiagente de Áudio')).toBeTruthy()
    expect(screen.getByText('6 agentes · criação de áudio profissional')).toBeTruthy()
    expect(screen.getByText(/Narrador \/ TTS/)).toBeTruthy()
    expect(screen.getByText(/geração de mídia/)).toBeTruthy()
  })
})