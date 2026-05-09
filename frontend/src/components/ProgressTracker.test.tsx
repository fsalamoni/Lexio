// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ProgressTracker from './ProgressTracker'

class MockWebSocket {
  static instances: MockWebSocket[] = []

  url: string
  onmessage: ((event: Pick<MessageEvent, 'data'>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  emitInvalidMessage(raw = '{invalid') {
    this.onmessage?.({ data: raw })
  }

  emitError() {
    this.onerror?.(new Event('error'))
  }
}

describe('ProgressTracker', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    MockWebSocket.instances = []
    vi.clearAllMocks()
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
  })

  afterEach(() => {
    cleanup()
    globalThis.WebSocket = originalWebSocket
  })

  it('connects to the document websocket and renders incoming progress updates', () => {
    render(<ProgressTracker documentId="doc-123" />)

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe(`${location.origin.replace(/^http/, 'ws')}/ws/document/doc-123`)

    act(() => {
      MockWebSocket.instances[0].emitInvalidMessage()
    })
    expect(screen.queryByText(/triagem/i)).toBeNull()

    act(() => {
      MockWebSocket.instances[0].emitMessage({
        phase: 'jurista',
        message: 'Analisando teses principais',
        progress: 67,
      })
    })

    expect(screen.getByText('Analisando teses principais')).toBeTruthy()
    expect(screen.getByText('67%')).toBeTruthy()
    expect(screen.getByText('Debate')).toBeTruthy()
  })

  it('closes the websocket on connection errors and component cleanup', () => {
    const view = render(<ProgressTracker documentId="doc-456" />)
    const socket = MockWebSocket.instances[0]

    socket.emitError()
    expect(socket.close).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(socket.close).toHaveBeenCalledTimes(2)
  })
})