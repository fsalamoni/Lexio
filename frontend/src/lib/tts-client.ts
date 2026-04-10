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

// ── Types ───────────────────────────────────────────────────────────────────

export interface TTSOptions {
  apiKey: string
  text: string
  voice?: string        // e.g., 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
  model?: string        // e.g., 'openai/gpt-4o-audio-preview'
  speed?: number        // 0.25 to 4.0
  signal?: AbortSignal
}

export interface TTSResult {
  audioBlob: Blob
  durationEstimate?: number  // seconds (estimated)
}

// ── OpenRouter TTS ──────────────────────────────────────────────────────────

export const DEFAULT_OPENROUTER_TTS_MODEL = 'openai/gpt-4o-audio-preview'

function normalizeTTSModel(model?: string): string {
  const value = String(model || '').trim()
  if (!value) return DEFAULT_OPENROUTER_TTS_MODEL
  if (/^openai\/tts-1(?:-hd)?$/i.test(value)) return DEFAULT_OPENROUTER_TTS_MODEL
  return value
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
export async function generateTTSViaOpenRouter(opts: TTSOptions): Promise<TTSResult> {
  const model = normalizeTTSModel(opts.model)
  const voice = opts.voice || 'nova'
  const speed = opts.speed || 1.0

  const response = await withRateLimit(
    'openrouter:tts',
    18,
    async () => withRetryAfterDelay(
      async () => fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${opts.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
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

  return { audioBlob, durationEstimate }
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
  { id: DEFAULT_OPENROUTER_TTS_MODEL, label: 'GPT-4o Audio Preview', description: 'Saída de áudio via chat completions streaming' },
] as const
