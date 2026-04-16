/**
 * Client-side OpenRouter LLM client.
 *
 * Calls the OpenRouter chat completions API directly from the browser.
 * OpenRouter supports CORS, so this works without a proxy/backend.
 *
 * The API key is resolved from the authenticated user's saved settings
 * (with environment fallback when configured).
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Timeout in milliseconds for each OpenRouter request. */
const REQUEST_TIMEOUT_MS = 120_000

/** Maximum number of automatic retries on transient failures. */
const MAX_RETRIES = 2

/** Maximum number of retries specifically for empty LLM responses. */
const MAX_EMPTY_RESPONSE_RETRIES = 2

export interface LLMCallOptions {
  signal?: AbortSignal
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

/**
 * Perform a fetch with automatic retry on transient errors.
 * Retries up to MAX_RETRIES times with exponential back-off (1 s, 2 s).
 * Retries on both network errors (TypeError) and timeouts (AbortError).
 * A per-request AbortController enforces REQUEST_TIMEOUT_MS.
 */
async function fetchWithRetry(url: string, options: RequestInit, externalSignal?: AbortSignal): Promise<Response> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (externalSignal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }

    if (attempt > 0) {
      const baseDelayMs = 1000 * Math.pow(2, attempt - 1)
      const jitterMs = Math.round(baseDelayMs * Math.random() * 0.25)
      const delayMs = baseDelayMs + jitterMs
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
      return resp
    } catch (err) {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onAbort)
      const isNetworkError = err instanceof TypeError
      const isTimeout = err instanceof DOMException && err.name === 'AbortError'

      if (externalSignal?.aborted) {
        throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
      }

      if (isTimeout) {
        lastError = new TransientLLMError(`Requisição ao OpenRouter excedeu o tempo limite (${REQUEST_TIMEOUT_MS / 1000}s)`)
      } else {
        lastError = err as Error
      }

      // Retry on network errors and timeouts
      if ((isNetworkError || isTimeout) && attempt < MAX_RETRIES) {
        continue
      }
      throw lastError
    }
  }
  throw lastError ?? new Error('Falha de rede desconhecida')
}

/**
 * Custom error thrown when a model is unavailable on OpenRouter
 * (404 / "no endpoints found"). Callers should catch this to display
 * a specific warning to the user with the affected model name.
 */
export class ModelUnavailableError extends Error {
  public readonly modelId: string
  constructor(modelId: string) {
    super(`Modelo "${modelId}" indisponível no OpenRouter (sem endpoints). Altere este modelo nas configurações.`)
    this.name = 'ModelUnavailableError'
    this.modelId = modelId
  }
}

/**
 * Custom error thrown on transient LLM failures (empty response, timeout).
 * Callers like callLLMWithFallback can catch this to transparently retry
 * with a fallback model.
 */
export class TransientLLMError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransientLLMError'
  }
}

/**
 * Reliable text fallback used when a `:free` / `:experimental` model picked by the
 * user returns `ModelUnavailableError` or `TransientLLMError`. Gemini 2.0 Flash is
 * cheap, fast, and supports JSON-structured outputs — making it a safe pinch-hitter
 * for notebook pipelines (studio, audio scripting, presentation scripting, video
 * scripting agents) without forcing a config change mid-run.
 */
export const RELIABLE_TEXT_FALLBACK_MODEL = 'google/gemini-2.0-flash-001'

/**
 * Given a primary model chosen by the user, pick a reliable alternative to try
 * when the primary fails. If the primary is already reliable (paid, non-experimental),
 * returns the primary unchanged.
 */
export function pickReliableFallback(primaryModel: string): string {
  const lower = primaryModel.toLowerCase()
  const isUnreliable = lower.endsWith(':free') || lower.includes(':experimental')
  if (!isUnreliable) return primaryModel
  if (lower.startsWith('google/gemini-2.0-flash')) {
    // Avoid returning the same family; use Haiku as secondary fallback
    return 'anthropic/claude-3.5-haiku'
  }
  return RELIABLE_TEXT_FALLBACK_MODEL
}

export interface LLMResult {
  content: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  duration_ms: number
}

/**
 * Call OpenRouter chat completion.
 *
 * @param apiKey   - OpenRouter API key (sk-or-v1-…)
 * @param system   - System prompt
 * @param user     - User prompt
 * @param model    - Model identifier (default: anthropic/claude-3.5-haiku)
 * @param maxTokens - Max output tokens
 * @param temperature - Sampling temperature
 * @returns Structured result with content and usage metadata
 */
