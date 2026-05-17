// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractChatMediaMetadata } from './chat-media-metadata'

describe('chat media metadata', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('extracts video duration and dimensions from browser metadata', async () => {
    const listeners = new Map<string, EventListener>()
    const media = {
      duration: 12.345,
      videoWidth: 1280,
      videoHeight: 720,
      preload: '',
      src: '',
      addEventListener: vi.fn((event: string, listener: EventListener) => listeners.set(event, listener)),
      removeEventListener: vi.fn(),
      load: vi.fn(() => listeners.get('loadedmetadata')?.(new Event('loadedmetadata'))),
    } as unknown as HTMLVideoElement
    vi.spyOn(document, 'createElement').mockReturnValue(media)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:video'),
      revokeObjectURL: vi.fn(),
    })

    const result = await extractChatMediaMetadata(new File(['video'], 'audiencia.mp4', { type: 'video/mp4' }), 'video')

    expect(result).toEqual({ durationSeconds: 12.35, width: 1280, height: 720 })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video')
  })

  it('extracts audio duration without visual dimensions', async () => {
    const listeners = new Map<string, EventListener>()
    const media = {
      duration: 61,
      preload: '',
      src: '',
      addEventListener: vi.fn((event: string, listener: EventListener) => listeners.set(event, listener)),
      removeEventListener: vi.fn(),
      load: vi.fn(() => listeners.get('loadedmetadata')?.(new Event('loadedmetadata'))),
    } as unknown as HTMLAudioElement
    vi.spyOn(document, 'createElement').mockReturnValue(media)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:audio'),
      revokeObjectURL: vi.fn(),
    })

    const result = await extractChatMediaMetadata(new File(['audio'], 'depoimento.mp3', { type: 'audio/mpeg' }), 'audio')

    expect(result).toEqual({ durationSeconds: 61, width: undefined, height: undefined })
  })
})
