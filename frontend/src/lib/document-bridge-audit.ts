import type { DocumentData } from './firestore-types'

export type DocumentBridgeStatus = 'ready' | 'partial' | 'needs_action' | 'invalid'

export interface DocumentBridgeAudit {
  status: DocumentBridgeStatus
  issues: string[]
  recommendations: string[]
  summary: {
    origin: string
    pipelineVersion: string | null
    contentChars: number
    wordCount: number
    executionCount: number
    hasNotebookLink: boolean
    hasQualityScore: boolean
  }
}

export interface DocumentBridgeAuditSummary {
  total: number
  ready: number
  partial: number
  needs_action: number
  invalid: number
  issues: Record<string, number>
}

type AuditableDocument = Pick<
  DocumentData,
  | 'origem'
  | 'status'
  | 'texto_completo'
  | 'quality_score'
  | 'notebook_id'
  | 'notebook_title'
  | 'request_context'
> & {
  llm_executions?: unknown[] | null
  generation_meta?: Record<string, unknown> | null
}

const TERMINAL_STATUSES = new Set(['concluido', 'em_revisao', 'aprovado', 'rejeitado'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getPipelineVersion(document: AuditableDocument): string | null {
  const requestContext = asRecord(document.request_context)
  const generationMeta = asRecord(document.generation_meta)
  const fromRequest = requestContext?.pipeline_version
  const fromGeneration = generationMeta?.pipeline_version
  if (typeof fromGeneration === 'string' && fromGeneration.trim()) return fromGeneration
  if (typeof fromRequest === 'string' && fromRequest.trim()) return fromRequest
  return null
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value)
}

export function auditDocumentBridge(document: AuditableDocument): DocumentBridgeAudit {
  const issues: string[] = []
  const recommendations: string[] = []
  const origin = document.origem || 'web'
  const text = typeof document.texto_completo === 'string' ? document.texto_completo.trim() : ''
  const contentChars = text.length
  const wordCount = contentChars ? countWords(text) : 0
  const executionCount = Array.isArray(document.llm_executions) ? document.llm_executions.length : 0
  const pipelineVersion = getPipelineVersion(document)
  const hasQualityScore = typeof document.quality_score === 'number'
  const hasNotebookLink = origin === 'caderno'
    ? Boolean(document.notebook_id && document.notebook_title)
    : true

  if (TERMINAL_STATUSES.has(document.status) && contentChars === 0) {
    pushUnique(issues, 'content_missing')
    pushUnique(recommendations, 'regenerate_or_restore_document_text')
  }

  if (document.status === 'erro') {
    pushUnique(issues, 'pipeline_failed')
    pushUnique(recommendations, 'retry_document_generation')
  }

  if (document.status === 'rejeitado') {
    pushUnique(issues, 'workflow_rejected')
    pushUnique(recommendations, 'review_rejection_reason')
  }

  if (origin === 'caderno') {
    if (!document.notebook_id) {
      pushUnique(issues, 'notebook_link_missing')
      pushUnique(recommendations, 'restore_notebook_origin_metadata')
    }
    if (!document.notebook_title) {
      pushUnique(issues, 'notebook_title_missing')
      pushUnique(recommendations, 'restore_notebook_origin_metadata')
    }
    if (!hasQualityScore) {
      pushUnique(issues, 'quality_not_scored')
      pushUnique(recommendations, 'open_in_generator_for_full_v3_review')
    }
  }

  if (origin !== 'caderno' && document.status === 'concluido') {
    if (pipelineVersion === 'v3') {
      if (!hasQualityScore) {
        pushUnique(issues, 'quality_not_scored')
        pushUnique(recommendations, 'rerun_v3_quality_gate')
      }
      if (executionCount === 0) {
        pushUnique(issues, 'executions_missing')
        pushUnique(recommendations, 'restore_llm_execution_records')
      }
    } else if (!pipelineVersion && executionCount > 0) {
      pushUnique(issues, 'pipeline_version_missing')
      pushUnique(recommendations, 'restore_generation_metadata')
    }
  }

  if (typeof document.quality_score === 'number' && document.quality_score < 60) {
    pushUnique(issues, 'quality_below_threshold')
    pushUnique(recommendations, 'send_to_review_or_regenerate')
  }

  let status: DocumentBridgeStatus = 'ready'
  if (issues.includes('content_missing') || issues.includes('notebook_link_missing')) {
    status = 'invalid'
  } else if (
    issues.includes('pipeline_failed') ||
    issues.includes('workflow_rejected') ||
    issues.includes('quality_below_threshold') ||
    issues.includes('executions_missing')
  ) {
    status = 'needs_action'
  } else if (issues.length > 0 || document.status === 'processando' || document.status === 'rascunho') {
    status = 'partial'
  }

  return {
    status,
    issues,
    recommendations,
    summary: {
      origin,
      pipelineVersion,
      contentChars,
      wordCount,
      executionCount,
      hasNotebookLink,
      hasQualityScore,
    },
  }
}

export function auditDocumentBridges(documents: AuditableDocument[]): DocumentBridgeAuditSummary {
  const summary: DocumentBridgeAuditSummary = {
    total: documents.length,
    ready: 0,
    partial: 0,
    needs_action: 0,
    invalid: 0,
    issues: {},
  }

  for (const document of documents) {
    const audit = auditDocumentBridge(document)
    summary[audit.status] += 1
    for (const issue of audit.issues) {
      summary.issues[issue] = (summary.issues[issue] ?? 0) + 1
    }
  }

  return summary
}