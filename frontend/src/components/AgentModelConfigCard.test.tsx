// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Brain, Sparkles } from 'lucide-react'
import AgentModelConfigCard, { V2_AGENT_CONFIG_TONES } from './AgentModelConfigCard'

const agentModelConfigCardMocks = vi.hoisted(() => ({
  useCatalogModels: vi.fn(),
}))

vi.mock('../lib/model-catalog', () => ({
  useCatalogModels: () => agentModelConfigCardMocks.useCatalogModels(),
}))

vi.mock('./ModelSelectorModal', () => ({
  default: ({ open, agentLabel, onSelect, onClose }: any) => (
    open ? (
      <div>
        <p>{agentLabel}</p>
        <button onClick={() => onSelect('custom-model')}>Selecionar customizado</button>
        <button onClick={onClose}>Fechar seletor</button>
      </div>
    ) : null
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AgentModelConfigCard', () => {
  it('loads current models, lets the user customize an agent, save the config, and restore defaults', async () => {
    const loadModels = vi.fn().mockResolvedValue({ agent_one: 'default-model' })
    const saveModels = vi.fn().mockResolvedValue(undefined)
    const resetModels = vi.fn().mockResolvedValue(undefined)
    const getDefaultModels = vi.fn(() => ({ agent_one: 'default-model' }))

    agentModelConfigCardMocks.useCatalogModels.mockReturnValue([
      {
        id: 'default-model',
        label: 'Modelo padrão',
        provider: 'OpenRouter',
        description: 'Modelo inicial.',
        contextWindow: 128000,
        inputCost: 0,
        outputCost: 0,
        isFree: true,
        tier: 'fast',
      },
      {
        id: 'custom-model',
        label: 'Modelo customizado',
        provider: 'Anthropic',
        description: 'Modelo alternativo.',
        contextWindow: 200000,
        inputCost: 3,
        outputCost: 15,
        isFree: false,
        tier: 'premium',
      },
    ])

    render(
      <AgentModelConfigCard
        loadingMessage="Carregando card base..."
        sections={[
          {
            id: 'base-section',
            title: 'Seção base',
            titleIcon: Sparkles,
            subtitle: '1 agente',
            agents: [
              {
                key: 'agent_one',
                label: 'Agente Um',
                description: 'Descrição do agente.',
                icon: 'brain',
                defaultModel: 'default-model',
                recommendedTier: 'fast',
                agentCategory: 'reasoning',
                requiredCapability: 'text',
                bestModelNote: 'Use um modelo estável.',
              },
            ],
            tone: V2_AGENT_CONFIG_TONES.teal,
            showIndex: true,
            beforeContent: <p>Antes da lista</p>,
            afterContent: <p>Depois da lista</p>,
          },
        ]}
        agentIcons={{ brain: Brain }}
        loadModels={loadModels}
        saveModels={saveModels}
        resetModels={resetModels}
        getDefaultModels={getDefaultModels}
        afterSections={<p>Pós-seções</p>}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Seção base')).toBeTruthy()
      expect(screen.getByText('Modelo padrão')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Modelo padrão/i }))
    expect(screen.getByRole('button', { name: 'Selecionar customizado' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar customizado' }))

    await waitFor(() => {
      expect(screen.getByText('Modelo customizado')).toBeTruthy()
      expect(screen.getByText('customizado')).toBeTruthy()
      expect(screen.getByText('Alterações não salvas')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Salvar configurações/i }))
    await waitFor(() => {
      expect(saveModels).toHaveBeenCalledWith({ agent_one: 'custom-model' })
    })

    fireEvent.click(screen.getByRole('button', { name: /Restaurar padrões/i }))
    await waitFor(() => {
      expect(resetModels).toHaveBeenCalled()
      expect(screen.getByText('Modelo padrão')).toBeTruthy()
    })
  })
})