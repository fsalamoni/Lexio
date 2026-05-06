/**
 * Document v3 pipeline definition — phase-grouped multi-agent pipeline.
 *
 * The v3 pipeline is organised in 4 distinct phases (Compreensão → Análise →
 * Pesquisa → Redação) plus operational stages (config / qualidade / salvando).
 * Within each phase several agents may run **in parallel** and they are
 * coordinated by a Supervisor (see `document-v3-orchestrator.ts`).
 *
 * The progress contract mirrors the v2 pipeline (`document-pipeline.ts`) so
 * that all existing UI primitives (`PipelineProgressPanel`, persistence,
 * cost analytics) keep working without any other change.
 *
 * IMPORTANT: This file does not touch the v2 pipeline. The v2 pipeline lives
 * in `document-pipeline.ts` and remains the source of truth for `NewDocument`.
 */
import { formatCostBadge } from './currency-utils'
import type { LLMResult } from './llm-client'
import { normalizeProgressForExecution, type PipelineExecutionState } from './pipeline-execution-contract'

export type DocumentV3PipelineStepStatus = 'pending' | 'active' | 'completed' | 'error'

/** v3 phase identifiers. Used for grouping in UI and orchestration. */
export type DocumentV3Phase =
  | 'config'
  | 'compreensao'
  | 'analise'
  | 'pesquisa'
  | 'redacao'
  | 'qualidade'
  | 'salvando'

export interface DocumentV3PipelineStage {
  /** Unique key used as the progress phase identifier */
  key: string
  /** Human-readable label */
  label: string
  /** Short description shown in the UI */
  description: string
  /** Phase grouping used for the v3 timeline */
  phase: DocumentV3Phase
  /** Optional model key (matches DOCUMENT_V3_PIPELINE_AGENT_DEFS) */
  modelKey?: string
  /** When true, this stage runs in parallel with siblings inside the phase */
  parallel?: boolean
}

export interface DocumentV3PipelineProgress {
  phase: string
  message: string
  percent: number
  step: number
  totalSteps: number
  executionState?: PipelineExecutionState
  stageLabel?: string
  stageDescription?: string
  stagePhase?: DocumentV3Phase
  modelId?: string
  modelLabel?: string
  stageMeta?: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackFrom?: string
}

export interface DocumentV3PipelineStep extends DocumentV3PipelineStage {
  status: DocumentV3PipelineStepStatus
  executionState?: PipelineExecutionState
  startedAt?: number
  completedAt?: number
  runtimeMessage?: string
  runtimeModel?: string
  runtimeMeta?: string
  runtimeCostUsd?: number
  runtimeDurationMs?: number
  runtimeRetryCount?: number
  runtimeFallbackFrom?: string
  runtimeUsedFallback?: boolean
}

/** Phase emitted when the v3 pipeline finishes successfully. */
export const DOCUMENT_V3_PIPELINE_COMPLETED_PHASE = 'concluido_v3'

/**
 * Ordered stages of the v3 pipeline. The order defines the natural progression
 * shown in the UI; the orchestrator may report the same key multiple times when
 * an agent is retried (the percent value drives the bar).
 */
