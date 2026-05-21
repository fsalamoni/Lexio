// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VideoPipelineConfigCard from './VideoPipelineConfigCard'

const videoPipelineMocks = vi.hoisted(() => ({
  checkExternalVideoProviderHealth: vi.fn().mockResolvedValue({ ok: true, message: 'Conexão validada', latencyMs: 123, statusCode: 200 }),
}))

vi.mock('../lib/model-config', () => ({
  VIDEO_PIPELINE_AGENT_DEFS: Array.from({ length: 12 }, (_, index) => ({ key: `video-${index}` })),
  getDefaultVideoPipelineModelMap: vi.fn(),
  loadVideoPipelineModels: vi.fn(),
  resetVideoPipelineModels: vi.fn(),
  saveVideoPipelineModels: vi.fn(),
}))

vi.mock('./AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_PANEL_BASE: 'panel-base',
  V2_AGENT_CONFIG_TONES: { rose: { infoBox: 'tone-rose' } },
  default: (props: {
    loadingMessage: string
    sections: Array<{ title: string; subtitle: string; afterContent: React.ReactNode }>
    afterSections?: React.ReactNode
  }) => (
    <div>
      <p>{props.loadingMessage}</p>
      <p>{props.sections[0].title}</p>
      <p>{props.sections[0].subtitle}</p>
      <div>{props.sections[0].afterContent}</div>
      <div>{props.afterSections}</div>
    </div>
  ),
}))

vi.mock('../lib/external-video-provider', () => ({
  checkExternalVideoProviderHealth: () => videoPipelineMocks.checkExternalVideoProviderHealth(),
  getExternalVideoProviderDiagnostics: () => ({
    provider: 'fal.ai',
    configured: true,
    endpoint: 'https://fal.ai/api',
    pollIntervalMs: 5000,
    pollTimeoutMs: 120000,
    blockingErrors: [],
    warnings: ['Use fallback local se o provedor falhar.'],
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('VideoPipelineConfigCard', () => {
  it('renders pipeline metadata, diagnostics, and updates provider health on demand', async () => {
    render(<VideoPipelineConfigCard />)

    expect(screen.getByText('Carregando configuração do Gerador de Vídeo...')).toBeTruthy()
    expect(screen.getByText('Trilha Multiagente de Vídeo')).toBeTruthy()
    expect(screen.getByText('12 agentes configuráveis · criação de vídeo profissional')).toBeTruthy()
    expect(screen.getByText(/15\+ minutos/)).toBeTruthy()
    expect(screen.getAllByText(/Gerador de Clipes de Vídeo/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Etapas literais de vídeo:/)).toBeTruthy()
    expect(screen.getByText(/Provedor: /)).toBeTruthy()
    expect(screen.getByText(/Endpoint: https:\/\/fal.ai\/api/)).toBeTruthy()
    expect(screen.getByText(/Use fallback local se o provedor falhar/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Testar conexão/ }))

    await waitFor(() => {
      expect(videoPipelineMocks.checkExternalVideoProviderHealth).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/OK · Conexão validada/)).toBeTruthy()
      expect(screen.getByText(/HTTP 200/)).toBeTruthy()
      expect(screen.getByText(/123ms/)).toBeTruthy()
    })
  })
})