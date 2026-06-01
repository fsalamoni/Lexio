import { createUsageExecutionRecord, type UsageExecutionRecord, type UsageFunctionKey } from './cost-analytics'
import { getResearchNotebook, updateResearchNotebook } from './firestore-service'
import type { StudioArtifact, StudioArtifactType } from './firestore-types'
import type { StudioStepExecution } from './notebook-studio-pipeline'
import { sanitizePresentationV2ArtifactsForFirestore } from './presentation-v2-persistence'
import { materializeStudioArtifactExports } from './chat-artifact-exporters'
import { isEnabled } from './feature-flags'

/**
 * Auto-synthesize the MP3 for an `audio_script` artifact (FF_NOTEBOOK_AUDIO_AUTO_TTS)
 * and persist it to storage, injecting `audioUrl` into the content so the viewer
 * plays it and the materializer/export buttons expose a real .mp3. Best-effort:
 * any failure returns the original artifact (the user can still synthesize
 * manually). Resolves the API key from the user so no call-site change is needed.
 */
async function maybeAutoSynthesizeAudioScript(
  artifact: StudioArtifact,
  uid: string,
  notebookId: string,
  executionSink?: UsageExecutionRecord[],
): Promise<StudioArtifact> {
  if (artifact.type !== 'audio_script' || !isEnabled('FF_NOTEBOOK_AUDIO_AUTO_TTS')) return artifact
  let parsed: Record<string, unknown>
  try {
    const value = JSON.parse(artifact.content) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return artifact
    parsed = value as Record<string, unknown>
  } catch {
    return artifact
  }
  if (typeof parsed.audioUrl === 'string' && parsed.audioUrl.trim()) return artifact // already has audio
  try {
    const startedAt = Date.now()
    const [{ getOpenRouterKey }, { synthesizeAudioFromScript }, { uploadNotebookMediaArtifact }] = await Promise.all([
      import('./generation-service'),
      import('./notebook-audio-pipeline'),
      import('./notebook-media-storage'),
    ])
    const apiKey = await getOpenRouterKey(uid)
    if (!apiKey) return artifact
    const result = await synthesizeAudioFromScript({ apiKey, rawScriptContent: artifact.content })
    if (!result.audioBlob) return artifact
    const stored = await uploadNotebookMediaArtifact(uid, notebookId, artifact.title || 'Áudio', result.audioBlob, 'audios', '.mp3')
    // Record a usage marker so the TTS render surfaces in Usos e Custos / Admin
    // (cost_usd unknown for media → 0, mirroring the chat's generate_video).
    executionSink?.push(createUsageExecutionRecord({
      source_type: 'audio_pipeline',
      source_id: notebookId,
      phase: 'media_tts_generation',
      agent_name: 'Narração TTS (Estúdio)',
      model: result.model || 'openai/tts-1-hd',
      provider_id: result.provider_id ?? null,
      provider_label: result.provider_label ?? null,
      cost_usd: 0,
      duration_ms: Date.now() - startedAt,
      execution_state: 'completed',
    }))
    return {
      ...artifact,
      content: JSON.stringify({ ...parsed, audioUrl: stored.url }),
      download_url: stored.url,
      storage_path: stored.path,
      mime_type: result.mimeType || 'audio/mpeg',
      extension: '.mp3',
    }
  } catch {
    return artifact
  }
}

/** Best-effort prompt from a video_script JSON: title + a few scenes' text. */
function buildVideoPromptFromScript(parsed: Record<string, unknown>, title: string): string {
  const parts: string[] = []
  if (title.trim()) parts.push(title.trim())
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : []
  for (const scene of scenes.slice(0, 6)) {
    if (scene && typeof scene === 'object') {
      for (const key of ['description', 'visual', 'visual_description', 'narration', 'text']) {
        const value = (scene as Record<string, unknown>)[key]
        if (typeof value === 'string' && value.trim()) parts.push(value.trim())
      }
    }
  }
  const prompt = parts.join('. ').slice(0, 1500)
  if (prompt) return prompt
  const summary = parsed.summary
  return typeof summary === 'string' && summary.trim() ? summary.trim().slice(0, 1500) : (title || 'Vídeo')
}

interface ResolvedVideoClip {
  url: string
  mimeType?: string
  provider: string
  /** Video model id used, when resolved from the pipeline config (fal path). */
  model?: string
  /** Provider-reported price, when available. */
  costUsd?: number
}

/**
 * Resolves a video clip for a prompt with full parity to the chat's
 * generate_video: (1) fal.ai with the user's own key — the recommended path,
 * using the model configured for the `video_clip_generator` agent of the video
 * pipeline; (2) the operator's external env provider. Returns `null` when
 * neither is available (best-effort). Mirrors the resolution used by the video
 * pipeline (`generateClipViaFal`) and the chat, without coupling to either.
 */
