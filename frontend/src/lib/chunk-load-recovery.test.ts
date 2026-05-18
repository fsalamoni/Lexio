import { describe, expect, it, vi } from 'vitest'

import { installChunkLoadRecovery, isRecoverableChunkLoadError } from './chunk-load-recovery'

function createWindowStub(href = 'https://lexio.web.app/chat') {
  const listeners = new Map<string, EventListener>()
  const storage = new Map<string, string>()
  const reload = vi.fn()

  return {
    target: {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener)
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type)
      }),
      location: {
        href,
        reload,
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
        removeItem: (key: string) => {
          storage.delete(key)
        },
      },
    },
    listeners,
    reload,
  }
}

describe('chunk-load-recovery', () => {
  it('recognizes stale deploy chunk failures as recoverable', () => {
    expect(isRecoverableChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://lexio.web.app/assets/Chat-old.js'))).toBe(true)
    expect(isRecoverableChunkLoadError('Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".')).toBe(true)
    expect(isRecoverableChunkLoadError(new Error('network request failed'))).toBe(false)
  })

  it('reloads once on an unhandled dynamic import rejection for the current URL', () => {
    const stub = createWindowStub()
    const teardown = installChunkLoadRecovery(stub.target as never)
    const listener = stub.listeners.get('unhandledrejection') as EventListener
    const preventDefault = vi.fn()

    listener({ reason: new TypeError('Failed to fetch dynamically imported module: https://lexio.web.app/assets/Chat-old.js'), preventDefault } as unknown as Event)
    listener({ reason: new TypeError('Failed to fetch dynamically imported module: https://lexio.web.app/assets/Chat-old.js'), preventDefault } as unknown as Event)

    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(stub.reload).toHaveBeenCalledTimes(1)
    teardown()
  })

  it('reloads on vite preload errors carrying stale chunk payloads', () => {
    const stub = createWindowStub('https://lexio.web.app/notebook')
    installChunkLoadRecovery(stub.target as never)
    const listener = stub.listeners.get('vite:preloadError') as EventListener
    const preventDefault = vi.fn()

    listener({ payload: new Error('Importing a module script failed'), preventDefault } as unknown as Event)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stub.reload).toHaveBeenCalledTimes(1)
  })
})