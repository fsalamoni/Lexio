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

  let data: any
  try {
    data = JSON.parse(rawText)
  } catch (parseErr) {
    throw new Error(
      `OpenRouter returned invalid JSON (${(parseErr as Error).message}). ` +
      `Response starts with: ${rawText.slice(0, 200)}`,
    )
  }

  const choice = data.choices?.[0]
  if (!choice?.message?.content) {
    throw new Error('OpenRouter returned empty response')
  }

  const usage = data.usage ?? {}
  const durationMs = Math.round(performance.now() - t0)

  return {
    content: choice.message.content,
    model,
    tokens_in: usage.prompt_tokens ?? 0,
    tokens_out: usage.completion_tokens ?? 0,
    cost_usd: 0, // Cost is tracked by OpenRouter
    duration_ms: durationMs,
  }
}