async function resolveNotebookVideoClip(prompt: string, uid: string): Promise<ResolvedVideoClip | null> {
  const {
    isExternalVideoProviderConfigured,
    requestExternalVideoClip,
    requestFalVideoClip,
    resolveFalVideoModelVariant,
  } = await import('./external-video-provider')

  // The clip model comes from the same agent the video pipeline uses, so the
  // user configures fal.ai in exactly one place (Pipeline de Vídeo → Gerador de
  // Clipes de Vídeo). Absent/failed config simply skips the fal path.
  let videoModel = ''
  try {
    const { loadVideoPipelineModels } = await import('./model-config')
    const models = await loadVideoPipelineModels()
    videoModel = (models.video_clip_generator || '').trim()
  } catch {
    videoModel = ''
  }

  // (1) fal.ai with the user's own key (recommended).
  if (videoModel) {
    try {
      const { resolveProviderCall } = await import('./provider-credentials')
      const resolved = await resolveProviderCall(videoModel, uid)
      if (resolved.provider.id === 'fal') {
        const clip = await requestFalVideoClip({
          apiKey: resolved.apiKey,
          baseUrl: resolved.baseUrl,
          model: resolveFalVideoModelVariant(videoModel, 'text'),
          prompt,
          aspectRatio: '16:9',
        })
        if (clip?.url) return { url: clip.url, mimeType: clip.mimeType, provider: clip.provider, model: videoModel, costUsd: clip.costUsd }
      }
    } catch {
      // Missing/disabled fal key or non-fal provider — fall back to env provider.
    }
  }

  // (2) Operator's external env provider.
  if (isExternalVideoProviderConfigured()) {
    const clip = await requestExternalVideoClip({ prompt, durationSeconds: 8, aspectRatio: '16:9', model: videoModel || undefined })
    if (clip?.url) return { url: clip.url, mimeType: clip.mimeType, provider: clip.provider, model: videoModel || undefined, costUsd: clip.costUsd }
  }

  return null
}

/**
 * Auto-render the MP4 for a `video_script` artifact (FF_NOTEBOOK_STUDIO_VIDEO),
 * persisting it and injecting `renderedVideoUrl` into the content so the viewer
 * plays it. Full parity with the chat's generate_video: fal.ai with the user's
 * own key (recommended) or the operator's external env provider. Best-effort:
 * any failure or no available provider returns the original artifact unchanged.
 *
 * Exported for direct unit testing of the wiring (the provider call itself is
 * mocked in tests and validated end-to-end by the operator's real provider).
 */
export async function maybeAutoGenerateVideoFromScript(
  artifact: StudioArtifact,
  uid: string,
  notebookId: string,
  executionSink?: UsageExecutionRecord[],
): Promise<StudioArtifact> {
  if (artifact.type !== 'video_script' || !isEnabled('FF_NOTEBOOK_STUDIO_VIDEO')) return artifact
  let parsed: Record<string, unknown>
  try {
    const value = JSON.parse(artifact.content) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return artifact
    parsed = value as Record<string, unknown>
  } catch {
    return artifact
  }
  if (typeof parsed.renderedVideoUrl === 'string' && parsed.renderedVideoUrl.trim()) return artifact // already rendered
  try {
    const startedAt = Date.now()
    const prompt = buildVideoPromptFromScript(parsed, artifact.title || '')
    const clip = await resolveNotebookVideoClip(prompt, uid)
    if (!clip?.url) return artifact // no provider available — best-effort

    // Persist to our Storage for a durable URL; keep the provider URL on failure.
    let videoUrl = clip.url
    let storagePath: string | undefined
    try {
      const response = await fetch(clip.url)
      if (response.ok) {
        const blob = await response.blob()
        const { uploadNotebookVideoArtifact } = await import('./notebook-media-storage')
        const stored = await uploadNotebookVideoArtifact(uid, notebookId, artifact.title || 'Vídeo', blob)
        if (stored.url) {
          videoUrl = stored.url
          storagePath = stored.path
        }
      }
    } catch {
      // Provider URL kept as-is — still a real, playable video.
    }

    // Record a usage marker so the video render surfaces in Usos e Custos /
    // Admin. cost_usd uses the provider-reported price when available, else 0
    // (mirroring the chat's generate_video for providers without pricing).
    executionSink?.push(createUsageExecutionRecord({
      source_type: 'video_pipeline',
      source_id: notebookId,
      phase: 'media_video_render',
      agent_name: 'Gerador de Vídeo (Estúdio)',
      model: clip.model || clip.provider || 'external-video-provider',
      provider_id: clip.provider ?? null,
      provider_label: clip.provider ?? null,
      cost_usd: clip.costUsd ?? 0,
      duration_ms: Date.now() - startedAt,
      execution_state: 'completed',
    }))
    return {
      ...artifact,
      content: JSON.stringify({ ...parsed, renderedVideoUrl: videoUrl }),
      download_url: videoUrl,
      ...(storagePath ? { storage_path: storagePath } : {}),
      mime_type: clip.mimeType || 'video/mp4',
      extension: '.mp4',
    }
  } catch {
    return artifact
  }
}

