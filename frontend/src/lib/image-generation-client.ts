/**
 * Image Generation Client — generates images via OpenRouter's chat completions API
 * using the `modalities: ["image"]` parameter.
 *
 * OpenRouter returns generated images as base64 data URLs in the assistant message content.
 * Supports models like Gemini Flash Image, Flux, and other image-capable models.
 *
 * Includes:
 * - Automatic retry (1 retry with 2s delay) for transient failures
 * - Robust response parsing covering all known OpenRouter image response formats
 * - Clear error logging for debugging
 */

import { resolveProviderCall, type ResolvedProviderCall } from './provider-credentials'
import { getCurrentUserId } from './firestore-service'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_REFERER = typeof window !== 'undefined' && window.location?.origin
  ? window.location.origin
  : 'https://lexio.web.app'

export const DEFAULT_IMAGE_MODEL = 'google/gemini-2.5-flash-preview:image-output'

/** Max retries for transient failures */
const MAX_RETRIES = 1
/** Delay between retries in ms */
const RETRY_DELAY_MS = 2000

function isLikelyOpenRouterKey(apiKey?: string): boolean {
  if (!apiKey) return false
  const key = apiKey.trim()
  if (!key) return false
  return /^sk-or-v1-/i.test(key) || /^or-v1-/i.test(key) || /^sk-or-/i.test(key)
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface ImageGenerationOptions {
  apiKey?: string
  uid?: string
  prompt: string
  negativePrompt?: string
  model?: string
  aspectRatio?: string   // '16:9', '1:1', '9:16', etc.
  signal?: AbortSignal
}

export interface ImageGenerationResult {
  imageDataUrl: string   // base64 data URL (data:image/png;base64,...)
  model: string
  cost_usd: number
  provider_id?: string
  provider_label?: string
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

// ── Image Generation ────────────────────────────────────────────────────────

/**
 * Generate an image via OpenRouter's chat completions endpoint with modalities: ["image"].
 * Returns the image as a base64 data URL.
 * Retries once on transient failures (network errors, 429, 500+).
 */
async function generateImageWithOpenRouter(opts: ImageGenerationOptions & { apiKey: string; baseUrl?: string; model: string; providerId?: string; providerLabel?: string }): Promise<ImageGenerationResult> {
  const model = opts.model || DEFAULT_IMAGE_MODEL
  const endpoint = opts.baseUrl
    ? `${opts.baseUrl.replace(/\/+$/, '')}/api/v1/chat/completions`
    : OPENROUTER_URL

  const promptText = opts.negativePrompt
    ? `${opts.prompt}\n\nAvoid: ${opts.negativePrompt}`
    : opts.prompt

  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'user',
        content: promptText,
      },
    ],
    modalities: ['image'],
  }

  // Add image_config if aspect ratio is specified
  if (opts.aspectRatio) {
    body.image_config = {
      aspect_ratio: opts.aspectRatio,
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': OPENROUTER_REFERER,
    'X-Title': 'Lexio Video Studio',
  }

  const bodyStr = JSON.stringify(body)
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (opts.signal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }
    if (attempt > 0) {
      console.log(`[ImageGen] Retry attempt ${attempt} for model ${model}...`)
      await sleepWithSignal(RETRY_DELAY_MS, opts.signal)
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: opts.signal,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        const status = response.status

        // Retry on transient errors (429 rate limit, 500+ server errors)
        if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
          console.warn(`[ImageGen] Transient error ${status}, will retry: ${errorText.slice(0, 200)}`)
          lastError = new Error(`Image generation API error (${status}): ${errorText}`)
          continue
        }

        throw new Error(`Image generation API error (${status}): ${errorText}`)
      }

      const data = await response.json()

      // Extract image from response
      const imageDataUrl = extractImageFromResponse(data)
      if (!imageDataUrl) {
        // Log the raw response structure for debugging
        const responseShape = describeResponseShape(data)
        const errMsg = `Image generation returned no image data. Model: ${model}. Response structure: ${responseShape}`
        console.error(`[ImageGen] ${errMsg}`)

        // If first attempt, retry in case of transient empty response
        if (attempt < MAX_RETRIES) {
          lastError = new Error(errMsg)
          continue
        }

        throw new Error(errMsg)
      }

      // Validate the data URL
      const validatedUrl = validateImageDataUrl(imageDataUrl)

      // Extract cost from usage metadata
      const usage = data.usage || {}
      const costUsd = usage.total_cost ?? estimateCost(model, usage)

      console.log(`[ImageGen] Successfully generated image with ${model} (cost: $${costUsd})`)

      return {
        imageDataUrl: validatedUrl,
        model,
        cost_usd: costUsd,
        provider_id: opts.providerId ?? 'openrouter',
        provider_label: opts.providerLabel ?? 'OpenRouter',
      }
    } catch (err) {
      lastError = err as Error

      // Retry on network errors
      if (err instanceof TypeError && attempt < MAX_RETRIES) {
        console.warn(`[ImageGen] Network error, will retry: ${(err as Error).message}`)
        continue
      }

      // Don't retry on other errors
      if (attempt >= MAX_RETRIES) break
      throw err
    }
  }

  throw lastError || new Error('Image generation failed after retries')
}

