// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioSegment } from './artifact-parsers'
import AudioOverviewPlayer from './AudioOverviewPlayer'

afterEach(() => {
  cleanup()
})

describe('AudioOverviewPlayer', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn().mockReturnValue('blob:audio-overview'),
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true,
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      value: vi.fn(),
      configurable: true,
    })
  })

  it('renders the generation CTA when audio is missing and forwards the action', () => {
    const onGenerateAudio = vi.fn()
    const segments: AudioSegment[] = [{ time: '00:00', type: 'narracao', speaker: 'Host A', text: 'Introdução.' }]

    render(
      <AudioOverviewPlayer
        title="Resumo"
        duration="05:00"
        segments={segments}
        onGenerateAudio={onGenerateAudio}
      />,
    )

    expect(screen.getByText('O roteiro está pronto. Gere o áudio para ouvir como podcast.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Gerar Áudio/ }))
    expect(onGenerateAudio).toHaveBeenCalledTimes(1)
  })

  it('renders the audio player, playback controls, and transcript interactions when a blob is available', () => {
    const segments: AudioSegment[] = [
      { time: '00:00', type: 'narracao', speaker: 'Host A', text: 'Introdução ao caso.', notes: 'Abrir com trilha leve.' },
      { time: '00:40', type: 'efeito', text: 'Sino discreto.' },
      { time: '01:10', type: 'narracao', speaker: 'Host B', text: 'Contexto final.' },
    ]

    render(
      <AudioOverviewPlayer
        title="Resumo"
        duration="05:00"
        segments={segments}
        audioBlob={new Blob(['audio'], { type: 'audio/mpeg' })}
      />,
    )

    expect(screen.getByText('Host A: 1')).toBeTruthy()
    expect(screen.getByText('Host B: 1')).toBeTruthy()
    expect(screen.getByText('1x')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Download MP3' }))
    fireEvent.click(screen.getAllByRole('button')[0])
    fireEvent.click(screen.getByText('1x'))
    expect(screen.getByText('1.25x')).toBeTruthy()

    fireEvent.click(screen.getByText('Introdução ao caso.'))
    expect(screen.getByText('🎵 Abrir com trilha leve.')).toBeTruthy()
    expect(screen.getByText('[efeito]')).toBeTruthy()
  })
})