const ARTIFACT_COST_KEY: Partial<Record<StudioArtifactType, UsageFunctionKey>> = {
  video_script: 'video_pipeline',
  video_production: 'video_pipeline',
  audio_script: 'audio_pipeline',
  apresentacao: 'presentation_pipeline',
  apresentacao_v2: 'presentation_pipeline_v2',
}

export interface PersistStudioArtifactToNotebookInput {
  uid: string
  notebookId: string
  artifact: StudioArtifact
  executions: StudioStepExecution[]
}

export interface MaterializeExistingStudioArtifactExportsInput {
  uid: string
  notebookId: string
  artifactId: string
}

export interface MaterializeStudioArtifactForNotebookInput {
  uid: string
  notebookId: string
  artifact: StudioArtifact
}

export async function materializeStudioArtifactForNotebook(
  { uid, notebookId, artifact }: MaterializeStudioArtifactForNotebookInput,
  /** Optional sink: media auto-gen (TTS/video) pushes usage records here so the
   *  caller can persist them into the notebook's llm_executions. */
  mediaExecutionSink?: UsageExecutionRecord[],
): Promise<StudioArtifact> {
  const withAudio = await maybeAutoSynthesizeAudioScript(artifact, uid, notebookId, mediaExecutionSink)
  const withMedia = await maybeAutoGenerateVideoFromScript(withAudio, uid, notebookId, mediaExecutionSink)
  const materializedArtifact = await materializeStudioArtifactExports(withMedia, { userId: uid, notebookId })
  return sanitizePresentationV2ArtifactsForFirestore([materializedArtifact])[0] ?? materializedArtifact
}

export async function persistStudioArtifactToNotebook({
  uid,
  notebookId,
  artifact,
  executions,
}: PersistStudioArtifactToNotebookInput): Promise<{ artifact: StudioArtifact; executionCount: number }> {
  const notebook = await getResearchNotebook(uid, notebookId)
  if (!notebook) {
    throw new Error(`Caderno ${notebookId} não encontrado ou inacessível.`)
  }

  const mediaExecutions: UsageExecutionRecord[] = []
  const materializedArtifact = await materializeStudioArtifactForNotebook({ uid, notebookId, artifact }, mediaExecutions)
  const updatedArtifacts = sanitizePresentationV2ArtifactsForFirestore([...(notebook.artifacts ?? []), materializedArtifact])
  const costKey = ARTIFACT_COST_KEY[artifact.type] ?? 'caderno_pesquisa'
  const newExecutions = executions.map(execution => createUsageExecutionRecord({
    source_type: costKey,
    source_id: notebookId,
    phase: execution.phase,
    agent_name: execution.agent_name,
    model: execution.model,
    provider_id: execution.provider_id,
    provider_label: execution.provider_label,
    requested_model: execution.requested_model,
    resolved_model: execution.resolved_model,
    tokens_in: execution.tokens_in,
    tokens_out: execution.tokens_out,
    cost_usd: execution.cost_usd,
    duration_ms: execution.duration_ms,
    execution_state: execution.execution_state,
    retry_count: execution.retry_count,
    used_fallback: execution.used_fallback,
    fallback_from: execution.fallback_from,
  }))

  await updateResearchNotebook(uid, notebookId, {
    artifacts: updatedArtifacts,
    llm_executions: [...(notebook.llm_executions ?? []), ...newExecutions, ...mediaExecutions],
  })

  return { artifact: materializedArtifact, executionCount: newExecutions.length + mediaExecutions.length }
}

export async function materializeExistingStudioArtifactExports({
  uid,
  notebookId,
  artifactId,
}: MaterializeExistingStudioArtifactExportsInput): Promise<{ artifact: StudioArtifact; artifacts: StudioArtifact[] }> {
  const notebook = await getResearchNotebook(uid, notebookId)
  if (!notebook) {
    throw new Error(`Caderno ${notebookId} não encontrado ou inacessível.`)
  }

  const existingArtifact = (notebook.artifacts ?? []).find(candidate => candidate.id === artifactId)
  if (!existingArtifact) {
    throw new Error(`Artefato ${artifactId} não encontrado no caderno ${notebookId}.`)
  }

  const mediaExecutions: UsageExecutionRecord[] = []
  const withAudio = await maybeAutoSynthesizeAudioScript(existingArtifact, uid, notebookId, mediaExecutions)
  const withMedia = await maybeAutoGenerateVideoFromScript(withAudio, uid, notebookId, mediaExecutions)
  const materializedArtifact = await materializeStudioArtifactExports(withMedia, { userId: uid, notebookId })
  const updatedArtifacts = sanitizePresentationV2ArtifactsForFirestore((notebook.artifacts ?? []).map(candidate => (
    candidate.id === artifactId ? materializedArtifact : candidate
  )))
  const storedArtifact = updatedArtifacts.find(candidate => candidate.id === artifactId) ?? materializedArtifact

  await updateResearchNotebook(uid, notebookId, {
    artifacts: updatedArtifacts,
    ...(mediaExecutions.length ? { llm_executions: [...(notebook.llm_executions ?? []), ...mediaExecutions] } : {}),
  })

  return { artifact: storedArtifact, artifacts: updatedArtifacts }
}