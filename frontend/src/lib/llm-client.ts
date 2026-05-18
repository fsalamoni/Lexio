/**
 * Multi-provider LLM client.
 *
 * Dispatches chat completion requests to the appropriate AI provider based on
 * the model's owner (resolved via `provider-credentials`):
 *  - `openrouter`        → POST openrouter chat/completions
 *  - `openai-compatible` → POST {baseUrl}/chat/completions
 *  - `anthropic`         → POST {baseUrl}/v1/messages (Anthropic dialect)
 *  - `ollama`            → POST localhost OpenAI-compat endpoint
 *
 * Public API (`callLLM`, `callLLMWithMessages`, `callLLMWithFallback`,
 * `callLLMWithMessagesFallback`) preserves its historical signature so the
 * dozens of pipelines keep working unchanged. The `apiKey` argument from
 * legacy callers is now treated as an "OpenRouter override key" — if it
 * matches the resolved provider it is used as-is; otherwise the resolver
 * loads the proper key from the user's settings.
 */

import { resolveProviderCall, type ResolvedProviderCall } from './provider-credentials'
import { PROVIDERS, type ProviderDefinition } from './providers'
import { getCurrentUserId } from './firestore-service'

const REQUEST_TIMEOUT_MS = 180_000
const MAX_RETRIES = 2
const MAX_EMPTY_RESPONSE_RETRIES = 2
const MAX_TOKEN_BUDGET_RETRIES = 2

export interface LLMCallOptions {
  signal?: AbortSignal
  /**
   * When provided, the LLM call uses HTTP streaming (SSE) where supported by
   * the provider, and `onToken` is invoked once per delta with the new chunk
   * and the cumulative content so far. The function still returns the full
   * `LLMResult` once the stream completes. If the provider does not support
   * streaming, the call falls back transparently to the non-streaming path
   * and `onToken` is invoked exactly once with the final content.
   */
  onToken?: (delta: string, total: string) => void
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms))
  if (signal.aborted) {
    return Promise.reject(new DOMException('Operação cancelada pelo usuário.', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Operação cancelada pelo usuário.', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

interface FetchWithRetryResult {
  response: Response
  retryCount: number
}

async function fetchWithRetry(url: string, options: RequestInit, externalSignal?: AbortSignal): Promise<FetchWithRetryResult> {
  let lastError: Error | undefined
  let retryAfterDelayMs: number | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }

    if (attempt > 0) {
      const baseDelayMs = 1000 * Math.pow(2, attempt - 1)
      const jitterMs = Math.round(baseDelayMs * Math.random() * 0.25)
      const delayMs = retryAfterDelayMs ?? (baseDelayMs + jitterMs)
      retryAfterDelayMs = undefined
      console.warn(`[LLM] Tentativa ${attempt + 1}/${MAX_RETRIES + 1} após ${delayMs}ms...`)
      await sleepWithSignal(delayMs, externalSignal)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const onAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onAbort, { once: true })

    try {
      const resp = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onAbort)
      if (!resp.ok && attempt < MAX_RETRIES && shouldRetryHttpTransient(resp.status)) {
        const errorBody = await resp.clone().text().catch(() => '')
        if (isTransientUpstreamResponse(resp.status, errorBody)) {
          retryAfterDelayMs = parseRetryAfterMs(resp.headers.get('Retry-After'))
          lastError = new TransientLLMError(`Resposta transitória do provedor (${resp.status})`)
          continue
        }
      }
      return { response: resp, retryCount: attempt }
    } catch (err) {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onAbort)
      const isNetworkError = err instanceof TypeError
      const isTimeout = err instanceof DOMException && err.name === 'AbortError'

      if (externalSignal?.aborted) {
        throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
      }

      if (isTimeout) {
        lastError = new TransientLLMError(`Requisição excedeu o tempo limite (${REQUEST_TIMEOUT_MS / 1000}s)`)
        throw lastError
      }
      lastError = err as Error
      if (isNetworkError && attempt < MAX_RETRIES) continue
      throw lastError
    }
  }
  throw lastError ?? new Error('Falha de rede desconhecida')
}

function parseRetryAfterMs(raw: string | null): number | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(30_000, Math.max(100, Math.round(seconds * 1000)))
  }
  const dateMs = Date.parse(trimmed)
  if (!Number.isFinite(dateMs)) return undefined
  return Math.min(30_000, Math.max(100, dateMs - Date.now()))
}

