// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VideoStudioEditor from './VideoStudioEditor'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('VideoStudioEditor', () => {
  it('renders the studio, exposes scene/segment details, and triggers media generation callbacks', async () => {
    const onClose = vi.fn()
    const onGenerateLiteralMedia = vi.fn().mockResolvedValue(undefined)
    const onGenerateClipVideo = vi.fn().mockResolvedValue({
      sceneAssets: [{ sceneNumber: 1, videoClips: [{ partNumber: 1, url: 'https://cdn.example.com/clip-1.mp4' }] }],
    })
    const onRegenerateTTS = vi.fn().mockResolvedValue('https://cdn.example.com/narration-1.mp3')

    render(
      <VideoStudioEditor
        production={{
          title: 'Vídeo demonstrativo',
          totalDuration: 120,
          tracks: [
            {
              type: 'video',
              label: 'Vídeo',
              segments: [
                {
                  id: 'seg-video-1',
                  startTime: 0,
                  endTime: 30,
                  label: 'Segmento vídeo 1',
                  content: 'Cena inicial do vídeo.',
                  sceneNumber: 1,
                  clipNumber: 1,
                  generatedMediaUrl: 'https://cdn.example.com/scene-1.png',
                },
              ],
            },
            {
              type: 'narration',
              label: 'Narração',
              segments: [
                {
                  id: 'seg-narr-1',
                  startTime: 0,
                  endTime: 30,
                  label: 'Narração 1',
                  content: 'Texto de narração da cena 1.',
                  sceneNumber: 1,
                  generatedMediaUrl: 'https://cdn.example.com/audio-1.mp3',
                },
              ],
            },
          ],
          scenes: [
            {
              number: 1,
              timeStart: '00:00',
              timeEnd: '00:30',
              duration: 30,
              narration: 'Narracao principal da cena 1',
              visual: 'Visual com cortes rápidos',
              clips: [
                {
                  sceneNumber: 1,
                  clipNumber: 1,
                  duration: 8,
                  description: 'Clip 1 da cena 1',
                  motionDescription: 'Pan lateral',
                  generatedImageUrl: 'https://cdn.example.com/clip-1.png',
                },
              ],
              generatedImageUrl: 'https://cdn.example.com/scene-1.png',
              transition: 'fade',
            },
          ],
          narration: [
            { sceneNumber: 1, generatedAudioUrl: 'https://cdn.example.com/audio-1.mp3' },
          ],
          sceneAssets: [
            { sceneNumber: 1, videoClips: [{ partNumber: 1, url: 'https://cdn.example.com/clip-1.mp4' }] },
          ],
          designGuide: {
            colorPalette: ['#111111', '#22aa88'],
            style: 'Estilo documental',
            fontFamily: 'IBM Plex Sans',
            characterDescriptions: [{ name: 'Narrador', description: 'Figura central da apresentação' }],
            recurringElements: ['Lower thirds'],
          },
          qualityReport: 'Consistência visual validada.',
          productionNotes: ['Manter ritmo ágil.'],
          literalGenerationState: { status: 'idle' },
        } as any}
        onClose={onClose}
        onGenerateLiteralMedia={onGenerateLiteralMedia}
        onGenerateClipVideo={onGenerateClipVideo}
        onRegenerateTTS={onRegenerateTTS}
      />,
    )

    expect(screen.getByText('Vídeo demonstrativo')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Guia de Design/i }))
    expect(screen.getByText('Estilo documental')).toBeTruthy()
    expect(screen.getByText('IBM Plex Sans')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Relatório de Qualidade/i }))
    expect(screen.getByText('Consistência visual validada.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /00:00 → 00:30/i }))
    expect(screen.getByText('Cena 1')).toBeTruthy()
    expect(screen.getByText('Clip 1 · 8s')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Regenerar Vídeo/i }))
    await waitFor(() => {
      expect(onGenerateClipVideo).toHaveBeenCalledWith(expect.any(Object), 1, 1)
    })

    fireEvent.click(screen.getByRole('button', { name: /Regenerar Narração/i }))
    await waitFor(() => {
      expect(onRegenerateTTS).toHaveBeenCalledWith(1)
    })

    fireEvent.click(screen.getByTitle('Segmento vídeo 1'))
    expect(screen.getByText('Cena inicial do vídeo.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Gerar Vídeo Literal/i }))
    await waitFor(() => {
      expect(onGenerateLiteralMedia).toHaveBeenCalledWith(expect.objectContaining({ title: 'Vídeo demonstrativo' }))
    })

    fireEvent.click(screen.getByRole('button', { name: /Fechar/i }))
    expect(onClose).toHaveBeenCalled()
  })
})