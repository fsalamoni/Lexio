/**
 * TTS Client — Text-to-Speech via OpenRouter or browser fallback.
 *
 * Supports:
 * 1. OpenRouter audio-output chat models
 * 2. Browser Web Speech API fallback (free, lower quality)
 *
 * Returns audio as a Blob (audio/mpeg or audio/wav).
 */

import { withRateLimit, withRetryAfterDelay } from './media-rate-limiter'
import { resolveProviderCall, type ResolvedProviderCall } from './provider-credentials'
import { getCurrentUserId } from './firestore-service'

const OPENROUTER_REFERER = typeof window !== 'undefined' && window.location?.origin
  ? window.location.origin
  : 'https://lexio.web.app'

// ── Types ───────────────────────────────────────────────────────────────────

export interface TTSOptions {
  apiKey?: string
  uid?: string
  text: string
  voice?: string        // e.g., 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
  model?: string        // e.g., 'openai/tts-1-hd'
  speed?: number        // 0.25 to 4.0
  signal?: AbortSignal
}

export interface TTSResult {
  audioBlob: Blob
  durationEstimate?: number  // seconds (estimated)
  model?: string
  provider_id?: string
  provider_label?: string
}

// ── OpenRouter TTS ──────────────────────────────────────────────────────────

export const DEFAULT_OPENROUTER_TTS_MODEL = 'openai/tts-1-hd'

function normalizeTTSModel(model?: string): string {
  const value = String(model || '').trim()
  if (!value) return DEFAULT_OPENROUTER_TTS_MODEL
  return value
}

function isLikelyOpenRouterKey(apiKey?: string): boolean {
  if (!apiKey) return false
  const key = apiKey.trim()
  if (!key) return false
  return /^sk-or-v1-/i.test(key) || /^or-v1-/i.test(key) || /^sk-or-/i.test(key)
}

function decodeBase64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Generate speech audio via OpenRouter chat completions audio output.
 * OpenRouter exposes audio generation through streamed chat completions.
 */
async function generateTTSWithOpenRouter(opts: TTSOptions & { apiKey: string; model: string; baseUrl?: string; providerId?: string; providerLabel?: string }): Promise<TTSResult> {
  const model = normalizeTTSModel(opts.model)
  const voice = opts.voice || 'nova'
  const speed = opts.speed || 1.0
  const endpoint = opts.baseUrl
    ? `${opts.baseUrl.replace(/\/+$/, '')}/api/v1/chat/completions`
    : 'https://openrouter.ai/api/v1/chat/completions'

  const response = await withRateLimit(
    `${opts.providerId ?? 'openrouter'}:tts`,
    18,
    async () => withRetryAfterDelay(
      async () => fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': OPENROUTER_REFERER,
          'X-Title': 'Lexio Research Notebook',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: opts.text,
            },
          ],
          modalities: ['text', 'audio'],
          audio: {
            voice,
            format: 'mp3',
          },
          speed,
          stream: true,
        }),
        signal: opts.signal,
      }).then(async resp => {
        if (resp.status === 429) {
          throw new Error('RATE_LIMIT_429')
        }
        return resp
      }),
      { signal: opts.signal },
    ),
    opts.signal,
  )

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`TTS API error (${response.status}): ${errorText}`)
  }

  if (!response.body) {
    throw new Error('TTS API error: resposta sem stream de áudio')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const audioChunks: string[] = []

  while (true) {
    if (opts.signal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            delta?: {
              audio?: {
                data?: string
              }
            }
          }>
        }
        const audioData = chunk.choices?.[0]?.delta?.audio?.data
        if (audioData) audioChunks.push(audioData)
      } catch {
        // Ignore non-JSON keepalive/control frames.
      }
    }
  }

  if (audioChunks.length === 0) {
    throw new Error('TTS API error: stream concluído sem áudio')
  }

  const merged = audioChunks.join('')
  const audioBytes = decodeBase64ToUint8Array(merged)
  const audioBuffer = new ArrayBuffer(audioBytes.byteLength)
  new Uint8Array(audioBuffer).set(audioBytes)
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
  // Rough estimate: ~150 words per minute at 1x speed
  const wordCount = opts.text.split(/\s+/).length
  const durationEstimate = Math.round((wordCount / 150) * 60 / speed)

  return {
    audioBlob,
    durationEstimate,
    model,
    provider_id: opts.providerId ?? 'openrouter',
    provider_label: opts.providerLabel ?? 'OpenRouter',
  }
}

async function generateTTSWithOpenAICompatible(opts: TTSOptions & {
  apiKey: string
  model: string
  baseUrl: string
  providerId: string
  providerLabel: string
  authHeader?: string
  authPrefix?: string
}): Promise<TTSResult> {
  const voice = opts.voice || 'nova'
  const speed = opts.speed || 1.0
  const endpoint = `${opts.baseUrl.replace(/\/+$/, '')}/audio/speech`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.authHeader) {
    headers[opts.authHeader] = `${opts.authPrefix ?? ''}${opts.apiKey}`
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      input: opts.text,
      voice,
      speed,
      format: 'mp3',
      response_format: 'mp3',
    }),
    signal: opts.signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`TTS API error (${response.status}): ${errorText}`)
  }

  const audioBlob = await response.blob()
  const wordCount = opts.text.split(/\s+/).length
  const durationEstimate = Math.round((wordCount / 150) * 60 / speed)
  return {
    audioBlob,
    durationEstimate,
    model: opts.model,
    provider_id: opts.providerId,
    provider_label: opts.providerLabel,
  }
}