function shouldRetryHttpTransient(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503
    || status === 520 || status === 521 || status === 522 || status === 523 || status === 524
}

export class ModelUnavailableError extends Error {
  public readonly modelId: string
  constructor(modelId: string) {
    super(`Modelo "${modelId}" indisponível no provedor (sem endpoints). Altere este modelo nas configurações.`)
    this.name = 'ModelUnavailableError'
    this.modelId = modelId
  }
}

export class TransientLLMError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransientLLMError'
  }
}

function isModelUnavailableResponse(status: number, errorBody: string): boolean {
  const lower = errorBody.toLowerCase()
  if (status === 404 && lower.includes('no endpoints')) return true
  if (status === 400 && lower.includes('not a valid model')) return true
  if (status === 404 && lower.includes('provider returned error')) return true
  if (lower.includes('model not found')) return true
  if (lower.includes('model does not exist')) return true
  if (lower.includes('model is no longer available')) return true
  if (lower.includes('unknown model')) return true
  return false
}

function isTransientUpstreamResponse(status: number, errorBody: string): boolean {
  if (status === 408 || status === 425 || status === 429) return true
  if (status === 500 || status === 502 || status === 503 || status === 504) return true
  if (status === 520 || status === 521 || status === 522 || status === 523 || status === 524) return true
  const lower = errorBody.toLowerCase()
  if (lower.includes('operation was aborted')) return true
  if (lower.includes('timed out') || lower.includes('timeout')) return true
  if (lower.includes('overloaded') || lower.includes('temporarily unavailable')) return true
  if (lower.includes('rate limit') || lower.includes('rate-limit')) return true
  return false
}

function isRecoverableProviderQuotaResponse(status: number, errorBody: string): boolean {
  if (status !== 403) return false
  const message = extractProviderErrorMessage(errorBody)
  return /key limit exceeded|monthly limit/i.test(message)
}

function extractProviderErrorMessage(errorBody: string): string {
  if (!errorBody) return ''
  try {
    const parsed = JSON.parse(errorBody) as Record<string, unknown>
    const nestedError = parsed.error
    if (nestedError && typeof nestedError === 'object') {
      const nestedRecord = nestedError as Record<string, unknown>
      if (typeof nestedRecord.message === 'string') return nestedRecord.message
      const metadata = nestedRecord.metadata
      if (metadata && typeof metadata === 'object' && typeof (metadata as Record<string, unknown>).raw === 'string') {
        return (metadata as Record<string, unknown>).raw as string
      }
    }
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    // Ignore malformed JSON payloads and fall back to the raw response body.
  }
  return errorBody
}

function deriveReducedMaxTokensForBudgetRetry(
  providerId: string,
  status: number,
  requestedMaxTokens: number,
  errorBody: string,
): number | null {
  if (providerId !== 'openrouter' || status !== 402 || requestedMaxTokens <= 128) return null

  const message = extractProviderErrorMessage(errorBody)
  if (!/(more credits|fewer max_tokens|can only afford|insufficient.*credits?)/i.test(message)) {
    return null
  }

  const affordMatch = message.match(/can only afford\s+(\d+)/i)
  const affordableMaxTokens = affordMatch ? Number.parseInt(affordMatch[1], 10) : Number.NaN
  const candidate = Number.isFinite(affordableMaxTokens) && affordableMaxTokens > 0
    ? affordableMaxTokens
    : Math.floor(requestedMaxTokens * 0.7)

  const bounded = Math.max(128, Math.min(requestedMaxTokens - 1, candidate))
  return bounded < requestedMaxTokens ? bounded : null
}

interface ProviderFetchResult {
  response: Response
  errorBody?: string
  networkRetryCount: number
  tokenBudgetRetryCount: number
  parseResponse: (raw: string) => { content: string; tokensIn: number; tokensOut: number; cost?: number }
}

