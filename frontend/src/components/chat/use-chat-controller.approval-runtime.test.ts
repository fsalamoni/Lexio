import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadChatOrchestratorModelsMock, getOpenRouterKeyMock } = vi.hoisted(() => ({
  loadChatOrchestratorModelsMock: vi.fn(),
  getOpenRouterKeyMock: vi.fn(),
}))

vi.mock('../../lib/model-config', async () => {
  const actual = await vi.importActual<typeof import('../../lib/model-config')>('../../lib/model-config')
  return {
    ...actual,
    loadChatOrchestratorModels: loadChatOrchestratorModelsMock,
  }
})

vi.mock('../../lib/generation-service', async () => {
  const actual = await vi.importActual<typeof import('../../lib/generation-service')>('../../lib/generation-service')
  return {
    ...actual,
    getOpenRouterKey: getOpenRouterKeyMock,
  }
})

import { resolveApprovalResumeRuntime } from './use-chat-controller'

describe('resolveApprovalResumeRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the configured chat agent models for approved non-mock resumes', async () => {
    loadChatOrchestratorModelsMock.mockResolvedValue({
      chat_image_generator: 'x-ai/grok-4.1-fast',
    })
    getOpenRouterKeyMock.mockResolvedValue('openrouter-key')

    const runtime = await resolveApprovalResumeRuntime({ userId: 'user-1', mock: false })

    expect(loadChatOrchestratorModelsMock).toHaveBeenCalledWith('user-1')
    expect(getOpenRouterKeyMock).toHaveBeenCalledWith('user-1')
    expect(runtime).toEqual({
      models: {
        chat_image_generator: 'x-ai/grok-4.1-fast',
      },
      apiKey: 'openrouter-key',
    })
  })

  it('preserves the configured models even when the API key lookup fails', async () => {
    loadChatOrchestratorModelsMock.mockResolvedValue({
      chat_image_generator: 'x-ai/grok-4.1-fast',
    })
    getOpenRouterKeyMock.mockRejectedValue(new Error('missing key'))

    const runtime = await resolveApprovalResumeRuntime({ userId: 'user-2', mock: false })

    expect(runtime).toEqual({
      models: {
        chat_image_generator: 'x-ai/grok-4.1-fast',
      },
      apiKey: '',
    })
  })
})