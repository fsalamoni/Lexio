// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProviderApiKeysCard from './ProviderApiKeysCard'

const providerApiKeysMocks = vi.hoisted(() => ({
  loadApiKeys: vi.fn(),
  loadProviderSettings: vi.fn(),
  saveApiKeys: vi.fn().mockResolvedValue(undefined),
  saveProviderSettings: vi.fn().mockResolvedValue(undefined),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../lib/settings-store', () => ({
  loadApiKeys: () => providerApiKeysMocks.loadApiKeys(),
  loadProviderSettings: () => providerApiKeysMocks.loadProviderSettings(),
  saveApiKeys: (...args: unknown[]) => providerApiKeysMocks.saveApiKeys(...args),
  saveProviderSettings: (...args: unknown[]) => providerApiKeysMocks.saveProviderSettings(...args),
}))

vi.mock('../lib/providers', () => ({
  PROVIDER_ORDER: ['openrouter'],
  PROVIDERS: {
    openrouter: {
      label: 'OpenRouter',
      color: 'bg-indigo-100 text-indigo-700',
      description: 'Roteador unificado.',
      consoleUrl: 'https://openrouter.ai/settings/keys',
      guide: ['Criar chave', 'Colar chave'],
      supportsBaseUrlOverride: true,
      baseUrlLabel: 'URL base OpenRouter',
      baseUrl: 'https://openrouter.ai/api',
      baseUrlHelp: 'Use um endpoint customizado se necessário.',
    },
  },
  apiKeyFieldForProvider: (providerId: string) => `${providerId}_api_key`,
}))

vi.mock('./Toast', () => ({
  useToast: () => providerApiKeysMocks.toast,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProviderApiKeysCard', () => {
  it('loads provider rows, edits keys/settings, and saves the pending changes', async () => {
    providerApiKeysMocks.loadApiKeys.mockResolvedValue([
      {
        key: 'openrouter_api_key',
        label: 'OpenRouter API Key',
        description: 'Roteador unificado.',
        placeholder: 'sk-or-v1...',
        link: 'https://openrouter.ai/settings/keys',
        guide: ['Criar chave', 'Colar chave'],
        is_auto: false,
        is_set: true,
        masked_value: '••••1234',
        source: 'perfil',
      },
      {
        key: 'datajud_api_key',
        label: 'DataJud API Key',
        description: 'Chave DataJud.',
        placeholder: 'cDZH...',
        link: 'https://datajud-wiki.cnj.jus.br/',
        guide: ['Copiar chave'],
        is_auto: false,
        is_set: false,
        masked_value: null,
        source: 'not_set',
      },
    ])
    providerApiKeysMocks.loadProviderSettings.mockResolvedValue({
      openrouter: { enabled: false, base_url: 'https://openrouter.ai/api' },
    })

    render(<ProviderApiKeysCard />)

    await waitFor(() => {
      expect(screen.getByText('OpenRouter')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Ativo/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /Como configurar/i })[0])
    fireEvent.change(screen.getByPlaceholderText('Nova chave (deixe vazio para manter a atual)'), { target: { value: 'sk-or-v1-new' } })
    fireEvent.change(screen.getByDisplayValue('https://openrouter.ai/api'), { target: { value: 'https://proxy.lexio.dev' } })

    expect(screen.getByText(/Há alterações pendentes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/i }))

    await waitFor(() => {
      expect(providerApiKeysMocks.saveApiKeys).toHaveBeenCalledWith({ openrouter_api_key: 'sk-or-v1-new' })
      expect(providerApiKeysMocks.saveProviderSettings).toHaveBeenCalled()
      expect(providerApiKeysMocks.toast.success).toHaveBeenCalled()
    })
  })
})