async function fetchProviderResponse(
  resolved: ResolvedProviderCall,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
  options: LLMCallOptions | undefined,
  streaming: boolean,
): Promise<ProviderFetchResult> {
  let requestedMaxTokens = maxTokens
  let networkRetryCount = 0
  let tokenBudgetRetryCount = 0

  for (let budgetAttempt = 0; budgetAttempt <= MAX_TOKEN_BUDGET_RETRIES; budgetAttempt++) {
    const plan = streaming
      ? buildStreamingPlan(resolved, messages, model, requestedMaxTokens, temperature)
      : buildPlan(resolved, messages, model, requestedMaxTokens, temperature)

    const { response, retryCount } = await fetchWithRetry(
      plan.url,
      { method: 'POST', headers: plan.headers, body: plan.body },
      options?.signal,
    )
    networkRetryCount += retryCount

    if (response.ok) {
      return {
        response,
        networkRetryCount,
        tokenBudgetRetryCount,
        parseResponse: plan.parseResponse,
      }
    }

    const errorBody = await response.text().catch(() => '')
    const reducedMaxTokens = budgetAttempt < MAX_TOKEN_BUDGET_RETRIES
      ? deriveReducedMaxTokensForBudgetRetry(resolved.provider.id, response.status, requestedMaxTokens, errorBody)
      : null

    if (reducedMaxTokens !== null) {
      tokenBudgetRetryCount += 1
      console.warn(
        `[LLM] ${resolved.provider.label} limitou o orçamento da resposta; reduzindo max_tokens de ${requestedMaxTokens} para ${reducedMaxTokens}.`,
      )
      requestedMaxTokens = reducedMaxTokens
      continue
    }

    return {
      response,
      errorBody,
      networkRetryCount,
      tokenBudgetRetryCount,
      parseResponse: plan.parseResponse,
    }
  }

  throw new Error(`${resolved.provider.label} não retornou resposta após reduzir max_tokens`)
}

export const RELIABLE_TEXT_FALLBACK_MODEL = 'google/gemini-2.5-flash'

function isRecoverableLLMError(err: unknown): err is ModelUnavailableError | TransientLLMError {
  return err instanceof ModelUnavailableError || err instanceof TransientLLMError
}

function buildFallbackCandidates(model: string, fallbackModel: string | readonly string[]): string[] {
  const raw = Array.isArray(fallbackModel) ? fallbackModel
    : (typeof fallbackModel === 'string' ? [fallbackModel] : [])
  const unique: string[] = []
  for (const candidate of raw) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (!trimmed) continue
    if (trimmed === model) continue
    if (unique.includes(trimmed)) continue
    unique.push(trimmed)
  }
  return unique
}

export interface LLMResult {
  content: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
  provider_id?: string
  provider_label?: string
  operational?: LLMOperationalMeta
}

export interface LLMOperationalMeta {
  requestedModel: string
  resolvedModel: string
  providerId?: string
  providerLabel?: string
  fallbackUsed: boolean
  fallbackFrom?: string
  fallbackReason?: 'model_unavailable' | 'transient_error'
  networkRetryCount: number
  emptyRetryCount: number
  totalRetryCount: number
}

export type ChatMessageTextPart = {
  type: 'text'
  text: string
}

export type ChatMessageImagePart = {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high'
  }
}

export type ChatMessageContentPart = ChatMessageTextPart | ChatMessageImagePart
export type ChatMessageContent = string | ChatMessageContentPart[]

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: ChatMessageContent
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

function extractTextFromChatMessageContent(content: ChatMessageContent): string {
  if (typeof content === 'string') return content
  return content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('')
}

function parseImageDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  return {
    mediaType: match[1],
    data: match[2],
  }
}

function buildAnthropicMessageContent(content: ChatMessageContent): string | AnthropicContentBlock[] {
  if (typeof content === 'string') return content

  const blocks: AnthropicContentBlock[] = []
  for (const part of content) {
    if (part.type === 'text') {
      if (part.text.trim()) {
        blocks.push({ type: 'text', text: part.text })
      }
      continue
    }

    const imageData = parseImageDataUrl(part.image_url.url)
    if (imageData) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageData.mediaType,
          data: imageData.data,
        },
      })
      continue
    }

    if (part.image_url.url.trim()) {
      blocks.push({ type: 'text', text: `Image reference: ${part.image_url.url}` })
    }
  }

  if (blocks.length === 1 && blocks[0].type === 'text') {
    return blocks[0].text
  }
  return blocks
}

function extractTextFromOpenAIContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const candidate = part as Record<string, unknown>
      if (typeof candidate.text === 'string') return candidate.text
      if (typeof candidate.content === 'string') return candidate.content
      return ''
    })
    .filter(Boolean)
    .join('')
}

