/**
 * Optional external video provider client for literal clip generation.
 *
 * This client is intentionally endpoint-driven via env vars so we can
 * integrate with different providers without hardcoding vendor SDK logic
 * inside the render pipeline.
 */

export interface ExternalVideoClipRequest {
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  sceneNumber?: number
  partNumber?: number
  /**
   * Optional video model identifier forwarded to the provider. Aggregator
   * endpoints (fal.ai, Replicate, …) host many video models behind one
   * endpoint, so this lets the caller pick a specific model (Veo, Kling,
   * Wan, …) without changing the configured endpoint.
   */
  model?: string
  signal?: AbortSignal
}

export interface ExternalVideoClipResult {
  url: string
  mimeType?: string
  provider: string
  jobId?: string
}

export interface ExternalVideoProviderDiagnostics {
  configured: boolean
  provider: string
  endpoint?: string
  statusEndpoint?: string
  hasApiKey: boolean
  pollIntervalMs: number
  pollTimeoutMs: number
  usingExternalEnvKeys: boolean
  usingLegacyEnvKeys: boolean
  warnings: string[]
  blockingErrors: string[]
}

export interface ExternalVideoProviderHealthCheckResult {
  ok: boolean
  provider: string
  endpoint?: string
  statusCode?: number
  method?: 'OPTIONS' | 'GET'
  latencyMs: number
  message: string
}

const DEFAULT_POLL_INTERVAL_MS = 4000
const DEFAULT_POLL_TIMEOUT_MS = 180000
const MAX_PROVIDER_REQUEST_ATTEMPTS = 3

function readEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = String((import.meta.env as Record<string, unknown>)[key] || '').trim()
    if (value) return value
  }
  return ''
}

function hasAnyEnv(...keys: string[]): boolean {
  return keys.some(key => {
    const value = String((import.meta.env as Record<string, unknown>)[key] || '').trim()
    return value.length > 0
  })
}

function getConfig(): {
  provider: string
  endpoint?: string
  apiKey?: string
  statusEndpoint?: string
  pollIntervalMs: number
  pollTimeoutMs: number
} {
  // Keep backward compatibility with legacy VITE_LITERAL_VIDEO_* keys.
  const provider = readEnv('VITE_EXTERNAL_VIDEO_PROVIDER', 'VITE_LITERAL_VIDEO_PROVIDER') || 'none'
  const endpoint = readEnv('VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT', 'VITE_LITERAL_VIDEO_ENDPOINT')
  const apiKey = readEnv('VITE_EXTERNAL_VIDEO_PROVIDER_API_KEY', 'VITE_LITERAL_VIDEO_API_KEY')
  const statusEndpoint = readEnv('VITE_EXTERNAL_VIDEO_PROVIDER_STATUS_ENDPOINT', 'VITE_LITERAL_VIDEO_STATUS_ENDPOINT')
  const pollIntervalMs = Number.parseInt(
    readEnv('VITE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS', 'VITE_LITERAL_VIDEO_POLL_INTERVAL_MS') || `${DEFAULT_POLL_INTERVAL_MS}`,
    10,
  )
  const pollTimeoutMs = Number.parseInt(
    readEnv('VITE_EXTERNAL_VIDEO_PROVIDER_TIMEOUT_MS', 'VITE_LITERAL_VIDEO_POLL_TIMEOUT_MS') || `${DEFAULT_POLL_TIMEOUT_MS}`,
    10,
  )
  return {
    provider: provider.toLowerCase(),
    endpoint: endpoint || undefined,
    apiKey: apiKey || undefined,
    statusEndpoint: statusEndpoint || undefined,
    pollIntervalMs: Number.isFinite(pollIntervalMs) ? Math.max(1000, pollIntervalMs) : DEFAULT_POLL_INTERVAL_MS,
    pollTimeoutMs: Number.isFinite(pollTimeoutMs) ? Math.max(30_000, pollTimeoutMs) : DEFAULT_POLL_TIMEOUT_MS,
  }
}

