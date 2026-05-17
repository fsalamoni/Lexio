// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MultimodalPolicyCard from './MultimodalPolicyCard'

const multimodalPolicyMocks = vi.hoisted(() => ({
  loadMultimodalPolicyConfig: vi.fn(),
  saveMultimodalPolicyConfig: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../../lib/multimodal-policy', async () => {
  const actual = await vi.importActual<typeof import('../../lib/multimodal-policy')>('../../lib/multimodal-policy')
  return {
    ...actual,
    loadMultimodalPolicyConfig: (...args: unknown[]) => multimodalPolicyMocks.loadMultimodalPolicyConfig(...args),
    saveMultimodalPolicyConfig: (...args: unknown[]) => multimodalPolicyMocks.saveMultimodalPolicyConfig(...args),
  }
})

vi.mock('../Toast', () => ({
  useToast: () => multimodalPolicyMocks.toast,
}))

beforeEach(() => {
  multimodalPolicyMocks.loadMultimodalPolicyConfig.mockResolvedValue({
    enabled: true,
    max_attachments_per_turn: 4,
    modalities: {
      image: { enabled: true, max_file_mb: 8, allowed_provider_ids: [] },
      audio: { enabled: true, max_file_mb: 25, allowed_provider_ids: [] },
      video: { enabled: true, max_file_mb: 50, allowed_provider_ids: [] },
    },
  })
  multimodalPolicyMocks.saveMultimodalPolicyConfig.mockImplementation(async (policy) => policy)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MultimodalPolicyCard', () => {
  it('loads, edits, and saves multimodal limits and provider allow-list', async () => {
    render(<MultimodalPolicyCard />)

    await waitFor(() => {
      expect(screen.getByText('Governanca multimodal')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Anexos por turno'), { target: { value: '2' } })
    fireEvent.click(screen.getAllByLabelText('Ativo')[1])
    fireEvent.click(screen.getAllByRole('button', { name: 'OpenAI' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Salvar politica' }))

    await waitFor(() => {
      expect(multimodalPolicyMocks.saveMultimodalPolicyConfig).toHaveBeenCalledWith(expect.objectContaining({
        max_attachments_per_turn: 2,
        modalities: expect.objectContaining({
          image: expect.objectContaining({ allowed_provider_ids: ['openai'] }),
          audio: expect.objectContaining({ enabled: false }),
        }),
      }))
    })
    expect(multimodalPolicyMocks.toast.success).toHaveBeenCalled()
  })
})
