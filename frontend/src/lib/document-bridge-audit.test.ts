import { describe, expect, it } from 'vitest'

import { auditDocumentBridge, auditDocumentBridges } from './document-bridge-audit'

const execution = {
  source_type: 'document_generation_v3',
  source_id: 'doc-1',
  created_at: '2026-05-01T10:00:00.000Z',
  function_key: 'document_generation_v3',
  function_label: 'Documento v3',
  phase: 'v3_writer',
  phase_label: 'Redator',
  agent_name: 'Redator',
  model: 'openai/gpt-4o',
  model_label: 'GPT-4o',
  tokens_in: 100,
  tokens_out: 200,
  total_tokens: 300,
  cost_usd: 0.01,
  duration_ms: 1200,
}

describe('document bridge audit', () => {
  it('marks completed v3 documents as ready when content, quality, executions and metadata are present', () => {
    const audit = auditDocumentBridge({
      status: 'concluido',
      origem: 'web',
      texto_completo: 'Parecer juridico completo com fundamentacao suficiente.',
      quality_score: 91,
      request_context: { pipeline_version: 'v3' },
      generation_meta: { pipeline_version: 'v3' },
      llm_executions: [execution],
    })

    expect(audit.status).toBe('ready')
    expect(audit.issues).toEqual([])
    expect(audit.summary.pipelineVersion).toBe('v3')
    expect(audit.summary.executionCount).toBe(1)
  })

  it('marks notebook-origin documents as partial when they are saved without a quality score', () => {
    const audit = auditDocumentBridge({
      status: 'concluido',
      origem: 'caderno',
      texto_completo: 'Documento formal gerado no caderno.',
      quality_score: null,
      notebook_id: 'nb-1',
      notebook_title: 'Caderno',
      llm_executions: [execution],
    })

    expect(audit.status).toBe('partial')
    expect(audit.issues).toContain('quality_not_scored')
    expect(audit.recommendations).toContain('open_in_generator_for_full_v3_review')
  })

  it('marks broken notebook-origin documents as invalid when the notebook link is missing', () => {
    const audit = auditDocumentBridge({
      status: 'concluido',
      origem: 'caderno',
      texto_completo: 'Documento sem vinculo de origem.',
      quality_score: 80,
      notebook_id: null,
      notebook_title: 'Caderno',
      llm_executions: [execution],
    })

    expect(audit.status).toBe('invalid')
    expect(audit.issues).toContain('notebook_link_missing')
  })

  it('summarizes bridge status counts and issue totals', () => {
    const summary = auditDocumentBridges([
      {
        status: 'concluido',
        origem: 'web',
        texto_completo: 'Documento pronto.',
        quality_score: 95,
        request_context: { pipeline_version: 'v3' },
        llm_executions: [execution],
      },
      {
        status: 'concluido',
        origem: 'caderno',
        texto_completo: '',
        notebook_id: null,
        notebook_title: null,
        quality_score: null,
      },
    ])

    expect(summary.total).toBe(2)
    expect(summary.ready).toBe(1)
    expect(summary.invalid).toBe(1)
    expect(summary.issues.content_missing).toBe(1)
    expect(summary.issues.notebook_link_missing).toBe(1)
  })
})