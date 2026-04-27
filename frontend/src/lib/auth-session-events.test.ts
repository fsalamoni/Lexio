import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  FIRESTORE_AUTH_SESSION_INVALID_EVENT,
  emitFirestoreAuthSessionInvalid,
  getSessionFingerprint,
} from './auth-session-events'

const originalWindow = globalThis.window
const originalCustomEvent = globalThis.CustomEvent

function installWindowMock(token: string | null = null) {
  const dispatchEvent = vi.fn()
  ;(globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: vi.fn((key: string) => {
        if (key !== 'lexio_token') return null
        return token
      }),
    },
    dispatchEvent,
  }
  return { dispatchEvent }
}

class MockCustomEvent<T = unknown> {
  type: string
  detail: T

  constructor(type: string, init?: { detail?: T }) {
    this.type = type
    this.detail = init?.detail as T
  }
}

afterEach(() => {
  ;(globalThis as { window?: unknown }).window = originalWindow
  ;(globalThis as { CustomEvent?: unknown }).CustomEvent = originalCustomEvent
})

describe('auth-session-events', () => {
  it('builds session fingerprint with uid and token suffix', () => {
    installWindowMock('token-prefix-1234567890abcdef')

    expect(getSessionFingerprint('uid-123')).toBe('uid-123|1234567890abcdef')
  })

  it('emits session-invalid event with context metadata', () => {
    const { dispatchEvent } = installWindowMock('token-prefix-1234567890abcdef')
    ;(globalThis as { CustomEvent?: unknown }).CustomEvent = MockCustomEvent as unknown

    emitFirestoreAuthSessionInvalid({
      contextLabel: 'listDocuments.query',
      authUid: 'uid-123',
    })

    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    const event = dispatchEvent.mock.calls[0][0] as MockCustomEvent<{
      contextLabel: string
      authUid: string | null
      sessionFingerprint: string
      occurredAt: number
    }>

    expect(event.type).toBe(FIRESTORE_AUTH_SESSION_INVALID_EVENT)
    expect(event.detail.contextLabel).toBe('listDocuments.query')
    expect(event.detail.authUid).toBe('uid-123')
    expect(event.detail.sessionFingerprint).toBe('uid-123|1234567890abcdef')
    expect(typeof event.detail.occurredAt).toBe('number')
  })

  it('does not throw when window is unavailable', () => {
    ;(globalThis as { window?: unknown }).window = undefined

    expect(() => {
      emitFirestoreAuthSessionInvalid({
        contextLabel: 'getUserSettings',
        authUid: null,
      })
    }).not.toThrow()
  })
})
