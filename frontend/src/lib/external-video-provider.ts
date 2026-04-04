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
  mime_type?: string
  status?: string
  state?: string
  job_id?: string
  id?: string
  poll_url?: string
  error?: string
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
  const candidate = payload.url
    || payload.video_url
    || payload.output_url
    || payload.result_url
    || payload.download_url
    || (typeof nested?.url === 'string' ? nested.url : undefined)
    || (typeof nested?.video_url === 'string' ? nested.video_url : undefined)
    || (typeof nested?.output_url === 'string' ? nested.output_url : undefined)
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined
}

function getJobId(payload: ExternalVideoResponsePayload): string | undefined {
  const nested = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : undefined
  const value = payload.job_id
    || payload.id
    || (typeof payload.job === 'object' && payload.job ? (payload.job as Record<string, unknown>).id : undefined)
    || (typeof nested?.job_id === 'string' ? nested.job_id : undefined)
    || (typeof nested?.id === 'string' ? nested.id : undefined)
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function getStatusValue(payload: ExternalVideoResponsePayload): string {
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
  const candidate = payload.error
    || payload.message
    || payload.details
    || (typeof nested?.error === 'string' ? nested.error : undefined)
    || (typeof nested?.message === 'string' ? nested.message : undefined)
    || fallbackText
  return String(candidate || 'Unknown provider error').trim()
}

function buildJobStatusUrl(
  cfg: ReturnType<typeof getConfig>,
  jobId: string | undefined,
  pollUrl?: string,
): string {
  if (pollUrl && pollUrl.trim().length > 0) return pollUrl
  if (!jobId && cfg.statusEndpoint) {
    return cfg.statusEndpoint
  }
  if (cfg.statusEndpoint && jobId && (cfg.statusEndpoint.includes(':jobId') || cfg.statusEndpoint.includes('{jobId}'))) {
    return cfg.statusEndpoint
      .replace(':jobId', encodeURIComponent(jobId))
      .replace('{jobId}', encodeURIComponent(jobId))
  }
  if (cfg.statusEndpoint && cfg.statusEndpoint.trim().length > 0 && jobId) {
    return `${cfg.statusEndpoint.replace(/\/$/, '')}/${encodeURIComponent(jobId)}`
  }
  if (!cfg.endpoint) {
    throw new Error('External video provider status endpoint is not configured')
  }
  if (!jobId) {
    throw new Error('External video provider did not return job id or poll URL')
  }
  return `${cfg.endpoint.replace(/\/$/, '')}/${encodeURIComponent(jobId)}`
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