function mapAspectRatioToSize(aspectRatio?: string): string | undefined {
  if (!aspectRatio) return undefined
  if (aspectRatio === '16:9') return '1536x1024'
  if (aspectRatio === '9:16') return '1024x1536'
  if (aspectRatio === '1:1') return '1024x1024'
  if (aspectRatio === '4:3') return '1365x1024'
  if (aspectRatio === '3:4') return '1024x1365'
  return undefined
}

async function generateImageWithOpenAICompatible(
  opts: ImageGenerationOptions & {
    model: string
    apiKey: string
    baseUrl: string
    providerId: string
    providerLabel: string
    authHeader?: string
    authPrefix?: string
  },
): Promise<ImageGenerationResult> {
  const promptText = opts.negativePrompt
    ? `${opts.prompt}\n\nAvoid: ${opts.negativePrompt}`
    : opts.prompt

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.authHeader) {
    headers[opts.authHeader] = `${opts.authPrefix ?? ''}${opts.apiKey}`
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    prompt: promptText,
    response_format: 'b64_json',
  }
  const size = mapAspectRatioToSize(opts.aspectRatio)
  if (size) body.size = size

  const url = `${opts.baseUrl.replace(/\/+$/, '')}/images/generations`
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Image generation API error (${response.status}): ${errorText}`)
  }

  const data = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string }>
    usage?: { total_cost?: number }
  }
  const first = data.data?.[0]
  const imageDataUrl = first?.b64_json
    ? `data:image/png;base64,${first.b64_json}`
    : (first?.url ?? null)

  if (!imageDataUrl) {
    throw new Error(`Image generation returned no image data for ${opts.providerLabel}.`)
  }

  return {
    imageDataUrl: validateImageDataUrl(imageDataUrl),
    model: opts.model,
    cost_usd: data.usage?.total_cost ?? estimateCost(opts.model, data.usage ?? {}),
    provider_id: opts.providerId,
    provider_label: opts.providerLabel,
  }
}

export async function generateImage(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const model = opts.model || DEFAULT_IMAGE_MODEL
  const uid = opts.uid ?? getCurrentUserId() ?? undefined
  let resolved: ResolvedProviderCall
  try {
    resolved = await resolveProviderCall(model, uid)
  } catch (error) {
    if (!isLikelyOpenRouterKey(opts.apiKey)) throw error
    return generateImageWithOpenRouter({
      ...opts,
      apiKey: opts.apiKey as string,
      model,
      providerId: 'openrouter',
      providerLabel: 'OpenRouter',
    })
  }

  if (resolved.provider.dialect === 'openrouter') {
    const openrouterOverride = opts.apiKey && (/^sk-or-v1-/i.test(opts.apiKey) || /^or-v1-/i.test(opts.apiKey) || /^sk-or-/i.test(opts.apiKey))
      ? opts.apiKey
      : resolved.apiKey
    return generateImageWithOpenRouter({
      ...opts,
      apiKey: openrouterOverride,
      model,
      baseUrl: resolved.baseUrl,
      providerId: resolved.provider.id,
      providerLabel: resolved.provider.label,
    })
  }

  if (resolved.provider.dialect === 'openai-compatible' || resolved.provider.dialect === 'ollama') {
    return generateImageWithOpenAICompatible({
      ...opts,
      model,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      providerId: resolved.provider.id,
      providerLabel: resolved.provider.label,
      authHeader: resolved.provider.authHeader,
      authPrefix: resolved.provider.authPrefix,
    })
  }

  throw new Error(`O provedor "${resolved.provider.label}" não suporta geração de imagens neste fluxo.`)
}

// Backwards-compatible export kept for existing callsites.
export async function generateImageViaOpenRouter(opts: ImageGenerationOptions): Promise<ImageGenerationResult> {
  return generateImage(opts)
}

/**
 * Extract image data URL from OpenRouter response.
 * Handles ALL known response formats from OpenRouter image generation:
 *
 * Format A: content is array with type="image_url" parts (Gemini, GPT)
 * Format B: content is array with type="image" and b64_json (Flux, DALL-E)
 * Format C: content is array with type="inline_data" (some Gemini variants)
 * Format D: content is string containing a data URL
 * Format E: content is string containing raw base64 (no prefix)
 * Format F: message.images array (legacy format)
 * Format G: content array with text parts containing base64 data URLs
 */
function extractImageFromResponse(data: Record<string, unknown>): string | null {
  try {
    const choices = data.choices as Array<Record<string, unknown>> | undefined
    if (!choices?.length) {
      console.warn('[ImageGen] Response has no choices')
      return null
    }

    const message = choices[0].message as Record<string, unknown> | undefined
    if (!message) {
      console.warn('[ImageGen] First choice has no message')
      return null
    }

    const content = message.content

    // ── Format A/B/C/G: content is an array of parts ──
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== 'object') continue

        // Format A: { type: "image_url", image_url: { url: "data:image/..." } }
        if (part.type === 'image_url') {
          const imgUrl = part.image_url
          if (imgUrl && typeof imgUrl === 'object' && imgUrl.url) {
            return imgUrl.url as string
          }
        }

        // Format B-1: { type: "image", image_url: { url: "data:image/..." } }
        if (part.type === 'image') {
          if (part.image_url && typeof part.image_url === 'object' && part.image_url.url) {
            return part.image_url.url as string
          }
          // Also check for direct b64_json
          if (part.b64_json) {
            const mime = part.mime_type || 'image/png'
            return `data:${mime};base64,${part.b64_json}`
          }
        }

        // Format C: { type: "inline_data", data: "base64...", mime_type: "image/png" }
        if (part.type === 'inline_data' && part.data) {
          const mime = part.mime_type || 'image/png'
          return `data:${mime};base64,${part.data}`
        }

        // Format G: { type: "text", text: "data:image/png;base64,..." }
        if (part.type === 'text' && typeof part.text === 'string') {
          const text = part.text.trim()
          if (text.startsWith('data:image')) {
            return text
          }
          // Check if it's raw base64 (long string with no spaces)
          if (text.length > 100 && !text.includes(' ') && /^[A-Za-z0-9+/=]+$/.test(text.slice(0, 50))) {
            return `data:image/png;base64,${text}`
          }
        }

        // Direct URL in any part
        if (typeof part.url === 'string' && part.url.startsWith('data:image')) {
          return part.url
        }
      }
    }

    // ── Format D: content is a string containing a data URL ──
    if (typeof content === 'string') {
      const trimmed = content.trim()
      if (trimmed.startsWith('data:image')) {
        return trimmed
      }
      // Format E: raw base64 string (no prefix)
      if (trimmed.length > 100 && !trimmed.includes(' ') && /^[A-Za-z0-9+/=]+$/.test(trimmed.slice(0, 50))) {
        return `data:image/png;base64,${trimmed}`
      }
    }

    // ── Format F: images array in message ──
    const images = message.images as Array<Record<string, unknown>> | undefined
    if (images?.length) {
      for (const img of images) {
        // { image_url: { url: "data:..." } }
        if (img.image_url && typeof img.image_url === 'object') {
          const urlObj = img.image_url as Record<string, unknown>
          if (typeof urlObj.url === 'string') return urlObj.url
        }
        // Direct url
        if (typeof img.url === 'string') return img.url
        // b64_json
        if (typeof img.b64_json === 'string') {
          return `data:image/png;base64,${img.b64_json}`
        }
      }
    }

    console.warn('[ImageGen] No image found in any known format')
    return null
  } catch (err) {
    console.error('[ImageGen] Error extracting image from response:', err)
    return null
  }
}

/**
 * Validate and normalize an image data URL.
 * Ensures it has the proper data:image prefix.
 */
function validateImageDataUrl(url: string): string {
  if (url.startsWith('data:image')) return url

  // If it looks like raw base64, add the prefix
  if (url.length > 50 && /^[A-Za-z0-9+/=]/.test(url[0])) {
    return `data:image/png;base64,${url}`
  }

  // If it's an https URL (some models return hosted URLs), keep as-is
  if (url.startsWith('https://')) return url

  console.warn(`[ImageGen] Unexpected image URL format (length=${url.length}): ${url.slice(0, 80)}...`)
  return url
}

/**
 * Describe the shape of the API response for debugging.
 */
function describeResponseShape(data: Record<string, unknown>): string {
  try {
    const choices = data.choices as Array<Record<string, unknown>> | undefined
    if (!choices?.length) return 'no choices'

    const msg = choices[0].message as Record<string, unknown> | undefined
    if (!msg) return 'no message in first choice'

    const content = msg.content
    if (content === null || content === undefined) return 'content is null/undefined'
    if (typeof content === 'string') return `content is string (length=${content.length}, starts="${content.slice(0, 50)}")`
    if (Array.isArray(content)) {
      const types = content.map((p: Record<string, unknown>) => p?.type || 'unknown').join(', ')
      return `content is array[${content.length}] types=[${types}]`
    }
    return `content is ${typeof content}`
  } catch {
    return 'unable to describe'
  }
}

/**
 * Rough cost estimation when usage metadata is not available.
 */
function estimateCost(model: string, _usage: Record<string, unknown>): number {
  if (model.includes(':free')) return 0
  if (model.includes('gemini') && model.includes('flash')) return 0.002
  if (model.includes('flux')) return 0.03
  return 0.01
}

// ── Helper: convert Blob to data URL ────────────────────────────────────────

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── Available image models ──────────────────────────────────────────────────

export const IMAGE_MODELS = [
  { id: 'google/gemini-2.5-flash-preview:image-output', label: 'Gemini Flash Image', description: 'Rápido e barato, boa qualidade', tier: 'balanced' as const },
  { id: 'black-forest-labs/flux-1.1-pro', label: 'Flux 1.1 Pro', description: 'Qualidade premium, fotorrealista', tier: 'premium' as const },
  { id: 'black-forest-labs/flux-schnell', label: 'Flux Schnell', description: 'Rápido, qualidade boa', tier: 'fast' as const },
] as const
