import { createUsageExecutionRecord, type UsageFunctionKey } from './cost-analytics'
import { getResearchNotebook, updateResearchNotebook } from './firestore-service'
import type { StudioArtifact, StudioArtifactType } from './firestore-types'
import type { StudioStepExecution } from './notebook-studio-pipeline'
import { sanitizePresentationV2ArtifactsForFirestore } from './presentation-v2-persistence'

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

  const updatedArtifacts = sanitizePresentationV2ArtifactsForFirestore([...(notebook.artifacts ?? []), artifact])
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

  return { artifact, executionCount: newExecutions.length }
}