import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { maybeAutoGenerateVideoFromScript } from './notebook-studio-artifact-persistence'
import { clearRuntimeFeatureFlags, setRuntimeFeatureFlags } from './feature-flags'
import type { UsageExecutionRecord } from './cost-analytics'
import type { StudioArtifact } from './firestore-types'

// ── Mocks ───────────────────────────────────────────────────────────────────

const isExternalVideoProviderConfiguredMock = vi.fn()
const requestExternalVideoClipMock = vi.fn()
const requestFalVideoClipMock = vi.fn()
const uploadNotebookVideoArtifactMock = vi.fn()
const loadVideoPipelineModelsMock = vi.fn()
const resolveProviderCallMock = vi.fn()

vi.mock('./external-video-provider', () => ({
  isExternalVideoProviderConfigured: () => isExternalVideoProviderConfiguredMock(),
  requestExternalVideoClip: (...args: unknown[]) => requestExternalVideoClipMock(...args),
  requestFalVideoClip: (...args: unknown[]) => requestFalVideoClipMock(...args),
  resolveFalVideoModelVariant: (model: string) => model, // identity for tests
}))

vi.mock('./notebook-media-storage', () => ({
  uploadNotebookVideoArtifact: (...args: unknown[]) => uploadNotebookVideoArtifactMock(...args),
}))

vi.mock('./model-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./model-config')>()),
  loadVideoPipelineModels: () => loadVideoPipelineModelsMock(),
}))

vi.mock('./provider-credentials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./provider-credentials')>()),
  resolveProviderCall: (...args: unknown[]) => resolveProviderCallMock(...args),
}))

function videoScript(extra: Record<string, unknown> = {}): StudioArtifact {
  return {
    id: 'art-1',
    type: 'video_script',
    title: 'Vídeo sobre responsabilidade civil',
    content: JSON.stringify({
      summary: 'Resumo do vídeo',
      scenes: [
        { description: 'Cena 1: abertura', narration: 'Olá' },
        { description: 'Cena 2: desenvolvimento', visual: 'gráfico' },
      ],
      ...extra,
    }),
    format: 'json',
    created_at: new Date().toISOString(),
  }
}

