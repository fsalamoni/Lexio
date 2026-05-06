/**
 * Thesis analysis pipeline definition.
 *
 * This mirrors the lightweight phase contract used by Document v3, but keeps
 * the existing five Banco de Teses agents. The UI still consumes the simpler
 * AgentProgress shape from thesis-analyzer.ts; this file documents phase
 * ownership and gives tests/configuration a stable source of truth.
 */

export type ThesisPipelinePhase =
  | 'config'
  | 'orquestracao'
  | 'inventario'
  | 'curadoria_acervo'
  | 'redundancia'
  | 'compilacao'
  | 'revisao'
  | 'persistencia'

export interface ThesisPipelineStage {
  key: string
  label: string
  description: string
  phase: ThesisPipelinePhase
  modelKey?: string
  parallel?: boolean
}

export const THESIS_PIPELINE_COMPLETED_PHASE = 'thesis_analysis_completed'

export const THESIS_PIPELINE_STAGES: ThesisPipelineStage[] = [
  {
    key: 'config',
    label: 'Configuração',
    description: 'Carrega modelos, fallbacks e limites de paralelismo',
    phase: 'config',
  },
  {
    key: 'thesis_pipeline_orchestrator',
    label: 'Orquestrador do Pipeline',
    description: 'Supervisiona agentes, retries, paralelismo e continuidade da execução',
    phase: 'orquestracao',
    modelKey: 'thesis_pipeline_orchestrator',
  },
  {
    key: 'thesis_catalogador',
    label: 'Catalogador',
    description: 'Inventaria teses existentes e identifica grupos similares',
    phase: 'inventario',
    modelKey: 'thesis_catalogador',
    parallel: true,
  },
  {
    key: 'thesis_curador',
    label: 'Curador de Lacunas',
    description: 'Extrai novas teses de documentos de acervo ainda não analisados',
    phase: 'curadoria_acervo',
    modelKey: 'thesis_curador',
    parallel: true,
  },
  {
    key: 'thesis_analista',
    label: 'Analista de Redundâncias',
    description: 'Analisa profundamente os grupos apontados pelo Catalogador',
    phase: 'redundancia',
    modelKey: 'thesis_analista',
  },
  {
    key: 'thesis_compilador',
    label: 'Compilador',
    description: 'Compila grupos aprovados em teses superiores, com batch paralelo',
    phase: 'compilacao',
    modelKey: 'thesis_compilador',
  },
  {
    key: 'thesis_revisor',
    label: 'Revisor Final',
    description: 'Valida, prioriza e finaliza sugestões das trilhas anteriores',
    phase: 'revisao',
    modelKey: 'thesis_revisor',
  },
]
