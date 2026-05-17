export interface ChatMediaMetadataResult {
  durationSeconds?: number
  width?: number
  height?: number
}

const MEDIA_METADATA_TIMEOUT_MS = 6_000

export async function extractChatMediaMetadata(file: File, kind: 'audio' | 'video'): Promise<ChatMediaMetadataResult> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return {}
  }

  const element = document.createElement(kind)
  const media = element as HTMLMediaElement & { videoWidth?: number; videoHeight?: number }
  const objectUrl = URL.createObjectURL(file)

  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      media.removeEventListener('loadedmetadata', onLoaded)
      media.removeEventListener('error', onError)
      clearTimeout(timer)
      URL.revokeObjectURL(objectUrl)
    }
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onLoaded = () => settle(() => resolve({
      durationSeconds: Number.isFinite(media.duration) && media.duration > 0 ? roundSeconds(media.duration) : undefined,
      width: kind === 'video' && Number.isFinite(media.videoWidth) && media.videoWidth ? Math.round(media.videoWidth) : undefined,
      height: kind === 'video' && Number.isFinite(media.videoHeight) && media.videoHeight ? Math.round(media.videoHeight) : undefined,
    }))
    const onError = () => settle(() => reject(new Error('Não foi possível ler os metadados do arquivo de mídia.')))
    const timer = setTimeout(() => settle(() => resolve({})), MEDIA_METADATA_TIMEOUT_MS)

    media.preload = 'metadata'
    media.addEventListener('loadedmetadata', onLoaded)
    media.addEventListener('error', onError)
    media.src = objectUrl
    media.load?.()
  })
}

function roundSeconds(value: number): number {
  return Math.round(value * 100) / 100
}
