// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProviderCatalogCard from './ProviderCatalogCard'

const providerCatalogCardMocks = vi.hoisted(() => ({
  fetchProviderModels: vi.fn(),
  loadApiKeyValues: vi.fn(),
  loadModelCatalog: vi.fn(),
  loadProviderSettings: vi.fn(),
  saveModelCatalog: vi.fn().mockResolvedValue(undefined),
  saveProviderSettings: vi.fn().mockResolvedValue(undefined),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../lib/model-catalog', () => ({
  CATALOG_UPDATED_EVENT: 'lexio:model_catalog_updated',
  fetchProviderModels: (...args: unknown[]) => providerCatalogCardMocks.fetchProviderModels(...args),
  loadModelCatalog: () => providerCatalogCardMocks.loadModelCatalog(),
  saveModelCatalog: (...args: unknown[]) => providerCatalogCardMocks.saveModelCatalog(...args),
}))

vi.mock('../lib/settings-store', () => ({
  loadApiKeyValues: () => providerCatalogCardMocks.loadApiKeyValues(),
  loadProviderSettings: () => providerCatalogCardMocks.loadProviderSettings(),
  saveProviderSettings: (...args: unknown[]) => providerCatalogCardMocks.saveProviderSettings(...args),
}))

vi.mock('../lib/providers', () => ({
  PROVIDERS: {
    openrouter: {
      id: 'openrouter',
      label: 'OpenRouter',
      color: 'bg-indigo-100 text-indigo-700',
      consoleUrl: 'https://openrouter.ai/settings/keys',
    },
  },
  apiKeyFieldForProvider: (providerId: string) => `${providerId}_api_key`,
}))

vi.mock('../lib/model-config', () => ({
  FREE_TIER_RATE_LIMITS: { rpm: 20, rpd: 200 },
}))

vi.mock('./Toast', () => ({
  useToast: () => providerCatalogCardMocks.toast,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProviderCatalogCard', () => {
  it('loads provider models when opened and adds a model to the personal catalog', async () => {
    providerCatalogCardMocks.loadApiKeyValues.mockResolvedValue({ openrouter_api_key: 'sk-or-v1' })
    providerCatalogCardMocks.loadProviderSettings.mockResolvedValue({ openrouter: { enabled: true } })
    providerCatalogCardMocks.loadModelCatalog.mockResolvedValue([])
    providerCatalogCardMocks.fetchProviderModels.mockResolvedValue([
      {
        id: 'openrouter/sonnet',
        label: 'Claude Sonnet',
        provider: 'OpenRouter',
        providerId: 'openrouter',
        tier: 'balanced',
        contextWindow: 200000,
        inputCost: 1,
        outputCost: 3,
        isFree: false,
        capabilities: ['text'],
      },
    ])

    render(<ProviderCatalogCard providerId="openrouter" />)

    fireEvent.click(screen.getByRole('button', { name: /Catálogo OpenRouter/i }))

    await waitFor(() => {
      expect(providerCatalogCardMocks.fetchProviderModels).toHaveBeenCalledWith('openrouter', 'sk-or-v1', undefined)
      expect(screen.getByText('Claude Sonnet')).toBeTruthy()
    })

    const addButtons = screen.getAllByRole('button', { name: /Adicionar/i })
    fireEvent.click(addButtons[addButtons.length - 1] as HTMLButtonElement)

    await waitFor(() => {
      expect(providerCatalogCardMocks.saveModelCatalog).toHaveBeenCalled()
      expect(providerCatalogCardMocks.saveProviderSettings).toHaveBeenCalled()
      expect(providerCatalogCardMocks.toast.success).toHaveBeenCalled()
      expect(screen.getByText(/No catálogo/)).toBeTruthy()
    })
  })
})