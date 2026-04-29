// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  apiInstance,
  apiCall,
  currentUser,
  capture,
  mockCreate,
} = vi.hoisted(() => {
  const capture: {
    request: ((config: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>) | null
    responseError: ((error: any) => Promise<any>) | null
  } = {
    request: null,
    responseError: null,
  }

  const apiCall = vi.fn()
  const apiInstance = Object.assign(apiCall, {
    interceptors: {
      request: {
        use: vi.fn((handler: typeof capture.request) => {
          capture.request = handler
          return 0
        }),
      },
      response: {
        use: vi.fn((_handler: unknown, errorHandler: typeof capture.responseError) => {
          capture.responseError = errorHandler
          return 0
        }),
      },
    },
    get: vi.fn(),
  })

  return {
    apiInstance,
    apiCall,
    currentUser: {
      getIdToken: vi.fn(),
    },
    capture,
    mockCreate: vi.fn(() => apiInstance),
  }
})

vi.mock('axios', () => ({
  default: {
    create: mockCreate,
  },
}))

vi.mock('./demo-interceptor', () => ({
  installDemoInterceptor: vi.fn(),
}))

vi.mock('../lib/firebase', () => ({
  IS_FIREBASE: true,
  firebaseAuth: {
    currentUser,
  },
}))

describe('api client firebase session handling', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    apiCall.mockReset()
    currentUser.getIdToken.mockReset()
    capture.request = null
    capture.responseError = null
    await import('./client')
  })

  it('uses the live firebase token on requests and persists it locally', async () => {
    currentUser.getIdToken.mockResolvedValue('firebase-live-token')

    const config = await capture.request?.({ headers: {} })

    expect(currentUser.getIdToken).toHaveBeenCalledWith(false)
    expect(config?.headers.Authorization).toBe('Bearer firebase-live-token')
    expect(localStorage.getItem('lexio_token')).toBe('firebase-live-token')
  })

  it('refreshes and retries 401 responses without clearing the local session', async () => {
    localStorage.setItem('lexio_token', 'stale-token')
    currentUser.getIdToken.mockResolvedValue('firebase-refreshed-token')
    apiCall.mockResolvedValue({ data: { ok: true } })

    const requestConfig = { headers: {} as Record<string, string> }
    const result = await capture.responseError?.({
      response: { status: 401 },
      config: requestConfig,
    })

    expect(currentUser.getIdToken).toHaveBeenCalledWith(true)
    expect(apiCall).toHaveBeenCalledWith(expect.objectContaining({
      _lexioAuthRetry: true,
      headers: expect.objectContaining({
        Authorization: 'Bearer firebase-refreshed-token',
      }),
    }))
    expect(localStorage.getItem('lexio_token')).toBe('firebase-refreshed-token')
    expect(result).toEqual({ data: { ok: true } })
  })
})