export const DOCUMENT_V3_PIPELINE_STAGES: DocumentV3PipelineStage[] = [
  {
    key: 'config',
    label: 'Configuração',
    description: 'Carregando chaves, modelos e estrutura do documento',
    phase: 'config',
  },
  {
    key: 'v3_pipeline_orchestrator',
    label: 'Orquestrador do Pipeline',
    description: 'Supervisiona agentes, retries, escalonamentos e continuidade da execução',
    phase: 'config',
    modelKey: 'v3_pipeline_orchestrator',
  },

  // ── Fase 1: Compreensão ────────────────────────────────────────────────────
  {
    key: 'v3_intent_classifier',
    label: 'Classificador de Intenção',
    description: 'Identifica tipo de demanda, urgência e complexidade',
    phase: 'compreensao',
    modelKey: 'v3_intent_classifier',
    parallel: true,
  },
  {
    key: 'v3_request_parser',
    label: 'Parser da Solicitação',
    description: 'Extrai fatos, partes, pedidos, prazos e jurisdição',
    phase: 'compreensao',
    modelKey: 'v3_request_parser',
    parallel: true,
  },
  {
    key: 'v3_legal_issue_spotter',
    label: 'Identificador de Questões Jurídicas',
    description: 'Mapeia todas as questões jurídicas implicadas no caso',
    phase: 'compreensao',
    modelKey: 'v3_legal_issue_spotter',
    parallel: true,
  },
  {
    key: 'v3_prompt_architect',
    label: 'Arquiteto de Prompts',
    description: 'Consolida a compreensão e gera os briefings das próximas fases',
    phase: 'compreensao',
    modelKey: 'v3_prompt_architect',
  },

  // ── Fase 2: Análise jurídica ──────────────────────────────────────────────
  {
    key: 'v3_acervo_retriever',
    label: 'Buscador de Acervo',
    description: 'Recupera documentos similares no acervo do usuário',
    phase: 'analise',
    modelKey: 'v3_acervo_retriever',
    parallel: true,
  },
  {
    key: 'v3_thesis_retriever',
    label: 'Buscador de Teses',
    description: 'Recupera teses pertinentes do banco do usuário',
    phase: 'analise',
    modelKey: 'v3_thesis_retriever',
    parallel: true,
  },
  {
    key: 'v3_thesis_builder',
    label: 'Construtor de Teses',
    description: 'Desenvolve argumentação robusta para cada questão jurídica',
    phase: 'analise',
    modelKey: 'v3_thesis_builder',
  },
  {
    key: 'v3_devil_advocate',
    label: 'Advogado do Diabo',
    description: 'Critica as teses e identifica fraquezas argumentativas',
    phase: 'analise',
    modelKey: 'v3_devil_advocate',
  },
  {
    key: 'v3_thesis_refiner',
    label: 'Refinador de Teses',
    description: 'Incorpora as críticas válidas e reforça os argumentos',
    phase: 'analise',
    modelKey: 'v3_thesis_refiner',
  },

  // ── Fase 3: Pesquisa ──────────────────────────────────────────────────────
  {
    key: 'v3_legislation_researcher',
    label: 'Pesquisador de Legislação',
    description: 'Identifica legislação aplicável e atualizada',
    phase: 'pesquisa',
    modelKey: 'v3_legislation_researcher',
    parallel: true,
  },
  {
    key: 'v3_jurisprudence_researcher',
    label: 'Pesquisador de Jurisprudência',
    description: 'Busca jurisprudência STF, STJ e tribunais aplicáveis',
    phase: 'pesquisa',
    modelKey: 'v3_jurisprudence_researcher',
    parallel: true,
  },
  {
    key: 'v3_doctrine_researcher',
    label: 'Pesquisador de Doutrina',
    description: 'Localiza doutrina pertinente e atualizada',
    phase: 'pesquisa',
    modelKey: 'v3_doctrine_researcher',
    parallel: true,
  },
  {
    key: 'v3_citation_verifier',
    label: 'Verificador de Citações',
    description: 'Verifica artigos, súmulas e julgados; corrige imprecisões',
    phase: 'pesquisa',
    modelKey: 'v3_citation_verifier',
  },

  // ── Fase 4: Redação ───────────────────────────────────────────────────────
  // outline-planner é disparado em paralelo com a Fase 3 (Pesquisa) para reduzir
  // o caminho crítico — depende apenas dos briefings + teses refinadas e não
  // precisa do material de pesquisa.
  {
    key: 'v3_outline_planner',
    label: 'Planejador da Estrutura',
    description: 'Planeja a arquitetura do documento final (em paralelo com a pesquisa)',
    phase: 'redacao',
    modelKey: 'v3_outline_planner',
    parallel: true,
  },
  {
    key: 'v3_writer',
    label: 'Redator',
    description: 'Redige o documento completo seguindo o plano',
    phase: 'redacao',
    modelKey: 'v3_writer',
  },
  {
    key: 'v3_writer_reviser',
    label: 'Revisor de Redação',
    description: 'Revisa citações suspeitas detectadas após a redação',
    phase: 'redacao',
    modelKey: 'v3_writer_reviser',
  },

  // ── Operacionais ──────────────────────────────────────────────────────────
  {
    key: 'qualidade',
    label: 'Qualidade',
    description: 'Avalia a qualidade final do material gerado',
    phase: 'qualidade',
  },
  {
    key: 'salvando',
    label: 'Salvando',
    description: 'Persiste o resultado e os metadados da execução',
    phase: 'salvando',
  },
]

/** Ordered list of phases used for grouping in UI components. */
export const DOCUMENT_V3_PHASES: { key: DocumentV3Phase; label: string; description: string }[] = [
  { key: 'config',      label: 'Configuração',          description: 'Preparação da execução' },
  { key: 'compreensao', label: 'Fase 1 — Compreensão',  description: 'Entendimento da solicitação e desenho dos prompts' },
  { key: 'analise',     label: 'Fase 2 — Análise',      description: 'Construção e crítica das teses jurídicas' },
  { key: 'pesquisa',    label: 'Fase 3 — Pesquisa',     description: 'Legislação, jurisprudência, doutrina e verificação' },
  { key: 'redacao',     label: 'Fase 4 — Redação',      description: 'Plano e redação final do documento' },
  { key: 'qualidade',   label: 'Qualidade',             description: 'Avaliação automática da qualidade' },
  { key: 'salvando',    label: 'Persistência',          description: 'Gravação no banco de documentos' },
]

export function createDocumentV3PipelineSteps(): DocumentV3PipelineStep[] {
  return DOCUMENT_V3_PIPELINE_STAGES.map(stage => ({
    ...stage,
    status: 'pending',
    executionState: 'queued',
    runtimeModel: stage.modelKey ? 'Carregando...' : '—',
  }))
}

export function getDocumentV3PipelineStage(phase: string): DocumentV3PipelineStage | undefined {
  return DOCUMENT_V3_PIPELINE_STAGES.find(stage => stage.key === phase)
}