export function getExternalVideoProviderConfig(): {
  provider: string
  endpoint?: string
  statusEndpoint?: string
  hasApiKey: boolean
  pollIntervalMs: number
  pollTimeoutMs: number
} {
  const cfg = getConfig()
  return {
    provider: cfg.provider,
    endpoint: cfg.endpoint,
    statusEndpoint: cfg.statusEndpoint,
    hasApiKey: Boolean(cfg.apiKey),
    pollIntervalMs: cfg.pollIntervalMs,
    pollTimeoutMs: cfg.pollTimeoutMs,
  }
}

export function isExternalVideoProviderConfigured(): boolean {
  const cfg = getConfig()
  return cfg.provider !== 'none' && Boolean(cfg.endpoint)
}

export function getExternalVideoProviderDiagnostics(): ExternalVideoProviderDiagnostics {
  const cfg = getConfig()
  const warnings: string[] = []
  const blockingErrors: string[] = []

  const usingExternalEnvKeys = hasAnyEnv(
    'VITE_EXTERNAL_VIDEO_PROVIDER',
    'VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT',
    'VITE_EXTERNAL_VIDEO_PROVIDER_API_KEY',
    'VITE_EXTERNAL_VIDEO_PROVIDER_STATUS_ENDPOINT',
    'VITE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS',
    'VITE_EXTERNAL_VIDEO_PROVIDER_TIMEOUT_MS',
  )
  const usingLegacyEnvKeys = hasAnyEnv(
    'VITE_LITERAL_VIDEO_PROVIDER',
    'VITE_LITERAL_VIDEO_ENDPOINT',
    'VITE_LITERAL_VIDEO_API_KEY',
    'VITE_LITERAL_VIDEO_STATUS_ENDPOINT',
    'VITE_LITERAL_VIDEO_POLL_INTERVAL_MS',
    'VITE_LITERAL_VIDEO_POLL_TIMEOUT_MS',
  )

  if (cfg.provider !== 'none' && !cfg.endpoint) {
    blockingErrors.push('Provedor externo habilitado sem endpoint configurado.')
  }

  if (cfg.provider !== 'none' && cfg.endpoint?.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:') {
    blockingErrors.push('Endpoint HTTP inseguro em página HTTPS. O navegador pode bloquear requisições por mixed content.')
  }

  if (cfg.provider !== 'none' && cfg.endpoint && !cfg.apiKey) {
    warnings.push('Provedor externo sem API key dedicada. Dependendo do endpoint, chamadas podem falhar por autenticação.')
  }

  if (cfg.provider === 'none') {
    warnings.push('Provedor externo não habilitado; geração de clipes dependerá do renderer local do navegador.')
  }

  if (usingExternalEnvKeys && usingLegacyEnvKeys) {
    warnings.push('Variáveis novas e legadas detectadas simultaneamente. Mantenha apenas um padrão para evitar confusão operacional.')
  }

  if (cfg.pollIntervalMs < 2000) {
    warnings.push(`Intervalo de polling muito agressivo (${cfg.pollIntervalMs}ms). Isso pode aumentar risco de rate limit.`)
  }
  if (cfg.pollTimeoutMs < 60_000) {
    warnings.push(`Timeout de polling baixo (${cfg.pollTimeoutMs}ms). Jobs mais longos podem falhar por timeout prematuro.`)
  }

  return {
    configured: cfg.provider !== 'none' && Boolean(cfg.endpoint),
    provider: cfg.provider,
    endpoint: cfg.endpoint,
    statusEndpoint: cfg.statusEndpoint,
    hasApiKey: Boolean(cfg.apiKey),
    pollIntervalMs: cfg.pollIntervalMs,
    pollTimeoutMs: cfg.pollTimeoutMs,
    usingExternalEnvKeys,
    usingLegacyEnvKeys,
    warnings,
    blockingErrors,
  }
}