// ── Provider dispatch ─────────────────────────────────────────────────────────

interface ProviderRequestPlan {
  url: string
  headers: Record<string, string>
  body: string
  parseResponse: (raw: string) => { content: string; tokensIn: number; tokensOut: number; cost?: number }
}

const DIRECT_PROVIDER_MODEL_PREFIX_ALIASES: Partial<Record<ProviderDefinition['id'], string[]>> = {
  xai: ['x-ai'],
}

function normalizeModelForDirectProvider(model: string, providerId: ProviderDefinition['id']): string {
  if (providerId === 'openrouter') return model
  const prefixes = [providerId, ...(DIRECT_PROVIDER_MODEL_PREFIX_ALIASES[providerId] ?? [])]
  for (const prefixCandidate of prefixes) {
    const prefix = `${prefixCandidate}/`
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length)
    }
  }
  return model
}

function buildOpenRouterPlan(
  resolved: ResolvedProviderCall,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): ProviderRequestPlan {
  const url = `${resolved.baseUrl.replace(/\/+$/, '')}/api/v1/chat/completions`
  return {
    url,
    headers: {
      'Authorization': `Bearer ${resolved.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://lexio.web.app',
      'X-Title': 'Lexio',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    parseResponse: parseOpenAIChatResponse,
  }
}

function buildOpenAICompatiblePlan(
  resolved: ResolvedProviderCall,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): ProviderRequestPlan {
  const normalizedModel = normalizeModelForDirectProvider(model, resolved.provider.id)
  const url = `${resolved.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (resolved.provider.authHeader) {
    headers[resolved.provider.authHeader] = `${resolved.provider.authPrefix ?? ''}${resolved.apiKey}`
  }
  if (resolved.provider.requiresDangerousBrowserHeader && resolved.provider.id === 'openai') {
    // OpenAI flags browser usage with this header (read by their JS SDK):
    headers['OpenAI-Beta'] = 'browser=dangerously-allow'
  }
  return {
    url,
    headers,
    body: JSON.stringify({ model: normalizedModel, messages, max_tokens: maxTokens, temperature }),
    parseResponse: parseOpenAIChatResponse,
  }
}

function buildAnthropicPlan(
  resolved: ResolvedProviderCall,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): ProviderRequestPlan {
  const normalizedModel = normalizeModelForDirectProvider(model, resolved.provider.id)
  const url = `${resolved.baseUrl.replace(/\/+$/, '')}/v1/messages`
  // Anthropic separates the system prompt from the messages list.
  const systemMessages = messages
    .filter(m => m.role === 'system')
    .map(m => extractTextFromChatMessageContent(m.content))
    .join('\n\n')
  const conversation = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: buildAnthropicMessageContent(m.content),
  }))
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': resolved.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  return {
    url,
    headers,
    body: JSON.stringify({
      model: normalizedModel,
      messages: conversation,
      system: systemMessages || undefined,
      max_tokens: maxTokens,
      temperature,
    }),
    parseResponse: parseAnthropicMessagesResponse,
  }
}

function parseOpenAIChatResponse(raw: string): { content: string; tokensIn: number; tokensOut: number; cost?: number } {
  const data = JSON.parse(raw) as Record<string, unknown>
  const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined
  const content = extractTextFromOpenAIContent(choices?.[0]?.message?.content)
  const usage = (data.usage ?? {}) as Record<string, number>
  return {
    content,
    tokensIn: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? usage.output_tokens ?? 0,
    cost: typeof usage.cost === 'number' ? usage.cost : undefined,
  }
}

function parseAnthropicMessagesResponse(raw: string): { content: string; tokensIn: number; tokensOut: number; cost?: number } {
  const data = JSON.parse(raw) as Record<string, unknown>
  const blocks = (data.content ?? []) as Array<{ type?: string; text?: string }>
  const text = blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
  const usage = (data.usage ?? {}) as Record<string, number>
  return {
    content: text,
    tokensIn: usage.input_tokens ?? 0,
    tokensOut: usage.output_tokens ?? 0,
  }
}

