// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedInfographic } from './artifact-parsers'
import InfographicRenderer from './InfographicRenderer'

afterEach(() => {
  cleanup()
})

describe('InfographicRenderer', () => {
  beforeEach(() => {
    class MockIntersectionObserver {
      private readonly callback: IntersectionObserverCallback

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
      }

      observe(target: Element) {
        this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }

      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      readonly root = null
      readonly rootMargin = ''
      readonly thresholds = []
    }

    Object.defineProperty(globalThis, 'IntersectionObserver', {
      value: MockIntersectionObserver,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      value: (callback: FrameRequestCallback) => {
        callback(10_000)
        return 1
      },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'performance', {
      value: { now: () => 0 },
      configurable: true,
      writable: true,
    })
  })

  it('renders image, sections, animated stats, conclusion, and sources', async () => {
    const data: ParsedInfographic = {
      title: 'Panorama Jurisprudencial',
      subtitle: 'Síntese visual dos principais achados.',
      renderedImageUrl: 'https://example.com/infografico.png',
      sections: [
        {
          icon: '⚖️',
          title: 'Tendência predominante',
          content: 'Os julgados seguem a linha protetiva.',
          highlight: 'Predomínio de decisões favoráveis.',
          stats: [{ label: 'Casos', value: 128, unit: '%' }],
        },
      ],
      conclusion: 'O cenário é favorável ao pedido principal.',
      sources: ['STF', 'STJ'],
    }

    const { container } = render(<InfographicRenderer data={data} />)

    expect(screen.getByText('Panorama Jurisprudencial')).toBeTruthy()
    expect(screen.getByText('Síntese visual dos principais achados.')).toBeTruthy()
    expect(screen.getByText('Tendência predominante')).toBeTruthy()
    expect(screen.getByText('Predomínio de decisões favoráveis.')).toBeTruthy()
    expect(screen.getByText('Conclusao')).toBeTruthy()
    expect(screen.getByText('O cenário é favorável ao pedido principal.')).toBeTruthy()
    expect(screen.getByText('Fontes')).toBeTruthy()
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/infografico.png')

    await waitFor(() => {
      expect(screen.getByText('128')).toBeTruthy()
    })
    expect(screen.getByText('%')).toBeTruthy()
    expect(screen.getByText('Casos')).toBeTruthy()
    expect(screen.getByText('STF')).toBeTruthy()
    expect(screen.getByText('STJ')).toBeTruthy()
  })
})