async function generateTTSWithElevenLabs(opts: TTSOptions & {
  apiKey: string
  model: string
  baseUrl: string
  providerId: string
  providerLabel: string
}): Promise<TTSResult> {
  const voiceId = opts.voice || 'EXAVITQu4vr4xnSDxMaL'
  const endpoint = `${opts.baseUrl.replace(/\/+$/, '')}/text-to-speech/${voiceId}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': opts.apiKey,
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: opts.model,
    }),
    signal: opts.signal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`TTS API error (${response.status}): ${errorText}`)
  }

  const audioBlob = await response.blob()
  const wordCount = opts.text.split(/\s+/).length
  const durationEstimate = Math.round((wordCount / 150) * 60)
  return {
    audioBlob,
    durationEstimate,
    model: opts.model,
    provider_id: opts.providerId,
    provider_label: opts.providerLabel,
  }
}

export async function generateTTS(opts: TTSOptions): Promise<TTSResult> {
  const model = normalizeTTSModel(opts.model)
  const uid = opts.uid ?? getCurrentUserId() ?? undefined
  let resolved: ResolvedProviderCall
  try {
    resolved = await resolveProviderCall(model, uid)
  } catch (error) {
    // Legacy compatibility: if caller passed an explicit key, preserve the
    // historical OpenRouter-only path instead of hard failing.
    if (!isLikelyOpenRouterKey(opts.apiKey)) throw error
    return generateTTSWithOpenRouter({
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
    return generateTTSWithOpenRouter({
      ...opts,
      apiKey: openrouterOverride,
      model,
      baseUrl: resolved.baseUrl,
      providerId: resolved.provider.id,
      providerLabel: resolved.provider.label,
    })
  }

  if (resolved.provider.id === 'elevenlabs') {
    return generateTTSWithElevenLabs({
      ...opts,
      apiKey: resolved.apiKey,
      model,
      baseUrl: resolved.baseUrl,
      providerId: resolved.provider.id,
      providerLabel: resolved.provider.label,
    })
  }

  if (resolved.provider.dialect === 'openai-compatible' || resolved.provider.dialect === 'ollama') {
    return generateTTSWithOpenAICompatible({
      ...opts,
      apiKey: resolved.apiKey,
      model,
      baseUrl: resolved.baseUrl,
      providerId: resolved.provider.id,
      providerLabel: resolved.provider.label,
      authHeader: resolved.provider.authHeader,
      authPrefix: resolved.provider.authPrefix,
    })
  }

  throw new Error(`O provedor "${resolved.provider.label}" não suporta TTS neste fluxo.`)
}

// Backwards-compatible export kept for existing callsites.
export async function generateTTSViaOpenRouter(opts: TTSOptions): Promise<TTSResult> {
  return generateTTS(opts)
}

// ── Browser Web Speech API fallback ─────────────────────────────────────────

/**
 * Generate speech using the browser's built-in Web Speech API.
 * Records to an AudioContext → WAV blob.
 * Falls back silently if speechSynthesis is not available.
 */
export async function generateTTSViaBrowser(text: string, lang = 'pt-BR'): Promise<TTSResult | null> {
  if (!('speechSynthesis' in window)) return null

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 1.0

    // Try to find a PT-BR voice
    const voices = speechSynthesis.getVoices()
    const ptVoice = voices.find(v => v.lang.startsWith('pt')) || voices[0]
    if (ptVoice) utterance.voice = ptVoice

    // We can't reliably capture Web Speech API output as a file/Blob.
    // Play the speech for accessibility/fallback UX and return null to avoid
    // falsely signaling that a real audio asset was generated.

    utterance.onend = () => resolve(null)
    utterance.onerror = () => resolve(null)

    speechSynthesis.speak(utterance)
  })
}

// ── Convenience: play directly via browser TTS ──────────────────────────────

export function speakText(text: string, lang = 'pt-BR'): void {
  if (!('speechSynthesis' in window)) return

  // Cancel any ongoing speech
  speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = 1.0

  const voices = speechSynthesis.getVoices()
  const ptVoice = voices.find(v => v.lang.startsWith('pt'))
  if (ptVoice) utterance.voice = ptVoice

  speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel()
  }
}

// ── Check TTS availability ──────────────────────────────────────────────────

export function isBrowserTTSAvailable(): boolean {
  return 'speechSynthesis' in window
}

export const TTS_VOICES = [
  { id: 'alloy', label: 'Alloy (neutra)' },
  { id: 'echo', label: 'Echo (masculina)' },
  { id: 'fable', label: 'Fable (britânica)' },
  { id: 'onyx', label: 'Onyx (grave)' },
  { id: 'nova', label: 'Nova (feminina)' },
  { id: 'shimmer', label: 'Shimmer (suave)' },
] as const

export const TTS_MODELS = [
  { id: DEFAULT_OPENROUTER_TTS_MODEL, label: 'OpenAI TTS HD', description: 'Síntese de voz premium com saída de áudio em streaming' },
  { id: 'openai/tts-1', label: 'OpenAI TTS Standard', description: 'Síntese de voz mais rápida e econômica' },
] as const