export async function callLLM(
  apiKey: string,
  system: string,
  user: string,
  model: string,
  maxTokens = 4000,
  temperature = 0.3,
  options?: LLMCallOptions,
): Promise<LLMResult> {
  const t0 = performance.now()

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature,
  })
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://lexio.app',
    'X-Title': 'Lexio',
  }

  // Retry loop for empty responses (separate from fetchWithRetry network retries)
  for (let emptyAttempt = 0; emptyAttempt <= MAX_EMPTY_RESPONSE_RETRIES; emptyAttempt++) {
    if (options?.signal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }
    if (emptyAttempt > 0) {
      const delayMs = 1500 * emptyAttempt
      console.warn(`[LLM] Resposta vazia, tentativa ${emptyAttempt + 1}/${MAX_EMPTY_RESPONSE_RETRIES + 1} após ${delayMs}ms...`)
      await sleepWithSignal(delayMs, options?.signal)
    }

    const resp = await fetchWithRetry(OPENROUTER_URL, { method: 'POST', headers, body }, options?.signal)

    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => '')
      const lower = errorBody.toLowerCase()
      if (
        (resp.status === 404 && lower.includes('no endpoints')) ||
        (resp.status === 400 && lower.includes('not a valid model'))
      ) {
        console.warn(`[LLM] Modelo "${model}" indisponível no OpenRouter: ${errorBody.slice(0, 200)}`)
        throw new ModelUnavailableError(model)
      }
      throw new Error(`OpenRouter API error ${resp.status}: ${errorBody}`)
    }

    const rawText = await resp.text()
    if (options?.signal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }
    if (!rawText || rawText.trim().length === 0) {
      if (emptyAttempt < MAX_EMPTY_RESPONSE_RETRIES) continue
      throw new TransientLLMError('OpenRouter returned empty response body')
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(rawText)
    } catch (parseErr) {
      throw new Error(
        `OpenRouter returned invalid JSON (${(parseErr as Error).message}). ` +
        `Response starts with: ${rawText.slice(0, 200)}`,
      )
    }

    const choice = (data as Record<string, unknown[]>).choices?.[0] as
      | { message?: { content?: string } }
      | undefined
    if (!choice?.message?.content) {
      if (emptyAttempt < MAX_EMPTY_RESPONSE_RETRIES) continue
      throw new TransientLLMError('OpenRouter returned empty response')
    }

    const usage = (data.usage ?? {}) as Record<string, number>
    const durationMs = Math.round(performance.now() - t0)

    const tokensIn  = usage.prompt_tokens ?? 0
    const tokensOut = usage.completion_tokens ?? 0

    const cost_usd: number = typeof usage.cost === 'number'
      ? usage.cost
      : estimateCost(model, tokensIn, tokensOut)

    return {
      content: choice.message.content,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd,
      duration_ms: durationMs,
    }
  }

  // Unreachable — the loop always returns or throws. Required for TypeScript control-flow.
  throw new TransientLLMError('OpenRouter returned empty response')
}

/**
 * Call OpenRouter chat completion with a full messages array.
 * Use this for multi-turn conversations where you need to pass prior messages.
 *
 * @param apiKey  - OpenRouter API key
 * @param messages - Array of {role, content} messages (system, user, assistant)
 * @param model   - Model identifier
 * @param maxTokens - Max output tokens
 * @param temperature - Sampling temperature
 */
export async function callLLMWithMessages(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string,
  maxTokens = 4000,
  temperature = 0.3,
  options?: LLMCallOptions,
): Promise<LLMResult> {
  const t0 = performance.now()

  const body = JSON.stringify({ model, messages, max_tokens: maxTokens, temperature })
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://lexio.app',
    'X-Title': 'Lexio',
  }

  // Retry loop for empty responses (separate from fetchWithRetry network retries)
  for (let emptyAttempt = 0; emptyAttempt <= MAX_EMPTY_RESPONSE_RETRIES; emptyAttempt++) {
    if (options?.signal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }
    if (emptyAttempt > 0) {
      const delayMs = 1500 * emptyAttempt
      console.warn(`[LLM] Resposta vazia, tentativa ${emptyAttempt + 1}/${MAX_EMPTY_RESPONSE_RETRIES + 1} após ${delayMs}ms...`)
      await sleepWithSignal(delayMs, options?.signal)
    }

    const resp = await fetchWithRetry(OPENROUTER_URL, { method: 'POST', headers, body }, options?.signal)

    if (!resp.ok) {
      const errorBody = await resp.text().catch(() => '')
      const lower = errorBody.toLowerCase()
      if (
        (resp.status === 404 && lower.includes('no endpoints')) ||
        (resp.status === 400 && lower.includes('not a valid model'))
      ) {
        console.warn(`[LLM] Modelo "${model}" indisponível no OpenRouter: ${errorBody.slice(0, 200)}`)
        throw new ModelUnavailableError(model)
      }
      throw new Error(`OpenRouter API error ${resp.status}: ${errorBody}`)
    }

    const rawText = await resp.text()
    if (options?.signal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }
    if (!rawText || rawText.trim().length === 0) {
      if (emptyAttempt < MAX_EMPTY_RESPONSE_RETRIES) continue
      throw new TransientLLMError('OpenRouter returned empty response body')
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(rawText)
    } catch (parseErr) {
      throw new Error(
        `OpenRouter returned invalid JSON (${(parseErr as Error).message}). ` +
        `Response starts with: ${rawText.slice(0, 200)}`,
      )
    }

    const choice = (data as Record<string, unknown[]>).choices?.[0] as
      | { message?: { content?: string } }
      | undefined
    if (!choice?.message?.content) {
      if (emptyAttempt < MAX_EMPTY_RESPONSE_RETRIES) continue
      throw new TransientLLMError('OpenRouter returned empty response')
    }

    const usage = (data.usage ?? {}) as Record<string, number>
    const durationMs = Math.round(performance.now() - t0)
    const tokensIn  = usage.prompt_tokens ?? 0
    const tokensOut = usage.completion_tokens ?? 0
    const cost_usd: number = typeof usage.cost === 'number'
      ? usage.cost
      : estimateCost(model, tokensIn, tokensOut)

    return {
      content: choice.message.content,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd,
      duration_ms: durationMs,
    }
  }

  // Unreachable — the loop always returns or throws. Required for TypeScript control-flow.
  throw new TransientLLMError('OpenRouter returned empty response')
}

