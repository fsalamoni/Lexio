// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import VideoSequencePlayer from './VideoSequencePlayer'
import type { VideoClipAsset } from '../../lib/video-generation-pipeline'

// jsdom does not implement HTMLMediaElement playback methods.
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() })
})

afterEach(cleanup)

function makeClip(scene: number, part: number): VideoClipAsset {
  return {
    sceneNumber: scene,
    partNumber: part,
    startTime: 0,
    endTime: 8,
    duration: 8,
    url: `blob:clip-${scene}-${part}`,
    mimeType: 'video/mp4',
    generatedAt: '2026-05-21T00:00:00.000Z',
  }
}

describe('VideoSequencePlayer', () => {
  it('renders the empty state when there are no clips', () => {
    render(<VideoSequencePlayer clips={[]} />)
    expect(screen.getByText(/Nenhum clipe de vídeo gerado/)).toBeTruthy()
  })

  it('renders continuous-playback controls and the part count for generated clips', () => {
    render(
      <VideoSequencePlayer
        clips={[makeClip(2, 1), makeClip(1, 2), makeClip(1, 1)]}
        title="Vídeo completo do caderno"
      />,
    )

    expect(screen.getByText('Vídeo completo do caderno')).toBeTruthy()
    expect(screen.getByText('3 partes')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reproduzir tudo/ })).toBeTruthy()
    expect(screen.getByText(/Reproduzindo parte 1 de 3/)).toBeTruthy()
    // The first ordered clip is scene 1, part 1 (clips arrive unsorted).
    expect(screen.getByText(/cena 1, parte 1/)).toBeTruthy()
  })
})
