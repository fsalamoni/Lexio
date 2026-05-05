import { formatCostBadge } from './currency-utils'
import type { TaskInfo } from '../contexts/TaskManagerContext'
import type { AcervoAnalysisProgress } from './notebook-acervo-analyzer'
import type { StudioArtifactType } from './firestore-service'
import type { PipelineExecutionState } from './pipeline-execution-contract'
import type { VideoPipelineProgressState } from './video-pipeline-progress'
import { ACERVO_TRAIL_STEPS, STUDIO_SPECIALIST_LABEL } from '../pages/notebook'

export interface NotebookTrailStep {
  key: string
  label: string
  status: 'pending' | 'active' | 'completed' | 'error'
  executionState?: PipelineExecutionState
  detail?: string
  meta?: string
}

export interface AcervoProgressState extends AcervoAnalysisProgress {
  step: number
  totalSteps: number
  stageLabel: string
}

export interface NotebookModalProgressState {
  currentMessage: string
  percent: number
  isComplete: boolean
  hasError: boolean
  stageLabel?: string
  stageMeta?: string
}

export interface NotebookOperationalSummary {
  id: string
  kind: 'acervo' | 'studio' | 'video_pipeline' | 'video_literal'
  title: string
  subtitle: string
  progress: number
  stageLabel?: string
  stageMeta?: string
  etaLabel?: string
  aggregateLabel?: string
  detailLabel?: string
  degradationLabel?: string
  tone: 'amber' | 'violet' | 'rose' | 'sky'
}

export interface NotebookOperationalAggregate {
  totalCostUsd: number
  totalDurationMs: number
  totalRetryCount: number
  fallbackCount: number
  degradationReasons?: string[]
  phaseCounts?: Record<string, number>
}

function formatUsd(costUsd: number): string {
  return formatCostBadge(costUsd)
}

function formatProcessedDuration(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s processados`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m${seconds.toString().padStart(2, '0')}s processados`
}

function buildAggregateLabel(aggregate?: NotebookOperationalAggregate | null): string | undefined {
  if (!aggregate) return undefined
  const parts: string[] = []
  if (aggregate.totalCostUsd > 0) parts.push(formatUsd(aggregate.totalCostUsd))
  if (aggregate.totalRetryCount > 0) {
    parts.push(`${aggregate.totalRetryCount} ${aggregate.totalRetryCount === 1 ? 'retry' : 'retries'}`)
  }
  if (aggregate.fallbackCount > 0) {
    parts.push(`${aggregate.fallbackCount} ${aggregate.fallbackCount === 1 ? 'fallback' : 'fallbacks'}`)
  }
  const durationLabel = formatProcessedDuration(aggregate.totalDurationMs)
  if (durationLabel) parts.push(durationLabel)
  return parts.length > 0 ? `Acumulado: ${parts.join(' • ')}` : undefined
}

function buildDegradationLabel(aggregate?: NotebookOperationalAggregate | null): string | undefined {
  if (!aggregate?.degradationReasons || aggregate.degradationReasons.length === 0) return undefined
  const reasons = aggregate.degradationReasons.filter(Boolean)
  if (reasons.length === 0) return undefined
  const visibleReasons = reasons.slice(0, 2)
  const suffix = reasons.length > 2 ? ` +${reasons.length - 2}` : ''
  return `Degradações: ${visibleReasons.join(' • ')}${suffix}`
}

