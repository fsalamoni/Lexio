const CHUNK_RELOAD_MARKER_KEY = 'lexio:chunk-load-recovery'
const CHUNK_RELOAD_TTL_MS = 30_000

interface ChunkReloadMarker {
  href: string
  at: number
}

type WindowLike = Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'> & {
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

export function installChunkLoadRecovery(target: WindowLike = window): () => void {
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (!isRecoverableChunkLoadError(event.reason)) return
    event.preventDefault()
    attemptChunkReload(target)
  }

  const onPreloadError = (event: Event & { payload?: unknown }) => {
    if (event.payload != null && !isRecoverableChunkLoadError(event.payload)) return
    event.preventDefault()
    attemptChunkReload(target)
  }

  target.addEventListener('unhandledrejection', onUnhandledRejection)
  target.addEventListener('vite:preloadError', onPreloadError as EventListener)

  return () => {
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
    target.removeEventListener('vite:preloadError', onPreloadError as EventListener)
  }
}

export function isRecoverableChunkLoadError(reason: unknown): boolean {
  const message = extractErrorMessage(reason)
  if (!message) return false
  return [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"',
  ].some(fragment => message.includes(fragment))
}

function attemptChunkReload(target: WindowLike): void {
  const href = target.location.href
  if (!shouldReloadChunk(target.sessionStorage, href)) return
  persistChunkReloadMarker(target.sessionStorage, { href, at: Date.now() })
  target.location.reload()
}

function shouldReloadChunk(storage: WindowLike['sessionStorage'], href: string): boolean {
  const marker = readChunkReloadMarker(storage)
  if (!marker) return true
  if (marker.href !== href) return true
  return Date.now() - marker.at > CHUNK_RELOAD_TTL_MS
}

function readChunkReloadMarker(storage: WindowLike['sessionStorage']): ChunkReloadMarker | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(CHUNK_RELOAD_MARKER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ChunkReloadMarker>
    if (typeof parsed.href !== 'string' || typeof parsed.at !== 'number') return null
    return { href: parsed.href, at: parsed.at }
  } catch {
    return null
  }
}

function persistChunkReloadMarker(storage: WindowLike['sessionStorage'], marker: ChunkReloadMarker): void {
  if (!storage) return
  try {
    storage.setItem(CHUNK_RELOAD_MARKER_KEY, JSON.stringify(marker))
  } catch {
    // best-effort; reload still helps even without the marker
  }
}

function extractErrorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'string') return reason
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    return String((reason as { message?: unknown }).message ?? '')
  }
  return ''
}