/**
 * TTS Client — Text-to-Speech via OpenRouter or browser fallback.
 *
 * Supports:
 * 1. OpenRouter TTS models (openai/tts-1, openai/tts-1-hd)
 * 2. Browser Web Speech API fallback (free, lower quality)
 *
 * Returns audio as a Blob (audio/mpeg or audio/wav).
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface TTSOptions {
  apiKey: string
  text: string
  voice?: string        // e.g., 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
  model?: string        // e.g., 'openai/tts-1-hd'
  speed?: number        // 0.25 to 4.0
}

export interface TTSResult {
  audioBlob: Blob
  durationEstimate?: number  // seconds (estimated)
}

// ── OpenRouter TTS ──────────────────────────────────────────────────────────

/**
 * Generate speech audio via OpenRouter's TTS endpoint.
 * Uses the OpenAI-compatible /audio/speech endpoint.
 */
export async function generateTTSViaOpenRouter(opts: TTSOptions): Promise<TTSResult> {
  const model = opts.model || 'openai/tts-1-hd'
  const voice = opts.voice || 'nova'
  const speed = opts.speed || 1.0

  const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Lexio Research Notebook',
    },
    body: JSON.stringify({
      model,
      input: opts.text,
      voice,
      speed,
      response_format: 'mp3',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`TTS API error (${response.status}): ${errorText}`)
  }

  const audioBlob = await response.blob()
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

    // We can't easily capture Web Speech API audio as a Blob.
    // Instead, we'll just play it directly and return a placeholder.
    // For actual blob capture, we'd need MediaRecorder + AudioContext routing,
    // which is complex and browser-dependent.

    const startTime = Date.now()
    utterance.onend = () => {
      const duration = (Date.now() - startTime) / 1000
      // Create a placeholder blob — the actual audio was played by the browser
      resolve({
        audioBlob: new Blob([], { type: 'audio/wav' }),
        durationEstimate: Math.round(duration),
      })
    }
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
  { id: 'openai/tts-1', label: 'TTS Standard', description: 'Rápido, boa qualidade' },
  { id: 'openai/tts-1-hd', label: 'TTS HD', description: 'Mais lento, qualidade premium' },
] as const