function buildPlan(
  resolved: ResolvedProviderCall,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): ProviderRequestPlan {
  switch (resolved.provider.dialect) {
    case 'openrouter':
      return buildOpenRouterPlan(resolved, messages, model, maxTokens, temperature)
    case 'anthropic':
      return buildAnthropicPlan(resolved, messages, model, maxTokens, temperature)
    case 'ollama':
    case 'openai-compatible':
      return buildOpenAICompatiblePlan(resolved, messages, model, maxTokens, temperature)
    case 'audio-only':
      throw new Error(`Provedor "${resolved.provider.label}" não suporta chamadas de texto.`)
  }
}

/**
 * Returns true when the resolved provider's dialect is compatible with the
 * OpenAI-style SSE streaming format (`data: {json}\n\n` with `[DONE]`).
 */
function dialectSupportsOpenAIStreaming(dialect: ProviderDefinition['dialect']): boolean {
  return dialect === 'openrouter' || dialect === 'openai-compatible' || dialect === 'ollama'
}

/**
 * Build a streaming-enabled request plan for OpenAI-compatible chat
 * completions. Mutates the body to include `stream: true` and a usage hint
 * so OpenRouter returns token usage in the final SSE event.
 */
function buildStreamingPlan(
  resolved: ResolvedProviderCall,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
): ProviderRequestPlan {
  const basePlan = buildPlan(resolved, messages, model, maxTokens, temperature)
  const parsedBody = JSON.parse(basePlan.body) as Record<string, unknown>
  parsedBody.stream = true
  if (resolved.provider.dialect === 'openrouter') {
    parsedBody.stream_options = { include_usage: true }
  }
  return { ...basePlan, body: JSON.stringify(parsedBody) }
}

interface StreamCompletionResult {
  content: string
  tokensIn: number
  tokensOut: number
  cost?: number
}

/**
 * Consume an OpenAI-compatible Server-Sent Events stream from a fetch
 * Response, dispatching each delta to the supplied callback and returning
 * the cumulative content and usage when the stream finishes.
 */
async function consumeOpenAIStream(
  response: Response,
  onDelta: (delta: string, total: string) => void,
  signal?: AbortSignal,
): Promise<StreamCompletionResult> {
  const reader = response.body?.getReader()
  if (!reader) {
    const fallbackText = await response.text().catch(() => '')
    const parsed = parseOpenAIChatResponse(fallbackText)
    if (parsed.content) onDelta(parsed.content, parsed.content)
    return parsed
  }

  const decoder = new TextDecoder()
  let buffered = ''
  let accumulated = ''
  let tokensIn = 0
  let tokensOut = 0
  let cost: number | undefined

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
      }
      const { value, done } = await reader.read()
      if (done) break
      buffered += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line. Drain any complete frames
      // we currently have before reading the next chunk.
      let separatorIndex = buffered.indexOf('\n\n')
      while (separatorIndex !== -1) {
        const rawFrame = buffered.slice(0, separatorIndex)
        buffered = buffered.slice(separatorIndex + 2)
        for (const line of rawFrame.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const event = JSON.parse(payload) as Record<string, unknown>
            const choices = event.choices as Array<{ delta?: { content?: unknown } }> | undefined
            const delta = extractTextFromOpenAIContent(choices?.[0]?.delta?.content)
            if (delta.length > 0) {
              accumulated += delta
              onDelta(delta, accumulated)
            }
            const usage = event.usage as Record<string, number> | undefined
            if (usage) {
              if (typeof usage.prompt_tokens === 'number') tokensIn = usage.prompt_tokens
              if (typeof usage.completion_tokens === 'number') tokensOut = usage.completion_tokens
              if (typeof usage.total_cost === 'number') cost = usage.total_cost
            }
          } catch {
            // Ignore malformed lines — the next frame may still be valid.
          }
        }
        separatorIndex = buffered.indexOf('\n\n')
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* noop */ }
  }

  return { content: accumulated, tokensIn, tokensOut, cost }
}

