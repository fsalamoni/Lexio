// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import DraggablePanel from './DraggablePanel'

type VisualViewportMock = {
  width: number
  height: number
  addEventListener: (event: string, listener: EventListenerOrEventListenerObject) => void
  removeEventListener: (event: string, listener: EventListenerOrEventListenerObject) => void
  emit: (event: string) => void
}

const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
const originalInnerWidth = window.innerWidth
const originalInnerHeight = window.innerHeight

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  })
}

function setVisualViewport(value: VisualViewportMock | undefined): void {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    writable: true,
    value,
  })
}

function createVisualViewportMock(width: number, height: number): VisualViewportMock {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()

  return {
    width,
    height,
    addEventListener: (event, listener) => {
      const bucket = listeners.get(event) ?? new Set<EventListenerOrEventListenerObject>()
      bucket.add(listener)
      listeners.set(event, bucket)
    },
    removeEventListener: (event, listener) => {
      listeners.get(event)?.delete(listener)
    },
    emit: (event) => {
      const eventObject = new Event(event)
      for (const listener of listeners.get(event) ?? []) {
        if (typeof listener === 'function') {
          listener(eventObject)
        } else {
          listener.handleEvent(eventObject)
        }
      }
    },
  }
}

afterEach(() => {
  cleanup()
  if (originalVisualViewport) {
    Object.defineProperty(window, 'visualViewport', originalVisualViewport)
  } else {
    setVisualViewport(undefined)
  }
  setViewport(originalInnerWidth, originalInnerHeight)
})

describe('DraggablePanel', () => {
  it('clamps compact geometry and disables maximize on small viewport', async () => {
    setVisualViewport(undefined)
    setViewport(360, 640)

    render(
      <DraggablePanel open onClose={() => {}} title="Painel" initialWidth={920} initialHeight={840}>
        <div>Conteudo</div>
      </DraggablePanel>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Painel' })

    await waitFor(() => {
      expect(dialog).toBeDefined()
      expect((dialog as HTMLDivElement).style.left).toBe('8px')
      expect((dialog as HTMLDivElement).style.top).toBe('8px')
      expect((dialog as HTMLDivElement).style.width).toBe('344px')
      expect((dialog as HTMLDivElement).style.height).toBe('624px')
    })

    const maximizeButton = screen.getByLabelText('Maximizar painel') as HTMLButtonElement
    expect(maximizeButton.disabled).toBe(true)
  })

  it('reacts to visualViewport size updates in compact mode', async () => {
    const visualViewport = createVisualViewportMock(390, 760)
    setVisualViewport(visualViewport)
    setViewport(1280, 900)

    render(
      <DraggablePanel open onClose={() => {}} title="Viewport" initialWidth={900} initialHeight={900}>
        <div>Conteudo</div>
      </DraggablePanel>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Viewport' }) as HTMLDivElement

    await waitFor(() => {
      expect(dialog.style.width).toBe('374px')
      expect(dialog.style.height).toBe('744px')
    })

    visualViewport.width = 350
    visualViewport.height = 500
    visualViewport.emit('resize')

    await waitFor(() => {
      expect(dialog.style.width).toBe('334px')
      expect(dialog.style.height).toBe('484px')
    })
  })
})