describe('maybeAutoGenerateVideoFromScript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearRuntimeFeatureFlags()
    isExternalVideoProviderConfiguredMock.mockReturnValue(true)
    requestExternalVideoClipMock.mockResolvedValue({ url: 'https://provider.example/clip.mp4', mimeType: 'video/mp4', provider: 'acme' })
    requestFalVideoClipMock.mockResolvedValue({ url: 'https://fal.example/clip.mp4', mimeType: 'video/mp4', provider: 'fal' })
    uploadNotebookVideoArtifactMock.mockResolvedValue({ url: 'https://storage.example/v.mp4', path: 'notebooks/n1/v.mp4' })
    // Default: no fal model configured → external (env) provider path.
    loadVideoPipelineModelsMock.mockResolvedValue({ video_clip_generator: '' })
    resolveProviderCallMock.mockRejectedValue(new Error('no key'))
    // fetch → ok blob (durable upload path)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'video/mp4' }) })))
  })
  afterEach(() => {
    clearRuntimeFeatureFlags()
    vi.unstubAllGlobals()
  })

  it('returns the artifact unchanged when the flag is off (default)', async () => {
    const art = videoScript()
    const result = await maybeAutoGenerateVideoFromScript(art, 'uid', 'n1')
    expect(result).toBe(art)
    expect(requestExternalVideoClipMock).not.toHaveBeenCalled()
  })

  it('renders + persists the MP4 and injects renderedVideoUrl when flag on and provider configured', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    const result = await maybeAutoGenerateVideoFromScript(videoScript(), 'uid', 'n1')

    expect(requestExternalVideoClipMock).toHaveBeenCalledOnce()
    const parsed = JSON.parse(result.content)
    expect(parsed.renderedVideoUrl).toBe('https://storage.example/v.mp4') // durable storage url
    expect(result.download_url).toBe('https://storage.example/v.mp4')
    expect(result.storage_path).toBe('notebooks/n1/v.mp4')
    expect(result.mime_type).toBe('video/mp4')
    expect(result.extension).toBe('.mp4')

    // prompt was built from title + scene text
    const prompt = requestExternalVideoClipMock.mock.calls[0][0].prompt as string
    expect(prompt).toContain('responsabilidade civil')
    expect(prompt).toContain('Cena 1')
  })

  it('uses fal.ai with the user key when video_clip_generator resolves to the fal provider (recommended path)', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    loadVideoPipelineModelsMock.mockResolvedValue({ video_clip_generator: 'fal-ai/veo3' })
    resolveProviderCallMock.mockResolvedValue({ provider: { id: 'fal' }, apiKey: 'fal-key', baseUrl: 'https://queue.fal.run' })
    const sink: UsageExecutionRecord[] = []
    const result = await maybeAutoGenerateVideoFromScript(videoScript(), 'uid', 'n1', sink)

    expect(requestFalVideoClipMock).toHaveBeenCalledOnce()
    expect(requestExternalVideoClipMock).not.toHaveBeenCalled() // fal short-circuits the env provider
    expect(JSON.parse(result.content).renderedVideoUrl).toBe('https://storage.example/v.mp4')
    expect(sink[0].provider_label).toBe('fal')
    expect(sink[0].model).toBe('fal-ai/veo3') // the configured video model is recorded
  })

  it('falls back to the env provider when the fal key is missing (resolveProviderCall throws)', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    loadVideoPipelineModelsMock.mockResolvedValue({ video_clip_generator: 'fal-ai/veo3' })
    resolveProviderCallMock.mockRejectedValue(new Error('Chave de API ausente'))
    const result = await maybeAutoGenerateVideoFromScript(videoScript(), 'uid', 'n1')
    expect(requestFalVideoClipMock).not.toHaveBeenCalled()
    expect(requestExternalVideoClipMock).toHaveBeenCalledOnce()
    expect(JSON.parse(result.content).renderedVideoUrl).toBe('https://storage.example/v.mp4')
  })

  it('captures the provider-reported cost into the usage record when present', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    requestExternalVideoClipMock.mockResolvedValue({ url: 'https://provider.example/clip.mp4', mimeType: 'video/mp4', provider: 'acme', costUsd: 0.42 })
    const sink: UsageExecutionRecord[] = []
    await maybeAutoGenerateVideoFromScript(videoScript(), 'uid', 'n1', sink)
    expect(sink[0].cost_usd).toBe(0.42)
  })

  it('is a no-op when neither fal nor the env provider is available', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    isExternalVideoProviderConfiguredMock.mockReturnValue(false)
    loadVideoPipelineModelsMock.mockResolvedValue({ video_clip_generator: '' })
    const art = videoScript()
    const result = await maybeAutoGenerateVideoFromScript(art, 'uid', 'n1')
    expect(result).toBe(art)
    expect(requestFalVideoClipMock).not.toHaveBeenCalled()
    expect(requestExternalVideoClipMock).not.toHaveBeenCalled()
  })

  it('emits a media_video_render usage record into the sink (for Usos e Custos / Admin)', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    const sink: UsageExecutionRecord[] = []
    await maybeAutoGenerateVideoFromScript(videoScript(), 'uid', 'n1', sink)
    expect(sink).toHaveLength(1)
    expect(sink[0].function_key).toBe('video_pipeline')
    expect(sink[0].function_label).toBe('Gerador de Vídeo')
    expect(sink[0].phase).toBe('media_video_render')
    expect(sink[0].agent_name).toBe('Gerador de Vídeo (Estúdio)')
    expect(sink[0].provider_label).toBe('acme')
    expect(sink[0].source_id).toBe('n1')
    expect(sink[0].cost_usd).toBe(0)
  })

  it('does not emit a usage record when the provider is unconfigured', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    isExternalVideoProviderConfiguredMock.mockReturnValue(false)
    const sink: UsageExecutionRecord[] = []
    await maybeAutoGenerateVideoFromScript(videoScript(), 'uid', 'n1', sink)
    expect(sink).toHaveLength(0)
  })

  it('keeps the provider URL when the durable upload fetch fails', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('CORS') }))
    const result = await maybeAutoGenerateVideoFromScript(videoScript(), 'uid', 'n1')
    const parsed = JSON.parse(result.content)
    expect(parsed.renderedVideoUrl).toBe('https://provider.example/clip.mp4')
    expect(uploadNotebookVideoArtifactMock).not.toHaveBeenCalled()
  })

  it('is a no-op when the provider is not configured (best-effort)', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    isExternalVideoProviderConfiguredMock.mockReturnValue(false)
    const art = videoScript()
    const result = await maybeAutoGenerateVideoFromScript(art, 'uid', 'n1')
    expect(result).toBe(art)
    expect(requestExternalVideoClipMock).not.toHaveBeenCalled()
  })

  it('skips when the script already has a renderedVideoUrl', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    const art = videoScript({ renderedVideoUrl: 'https://existing.example/v.mp4' })
    const result = await maybeAutoGenerateVideoFromScript(art, 'uid', 'n1')
    expect(result).toBe(art)
    expect(requestExternalVideoClipMock).not.toHaveBeenCalled()
  })

  it('only applies to video_script artifacts', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    const art = { ...videoScript(), type: 'resumo' as StudioArtifact['type'] }
    const result = await maybeAutoGenerateVideoFromScript(art, 'uid', 'n1')
    expect(result).toBe(art)
    expect(requestExternalVideoClipMock).not.toHaveBeenCalled()
  })

  it('returns unchanged when the provider yields no url', async () => {
    setRuntimeFeatureFlags({ FF_NOTEBOOK_STUDIO_VIDEO: true })
    requestExternalVideoClipMock.mockResolvedValue(null)
    const art = videoScript()
    const result = await maybeAutoGenerateVideoFromScript(art, 'uid', 'n1')
    expect(result).toBe(art)
  })
})
