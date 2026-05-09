// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ParsedVideoScript } from './artifact-parsers'
import VideoScriptViewer from './VideoScriptViewer'

afterEach(() => {
  cleanup()
})

describe('VideoScriptViewer', () => {
  it('renders storyboard scenes, media preview, and expandable post-production notes', () => {
    const data: ParsedVideoScript = {
      title: 'Storyboard Lexio',
      duration: '03:20',
      renderedVideoUrl: 'https://example.com/video.mp4',
      scenes: [
        {
          number: 1,
          time: '00:00',
          narration: 'Abrimos com a tese principal.',
          visual: 'Plano geral do tribunal.',
          transition: 'Corte seco',
          broll: 'Arquivos do processo',
          lowerThird: 'Caso Lexio',
          notes: 'Dar destaque ao relator.',
        },
        {
          number: 2,
          time: '00:20',
          narration: 'Fechamos com a conclusão.',
          visual: 'Tela final com destaques.',
        },
      ],
      postProductionNotes: ['Adicionar trilha final.', 'Equalizar o volume da locução.'],
    }

    const { container } = render(<VideoScriptViewer data={data} />)

    expect(screen.getByText('Storyboard Lexio')).toBeTruthy()
    expect(screen.getByText('2 cenas')).toBeTruthy()
    expect(screen.getByText('Video literal gerado')).toBeTruthy()
    expect(screen.getByText('Abrimos com a tese principal.')).toBeTruthy()
    expect(screen.getByText('Plano geral do tribunal.')).toBeTruthy()
    expect(screen.getByText('B-Roll: Arquivos do processo')).toBeTruthy()
    expect(screen.getByText('Caso Lexio')).toBeTruthy()
    expect(screen.getByText('Dar destaque ao relator.')).toBeTruthy()

    const source = container.querySelector('video source')
    expect(source?.getAttribute('src')).toBe('https://example.com/video.mp4')

    fireEvent.click(screen.getByRole('button', { name: /Notas de Pos-Producao/ }))
    expect(screen.getByText('Adicionar trilha final.')).toBeTruthy()
    expect(screen.getByText('Equalizar o volume da locução.')).toBeTruthy()
  })
})