async function executeChatCompletionStreaming(
  resolved: ResolvedProviderCall,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
  options: LLMCallOptions,
): Promise<LLMResult> {
  const t0 = performance.now()
  const onToken = options.onToken!

  const {
    response,
    errorBody = '',
    networkRetryCount,
    tokenBudgetRetryCount,
  } = await fetchProviderResponse(
    resolved,
    messages,
    model,
    maxTokens,
    temperature,
    options,
    true,
  )

  if (!response.ok) {
    if (isModelUnavailableResponse(response.status, errorBody)) {
      throw new ModelUnavailableError(model)
    }
    if (isRecoverableProviderQuotaResponse(response.status, errorBody)) {
      throw new TransientLLMError(`${resolved.provider.label} API error ${response.status}: ${errorBody.slice(0, 300)}`)
    }
    if (isTransientUpstreamResponse(response.status, errorBody)) {
      throw new TransientLLMError(`${resolved.provider.label} API error ${response.status}: ${errorBody.slice(0, 300)}`)
    }
    throw new Error(`${resolved.provider.label} API error ${response.status}: ${errorBody}`)
  }

  const streamed = await consumeOpenAIStream(response, onToken, options.signal)
  if (!streamed.content) {
    throw new TransientLLMError(`${resolved.provider.label} retornou stream vazio`)
  }

  const durationMs = Math.round(performance.now() - t0)
  const cost_usd = streamed.cost ?? estimateCost(model, resolved.provider.id, streamed.tokensIn, streamed.tokensOut)
  return {
    content: streamed.content,
    model,
    tokens_in: streamed.tokensIn,
    tokens_out: streamed.tokensOut,
    cost_usd,
    duration_ms: durationMs,
    provider_id: resolved.provider.id,
    provider_label: resolved.provider.label,
    operational: {
      requestedModel: model,
      resolvedModel: model,
      providerId: resolved.provider.id,
      providerLabel: resolved.provider.label,
      fallbackUsed: false,
      networkRetryCount,
      emptyRetryCount: 0,
      totalRetryCount: networkRetryCount + tokenBudgetRetryCount,
    },
  }
}

function estimateCost(model: string, providerId: string, tokensIn: number, tokensOut: number): number {
  const PRICING: Record<string, [number, number]> = {
    'anthropic/claude-3.5-haiku':         [0.80,  4.00],
    'anthropic/claude-3-haiku':           [0.25,  1.25],
    'anthropic/claude-haiku-4-5':         [0.80,  4.00],
    'anthropic/claude-sonnet-4':          [3.00, 15.00],
    'anthropic/claude-sonnet-4-5':        [3.00, 15.00],
    'anthropic/claude-3.5-sonnet':        [3.00, 15.00],
    'anthropic/claude-3-opus':            [15.00, 75.00],
    'anthropic/claude-opus-4':            [15.00, 75.00],
    'openai/gpt-4o':                      [2.50, 10.00],
    'openai/gpt-4o-mini':                 [0.15,  0.60],
    'google/gemini-2.5-flash':            [0.30,  2.50],
    'google/gemini-2.5-flash-lite':       [0.10,  0.40],
    'google/gemini-2.0-flash':            [0.075, 0.30],
    'google/gemini-2.0-flash-lite':       [0.038, 0.15],
    'meta-llama/llama-3.1-8b-instruct':   [0.06,  0.06],
    'nvidia/llama-3.3-nemotron-super-49b-v1': [0.10, 0.40],
    'nvidia/llama-3.1-nemotron-70b-instruct': [1.20, 1.20],
  }
  const compositeKey = `${providerId}/${model}`
  let rates = PRICING[model] ?? PRICING[compositeKey]
  if (!rates) {
    const knownKey = Object.keys(PRICING).find(k => model.startsWith(k.split('/')[0]))
    rates = knownKey ? PRICING[knownKey] : [1.00, 5.00]
  }
  return parseFloat(((tokensIn * rates[0] + tokensOut * rates[1]) / 1_000_000).toFixed(6))
}

async function resolveCallContext(
  legacyApiKey: string | undefined,
  model: string,
): Promise<ResolvedProviderCall> {
  const isLikelyOpenRouterKey = (key: string | undefined): boolean => {
    if (!key) return false
    const trimmed = key.trim()
    if (!trimmed) return false
    return /^sk-or-v1-/i.test(trimmed) || /^or-v1-/i.test(trimmed) || /^sk-or-/i.test(trimmed)
  }

  const uid = getCurrentUserId() ?? undefined
  try {
    const resolved = await resolveProviderCall(model, uid)
    if (legacyApiKey && resolved.provider.id === 'openrouter' && isLikelyOpenRouterKey(legacyApiKey)) {
      // Honour explicit override when the call still points at OpenRouter.
      return { ...resolved, apiKey: legacyApiKey }
    }
    return resolved
  } catch (err) {
    // Fallback when the user has no settings yet: assume OpenRouter with the
    // legacy key. This preserves the historical behaviour for fresh installs.
    if (!isLikelyOpenRouterKey(legacyApiKey)) throw err
    const legacyOpenRouterKey = legacyApiKey as string
    return {
      provider: PROVIDERS.openrouter as ProviderDefinition,
      apiKey: legacyOpenRouterKey,
      baseUrl: PROVIDERS.openrouter.baseUrl,
    }
  }
}