export function formatV3PipelineModelLabel(model: string | null | undefined): string {
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

export function buildDocumentV3PipelineProgress(
  phase: string,
  message: string,
  percent: number,
  options?: {
    executionState?: PipelineExecutionState
    modelId?: string
    modelLabel?: string
    stageMeta?: string
    costUsd?: number
    durationMs?: number
    retryCount?: number
    usedFallback?: boolean
    fallbackFrom?: string
  },
): DocumentV3PipelineProgress {
  const clampedPercent = Math.max(0, Math.min(100, percent))
  const normalizedPercent = options?.executionState
    ? normalizeProgressForExecution({
      progress: clampedPercent,
      executionState: options.executionState,
    })
    : clampedPercent

  const stage = getDocumentV3PipelineStage(phase)
  const step = phase === DOCUMENT_V3_PIPELINE_COMPLETED_PHASE
    ? DOCUMENT_V3_PIPELINE_STAGES.length
    : Math.max(1, DOCUMENT_V3_PIPELINE_STAGES.findIndex(item => item.key === phase) + 1)

  return {
    phase,
    message,
    percent: normalizedPercent,
    step,
    totalSteps: DOCUMENT_V3_PIPELINE_STAGES.length,
    executionState: options?.executionState,
    stageLabel: stage?.label,
    stageDescription: stage?.description,
    stagePhase: stage?.phase,
    modelId: options?.modelId,
    modelLabel: options?.modelLabel ?? formatV3PipelineModelLabel(options?.modelId),
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

export function buildDocumentV3StageMeta(result: LLMResult): string | undefined {
  const parts: string[] = []
  if (result.operational?.fallbackUsed && result.operational.fallbackFrom) {
    parts.push(`Fallback de ${formatV3PipelineModelLabel(result.operational.fallbackFrom)}`)
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

export function getDocumentV3StepMeta(step: DocumentV3PipelineStep): string | undefined {
  if (step.runtimeMeta) return step.runtimeMeta
  if (step.runtimeModel && step.runtimeModel !== '—') return `Modelo: ${step.runtimeModel}`
  return undefined
}

/**
 * Apply a progress update to the pipeline steps array.
 *
 * The v3 orchestrator may emit updates for stages out-of-order (because of
 * parallel execution within a phase). The applier therefore:
 *  - Marks the reported stage as `active` (or keeps it `completed` if already
 *    finished, e.g. parallel siblings reporting after one another).
 *  - Marks earlier sequential stages as `completed` when a later phase starts.
 *  - Keeps already-completed stages untouched.
 */
export function applyDocumentV3PipelineProgress(
  steps: DocumentV3PipelineStep[],
  progress: DocumentV3PipelineProgress,
  timers: Record<string, number>,
  now = Date.now(),
): DocumentV3PipelineStep[] {
  if (progress.phase === DOCUMENT_V3_PIPELINE_COMPLETED_PHASE) {
    return steps.map(step => (
      step.status !== 'completed'
        ? { ...step, status: 'completed', executionState: 'completed', completedAt: step.completedAt ?? now }
        : step
    ))
  }

  const phaseIdx = steps.findIndex(step => step.key === progress.phase)
  if (phaseIdx === -1) return steps

  const targetStep = steps[phaseIdx]
  const stagesByPhaseOrder = new Map<DocumentV3Phase, number>()
  DOCUMENT_V3_PHASES.forEach((p, idx) => stagesByPhaseOrder.set(p.key, idx))
  const targetPhaseOrder = stagesByPhaseOrder.get(targetStep.phase) ?? 0

  return steps.map((step, idx) => {
    if (step.key === progress.phase) {
      if (!timers[progress.phase]) {
        timers[progress.phase] = now
      }
      const executionState = progress.executionState ?? step.executionState ?? 'running'
      const isCompleting = executionState === 'completed'
      return {
        ...step,
        status: isCompleting ? 'completed' : 'active',
        executionState,
        startedAt: step.startedAt ?? timers[progress.phase],
        completedAt: isCompleting ? (step.completedAt ?? now) : step.completedAt,
        runtimeMessage: progress.message,
        runtimeModel: progress.modelLabel ?? step.runtimeModel,
        runtimeMeta: progress.stageMeta ?? step.runtimeMeta,
        runtimeCostUsd: progress.costUsd ?? step.runtimeCostUsd,
        runtimeDurationMs: progress.durationMs ?? step.runtimeDurationMs,
        runtimeRetryCount: progress.retryCount ?? step.runtimeRetryCount,
        runtimeFallbackFrom: progress.fallbackFrom ?? step.runtimeFallbackFrom,
        runtimeUsedFallback: progress.usedFallback ?? step.runtimeUsedFallback,
      }
    }

    // Auto-complete earlier active steps in earlier phases when a later phase starts.
    const stepPhaseOrder = stagesByPhaseOrder.get(step.phase) ?? 0
    if (idx < phaseIdx && step.status === 'active' && stepPhaseOrder < targetPhaseOrder) {
      return { ...step, status: 'completed', executionState: 'completed', completedAt: step.completedAt ?? now }
    }

    return step
  })
}
