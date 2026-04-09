import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  checkExternalVideoProviderHealth,
  getExternalVideoProviderDiagnostics,
  requestExternalVideoClip,
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
