// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RuntimeFeatureFlagsCard from './RuntimeFeatureFlagsCard'

const hoisted = vi.hoisted(() => ({
  mockHydrateRuntimeFeatureFlags: vi.fn(),
  mockSaveFeatureFlags: vi.fn(),
  toastSuccess: vi.fn(),
  testFlags: [
    {
      key: 'FF_ALPHA',
      label: 'Flag Alpha',
      description: 'Primeira flag de teste.',
      defaultEnabled: false,
      envVar: 'VITE_FF_ALPHA',
      devToggleable: true,
    },
    {
      key: 'FF_BETA',
      label: 'Flag Beta',
      description: 'Segunda flag de teste.',
      defaultEnabled: false,
      envVar: 'VITE_FF_BETA',
      devToggleable: true,
    },
  ],
  state: {
    savedFlags: {} as Record<string, boolean>,
    inheritedStates: {
      FF_ALPHA: { enabled: true, source: 'env' as const },
      FF_BETA: { enabled: false, source: 'default' as const },
    } as Record<string, { enabled: boolean; source: 'default' | 'env' | 'runtime' | 'sessionStorage' }>,
  },
}))

vi.mock('../../lib/settings-store', () => ({
  hydrateRuntimeFeatureFlags: (...args: unknown[]) => hoisted.mockHydrateRuntimeFeatureFlags(...args),
  saveFeatureFlags: (...args: unknown[]) => hoisted.mockSaveFeatureFlags(...args),
}))

vi.mock('../../lib/feature-flags', () => ({
  FEATURE_FLAGS: hoisted.testFlags,
  listAllFlags: () => hoisted.testFlags.map((flag) => {
    if (Object.prototype.hasOwnProperty.call(hoisted.state.savedFlags, flag.key)) {
      return {
        ...flag,
        enabled: hoisted.state.savedFlags[flag.key],
        source: 'runtime' as const,
      }
    }

    return {
      ...flag,
      enabled: hoisted.state.inheritedStates[flag.key].enabled,
      source: hoisted.state.inheritedStates[flag.key].source,
    }
  }),
  getNonRuntimeFlagState: (flagKey: string) => hoisted.state.inheritedStates[flagKey],
}))

vi.mock('../Toast', () => ({
  useToast: () => ({
    success: hoisted.toastSuccess,
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}))

describe('RuntimeFeatureFlagsCard', () => {
  beforeEach(() => {
    hoisted.state.savedFlags = { FF_ALPHA: false }
    hoisted.mockHydrateRuntimeFeatureFlags.mockImplementation(async () => ({ ...hoisted.state.savedFlags }))
    hoisted.mockSaveFeatureFlags.mockImplementation(async (payload: Record<string, boolean>) => {
      hoisted.state.savedFlags = { ...payload }
      return { ...payload }
    })
    hoisted.toastSuccess.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('saves only remaining overrides after resetting a flag to its inherited state', async () => {
    render(<RuntimeFeatureFlagsCard />)

    await waitFor(() => {
      expect(screen.getByText('Flag Alpha')).toBeTruthy()
    })

    expect(screen.getByText('Sem override, fica ativado via env.')).toBeTruthy()
    expect(screen.getByText('Sem override, fica desativado via default.')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Herdar' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Desativado' })[0])

    await waitFor(() => {
      expect(screen.getAllByText('env', { selector: 'span' })).toHaveLength(1)
      expect(screen.getAllByText('perfil', { selector: 'span' })).toHaveLength(1)
    })

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Salvar Flags' }) as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Salvar Flags' }))

    await waitFor(() => {
      expect(hoisted.mockSaveFeatureFlags).toHaveBeenCalledWith({ FF_BETA: true })
    })
    expect(hoisted.toastSuccess).toHaveBeenCalledWith(
      'Feature flags salvos',
      'As próximas execuções já usarão os valores do seu perfil.',
    )

    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Salvar Flags' }) as HTMLButtonElement).disabled).toBe(true)
    })
  })

  it('shows a load error when hydration fails', async () => {
    hoisted.mockHydrateRuntimeFeatureFlags.mockRejectedValueOnce(new Error('boom'))

    render(<RuntimeFeatureFlagsCard />)

    await waitFor(() => {
      expect(screen.getByText('Não foi possível carregar os feature flags do perfil.')).toBeTruthy()
    })
  })
})