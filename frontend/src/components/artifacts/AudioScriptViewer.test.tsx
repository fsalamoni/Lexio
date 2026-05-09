// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ParsedAudioScript } from './artifact-parsers'
import AudioScriptViewer from './AudioScriptViewer'

afterEach(() => {
  cleanup()
})

describe('AudioScriptViewer', () => {
  it('renders the timeline, audio player, active segment state, and production notes', () => {
    const data: ParsedAudioScript = {
      title: 'Podcast Lexio',
      duration: '12:00',
      audioUrl: 'https://example.com/audio.mp3',
      audioMimeType: 'audio/mpeg',
      segments: [
        {
          time: '00:00',
          type: 'narracao',
          speaker: 'Host A',
          text: 'Explicação inicial.',
          notes: 'Trilha suave.',
        },
        {
          time: '00:30',
          type: 'efeito',
          text: 'Som ambiente.',
        },
      ],
      productionNotes: ['Ajustar trilha na abertura.', 'Encerrar com vinheta curta.'],
    }

    const { container } = render(<AudioScriptViewer data={data} />)

    expect(screen.getByText('Podcast Lexio')).toBeTruthy()
    expect(screen.getByText('2 segmentos')).toBeTruthy()
    expect(screen.getByText('12:00')).toBeTruthy()
    expect(screen.getByText('Audio literal gerado')).toBeTruthy()
    expect(screen.getAllByText('Narracao').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Efeito').length).toBeGreaterThan(0)

    const source = container.querySelector('audio source')
    expect(source?.getAttribute('src')).toBe('https://example.com/audio.mp3')

    fireEvent.click(screen.getByText('Explicação inicial.'))
    expect(screen.getByText('Selecionado')).toBeTruthy()
    expect(screen.getByText('Trilha suave.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Notas de Producao/ }))
    expect(screen.getByText('Ajustar trilha na abertura.')).toBeTruthy()
    expect(screen.getByText('Encerrar com vinheta curta.')).toBeTruthy()
  })
})