import { formatCostBadge } from './currency-utils'
import type { LLMResult } from './llm-client'

export type DocumentPipelineStepStatus = 'pending' | 'active' | 'completed' | 'error'

export interface DocumentPipelineStage {
  key: string
  label: string
  description: string
  modelKey?: string
}

export interface DocumentPipelineProgress {
  phase: string
  message: string
  percent: number
  step: number
  totalSteps: number
  stageLabel?: string
  stageDescription?: string
  modelId?: string
  modelLabel?: string
  stageMeta?: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackFrom?: string
}

export interface DocumentPipelineStep extends DocumentPipelineStage {
  status: DocumentPipelineStepStatus
  startedAt?: number
  completedAt?: number
  runtimeMessage?: string
  runtimeModel?: string
  runtimeMeta?: string
  runtimeCostUsd?: number
  runtimeDurationMs?: number
  runtimeRetryCount?: number
  runtimeFallbackFrom?: string
}

export const DOCUMENT_PIPELINE_COMPLETED_PHASE = 'concluido'

export const DOCUMENT_PIPELINE_STAGES: DocumentPipelineStage[] = [
  { key: 'config', label: 'Configuração', description: 'Carregando chaves, modelos e preferências da execução' },
  { key: 'triagem', label: 'Triagem', description: 'Extração de tema, subtemas e palavras-chave da solicitação', modelKey: 'triagem' },
  { key: 'acervo_buscador', label: 'Buscador de Acervo', description: 'Buscando documentos similares no acervo do usuário', modelKey: 'acervo_buscador' },
  { key: 'acervo_compilador', label: 'Compilador de Base', description: 'Compilando uma base útil a partir do acervo selecionado', modelKey: 'acervo_compilador' },
  { key: 'acervo_revisor', label: 'Revisor de Base', description: 'Revisando a base compilada para coerência e reaproveitamento', modelKey: 'acervo_revisor' },
  { key: 'pesquisador', label: 'Pesquisador', description: 'Pesquisando legislação, jurisprudência e doutrina aplicáveis', modelKey: 'pesquisador' },
  { key: 'jurista', label: 'Jurista', description: 'Desenvolvendo teses jurídicas principais', modelKey: 'jurista' },
  { key: 'advogado_diabo', label: 'Advogado do Diabo', description: 'Stress test das teses com crítica e contra-argumentação', modelKey: 'advogado_diabo' },
  { key: 'jurista_v2', label: 'Jurista (revisão)', description: 'Refinando as teses após a crítica', modelKey: 'jurista_v2' },
  { key: 'fact_checker', label: 'Fact-Checker', description: 'Verificando citações legais, referências e consistência', modelKey: 'fact_checker' },
  { key: 'moderador', label: 'Moderador', description: 'Definindo a arquitetura final do documento', modelKey: 'moderador' },
  { key: 'redacao', label: 'Redator', description: 'Redigindo o documento completo', modelKey: 'redator' },
  { key: 'qualidade', label: 'Qualidade', description: 'Avaliando a qualidade final do material gerado' },
  { key: 'salvando', label: 'Salvando', description: 'Persistindo o resultado e os metadados da execução' },
]

export function createDocumentPipelineSteps(): DocumentPipelineStep[] {
  return DOCUMENT_PIPELINE_STAGES.map(stage => ({
    ...stage,
    status: 'pending',
    runtimeModel: stage.modelKey ? 'Carregando...' : '—',
  }))
}

export function getDocumentPipelineStage(phase: string): DocumentPipelineStage | undefined {
  return DOCUMENT_PIPELINE_STAGES.find(stage => stage.key === phase)
}

export function formatPipelineModelLabel(model: string | null | undefined): string {
  if (!model) return '—'

  const normalized = model.toLowerCase()
  if (normalized.includes('haiku')) return 'Haiku'
  if (normalized.includes('sonnet')) return 'Sonnet'
  if (normalized.includes('opus')) return 'Opus'
  if (normalized.includes('gemini')) return 'Gemini'
  if (normalized.includes('gpt-4o')) return 'GPT-4o'
  if (normalized.includes('gpt-4.1')) return 'GPT-4.1'

  const shortName = model.split('/').pop() || model
  return shortName.replace(/[-_]/g, ' ')
}

