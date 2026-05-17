export interface ChatVideoKeyframe {
  label: string
  timeSeconds: number
  dataUrl: string
}

export interface ExtractChatVideoKeyframesOptions {
  maxFrames?: number
  maxWidth?: number
  mimeType?: string
  quality?: number
  timeoutMs?: number
}

const DEFAULT_MAX_FRAMES = 3
const DEFAULT_MAX_WIDTH = 960
const DEFAULT_MIME_TYPE = 'image/jpeg'
const DEFAULT_QUALITY = 0.82
const DEFAULT_TIMEOUT_MS = 8_000

export async function extractChatVideoKeyframes(
  file: File,
  options: ExtractChatVideoKeyframesOptions = {},
): Promise<ChatVideoKeyframe[]> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return []
  }

  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return []

  const objectUrl = URL.createObjectURL(file)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  try {
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = objectUrl
    await waitForMediaEvent(video, 'loadedmetadata', timeoutMs)
    const width = Math.max(1, Math.round(video.videoWidth || 0))
    const height = Math.max(1, Math.round(video.videoHeight || 0))
    if (!width || !height) return []

    const scale = Math.min(1, (options.maxWidth ?? DEFAULT_MAX_WIDTH) / width)
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))

    const frameTimes = buildFrameTimes(video.duration, options.maxFrames ?? DEFAULT_MAX_FRAMES)
    const frames: ChatVideoKeyframe[] = []
    for (const [index, timeSeconds] of frameTimes.entries()) {
      await seekVideo(video, timeSeconds, timeoutMs)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push({
        label: frameLabel(index, frameTimes.length),
        timeSeconds,
        dataUrl: canvas.toDataURL(options.mimeType ?? DEFAULT_MIME_TYPE, options.quality ?? DEFAULT_QUALITY),
      })
    }
    return frames
  } finally {
    video.removeAttribute('src')
    video.load?.()
    URL.revokeObjectURL(objectUrl)
  }
}

function buildFrameTimes(duration: number, maxFrames: number): number[] {
  const frameLimit = Math.max(1, Math.min(DEFAULT_MAX_FRAMES, Math.floor(maxFrames || DEFAULT_MAX_FRAMES)))
  if (!Number.isFinite(duration) || duration <= 0.5) return [0]
  const candidates = duration < 2
    ? [Math.max(0, duration / 2)]
    : [0.5, duration / 2, Math.max(0.5, duration - 0.5)]
  const unique: number[] = []
  for (const candidate of candidates) {
    const rounded = Math.round(Math.min(Math.max(candidate, 0), Math.max(duration - 0.05, 0)) * 100) / 100
    if (!unique.some(value => Math.abs(value - rounded) < 0.1)) unique.push(rounded)
    if (unique.length >= frameLimit) break
  }
  return unique.length ? unique : [0]
}

async function seekVideo(video: HTMLVideoElement, timeSeconds: number, timeoutMs: number): Promise<void> {
  const wait = waitForMediaEvent(video, 'seeked', timeoutMs)
  video.currentTime = timeSeconds
  await wait
}

function waitForMediaEvent(video: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked', timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      video.removeEventListener(eventName, onReady)
      video.removeEventListener('error', onError)
      clearTimeout(timer)
    }
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onReady = () => settle(resolve)
    const onError = () => settle(() => reject(new Error('Não foi possível ler frames do vídeo.')))
    const timer = setTimeout(() => settle(() => reject(new Error('Tempo limite ao ler frames do vídeo.'))), timeoutMs)
    video.addEventListener(eventName, onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
    if (eventName === 'loadedmetadata') video.load?.()
  })
}

function frameLabel(index: number, total: number): string {
  if (total === 1) return 'frame principal'
  if (index === 0) return 'início'
  if (index === total - 1) return 'final'
  return 'meio'
}
