// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FallbackPriorityConfigCard from './FallbackPriorityConfigCard'

const fallbackPriorityMocks = vi.hoisted(() => ({
  getDefaultFallbackPriorityConfig: vi.fn(),
  getEmptyFallbackPriorityList: vi.fn(),
  loadFallbackPriorityConfig: vi.fn(),
  resetFallbackPriorityConfig: vi.fn().mockResolvedValue(undefined),
  saveFallbackPriorityConfig: vi.fn().mockResolvedValue(undefined),
  useCatalogModels: vi.fn(),
}))

vi.mock('../../lib/model-config', () => ({
  FALLBACK_AGENT_CATEGORIES: ['extraction', 'synthesis'],
  FALLBACK_PRIORITY_SLOTS: 3,
  getDefaultFallbackPriorityConfig: () => fallbackPriorityMocks.getDefaultFallbackPriorityConfig(),
  getEmptyFallbackPriorityList: () => fallbackPriorityMocks.getEmptyFallbackPriorityList(),
  loadFallbackPriorityConfig: () => fallbackPriorityMocks.loadFallbackPriorityConfig(),
  resetFallbackPriorityConfig: (...args: unknown[]) => fallbackPriorityMocks.resetFallbackPriorityConfig(...args),
  saveFallbackPriorityConfig: (...args: unknown[]) => fallbackPriorityMocks.saveFallbackPriorityConfig(...args),
}))

vi.mock('../../lib/model-catalog', () => ({
  useCatalogModels: () => fallbackPriorityMocks.useCatalogModels(),
}))

vi.mock('../ModelSelectorModal', () => ({
  default: ({ open, agentLabel, onClose, onSelect }: { open: boolean; agentLabel: string; onClose: () => void; onSelect: (modelId: string) => void }) => (
    open ? (
      <div>
        <p>{agentLabel}</p>
        <button onClick={() => onSelect('model-selected')}>Selecionar fallback</button>
        <button onClick={onClose}>Fechar modal</button>
      </div>
    ) : null
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FallbackPriorityConfigCard', () => {
  it('loads the saved config, allows selecting a fallback, and persists/reset changes', async () => {
    const defaultConfig = {
      extraction: ['', '', ''],
      synthesis: ['', '', ''],
    }
    const savedConfig = {
      extraction: ['model-a', '', ''],
      synthesis: ['', '', ''],
    }

    fallbackPriorityMocks.getDefaultFallbackPriorityConfig.mockReturnValue(defaultConfig)
    fallbackPriorityMocks.getEmptyFallbackPriorityList.mockReturnValue(['', '', ''])
    fallbackPriorityMocks.loadFallbackPriorityConfig.mockResolvedValue(savedConfig)
    fallbackPriorityMocks.useCatalogModels.mockReturnValue([
      { id: 'model-a', label: 'Modelo A', provider: 'OpenRouter' },
      { id: 'model-selected', label: 'Modelo B', provider: 'Anthropic' },
    ])

    render(<FallbackPriorityConfigCard />)

    await waitFor(() => {
      expect(screen.getByText('Modelo A')).toBeTruthy()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /Selecionar modelo/i })[1])
    expect(screen.getByText(/Fallback de Extração/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar fallback' }))

    await waitFor(() => {
      expect(screen.getByText('Modelo B')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Salvar fallbacks/i }))
    await waitFor(() => {
      expect(fallbackPriorityMocks.saveFallbackPriorityConfig).toHaveBeenCalled()
      expect(screen.getByText(/salva com sucesso/)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Limpar todos/i }))
    await waitFor(() => {
      expect(fallbackPriorityMocks.resetFallbackPriorityConfig).toHaveBeenCalled()
    })
  })
})