export function buildDocumentPipelineProgress(
  phase: string,
  message: string,
  percent: number,
  options?: {
    modelId?: string
    modelLabel?: string
    stageMeta?: string
    costUsd?: number
    durationMs?: number
    retryCount?: number
    usedFallback?: boolean
    fallbackFrom?: string
  },
): DocumentPipelineProgress {
  const stage = getDocumentPipelineStage(phase)
  const step = phase === DOCUMENT_PIPELINE_COMPLETED_PHASE
    ? DOCUMENT_PIPELINE_STAGES.length
    : Math.max(1, DOCUMENT_PIPELINE_STAGES.findIndex(item => item.key === phase) + 1)

  return {
    phase,
    message,
    percent,
    step,
    totalSteps: DOCUMENT_PIPELINE_STAGES.length,
    stageLabel: stage?.label,
    stageDescription: stage?.description,
    modelId: options?.modelId,
    modelLabel: options?.modelLabel ?? formatPipelineModelLabel(options?.modelId),
    stageMeta: options?.stageMeta,
    costUsd: options?.costUsd,
    durationMs: options?.durationMs,
    retryCount: options?.retryCount,
    usedFallback: options?.usedFallback,
    fallbackFrom: options?.fallbackFrom,
  }
}

function formatUsd(costUsd: number): string {
  return formatCostBadge(costUsd)
}

export function buildDocumentStageMeta(result: LLMResult): string | undefined {
  const parts: string[] = []
  if (result.operational?.fallbackUsed && result.operational.fallbackFrom) {
    parts.push(`Fallback de ${formatPipelineModelLabel(result.operational.fallbackFrom)}`)
  }
  if ((result.operational?.totalRetryCount ?? 0) > 0) {
    const retries = result.operational?.totalRetryCount ?? 0
    parts.push(`${retries} ${retries === 1 ? 'retry' : 'retries'}`)
  }
  if (result.duration_ms > 0) {
    parts.push(`${Math.max(1, Math.round(result.duration_ms / 1000))}s`)
  }
  if (result.cost_usd > 0) {
    parts.push(formatUsd(result.cost_usd))
  }
  return parts.length > 0 ? parts.join(' • ') : undefined
}

export function getDocumentStepMeta(step: DocumentPipelineStep): string | undefined {
  if (step.runtimeMeta) return step.runtimeMeta
  if (step.runtimeModel && step.runtimeModel !== '—') return `Modelo: ${step.runtimeModel}`
  return undefined
}

export function applyDocumentPipelineProgress(
  steps: DocumentPipelineStep[],
  progress: DocumentPipelineProgress,
  timers: Record<string, number>,
  now = Date.now(),
): DocumentPipelineStep[] {
  if (progress.phase === DOCUMENT_PIPELINE_COMPLETED_PHASE) {
    return steps.map(step => (
      step.status === 'active'
        ? { ...step, status: 'completed', completedAt: now }
        : step
    ))
  }

  const phaseIdx = steps.findIndex(step => step.key === progress.phase)
  if (phaseIdx === -1) return steps

  return steps.map((step, idx) => {
    if (step.key === progress.phase) {
      if (!timers[progress.phase]) {
        timers[progress.phase] = now
      }

      return {
        ...step,
        status: 'active',
        startedAt: step.startedAt ?? timers[progress.phase],
        runtimeMessage: progress.message,
        runtimeModel: progress.modelLabel ?? step.runtimeModel,
        runtimeMeta: progress.stageMeta ?? step.runtimeMeta,
        runtimeCostUsd: progress.costUsd ?? step.runtimeCostUsd,
        runtimeDurationMs: progress.durationMs ?? step.runtimeDurationMs,
        runtimeRetryCount: progress.retryCount ?? step.runtimeRetryCount,
        runtimeFallbackFrom: progress.fallbackFrom ?? step.runtimeFallbackFrom,
      }
    }

    if (idx < phaseIdx && step.status === 'active') {
      return {
        ...step,
        status: 'completed',
        completedAt: step.completedAt ?? now,
      }
    }

    return step
  })
}