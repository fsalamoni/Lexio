/**
 * Image Generation Client — generates images via OpenRouter (DALL-E compatible).
 *
 * Uses the OpenAI-compatible /images/generations endpoint exposed by OpenRouter.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ImageGenerationOptions {
  apiKey: string
  prompt: string
  model?: string    // e.g. 'openai/dall-e-3'
  size?: '1024x1024' | '1792x1024' | '1024x1792'
  quality?: 'standard' | 'hd'
  style?: 'vivid' | 'natural'
}

export interface ImageGenerationResult {
  url?: string       // URL returned by the API (temporary)
  b64_json?: string  // Base64 PNG if requested
  revisedPrompt?: string
}

// ── OpenRouter Image Generation ─────────────────────────────────────────────

/**
 * Generate an image via OpenRouter's images/generations endpoint.
 * Returns the URL of the generated image.
 */
export async function generateImageViaOpenRouter(
  opts: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  const model = opts.model || 'openai/dall-e-3'
  const size = opts.size || '1792x1024'
  const quality = opts.quality || 'standard'

  const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Lexio Research Notebook',
    },
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
      n: 1,
      size,
      quality,
      style: opts.style || 'vivid',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Image generation API error (${response.status}): ${errorText}`)
  }

  const data = await response.json() as {
    data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
  }
  const item = data.data?.[0]
  if (!item) throw new Error('No image returned from API')

  return {
    url: item.url,
    b64_json: item.b64_json,
    revisedPrompt: item.revised_prompt,
  }
}

// ── Available image models ──────────────────────────────────────────────────

export const IMAGE_MODELS = [
  { id: 'openai/dall-e-3', label: 'DALL-E 3', description: 'Alta qualidade, detalhado (recomendado)' },
  { id: 'openai/dall-e-2', label: 'DALL-E 2', description: 'Mais rápido e barato' },
] as const
