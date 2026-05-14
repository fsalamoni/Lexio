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

vi.mock('../lib/media-capability-guidance', () => ({
  getMediaCapabilityGuidance: (capability?: string) => {
    if (capability === 'image') {
      return {
        capability: 'image',
        summary: 'Nenhum modelo com capacidade real de imagem esta disponivel no catalogo pessoal deste usuario.',
        routeHint: 'Configuracoes -> Provedores de IA -> Catalogos por Provedor -> Catalogo de Modelos.',
        steps: [],
        recommendedModels: [
          { providerLabel: 'OpenAI direto', models: ['gpt-image-1'] },
        ],
      }
    }
    if (capability === 'video') {
      return {
        capability: 'video',
        summary: 'Clipes de video nao usam seletor de modelo; dependem de provedor externo.',
        routeHint: 'Configure as variaveis de ambiente do build e valide o endpoint.',
        steps: [],
        recommendedModels: [],
        envVars: ['VITE_EXTERNAL_VIDEO_PROVIDER', 'VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT'],
        endpointContractHint: 'POST JSON com prompt e retorno de URL ou job_id.',
      }
    }
    return null
  },
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

  it('renders provider-managed agents without opening the model selector and flags unknown pricing as N/D', async () => {
    const loadModels = vi.fn().mockResolvedValue({
      image_agent: 'image-model',
      video_agent: '',
    })
    const saveModels = vi.fn().mockResolvedValue(undefined)
    const resetModels = vi.fn().mockResolvedValue(undefined)
    const getDefaultModels = vi.fn(() => ({ image_agent: 'image-model', video_agent: '' }))

    agentModelConfigCardMocks.useCatalogModels.mockReturnValue([
      {
        id: 'image-model',
        label: 'Modelo de imagem sem preço local',
        provider: 'Google',
        description: 'Imagem premium.',
        contextWindow: 128000,
        inputCost: 0,
        outputCost: 0,
        isFree: false,
        tier: 'balanced',
        capabilities: ['image'],
      },
    ])

    render(
      <AgentModelConfigCard
        loadingMessage="Carregando..."
        sections={[
          {
            id: 'base-section',
            title: 'Seção base',
            titleIcon: Sparkles,
            agents: [
              {
                key: 'image_agent',
                label: 'Agente de Imagem',
                description: 'Seleciona imagens.',
                icon: 'brain',
                defaultModel: 'image-model',
                recommendedTier: 'balanced',
                agentCategory: 'synthesis',
                requiredCapability: 'image',
              },
              {
                key: 'video_agent',
                label: 'Agente de Vídeo',
                description: 'Usa provedor externo.',
                icon: 'brain',
                defaultModel: '',
                recommendedTier: 'premium',
                agentCategory: 'synthesis',
                requiredCapability: 'video',
                configurationMode: 'external-provider',
                configurationHint: 'Configuração feita no ambiente.',
              },
            ],
            tone: V2_AGENT_CONFIG_TONES.teal,
          },
        ]}
        agentIcons={{ brain: Brain }}
        loadModels={loadModels}
        saveModels={saveModels}
        resetModels={resetModels}
        getDefaultModels={getDefaultModels}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Agente de Imagem')).toBeTruthy()
      expect(screen.getAllByText('N/D').length).toBeGreaterThan(0)
      expect(screen.getByText('Preço não informado no catálogo local.')).toBeTruthy()
      expect(screen.getByText('Gerido por provedor externo')).toBeTruthy()
      expect(screen.getByText('Configuração feita no ambiente.')).toBeTruthy()
      expect(screen.getByText(/vite_external_video_provider/i)).toBeTruthy()
      expect(screen.getByText(/post json com prompt/i)).toBeTruthy()
    })

    expect(screen.queryByText('Agente de Vídeo', { selector: 'p' })).toBeFalsy()
    expect(screen.queryByRole('button', { name: 'Selecionar customizado' })).toBeNull()
  })

  it('shows precise remediation when a required capability is absent from the personal catalog', async () => {
    const loadModels = vi.fn().mockResolvedValue({ image_agent: 'missing-image-model' })

    agentModelConfigCardMocks.useCatalogModels.mockReturnValue([
      {
        id: 'text-model',
        label: 'Modelo textual',
        provider: 'Anthropic',
        description: 'Sem imagem.',
        contextWindow: 128000,
        inputCost: 1,
        outputCost: 3,
        isFree: false,
        tier: 'balanced',
        capabilities: ['text'],
      },
    ])

    render(
      <AgentModelConfigCard
        loadingMessage="Carregando..."
        sections={[
          {
            id: 'image-section',
            title: 'Imagem',
            titleIcon: Sparkles,
            agents: [
              {
                key: 'image_agent',
                label: 'Gerador de Imagem',
                description: 'Precisa de imagem real.',
                icon: 'brain',
                defaultModel: 'missing-image-model',
                recommendedTier: 'balanced',
                agentCategory: 'synthesis',
                requiredCapability: 'image',
              },
            ],
            tone: V2_AGENT_CONFIG_TONES.teal,
          },
        ]}
        agentIcons={{ brain: Brain }}
        loadModels={loadModels}
        saveModels={vi.fn().mockResolvedValue(undefined)}
        resetModels={vi.fn().mockResolvedValue(undefined)}
        getDefaultModels={() => ({ image_agent: 'missing-image-model' })}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/nenhum modelo com capacidade real de imagem/i)).toBeTruthy()
      expect(screen.getByText(/openai direto:/i)).toBeTruthy()
      expect(screen.getByText(/gpt-image-1/i)).toBeTruthy()
    })
  })
})