async function executeChatCompletion(
  legacyApiKey: string | undefined,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  temperature: number,
  options?: LLMCallOptions,
): Promise<LLMResult> {
  const t0 = performance.now()
  const resolved = await resolveCallContext(legacyApiKey, model)

  if (options?.onToken && dialectSupportsOpenAIStreaming(resolved.provider.dialect)) {
    return executeChatCompletionStreaming(resolved, messages, model, maxTokens, temperature, options)
  }

  for (let emptyAttempt = 0; emptyAttempt <= MAX_EMPTY_RESPONSE_RETRIES; emptyAttempt++) {
    if (options?.signal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }
    if (emptyAttempt > 0) {
      const delayMs = 1500 * emptyAttempt
      console.warn(`[LLM] Resposta vazia, tentativa ${emptyAttempt + 1}/${MAX_EMPTY_RESPONSE_RETRIES + 1} após ${delayMs}ms...`)
      await sleepWithSignal(delayMs, options?.signal)
    }

    const {
      response,
      errorBody = '',
      networkRetryCount,
      tokenBudgetRetryCount,
      parseResponse,
    } = await fetchProviderResponse(
      resolved,
      messages,
      model,
      maxTokens,
      temperature,
      options,
      false,
    )

    if (!response.ok) {
      if (isModelUnavailableResponse(response.status, errorBody)) {
        throw new ModelUnavailableError(model)
      }
      if (isRecoverableProviderQuotaResponse(response.status, errorBody)) {
        throw new TransientLLMError(`${resolved.provider.label} API error ${response.status}: ${errorBody.slice(0, 300)}`)
      }
      if (isTransientUpstreamResponse(response.status, errorBody)) {
        throw new TransientLLMError(`${resolved.provider.label} API error ${response.status}: ${errorBody.slice(0, 300)}`)
      }
      throw new Error(`${resolved.provider.label} API error ${response.status}: ${errorBody}`)
    }

    const rawText = await response.text()
    if (options?.signal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }
    if (!rawText || rawText.trim().length === 0) {
      if (emptyAttempt < MAX_EMPTY_RESPONSE_RETRIES) continue
      throw new TransientLLMError(`${resolved.provider.label} retornou resposta vazia`)
    }

    let parsed
    try {
      parsed = parseResponse(rawText)
    } catch (parseErr) {
      throw new Error(
        `${resolved.provider.label} retornou JSON inválido (${(parseErr as Error).message}). ` +
        `Resposta inicia com: ${rawText.slice(0, 200)}`,
      )
    }

    if (!parsed.content) {
      if (emptyAttempt < MAX_EMPTY_RESPONSE_RETRIES) continue
      throw new TransientLLMError(`${resolved.provider.label} retornou conteúdo vazio`)
    }

    const durationMs = Math.round(performance.now() - t0)
    const cost_usd = parsed.cost ?? estimateCost(model, resolved.provider.id, parsed.tokensIn, parsed.tokensOut)
    return {
      content: parsed.content,
      model,
      tokens_in: parsed.tokensIn,
      tokens_out: parsed.tokensOut,
      cost_usd,
      duration_ms: durationMs,
      provider_id: resolved.provider.id,
      provider_label: resolved.provider.label,
      operational: {
        requestedModel: model,
        resolvedModel: model,
        providerId: resolved.provider.id,
        providerLabel: resolved.provider.label,
        fallbackUsed: false,
        networkRetryCount,
        emptyRetryCount: emptyAttempt,
        totalRetryCount: networkRetryCount + tokenBudgetRetryCount + emptyAttempt,
      },
    }
  }

  throw new TransientLLMError(`${resolved.provider.label} retornou resposta vazia`)
}