function buildOperationalDetailLabel(
  kind: NotebookOperationalSummary['kind'],
  aggregate?: NotebookOperationalAggregate | null,
): string | undefined {
  const phaseCounts = aggregate?.phaseCounts
  if (!phaseCounts) return undefined

  if (kind === 'video_pipeline' || kind === 'video_literal') {
    const parts: string[] = []
    const imageBatches = phaseCounts.media_image_generation ?? 0
    const narrations = phaseCounts.media_tts_generation ?? 0
    const clipBatches = phaseCounts.media_video_clip_generation ?? 0
    const localRenders = phaseCounts.media_video_render ?? 0
    const externalRenders = phaseCounts.external_video_render ?? 0
    const llmStages = Object.keys(phaseCounts).filter(key => !key.startsWith('media_') && key !== 'external_video_render').length

    if (llmStages > 0) parts.push(`${llmStages} agentes concluídos`)
    if (imageBatches > 0) parts.push(`${imageBatches} ${imageBatches === 1 ? 'lote de imagens' : 'lotes de imagem'}`)
    if (narrations > 0) parts.push(`${narrations} ${narrations === 1 ? 'narração' : 'narrações'}`)
    if (clipBatches > 0) parts.push(`${clipBatches} ${clipBatches === 1 ? 'lote de clipes' : 'lotes de clipe'}`)
    if (externalRenders > 0) {
      parts.push(`${externalRenders} ${externalRenders === 1 ? 'render externo' : 'renders externos'}`)
    } else if (localRenders > 0) {
      parts.push(`${localRenders} ${localRenders === 1 ? 'render local' : 'renders locais'}`)
    }

    return parts.length > 0 ? `Saída: ${parts.join(' • ')}` : undefined
  }

  if (kind === 'studio') {
    const reportedStages = Object.keys(phaseCounts).length
    return reportedStages > 0 ? `Pipeline: ${reportedStages} etapa${reportedStages === 1 ? '' : 's'} reportada${reportedStages === 1 ? '' : 's'}` : undefined
  }

  return undefined
}

function formatEta(ms: number): string | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s restantes`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m${seconds.toString().padStart(2, '0')}s restantes`
}

function estimateEta(startedAt: number | undefined, progress: number): string | undefined {
  if (!startedAt || progress <= 0 || progress >= 100) return undefined
  const elapsed = Date.now() - startedAt
  if (elapsed <= 0) return undefined
  const totalEstimate = elapsed / (progress / 100)
  return formatEta(totalEstimate - elapsed)
}

export function buildAcervoProgressState(progress: AcervoAnalysisProgress): AcervoProgressState {
  const totalSteps = ACERVO_TRAIL_STEPS.length
  const stepIndex = ACERVO_TRAIL_STEPS.findIndex(stage => stage.key === progress.phase)
  const step = stepIndex >= 0 ? stepIndex + 1 : 0

  return {
    ...progress,
    step,
    totalSteps,
    stageLabel: ACERVO_TRAIL_STEPS[stepIndex]?.label || progress.phase,
  }
}

export function buildAcervoTrailSteps(options: {
  phase: string
  message: string
  loading: boolean
  executionState?: PipelineExecutionState
  stageMeta?: string
  error?: string
}): NotebookTrailStep[] {
  const currentIndex = ACERVO_TRAIL_STEPS.findIndex(step => step.key === options.phase)
  const isConcluded = options.phase === 'concluido'
  const errorIndex = currentIndex >= 0 ? currentIndex : 0

  return ACERVO_TRAIL_STEPS.map((step, index) => {
    let status: NotebookTrailStep['status'] = 'pending'

    if (isConcluded) {
      status = 'completed'
    } else if (index < currentIndex) {
      status = 'completed'
    } else if (options.loading && index === currentIndex) {
      status = 'active'
    }

    if (options.error && index === errorIndex) {
      status = 'error'
    }

    const executionState = status === 'error'
      ? 'failed'
      : status === 'completed'
        ? 'completed'
        : status === 'active'
          ? (options.executionState ?? 'running')
          : 'queued'

    return {
      key: step.key,
      label: step.label,
      status,
      executionState,
      detail: status === 'active' ? options.message : undefined,
      meta: status === 'active'
        ? options.stageMeta || (currentIndex >= 0 ? `Etapa ${currentIndex + 1} de ${ACERVO_TRAIL_STEPS.length}` : undefined)
        : undefined,
    }
  })
}

export function buildAcervoModalProgressState(options: {
  phase: string
  message: string
  percent: number
  loading: boolean
  stageMeta?: string
  error?: string
}): NotebookModalProgressState {
  const progress = buildAcervoProgressState({
    phase: options.phase,
    message: options.message,
    percent: options.percent,
  })
  const isComplete = options.phase === 'concluido' && !options.error
  const hasError = Boolean(options.error)
  const activeMeta = progress.step > 0 ? `Etapa ${progress.step} de ${progress.totalSteps}` : undefined

  return {
    currentMessage: options.error || options.message || 'Preparando análise do acervo...',
    percent: progress.percent,
    isComplete,
    hasError,
    stageLabel: isComplete ? 'Análise concluída' : progress.stageLabel,
    stageMeta: hasError ? 'Execução interrompida' : options.stageMeta || activeMeta,
  }
}

