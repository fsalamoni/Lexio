// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractChatVideoKeyframes } from './chat-video-keyframes'

describe('chat video keyframes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('extracts beginning, middle and final frames as data URLs', async () => {
    const listeners = new Map<string, EventListener>()
    let currentTime = 0
    const video = {
      duration: 9,
      videoWidth: 1920,
      videoHeight: 1080,
      preload: '',
      muted: false,
      playsInline: false,
      src: '',
      addEventListener: vi.fn((event: string, listener: EventListener) => listeners.set(event, listener)),
      removeEventListener: vi.fn((event: string) => listeners.delete(event)),
      removeAttribute: vi.fn(),
      load: vi.fn(() => listeners.get('loadedmetadata')?.(new Event('loadedmetadata'))),
      get currentTime() {
        return currentTime
      },
      set currentTime(value: number) {
        currentTime = value
        listeners.get('seeked')?.(new Event('seeked'))
      },
    } as unknown as HTMLVideoElement
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toDataURL: vi.fn(() => `data:image/jpeg;base64,frame-${currentTime}`),
    } as unknown as HTMLCanvasElement
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'video') return video
      if (tagName === 'canvas') return canvas
      return document.createElement(tagName)
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:video'),
      revokeObjectURL: vi.fn(),
    })

    const frames = await extractChatVideoKeyframes(new File(['video'], 'audiencia.mp4', { type: 'video/mp4' }))

    expect(frames).toEqual([
      { label: 'início', timeSeconds: 0.5, dataUrl: 'data:image/jpeg;base64,frame-0.5' },
      { label: 'meio', timeSeconds: 4.5, dataUrl: 'data:image/jpeg;base64,frame-4.5' },
      { label: 'final', timeSeconds: 8.5, dataUrl: 'data:image/jpeg;base64,frame-8.5' },
    ])
    expect(canvas.width).toBe(960)
    expect(canvas.height).toBe(540)
    expect(drawImage).toHaveBeenCalledTimes(3)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video')
  })
})