/**
 * Call OpenRouter with automatic fallback when a model is unavailable or
 * encounters transient errors (empty response, timeout).
 *
 * Free / experimental models on OpenRouter can return "No endpoints found" (404)
 * or empty responses when they are temporarily unavailable or overloaded.
 * This wrapper transparently retries with the specified fallback model so the
 * pipeline keeps working.
 *
 * @param fallbackModel - Reliable model to use when `model` fails
 */
export async function callLLMWithFallback(
  apiKey: string,
  system: string,
  user: string,
  model: string,
  fallbackModel: string,
  maxTokens = 4000,
  temperature = 0.3,
  options?: LLMCallOptions,
): Promise<LLMResult> {
  try {
    return await callLLM(apiKey, system, user, model, maxTokens, temperature, options)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    const isRecoverable = err instanceof ModelUnavailableError || err instanceof TransientLLMError
    if (isRecoverable) {
      // Resolve an effective fallback: if caller passed the same model as both
      // primary and fallback, pick a reliable alternative so notebook pipelines
      // configured with `:free` models can still complete.
      let effectiveFallback = fallbackModel
      if (model === fallbackModel) {
        const alt = pickReliableFallback(model)
        if (alt === model) {
          // No alternative available — propagate error
          throw err
        }
        effectiveFallback = alt
      }
      console.warn(
        `[LLM] Modelo "${model}" falhou (${err instanceof ModelUnavailableError ? 'indisponível' : 'erro transitório'}).` +
        ` Usando fallback: "${effectiveFallback}".`,
      )
      return callLLM(apiKey, system, user, effectiveFallback, maxTokens, temperature, options)
    }
    throw err
  }
}

/**
 * Like callLLMWithFallback but for multi-turn conversations (wraps callLLMWithMessages).
 */
export async function callLLMWithMessagesFallback(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string,
  fallbackModel: string,
  maxTokens = 4000,
  temperature = 0.3,
  options?: LLMCallOptions,
): Promise<LLMResult> {
  try {
    return await callLLMWithMessages(apiKey, messages, model, maxTokens, temperature, options)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    const isRecoverable = err instanceof ModelUnavailableError || err instanceof TransientLLMError
    if (isRecoverable) {
      let effectiveFallback = fallbackModel
      if (model === fallbackModel) {
        const alt = pickReliableFallback(model)
        if (alt === model) throw err
        effectiveFallback = alt
      }
      console.warn(
        `[LLM] Modelo "${model}" falhou (${err instanceof ModelUnavailableError ? 'indisponível' : 'erro transitório'}).` +
        ` Usando fallback: "${effectiveFallback}".`,
      )
      return callLLMWithMessages(apiKey, messages, effectiveFallback, maxTokens, temperature, options)
    }
    throw err
  }
}

/**
 * Estimate LLM cost from token counts using a model pricing table (USD per 1M tokens).
 * Values sourced from OpenRouter pricing page (approximate).
 */
function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const PRICING: Record<string, [number, number]> = {
    // [input $/1M, output $/1M]
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
    'google/gemini-2.0-flash':            [0.075, 0.30],
    'google/gemini-2.0-flash-lite':       [0.038, 0.15],
    'meta-llama/llama-3.1-8b-instruct':   [0.06,  0.06],
  }

  // Exact match first, then prefix match
  let rates = PRICING[model]
  if (!rates) {
    const key = Object.keys(PRICING).find(k => model.startsWith(k.split('/')[0]))
    rates = key ? PRICING[key] : [1.00, 5.00] // conservative fallback
  }
  return parseFloat(((tokensIn * rates[0] + tokensOut * rates[1]) / 1_000_000).toFixed(6))
}