export async function callLLM(
  apiKey: string,
  system: string,
  user: string,
  model: string,
  maxTokens = 4000,
  temperature = 0.3,
  options?: LLMCallOptions,
): Promise<LLMResult> {
  return executeChatCompletion(
    apiKey,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    model,
    maxTokens,
    temperature,
    options,
  )
}

export async function callLLMWithMessages(
  apiKey: string,
  messages: Array<ChatMessage>,
  model: string,
  maxTokens = 4000,
  temperature = 0.3,
  options?: LLMCallOptions,
): Promise<LLMResult> {
  return executeChatCompletion(apiKey, messages, model, maxTokens, temperature, options)
}

export async function callLLMWithFallback(
  apiKey: string,
  system: string,
  user: string,
  model: string,
  fallbackModel: string | readonly string[],
  maxTokens = 4000,
  temperature = 0.3,
  options?: LLMCallOptions,
): Promise<LLMResult> {
  try {
    return await callLLM(apiKey, system, user, model, maxTokens, temperature, options)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    if (isRecoverableLLMError(err)) {
      const fallbackCandidates = buildFallbackCandidates(model, fallbackModel)
      let lastRecoverableError: ModelUnavailableError | TransientLLMError = err
      for (const fallbackCandidate of fallbackCandidates) {
        try {
          const fallbackResult = await callLLM(apiKey, system, user, fallbackCandidate, maxTokens, temperature, options)
          return {
            ...fallbackResult,
            operational: {
              requestedModel: model,
              resolvedModel: fallbackResult.model,
              providerId: fallbackResult.provider_id ?? fallbackResult.operational?.providerId,
              providerLabel: fallbackResult.provider_label ?? fallbackResult.operational?.providerLabel,
              fallbackUsed: true,
              fallbackFrom: model,
              fallbackReason: err instanceof ModelUnavailableError ? 'model_unavailable' : 'transient_error',
              networkRetryCount: fallbackResult.operational?.networkRetryCount ?? 0,
              emptyRetryCount: fallbackResult.operational?.emptyRetryCount ?? 0,
              totalRetryCount: fallbackResult.operational?.totalRetryCount ?? 0,
            },
          }
        } catch (fallbackErr) {
          if (fallbackErr instanceof DOMException && fallbackErr.name === 'AbortError') throw fallbackErr
          if (isRecoverableLLMError(fallbackErr)) {
            lastRecoverableError = fallbackErr
            continue
          }
          throw fallbackErr
        }
      }
      throw lastRecoverableError
    }
    throw err
  }
}

export async function callLLMWithMessagesFallback(
  apiKey: string,
  messages: Array<ChatMessage>,
  model: string,
  fallbackModel: string | readonly string[],
  maxTokens = 4000,
  temperature = 0.3,
  options?: LLMCallOptions,
): Promise<LLMResult> {
  try {
    return await callLLMWithMessages(apiKey, messages, model, maxTokens, temperature, options)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    if (isRecoverableLLMError(err)) {
      const fallbackCandidates = buildFallbackCandidates(model, fallbackModel)
      let lastRecoverableError: ModelUnavailableError | TransientLLMError = err
      for (const fallbackCandidate of fallbackCandidates) {
        try {
          const fallbackResult = await callLLMWithMessages(apiKey, messages, fallbackCandidate, maxTokens, temperature, options)
          return {
            ...fallbackResult,
            operational: {
              requestedModel: model,
              resolvedModel: fallbackResult.model,
              providerId: fallbackResult.provider_id ?? fallbackResult.operational?.providerId,
              providerLabel: fallbackResult.provider_label ?? fallbackResult.operational?.providerLabel,
              fallbackUsed: true,
              fallbackFrom: model,
              fallbackReason: err instanceof ModelUnavailableError ? 'model_unavailable' : 'transient_error',
              networkRetryCount: fallbackResult.operational?.networkRetryCount ?? 0,
              emptyRetryCount: fallbackResult.operational?.emptyRetryCount ?? 0,
              totalRetryCount: fallbackResult.operational?.totalRetryCount ?? 0,
            },
          }
        } catch (fallbackErr) {
          if (fallbackErr instanceof DOMException && fallbackErr.name === 'AbortError') throw fallbackErr
          if (isRecoverableLLMError(fallbackErr)) {
            lastRecoverableError = fallbackErr
            continue
          }
          throw fallbackErr
        }
      }
      throw lastRecoverableError
    }
    throw err
  }
}