export async function checkExternalVideoProviderHealth(
  timeoutMs = 8000,
): Promise<ExternalVideoProviderHealthCheckResult> {
  const cfg = getConfig()
  const startedAt = Date.now()

  if (cfg.provider === 'none') {
    return {
      ok: false,
      provider: cfg.provider,
      latencyMs: Date.now() - startedAt,
      message: 'Provedor externo desabilitado (fallback local ativo).',
    }
  }

  const endpoint = cfg.statusEndpoint || cfg.endpoint
  if (!endpoint) {
    return {
      ok: false,
      provider: cfg.provider,
      latencyMs: Date.now() - startedAt,
      message: 'Endpoint do provedor externo ausente.',
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'X-Lexio-Video-Provider': cfg.provider,
  }
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`
  }

  const methods: Array<'OPTIONS' | 'GET'> = cfg.statusEndpoint ? ['GET'] : ['OPTIONS', 'GET']

  for (const method of methods) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs))

    try {
      const response = await fetch(endpoint, {
        method,
        headers,
        signal: controller.signal,
      })

      const latencyMs = Date.now() - startedAt
      clearTimeout(timer)

      if (response.ok) {
        return {
          ok: true,
          provider: cfg.provider,
          endpoint,
          statusCode: response.status,
          method,
          latencyMs,
          message: `Conectado com sucesso (${response.status}).`,
        }
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          provider: cfg.provider,
          endpoint,
          statusCode: response.status,
          method,
          latencyMs,
          message: `Endpoint acessível, mas autenticação falhou (${response.status}).`,
        }
      }

      if ((response.status === 405 || response.status === 404) && method === 'OPTIONS') {
        continue
      }

      return {
        ok: false,
        provider: cfg.provider,
        endpoint,
        statusCode: response.status,
        method,
        latencyMs,
        message: `Endpoint respondeu com status inesperado (${response.status}).`,
      }
    } catch (error) {
      clearTimeout(timer)
      const latencyMs = Date.now() - startedAt
      const message = error instanceof Error ? error.message : String(error)

      if (method === 'OPTIONS') {
        continue
      }

      return {
        ok: false,
        provider: cfg.provider,
        endpoint,
        method,
        latencyMs,
        message: `Falha de conectividade: ${message}`,
      }
    }
  }

  return {
    ok: false,
    provider: cfg.provider,
    endpoint,
    latencyMs: Date.now() - startedAt,
    message: 'Não foi possível validar conectividade com o endpoint.',
  }
}

interface ExternalVideoResponsePayload {
  url?: string
  video_url?: string
  output_url?: string
  result_url?: string
  download_url?: string
  name?: string
  mime_type?: string
  status?: string
  state?: string
  done?: boolean
  job_id?: string
  id?: string
  poll_url?: string
  response?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: string | Record<string, unknown>
  message?: string
  details?: string
  [key: string]: unknown
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('External video request cancelled'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('External video request cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('External video request cancelled')
  }
}

function getResultUrl(payload: ExternalVideoResponsePayload): string | undefined {
  const nested = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : undefined
  const response = payload.response && typeof payload.response === 'object'
    ? payload.response as Record<string, unknown>
    : undefined
  const result = payload.result && typeof payload.result === 'object'
    ? payload.result as Record<string, unknown>
    : undefined
  const generatedVideos = Array.isArray(response?.generatedVideos)
    ? response.generatedVideos
    : Array.isArray(response?.generated_videos)
      ? response.generated_videos
      : Array.isArray(result?.generatedVideos)
        ? result.generatedVideos
        : Array.isArray(result?.generated_videos)
          ? result.generated_videos
          : undefined
  const firstGeneratedVideo = generatedVideos?.[0] && typeof generatedVideos[0] === 'object'
    ? generatedVideos[0] as Record<string, unknown>
    : undefined
  const firstVideoRecord = firstGeneratedVideo?.video && typeof firstGeneratedVideo.video === 'object'
    ? firstGeneratedVideo.video as Record<string, unknown>
    : undefined
  const candidate = payload.url
    || payload.video_url
    || payload.output_url
    || payload.result_url
    || payload.download_url
    || (typeof payload.uri === 'string' ? payload.uri : undefined)
    || (typeof nested?.url === 'string' ? nested.url : undefined)
    || (typeof nested?.video_url === 'string' ? nested.video_url : undefined)
    || (typeof nested?.output_url === 'string' ? nested.output_url : undefined)
    || (typeof response?.url === 'string' ? response.url : undefined)
    || (typeof response?.video_url === 'string' ? response.video_url : undefined)
    || (typeof response?.output_url === 'string' ? response.output_url : undefined)
    || (typeof response?.uri === 'string' ? response.uri : undefined)
    || (typeof result?.url === 'string' ? result.url : undefined)
    || (typeof result?.video_url === 'string' ? result.video_url : undefined)
    || (typeof result?.output_url === 'string' ? result.output_url : undefined)
    || (typeof result?.uri === 'string' ? result.uri : undefined)
    || (typeof firstGeneratedVideo?.uri === 'string' ? firstGeneratedVideo.uri : undefined)
    || (typeof firstGeneratedVideo?.videoUri === 'string' ? firstGeneratedVideo.videoUri : undefined)
    || (typeof firstVideoRecord?.uri === 'string' ? firstVideoRecord.uri : undefined)
    || (typeof firstVideoRecord?.url === 'string' ? firstVideoRecord.url : undefined)
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined
}

function getJobId(payload: ExternalVideoResponsePayload): string | undefined {
  const nested = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : undefined
  const response = payload.response && typeof payload.response === 'object'
    ? payload.response as Record<string, unknown>
    : undefined
  const value = payload.job_id
    || payload.id
    || payload.name
    || (typeof payload.job === 'object' && payload.job ? (payload.job as Record<string, unknown>).id : undefined)
    || (typeof nested?.job_id === 'string' ? nested.job_id : undefined)
    || (typeof nested?.id === 'string' ? nested.id : undefined)
    || (typeof nested?.name === 'string' ? nested.name : undefined)
    || (typeof response?.job_id === 'string' ? response.job_id : undefined)
    || (typeof response?.id === 'string' ? response.id : undefined)
    || (typeof response?.name === 'string' ? response.name : undefined)
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function getStatusValue(payload: ExternalVideoResponsePayload): string {
  if (payload.done === true) return 'completed'
  if (payload.done === false) return 'processing'
  const status = String(payload.status || payload.state || '').trim().toLowerCase()
  return status
}

function isCompletedStatus(status: string): boolean {
  return ['completed', 'complete', 'succeeded', 'success', 'done', 'finished', 'ready'].includes(status)
}

function isFailedStatus(status: string): boolean {
  return ['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(status)
}

function isPendingStatus(status: string): boolean {
  return ['queued', 'pending', 'processing', 'in_progress', 'running', 'submitted', 'accepted'].includes(status)
}

function isRetryableStatusCode(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function parseRetryAfterMs(value: string | null | undefined): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const seconds = Number.parseInt(trimmed, 10)
  if (Number.isFinite(seconds)) {
    return Math.max(500, seconds * 1000)
  }

  const dateTs = Date.parse(trimmed)
  if (!Number.isNaN(dateTs)) {
    return Math.max(500, dateTs - Date.now())
  }

  return null
}

function nextBackoffMs(attempt: number, retryAfterMs?: number | null): number {
  if (retryAfterMs && Number.isFinite(retryAfterMs)) {
    return Math.min(30_000, Math.max(500, retryAfterMs))
  }
  return Math.min(30_000, 900 * Math.pow(2, attempt - 1))
}

async function parseResponsePayload(response: Response): Promise<{ payload: ExternalVideoResponsePayload; text: string }> {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  if (contentType.includes('application/json')) {
    const payload = await response.json() as ExternalVideoResponsePayload
    return { payload, text: '' }
  }

  const text = await response.text().catch(() => '')
  if (!text.trim()) return { payload: {}, text: '' }

  try {
    const payload = JSON.parse(text) as ExternalVideoResponsePayload
    return { payload, text }
  } catch {
    return { payload: {}, text }
  }
}

function getPayloadError(payload: ExternalVideoResponsePayload, fallbackText: string): string {
  const nested = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : undefined
  const response = payload.response && typeof payload.response === 'object'
    ? payload.response as Record<string, unknown>
    : undefined
  const errorObject = payload.error && typeof payload.error === 'object'
    ? payload.error as Record<string, unknown>
    : undefined
  const candidate = payload.error
    || payload.message
    || payload.details
    || (typeof errorObject?.message === 'string' ? errorObject.message : undefined)
    || (typeof response?.error === 'string' ? response.error : undefined)
    || (typeof nested?.error === 'string' ? nested.error : undefined)
    || (typeof nested?.message === 'string' ? nested.message : undefined)
    || fallbackText
  return String(candidate || 'Unknown provider error').trim()
}

function isFullResourceName(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('projects/') || trimmed.includes('/operations/')
}

function normalizeJobReference(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (isFullResourceName(trimmed)) return trimmed.replace(/^\/+/, '')
  return encodeURIComponent(trimmed)
}

function buildJobStatusUrl(
  cfg: ReturnType<typeof getConfig>,
  jobId: string | undefined,
  pollUrl?: string,
): string {
  if (pollUrl && pollUrl.trim().length > 0) {
    const trimmedPollUrl = pollUrl.trim()
    if (/^https?:\/\//i.test(trimmedPollUrl)) return trimmedPollUrl
    if (cfg.statusEndpoint) {
      const normalizedPoll = normalizeJobReference(trimmedPollUrl)
      if (cfg.statusEndpoint.includes(':jobId') || cfg.statusEndpoint.includes('{jobId}')) {
        return cfg.statusEndpoint
          .replace(':jobId', normalizedPoll)
          .replace('{jobId}', normalizedPoll)
      }
      return `${cfg.statusEndpoint.replace(/\/$/, '')}/${normalizedPoll}`
    }
    return trimmedPollUrl
  }
  if (!jobId && cfg.statusEndpoint) {
    return cfg.statusEndpoint
  }
  const normalizedJob = jobId ? normalizeJobReference(jobId) : undefined
  if (cfg.statusEndpoint && jobId && (cfg.statusEndpoint.includes(':jobId') || cfg.statusEndpoint.includes('{jobId}'))) {
    return cfg.statusEndpoint
      .replace(':jobId', normalizedJob || '')
      .replace('{jobId}', normalizedJob || '')
  }
  if (cfg.statusEndpoint && cfg.statusEndpoint.trim().length > 0 && jobId) {
    return `${cfg.statusEndpoint.replace(/\/$/, '')}/${normalizedJob || ''}`
  }
  if (!cfg.endpoint) {
    throw new Error('External video provider status endpoint is not configured')
  }
  if (!jobId) {
    throw new Error('External video provider did not return job id or poll URL')
  }
  return `${cfg.endpoint.replace(/\/$/, '')}/${normalizedJob || ''}`
}

async function pollExternalVideoResult(
  cfg: ReturnType<typeof getConfig>,
  headers: Record<string, string>,
  jobId: string | undefined,
  initialPollUrl?: string,
  signal?: AbortSignal,
): Promise<ExternalVideoResponsePayload> {
  const startedAt = Date.now()
  let pollUrl = initialPollUrl
  let attempt = 0
  while (Date.now() - startedAt < cfg.pollTimeoutMs) {
    assertNotAborted(signal)
    attempt += 1
    const statusUrl = buildJobStatusUrl(cfg, jobId, pollUrl)
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers,
      signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      if (isRetryableStatusCode(response.status)) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'))
        await sleep(nextBackoffMs(attempt, retryAfterMs), signal)
        continue
      }
      throw new Error(`External video status error (${response.status}): ${text}`)
    }

    const { payload } = await parseResponsePayload(response)
    const readyUrl = getResultUrl(payload)
    if (readyUrl) return payload

    const status = getStatusValue(payload)
    if (isFailedStatus(status)) {
      throw new Error(`External video job failed (status=${status || 'unknown'}): ${getPayloadError(payload, '')}`)
    }
    if (isCompletedStatus(status) && !readyUrl) {
      throw new Error('External video job completed without result URL')
    }
    if (status && !isPendingStatus(status) && !isCompletedStatus(status)) {
      throw new Error(`External video job returned unexpected status: ${status}`)
    }

    if (payload.poll_url && payload.poll_url.trim().length > 0) pollUrl = payload.poll_url.trim()
    const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'))
    await sleep(Math.max(cfg.pollIntervalMs, nextBackoffMs(attempt, retryAfterMs)), signal)
  }

  throw new Error(`External video job timed out after ${Math.round(cfg.pollTimeoutMs / 1000)}s`)
}

export async function requestExternalVideoClip(
  req: ExternalVideoClipRequest,
): Promise<ExternalVideoClipResult | null> {
  const cfg = getConfig()
  if (cfg.provider === 'none' || !cfg.endpoint) return null

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Lexio-Video-Provider': cfg.provider,
  }
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`
  }

  const body = JSON.stringify({
    prompt: req.prompt,
    duration_seconds: req.durationSeconds,
    aspect_ratio: req.aspectRatio || '16:9',
    scene_number: req.sceneNumber,
    part_number: req.partNumber,
    provider: cfg.provider,
    ...(req.model?.trim() ? { model: req.model.trim() } : {}),
  })

  let response: Response | null = null
  let payload: ExternalVideoResponsePayload = {}
  let responseText = ''

  for (let attempt = 1; attempt <= MAX_PROVIDER_REQUEST_ATTEMPTS; attempt++) {
    assertNotAborted(req.signal)
    response = await fetch(cfg.endpoint, {
      method: 'POST',
      headers,
      signal: req.signal,
      body,
    })

    const parsed = await parseResponsePayload(response)
    payload = parsed.payload
    responseText = parsed.text

    if (response.ok) {
      break
    }

    if (attempt >= MAX_PROVIDER_REQUEST_ATTEMPTS || !isRetryableStatusCode(response.status)) {
      const details = getPayloadError(payload, responseText || 'Unknown error')
      throw new Error(`External video provider error (${response.status}): ${details}`)
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'))
    await sleep(nextBackoffMs(attempt, retryAfterMs), req.signal)
  }

  if (!response || !response.ok) {
    throw new Error('External video provider request failed after retries')
  }

  let finalPayload = payload
  const immediateUrl = getResultUrl(payload)
  if (!immediateUrl) {
    const jobId = getJobId(payload)
    const pollUrl = payload.poll_url || response.headers.get('Location') || undefined
    if (!jobId && !pollUrl) {
      const status = getStatusValue(payload)
      if (status && isFailedStatus(status)) {
        throw new Error(`External video request failed immediately (status=${status}): ${getPayloadError(payload, '')}`)
      }
      throw new Error('External video provider did not return URL or job id')
    }
    finalPayload = await pollExternalVideoResult(cfg, headers, jobId, pollUrl, req.signal)
  }

  const url = getResultUrl(finalPayload)
  if (!url) return null

  return {
    url,
    mimeType: finalPayload.mime_type || 'video/mp4',
    provider: cfg.provider,
    jobId: getJobId(finalPayload) || getJobId(payload),
  }
}

// ── Native fal.ai client ──────────────────────────────────────────────────────

function getFalResultUrl(payload: ExternalVideoResponsePayload): string | undefined {
  const video = payload.video && typeof payload.video === 'object'
    ? payload.video as Record<string, unknown>
    : undefined
  const fromVideo = typeof video?.url === 'string' ? video.url : undefined
  const candidate = fromVideo || getResultUrl(payload)
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined
}

function getFalMimeType(payload: ExternalVideoResponsePayload): string {
  const video = payload.video && typeof payload.video === 'object'
    ? payload.video as Record<string, unknown>
    : undefined
  const contentType = (typeof video?.content_type === 'string' ? video.content_type : undefined)
    || (typeof payload.mime_type === 'string' ? payload.mime_type : undefined)
  return contentType && contentType.trim().length > 0 ? contentType.trim() : 'video/mp4'
}

/**
 * fal.ai hosts text-to-video and image-to-video as distinct route ids. Given a
 * configured model id and the desired generation mode, returns the matching
 * route. Known models use an explicit mapping; unknown ids fall back to a
 * suffix heuristic; when nothing applies the id is returned unchanged so
 * text-to-video keeps working.
 *
 * Image-to-video chaining is what lets each clip continue visually from the
 * last frame of the previous one.
 */
export function resolveFalVideoModelVariant(modelId: string, mode: 'text' | 'image'): string {
  const id = String(modelId || '').trim().replace(/^\/+/, '')
  if (!id) return modelId

  // [textToVideo, imageToVideo] for the documented fal.ai video models.
  const KNOWN_VARIANTS: ReadonlyArray<readonly [string, string]> = [
    ['fal-ai/veo3', 'fal-ai/veo3/image-to-video'],
    ['fal-ai/veo3/fast', 'fal-ai/veo3/fast/image-to-video'],
    ['fal-ai/kling-video/v2.5-turbo/pro/text-to-video', 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'],
    ['fal-ai/wan/v2.2-a14b/text-to-video', 'fal-ai/wan/v2.2-a14b/image-to-video'],
    ['fal-ai/minimax/hailuo-02/standard/text-to-video', 'fal-ai/minimax/hailuo-02/standard/image-to-video'],
    ['fal-ai/ltx-video-13b-distilled', 'fal-ai/ltx-video-13b-distilled/image-to-video'],
  ]
  for (const [textId, imageId] of KNOWN_VARIANTS) {
    if (id === textId || id === imageId) {
      return mode === 'image' ? imageId : textId
    }
  }

  // Heuristic for uncatalogued ids: fal routes consistently end with the mode.
  const hasImageSuffix = /\/image-to-video$/.test(id)
  const hasTextSuffix = /\/text-to-video$/.test(id)
  if (mode === 'image') {
    if (hasImageSuffix) return id
    if (hasTextSuffix) return id.replace(/\/text-to-video$/, '/image-to-video')
    return `${id}/image-to-video`
  }
  if (hasTextSuffix) return id
  if (hasImageSuffix) return id.replace(/\/image-to-video$/, '/text-to-video')
  return id
}

/**
 * Native fal.ai queue client for literal video generation.
 *
 * fal.ai exposes every hosted video model (Veo, Kling, Wan, Hailuo, LTX, …)
 * behind one queue protocol:
 *   POST {baseUrl}/{model}  → { request_id, status_url, response_url }
 *   GET  {status_url}       → { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
 *   GET  {response_url}     → { video: { url } }
 *
 * Unlike `requestExternalVideoClip` (operator-configured proxy endpoint via
 * env vars), this path is fully user-configurable: the user only needs a
 * fal.ai API key saved in Configurações → Provedores de IA and a video model
 * picked for the agent.
 *
 * When `imageUrl` is supplied the request becomes an image-to-video call: fal
 * conditions the first frame on that image, which is how consecutive clips are
 * chained into a continuous sequence.
 */
export async function requestFalVideoClip(input: {
  apiKey: string
  baseUrl: string
  model: string
  prompt: string
  aspectRatio?: string
  imageUrl?: string
  signal?: AbortSignal
}): Promise<ExternalVideoClipResult> {
  const base = (input.baseUrl || 'https://queue.fal.run').replace(/\/+$/, '')
  const model = input.model.replace(/^\/+/, '')
  const submitUrl = `${base}/${model}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Key ${input.apiKey}`,
  }
  const body = JSON.stringify({
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio || '16:9',
    ...(input.imageUrl?.trim() ? { image_url: input.imageUrl.trim() } : {}),
  })

  let submitResponse: Response | null = null
  let submitPayload: ExternalVideoResponsePayload = {}
  for (let attempt = 1; attempt <= MAX_PROVIDER_REQUEST_ATTEMPTS; attempt++) {
    assertNotAborted(input.signal)
    submitResponse = await fetch(submitUrl, { method: 'POST', headers, body, signal: input.signal })
    const parsed = await parseResponsePayload(submitResponse)
    submitPayload = parsed.payload
    if (submitResponse.ok) break
    if (attempt >= MAX_PROVIDER_REQUEST_ATTEMPTS || !isRetryableStatusCode(submitResponse.status)) {
      throw new Error(`fal.ai recusou a geração de vídeo (${submitResponse.status}): ${getPayloadError(submitPayload, parsed.text || '')}`)
    }
    await sleep(nextBackoffMs(attempt, parseRetryAfterMs(submitResponse.headers.get('Retry-After'))), input.signal)
  }
  if (!submitResponse || !submitResponse.ok) {
    throw new Error('fal.ai não aceitou a solicitação de vídeo após múltiplas tentativas.')
  }

  // Some fal models return the result inline on submit.
  const inlineUrl = getFalResultUrl(submitPayload)
  if (inlineUrl) {
    return { url: inlineUrl, mimeType: getFalMimeType(submitPayload), provider: 'fal' }
  }

  const statusUrl = typeof submitPayload.status_url === 'string' ? submitPayload.status_url : undefined
  const responseUrl = typeof submitPayload.response_url === 'string' ? submitPayload.response_url : undefined
  if (!statusUrl && !responseUrl) {
    throw new Error('fal.ai não retornou URL de resultado nem handle de fila para o vídeo.')
  }

  // Poll the queue until the job completes.
  const startedAt = Date.now()
  let attempt = 0
  let completed = !statusUrl
  while (statusUrl && Date.now() - startedAt < DEFAULT_POLL_TIMEOUT_MS) {
    assertNotAborted(input.signal)
    attempt += 1
    const statusResponse = await fetch(statusUrl, { method: 'GET', headers, signal: input.signal })
    if (statusResponse.ok) {
      const { payload } = await parseResponsePayload(statusResponse)
      const directUrl = getFalResultUrl(payload)
      if (directUrl) {
        return { url: directUrl, mimeType: getFalMimeType(payload), provider: 'fal' }
      }
      const status = getStatusValue(payload)
      if (isFailedStatus(status)) {
        throw new Error(`fal.ai falhou ao gerar o vídeo: ${getPayloadError(payload, '')}`)
      }
      if (isCompletedStatus(status)) {
        completed = true
        break
      }
    } else if (!isRetryableStatusCode(statusResponse.status)) {
      const text = await statusResponse.text().catch(() => 'erro desconhecido')
      throw new Error(`fal.ai status erro (${statusResponse.status}): ${text}`)
    }
    await sleep(Math.max(DEFAULT_POLL_INTERVAL_MS, nextBackoffMs(attempt)), input.signal)
  }

  if (!completed) {
    throw new Error(`fal.ai não concluiu o vídeo dentro do tempo limite (${Math.round(DEFAULT_POLL_TIMEOUT_MS / 1000)}s).`)
  }

  if (responseUrl) {
    const resultResponse = await fetch(responseUrl, { method: 'GET', headers, signal: input.signal })
    if (!resultResponse.ok) {
      const text = await resultResponse.text().catch(() => 'erro desconhecido')
      throw new Error(`fal.ai erro ao buscar o vídeo final (${resultResponse.status}): ${text}`)
    }
    const { payload } = await parseResponsePayload(resultResponse)
    const url = getFalResultUrl(payload)
    if (url) {
      return { url, mimeType: getFalMimeType(payload), provider: 'fal' }
    }
    throw new Error(`fal.ai concluiu mas não retornou o arquivo de vídeo: ${getPayloadError(payload, '')}`)
  }

  throw new Error('fal.ai concluiu a fila mas não forneceu o endpoint do resultado.')
}
