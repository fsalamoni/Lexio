// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProviderCatalogsSection from './ProviderCatalogsSection'

const providerCatalogsSectionMocks = vi.hoisted(() => ({
  loadApiKeyValues: vi.fn(),
  loadProviderSettings: vi.fn(),
}))

vi.mock('../lib/settings-store', () => ({
  PROVIDER_SETTINGS_UPDATED_EVENT: 'lexio:provider_settings_updated',
  loadApiKeyValues: () => providerCatalogsSectionMocks.loadApiKeyValues(),
  loadProviderSettings: () => providerCatalogsSectionMocks.loadProviderSettings(),
}))

vi.mock('../lib/providers', () => ({
  PROVIDER_ORDER: ['openrouter', 'ollama'],
  PROVIDERS: {
    openrouter: { id: 'openrouter' },
    ollama: { id: 'ollama' },
  },
  apiKeyFieldForProvider: (providerId: string) => `${providerId}_api_key`,
}))

vi.mock('./ProviderCatalogCard', () => ({
  default: ({ providerId, defaultOpen }: { providerId: string; defaultOpen?: boolean }) => (
    <div>{`${providerId}:${defaultOpen ? 'open' : 'closed'}`}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProviderCatalogsSection', () => {
  it('shows the empty-state message when no provider is enabled', async () => {
    providerCatalogsSectionMocks.loadApiKeyValues.mockResolvedValue({})
    providerCatalogsSectionMocks.loadProviderSettings.mockResolvedValue({})

    render(<ProviderCatalogsSection />)

    await waitFor(() => {
      expect(screen.getByText(/Habilite um provedor em/)).toBeTruthy()
    })
  })

  it('renders one catalog card per effectively enabled provider and refreshes on settings updates', async () => {
    providerCatalogsSectionMocks.loadApiKeyValues
      .mockResolvedValueOnce({ openrouter_api_key: 'sk-or-v1' })
      .mockResolvedValueOnce({ openrouter_api_key: 'sk-or-v1', ollama_api_key: '' })
    providerCatalogsSectionMocks.loadProviderSettings
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ollama: { enabled: true, base_url: 'http://localhost:11434' } })

    render(<ProviderCatalogsSection />)

    await waitFor(() => {
      expect(screen.getByText('openrouter:open')).toBeTruthy()
    })

    window.dispatchEvent(new CustomEvent('lexio:provider_settings_updated'))

    await waitFor(() => {
      expect(screen.getByText('ollama:closed')).toBeTruthy()
    })
  })
})