export function buildStudioTrailSteps(task: TaskInfo | undefined, artifactType: StudioArtifactType | null): NotebookTrailStep[] {
  const specialistLabel = artifactType ? STUDIO_SPECIALIST_LABEL[artifactType] : 'Especialista'
  const steps = [
    { key: 'studio_pesquisador', label: 'Pesquisador do Estúdio' },
    { key: 'studio_specialist', label: specialistLabel },
    { key: 'studio_revisor', label: 'Revisor de Qualidade' },
  ]

  const progressStep = task?.currentStep ?? 0
  const errorIndex = progressStep > 0 ? Math.min(progressStep, steps.length) - 1 : 0
  const loading = task?.status === 'running'
  const studioErrorMessage = task?.status === 'error'
    ? (task.error || 'Erro no pipeline')
    : task?.status === 'cancelled'
      ? 'Execução cancelada pelo usuário.'
      : ''

  return steps.map((step, index) => {
    let status: NotebookTrailStep['status'] = 'pending'
    const oneBased = index + 1

    if (progressStep >= steps.length && !loading && !studioErrorMessage) {
      status = 'completed'
    } else if (oneBased < progressStep) {
      status = 'completed'
    } else if (loading && oneBased === progressStep) {
      status = 'active'
    }

    if (studioErrorMessage && index === errorIndex) {
      status = 'error'
    }

    const executionState = status === 'error'
      ? (task?.status === 'cancelled' ? 'cancelled' : 'failed')
      : status === 'completed'
        ? 'completed'
        : status === 'active'
          ? (task?.executionState ?? 'running')
          : 'queued'

    return {
      key: step.key,
      label: step.label,
      status,
      executionState,
      detail: status === 'active' ? (task?.phase || undefined) : undefined,
      meta: status === 'active'
        ? (task?.stageMeta || ((task?.totalSteps)
          ? `Etapa ${Math.max(1, Math.min(progressStep || 1, task.totalSteps))} de ${task.totalSteps}`
          : undefined))
        : ((status === 'completed' && task?.totalSteps)
          ? `Etapa ${Math.max(1, Math.min(progressStep || 1, task.totalSteps))} de ${task.totalSteps}`
          : undefined),
    }
  })
}

export function buildStudioModalProgressState(
  task: TaskInfo | undefined,
  artifactType: StudioArtifactType | null,
): NotebookModalProgressState {
  const progressStep = task?.currentStep ?? 0
  const totalSteps = task?.totalSteps ?? 0
  const specialistLabel = artifactType ? STUDIO_SPECIALIST_LABEL[artifactType] : 'Especialista'
  const labels = ['Pesquisador do Estúdio', specialistLabel, 'Revisor de Qualidade']
  const boundedIndex = Math.max(0, Math.min(progressStep - 1, labels.length - 1))
  const stageLabel = progressStep > 0 ? labels[boundedIndex] : 'Preparando trilha'
  const hasError = task?.status === 'error' || task?.status === 'cancelled'
  const isComplete = task?.status === 'completed'

  return {
    currentMessage: hasError
      ? (task?.status === 'cancelled' ? 'Execução cancelada pelo usuário.' : (task?.error || 'Erro no pipeline do estúdio'))
      : task?.phase || 'Inicializando pipeline do estúdio...',
    percent: task?.progress || 0,
    isComplete,
    hasError,
    stageLabel: isComplete ? 'Entrega concluída' : stageLabel,
    stageMeta: task?.stageMeta || (totalSteps > 0 ? `Etapa ${Math.max(1, Math.min(progressStep || 1, totalSteps))} de ${totalSteps}` : undefined),
  }
}

export function buildStudioTaskPhaseMessage(
  step: number,
  total: number,
  phase: string,
  artifactType: StudioArtifactType,
): string {
  const specialistLabel = STUDIO_SPECIALIST_LABEL[artifactType]
  const labels = ['Pesquisador do Estúdio', specialistLabel, 'Revisor de Qualidade']
  const stageLabel = labels[Math.max(0, Math.min(step - 1, labels.length - 1))] || phase
  const suffix = total > 0 ? ` (${step}/${total})` : ''
  return `${stageLabel}${suffix}: ${phase}`
}

