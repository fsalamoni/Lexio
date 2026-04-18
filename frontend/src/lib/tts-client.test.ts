import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENROUTER_TTS_MODEL, generateTTSViaOpenRouter } from './tts-client'

function createTtsStreamResponse() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: 'QUJD' } } }] })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('tts-client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the aligned default TTS model when none is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      expect(body.model).toBe(DEFAULT_OPENROUTER_TTS_MODEL)
      return createTtsStreamResponse()
    })

    const result = await generateTTSViaOpenRouter({ apiKey: 'sk-or-test', text: 'Olá mundo em áudio.' })

    expect(result.audioBlob.type).toBe('audio/mpeg')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves an explicitly configured TTS model override', async () => {
    const explicitModel = 'openai/tts-1'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      expect(body.model).toBe(explicitModel)
      return createTtsStreamResponse()
    })

    const result = await generateTTSViaOpenRouter({
      apiKey: 'sk-or-test',
      text: 'Teste curto de voz.',
      model: explicitModel,
    })

    expect(result.audioBlob.type).toBe('audio/mpeg')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})