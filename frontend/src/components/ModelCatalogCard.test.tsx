// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ModelCatalogCard from './ModelCatalogCard'

const modelCatalogCardMocks = vi.hoisted(() => ({
  fetchOpenRouterModels: vi.fn(),
  formatHealthCheckMessage: vi.fn(),
  getBestAgentInfo: vi.fn(),
  inferFitScores: vi.fn(),
  inferProviderFromId: vi.fn(),
  inferTier: vi.fn(),
  loadModelCatalog: vi.fn(),
  loadProviderSettings: vi.fn(),
  openRouterToModelOption: vi.fn(),
  runModelHealthCheck: vi.fn(),
  saveModelCatalog: vi.fn().mockResolvedValue(undefined),
  saveProviderSettings: vi.fn().mockResolvedValue(undefined),
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../lib/model-catalog', () => ({
  fetchOpenRouterModels: (...args: unknown[]) => modelCatalogCardMocks.fetchOpenRouterModels(...args),
  getBestAgentInfo: (...args: unknown[]) => modelCatalogCardMocks.getBestAgentInfo(...args),
  inferFitScores: (...args: unknown[]) => modelCatalogCardMocks.inferFitScores(...args),
  inferProviderFromId: (...args: unknown[]) => modelCatalogCardMocks.inferProviderFromId(...args),
  inferTier: (...args: unknown[]) => modelCatalogCardMocks.inferTier(...args),
  loadModelCatalog: () => modelCatalogCardMocks.loadModelCatalog(),
  openRouterToModelOption: (...args: unknown[]) => modelCatalogCardMocks.openRouterToModelOption(...args),
  saveModelCatalog: (...args: unknown[]) => modelCatalogCardMocks.saveModelCatalog(...args),
}))

vi.mock('../lib/model-config', () => ({
  AVAILABLE_MODELS: [
    {
      id: 'openrouter/model-inicial',
      label: 'Modelo Inicial',
      provider: 'OpenRouter',
      providerId: 'openrouter',
      tier: 'fast',
      description: 'Modelo inicial do catálogo.',
      contextWindow: 128000,
      inputCost: 0,
      outputCost: 0,
      isFree: true,
      capabilities: ['text'],
      agentFit: { extraction: 8, synthesis: 7, reasoning: 6, writing: 5 },
    },
  ],
  FREE_TIER_RATE_LIMITS: { rpm: 20, rpd: 200 },
}))

vi.mock('../lib/model-health-check', () => ({
  formatHealthCheckMessage: (...args: unknown[]) => modelCatalogCardMocks.formatHealthCheckMessage(...args),
  runModelHealthCheck: (...args: unknown[]) => modelCatalogCardMocks.runModelHealthCheck(...args),
}))

vi.mock('../lib/providers', () => ({
  PROVIDER_ORDER: ['openrouter', 'anthropic'],
  PROVIDERS: {
    openrouter: { id: 'openrouter' },
    anthropic: { id: 'anthropic' },
  },
}))

vi.mock('../lib/settings-store', () => ({
  loadProviderSettings: () => modelCatalogCardMocks.loadProviderSettings(),
  saveProviderSettings: (...args: unknown[]) => modelCatalogCardMocks.saveProviderSettings(...args),
}))

vi.mock('./Toast', () => ({
  useToast: () => modelCatalogCardMocks.toast,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ModelCatalogCard', () => {
  it('expands the catalog, adds an OpenRouter model, saves the catalog, and runs availability checks', async () => {
    const initialCatalog = [
      {
        id: 'openrouter/model-inicial',
        label: 'Modelo Inicial',
        provider: 'OpenRouter',
        providerId: 'openrouter',
        tier: 'fast',
        description: 'Modelo inicial do catálogo.',
        contextWindow: 128000,
        inputCost: 0,
        outputCost: 0,
        isFree: true,
        capabilities: ['text'],
        agentFit: { extraction: 8, synthesis: 7, reasoning: 6, writing: 5 },
      },
    ]

    modelCatalogCardMocks.loadModelCatalog
      .mockResolvedValueOnce(initialCatalog)
      .mockResolvedValueOnce([...initialCatalog, {
        id: 'anthropic/claude-sonnet',
        label: 'Claude Sonnet',
        provider: 'Anthropic',
        providerId: 'anthropic',
        tier: 'balanced',
        description: 'Modelo novo.',
        contextWindow: 200000,
        inputCost: 3,
        outputCost: 15,
        isFree: false,
        capabilities: ['text'],
        agentFit: { extraction: 7, synthesis: 8, reasoning: 9, writing: 8 },
      }])
    modelCatalogCardMocks.loadProviderSettings.mockResolvedValue({
      openrouter: { enabled: true, saved_models: initialCatalog },
      anthropic: { enabled: true, saved_models: [] },
    })
    modelCatalogCardMocks.fetchOpenRouterModels.mockResolvedValue([
      { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet', pricing: { prompt: '0.000003' } },
    ])
    modelCatalogCardMocks.openRouterToModelOption.mockReturnValue({
      id: 'anthropic/claude-sonnet',
      label: 'Claude Sonnet',
      provider: 'Anthropic',
      providerId: 'anthropic',
      tier: 'balanced',
      description: 'Modelo novo.',
      contextWindow: 200000,
      inputCost: 3,
      outputCost: 15,
      isFree: false,
      capabilities: ['text'],
      agentFit: { extraction: 7, synthesis: 8, reasoning: 9, writing: 8 },
    })
    modelCatalogCardMocks.getBestAgentInfo.mockReturnValue({
      topCategory: 'reasoning',
      categoryLabel: 'Raciocínio',
      agents: ['Analista', 'Revisor'],
      why: 'Melhor para raciocínio jurídico.',
    })
    modelCatalogCardMocks.runModelHealthCheck.mockResolvedValue({ removedModels: [] })
    modelCatalogCardMocks.formatHealthCheckMessage.mockReturnValue({
      title: 'Catálogo íntegro',
      message: 'Nenhum modelo removido.',
    })

    render(<ModelCatalogCard />)

    await waitFor(() => {
      expect(screen.getByText('Catálogo Pessoal')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Catálogo Pessoal/i }))
    expect(screen.getByText('Modelo Inicial')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Adicionar do OpenRouter/i }))
    await waitFor(() => {
      expect(modelCatalogCardMocks.fetchOpenRouterModels).toHaveBeenCalled()
      expect(screen.getByText('Claude Sonnet')).toBeTruthy()
    })

    const addButtons = screen.getAllByRole('button', { name: /Adicionar/i })
    fireEvent.click(addButtons[addButtons.length - 1] as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.getByText(/Alterações não salvas/)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Salvar Catálogo/i }))
    await waitFor(() => {
      expect(modelCatalogCardMocks.saveModelCatalog).toHaveBeenCalled()
      expect(modelCatalogCardMocks.saveProviderSettings).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByRole('button', { name: /Verificar Disponibilidade/i }))
    await waitFor(() => {
      expect(modelCatalogCardMocks.runModelHealthCheck).toHaveBeenCalledWith(true)
      expect(modelCatalogCardMocks.toast.success).toHaveBeenCalledWith('Catálogo íntegro', 'Nenhum modelo removido.')
    })
  })
})