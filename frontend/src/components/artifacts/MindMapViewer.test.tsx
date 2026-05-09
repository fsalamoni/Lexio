// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ParsedMindMap } from './artifact-parsers'
import MindMapViewer from './MindMapViewer'

afterEach(() => {
  cleanup()
})

describe('MindMapViewer', () => {
  it('renders the map, toggles branch collapse state, and supports expand/collapse all', () => {
    const data: ParsedMindMap = {
      centralNode: 'Tese central',
      renderedImageUrl: 'https://example.com/mapa.png',
      branches: [
        {
          label: 'Fundamentos',
          children: [
            { label: 'Constituição' },
            { label: 'Precedentes' },
          ],
        },
        {
          label: 'Pedidos',
          children: [
            { label: 'Tutela' },
          ],
        },
      ],
    }

    const { container } = render(<MindMapViewer data={data} />)

    expect(screen.getByRole('heading', { name: 'Tese central' })).toBeTruthy()
    expect(screen.getByText('Clique em um ramo para expandir ou recolher')).toBeTruthy()
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/mapa.png')

    const branchButton = screen.getByRole('button', { name: /Fundamentos/ })
    expect(branchButton.getAttribute('title')).toBe('Recolher')

    fireEvent.click(branchButton)
    expect(branchButton.getAttribute('title')).toBe('Expandir')

    fireEvent.click(screen.getByRole('button', { name: 'Expandir tudo' }))
    expect(branchButton.getAttribute('title')).toBe('Recolher')

    fireEvent.click(screen.getByRole('button', { name: 'Recolher tudo' }))
    expect(branchButton.getAttribute('title')).toBe('Expandir')
  })
})