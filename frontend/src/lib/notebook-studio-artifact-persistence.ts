import { createUsageExecutionRecord, type UsageFunctionKey } from './cost-analytics'
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

export async function materializeStudioArtifactForNotebook({
  uid,
  notebookId,
  artifact,
}: MaterializeStudioArtifactForNotebookInput): Promise<StudioArtifact> {
  const withAudio = await maybeAutoSynthesizeAudioScript(artifact, uid, notebookId)
  const materializedArtifact = await materializeStudioArtifactExports(withAudio, { userId: uid, notebookId })
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

  const materializedArtifact = await materializeStudioArtifactForNotebook({ uid, notebookId, artifact })
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
    llm_executions: [...(notebook.llm_executions ?? []), ...newExecutions],
  })

  return { artifact: materializedArtifact, executionCount: newExecutions.length }
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

  const withAudio = await maybeAutoSynthesizeAudioScript(existingArtifact, uid, notebookId)
  const materializedArtifact = await materializeStudioArtifactExports(withAudio, { userId: uid, notebookId })
  const updatedArtifacts = sanitizePresentationV2ArtifactsForFirestore((notebook.artifacts ?? []).map(candidate => (
    candidate.id === artifactId ? materializedArtifact : candidate
  )))
  const storedArtifact = updatedArtifacts.find(candidate => candidate.id === artifactId) ?? materializedArtifact

  await updateResearchNotebook(uid, notebookId, { artifacts: updatedArtifacts })

  return { artifact: storedArtifact, artifacts: updatedArtifacts }
}