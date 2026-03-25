/**
 * Client-side OpenRouter LLM client.
 *
 * Calls the OpenRouter chat completions API directly from the browser.
 * OpenRouter supports CORS, so this works without a proxy/backend.
 *
 * The API key is read from Firestore `/settings/platform.openrouter_api_key`
 * (configured in the Admin Panel).
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

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
  model = 'anthropic/claude-3.5-haiku',
  maxTokens = 4000,
  temperature = 0.3,
): Promise<LLMResult> {
  const t0 = performance.now()

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lexio.app',
      'X-Title': 'Lexio',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  })

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => '')
    throw new Error(`OpenRouter API error ${resp.status}: ${errorBody}`)
  }

  const rawText = await resp.text()
  if (!rawText || rawText.trim().length === 0) {
    throw new Error('OpenRouter returned empty response body')
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
    throw new Error('OpenRouter returned empty response')
  }

  const usage = (data.usage ?? {}) as Record<string, number>
  const durationMs = Math.round(performance.now() - t0)

  const tokensIn  = usage.prompt_tokens ?? 0
  const tokensOut = usage.completion_tokens ?? 0

  // OpenRouter returns the generation cost in usage.cost (USD).
  // When cost is explicitly 0 (free/gratis models), honour it instead of estimating.
  // Only estimate when the field is absent from the response entirely.
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
  model = 'anthropic/claude-3.5-haiku',
  maxTokens = 4000,
  temperature = 0.3,
): Promise<LLMResult> {
  const t0 = performance.now()

  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lexio.app',
      'X-Title': 'Lexio',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  })

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => '')
    throw new Error(`OpenRouter API error ${resp.status}: ${errorBody}`)
  }

  const rawText = await resp.text()
  if (!rawText || rawText.trim().length === 0) {
    throw new Error('OpenRouter returned empty response body')
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
    throw new Error('OpenRouter returned empty response')
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

/**
 * Call OpenRouter with automatic fallback when a model has no available endpoints.
 *
 * Free / experimental models on OpenRouter can return "No endpoints found" (404)
 * when they are temporarily unavailable or rate-limited. This wrapper transparently
 * retries with the specified fallback model so the pipeline keeps working.
 *
 * @param fallbackModel - Reliable model to use when `model` is unavailable
 */
export async function callLLMWithFallback(
  apiKey: string,
  system: string,
  user: string,
  model: string,
  fallbackModel: string,
  maxTokens = 4000,
  temperature = 0.3,
): Promise<LLMResult> {
  try {
    return await callLLM(apiKey, system, user, model, maxTokens, temperature)
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
    const isModelUnavailable = msg.includes('no endpoints found') || msg.includes('no endpoints')
    if (isModelUnavailable) {
      if (model === fallbackModel) {
        console.warn(
          `[LLM] Modelo "${model}" sem endpoints disponíveis.` +
          ` Fallback ignorado (mesmo modelo).`,
        )
      } else {
        console.warn(
          `[LLM] Modelo "${model}" sem endpoints disponíveis.` +
          ` Usando fallback: "${fallbackModel}".`,
        )
        return callLLM(apiKey, system, user, fallbackModel, maxTokens, temperature)
      }
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
