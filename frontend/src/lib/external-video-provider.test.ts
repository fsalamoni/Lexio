import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  checkExternalVideoProviderHealth,
  getExternalVideoProviderDiagnostics,
  requestExternalVideoClip,
  requestFalVideoClip,
  resolveFalVideoModelVariant,
} from './external-video-provider'

describe('external-video-provider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('reports warning when both new and legacy env keys are present', () => {
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER', 'replicate')
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT', 'https://provider.example/generate')
    vi.stubEnv('VITE_LITERAL_VIDEO_PROVIDER', 'legacy-provider')
    vi.stubEnv('VITE_LITERAL_VIDEO_ENDPOINT', 'https://legacy.example/generate')

    const diagnostics = getExternalVideoProviderDiagnostics()

    expect(diagnostics.provider).toBe('replicate')
    expect(diagnostics.usingExternalEnvKeys).toBe(true)
    expect(diagnostics.usingLegacyEnvKeys).toBe(true)
    expect(diagnostics.warnings.some(item => item.includes('simultaneamente'))).toBe(true)
  })

  it('returns immediate clip URL payload without polling', async () => {
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER', 'runway')
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT', 'https://provider.example/generate')

    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ url: 'https://cdn.example/clip.mp4', mime_type: 'video/mp4' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestExternalVideoClip({
      prompt: 'Cena noturna da cidade com chuva',
      durationSeconds: 8,
      sceneNumber: 1,
      partNumber: 1,
    })

    expect(result).not.toBeNull()
    expect(result?.url).toBe('https://cdn.example/clip.mp4')
    expect(result?.mimeType).toBe('video/mp4')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('polls async provider job until completed using Location fallback', async () => {
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER', 'pika')
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT', 'https://provider.example/generate')
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS', '1000')

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response(
        JSON.stringify({ status: 'queued', job_id: 'job-123' }),
        {
          status: 202,
          headers: {
            'Content-Type': 'application/json',
            Location: 'https://provider.example/status/job-123',
          },
        },
      ))
      .mockImplementationOnce(async () => new Response(
        JSON.stringify({ status: 'completed', output_url: 'https://cdn.example/job-123.mp4', mime_type: 'video/mp4' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ))

    vi.stubGlobal('fetch', fetchMock)

    const result = await requestExternalVideoClip({
      prompt: 'Animação com transição cinematográfica',
      durationSeconds: 6,
      sceneNumber: 2,
      partNumber: 1,
    })

    expect(result).not.toBeNull()
    expect(result?.url).toBe('https://cdn.example/job-123.mp4')
    expect(result?.jobId).toBe('job-123')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('polls full operation resource names without encoding path separators', async () => {
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER', 'google-veo')
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT', 'https://provider.example/v1beta/video:generate')
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER_STATUS_ENDPOINT', 'https://provider.example/v1beta/{jobId}')
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS', '1000')

    const operationName = 'projects/demo/locations/us-central1/operations/veo-123'
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response(
        JSON.stringify({ name: operationName, done: false }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        },
      ))
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(`https://provider.example/v1beta/${operationName}`)
        return new Response(
          JSON.stringify({
            name: operationName,
            done: true,
            response: {
              generatedVideos: [
                { video: { uri: 'https://cdn.example/veo-123.mp4' } },
              ],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      })

    vi.stubGlobal('fetch', fetchMock)

    const result = await requestExternalVideoClip({
      prompt: 'Sequência institucional cinematográfica',
      durationSeconds: 8,
      sceneNumber: 3,
      partNumber: 1,
    })

    expect(result).not.toBeNull()
    expect(result?.url).toBe('https://cdn.example/veo-123.mp4')
    expect(result?.jobId).toBe(operationName)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('maps known fal models between text-to-video and image-to-video routes', () => {
    expect(resolveFalVideoModelVariant('fal-ai/veo3', 'text')).toBe('fal-ai/veo3')
    expect(resolveFalVideoModelVariant('fal-ai/veo3', 'image')).toBe('fal-ai/veo3/image-to-video')
    expect(resolveFalVideoModelVariant('fal-ai/veo3/image-to-video', 'text')).toBe('fal-ai/veo3')
    expect(resolveFalVideoModelVariant('fal-ai/kling-video/v2.5-turbo/pro/text-to-video', 'image'))
      .toBe('fal-ai/kling-video/v2.5-turbo/pro/image-to-video')
    expect(resolveFalVideoModelVariant('fal-ai/wan/v2.2-a14b/text-to-video', 'image'))
      .toBe('fal-ai/wan/v2.2-a14b/image-to-video')
    expect(resolveFalVideoModelVariant('fal-ai/minimax/hailuo-02/standard/text-to-video', 'image'))
      .toBe('fal-ai/minimax/hailuo-02/standard/image-to-video')
  })

  it('applies a suffix heuristic for uncatalogued fal model ids', () => {
    expect(resolveFalVideoModelVariant('fal-ai/custom-model', 'text')).toBe('fal-ai/custom-model')
    expect(resolveFalVideoModelVariant('fal-ai/custom-model', 'image')).toBe('fal-ai/custom-model/image-to-video')
    expect(resolveFalVideoModelVariant('fal-ai/custom/text-to-video', 'image')).toBe('fal-ai/custom/image-to-video')
    expect(resolveFalVideoModelVariant('fal-ai/custom/image-to-video', 'text')).toBe('fal-ai/custom/text-to-video')
    expect(resolveFalVideoModelVariant('', 'image')).toBe('')
  })

  it('includes image_url in the fal request body for image-to-video chaining', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({ video: { url: 'https://fal.media/clip.mp4', content_type: 'video/mp4' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestFalVideoClip({
      apiKey: 'fal-key',
      baseUrl: 'https://queue.fal.run',
      model: 'fal-ai/veo3/image-to-video',
      prompt: 'Continua a cena do tribunal',
      imageUrl: 'data:image/jpeg;base64,AAA',
    })

    expect(result.url).toBe('https://fal.media/clip.mp4')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.image_url).toBe('data:image/jpeg;base64,AAA')
    expect(body.prompt).toBe('Continua a cena do tribunal')
  })

  it('omits image_url from the fal request body for text-to-video requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({ video: { url: 'https://fal.media/clip.mp4' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await requestFalVideoClip({
      apiKey: 'fal-key',
      baseUrl: 'https://queue.fal.run',
      model: 'fal-ai/veo3',
      prompt: 'Abertura da cena',
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.image_url).toBeUndefined()
  })

  it('health check marks auth failure as actionable warning', async () => {
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER', 'kling')
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER_ENDPOINT', 'https://provider.example/generate')
    vi.stubEnv('VITE_EXTERNAL_VIDEO_PROVIDER_API_KEY', 'bad-key')

    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkExternalVideoProviderHealth(2000)

    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(401)
    expect(result.message.toLowerCase()).toContain('autenticação')
  })
})