export function buildNotebookOperationalSummaries(options: {
  acervoLoading: boolean
  acervoState: NotebookModalProgressState
  acervoStartedAt?: number | null
  acervoAggregate?: NotebookOperationalAggregate | null
  studioTask?: TaskInfo
  studioArtifactLabel?: string | null
  videoGeneration?: VideoPipelineProgressState | null
  videoGenerationStartedAt?: number | null
  videoGenerationAggregate?: NotebookOperationalAggregate | null
  videoLiteral?: VideoPipelineProgressState | null
  videoLiteralStartedAt?: number | null
  videoLiteralAggregate?: NotebookOperationalAggregate | null
}): NotebookOperationalSummary[] {
  const items: NotebookOperationalSummary[] = []

  if (options.videoLiteral) {
    items.push({
      id: 'video-literal',
      kind: 'video_literal',
      title: 'Vídeo literal em execução',
      subtitle: options.videoLiteral.stageDescription || options.videoLiteral.phase,
      progress: options.videoLiteral.percent,
      stageLabel: options.videoLiteral.stageLabel,
      stageMeta: options.videoLiteral.stageMeta,
      etaLabel: estimateEta(options.videoLiteralStartedAt ?? undefined, options.videoLiteral.percent),
      aggregateLabel: buildAggregateLabel(options.videoLiteralAggregate),
      detailLabel: buildOperationalDetailLabel('video_literal', options.videoLiteralAggregate),
      degradationLabel: buildDegradationLabel(options.videoLiteralAggregate),
      tone: 'rose',
    })
  }

  if (options.videoGeneration) {
    items.push({
      id: 'video-generation',
      kind: 'video_pipeline',
      title: 'Pipeline de vídeo em execução',
      subtitle: options.videoGeneration.stageDescription || options.videoGeneration.phase,
      progress: options.videoGeneration.percent,
      stageLabel: options.videoGeneration.stageLabel,
      stageMeta: options.videoGeneration.stageMeta,
      etaLabel: estimateEta(options.videoGenerationStartedAt ?? undefined, options.videoGeneration.percent),
      aggregateLabel: buildAggregateLabel(options.videoGenerationAggregate),
      detailLabel: buildOperationalDetailLabel('video_pipeline', options.videoGenerationAggregate),
      degradationLabel: buildDegradationLabel(options.videoGenerationAggregate),
      tone: 'sky',
    })
  }

  if (options.studioTask?.status === 'running') {
    items.push({
      id: options.studioTask.id,
      kind: 'studio',
      title: options.studioArtifactLabel ? `Estúdio: ${options.studioArtifactLabel}` : 'Estúdio em execução',
      subtitle: options.studioTask.phase,
      progress: options.studioTask.progress,
      stageLabel: options.studioTask.currentStep && options.studioTask.totalSteps
        ? `Etapa ${options.studioTask.currentStep} de ${options.studioTask.totalSteps}`
        : 'Pipeline do estúdio',
      stageMeta: options.studioTask.stageMeta,
      etaLabel: estimateEta(options.studioTask.startedAt, options.studioTask.progress),
      aggregateLabel: buildAggregateLabel(options.studioTask.operationals),
      detailLabel: buildOperationalDetailLabel('studio', options.studioTask.operationals),
      degradationLabel: buildDegradationLabel(options.studioTask.operationals),
      tone: 'violet',
    })
  }

  if (options.acervoLoading) {
    items.push({
      id: 'acervo-analysis',
      kind: 'acervo',
      title: 'Análise do acervo em execução',
      subtitle: options.acervoState.currentMessage,
      progress: options.acervoState.percent,
      stageLabel: options.acervoState.stageLabel,
      stageMeta: options.acervoState.stageMeta,
      etaLabel: estimateEta(options.acervoStartedAt ?? undefined, options.acervoState.percent),
      aggregateLabel: buildAggregateLabel(options.acervoAggregate),
      degradationLabel: buildDegradationLabel(options.acervoAggregate),
      tone: 'amber',
    })
  }

  return items
}