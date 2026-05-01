import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const callLLMMock = vi.fn()

vi.mock('./llm-client', async () => {
  const actual = await vi.importActual<typeof import('./llm-client')>('./llm-client')
  return {
    ...actual,
    callLLMWithFallback: (...args: unknown[]) => callLLMMock(...args),
  }
})

vi.mock('./model-config', () => {
  const agentDefs = [
    { key: 'thesis_catalogador', label: 'Catalogador', agentCategory: 'extraction' },
    { key: 'thesis_analista', label: 'Analista de Redundâncias', agentCategory: 'reasoning' },
    { key: 'thesis_compilador', label: 'Compilador', agentCategory: 'synthesis' },
    { key: 'thesis_curador', label: 'Curador de Lacunas', agentCategory: 'synthesis' },
    { key: 'thesis_revisor', label: 'Revisor Final', agentCategory: 'synthesis' },
  ]

  return {
    THESIS_ANALYST_AGENT_DEFS: agentDefs,
    validateModelMap: (modelMap: Record<string, string>) => {
      for (const agent of agentDefs) {
        if (!modelMap[agent.key]) throw new Error(`Missing model for ${agent.key}`)
      }
    },
    buildPipelineFallbackResolver: () => () => [],
    loadFallbackPriorityConfig: async () => ({}),
  }
})

import { analyzeThesisBank } from './thesis-analyzer'
import type { AcervoDocumentData, ThesisData } from './firestore-types'

const modelMap = {
  thesis_catalogador: 'catalogador-model',
  thesis_analista: 'analista-model',
  thesis_compilador: 'compilador-model',
  thesis_curador: 'curador-model',
  thesis_revisor: 'revisor-model',
}

function llmResult(content: string, model: string, durationMs = 25) {
  return {
    content,
    model,
    provider_id: 'test-provider',
    provider_label: 'Test Provider',
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.001,
    duration_ms: durationMs,
    operational: {
      requestedModel: model,
      resolvedModel: model,
      providerId: 'test-provider',
      providerLabel: 'Test Provider',
      fallbackUsed: false,
      fallbackFrom: null,
      totalRetryCount: 0,
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function thesis(id: string, title: string): ThesisData {
  return {
    id,
    title,
    content: `${title}. Conteúdo jurídico robusto. `.repeat(20),
    summary: `Resumo de ${title}`,
    legal_area_id: 'civil',
    tags: ['civil'],
    usage_count: 0,
    source_type: 'manual',
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function acervoDoc(id: string): AcervoDocumentData {
  return {
    id,
    filename: `${id}.pdf`,
    content_type: 'application/pdf',
    size_bytes: 2048,
    text_content: 'Documento do acervo com fatos e fundamentos aptos a gerar nova tese. '.repeat(80),
    chunks_count: 3,
    status: 'indexed',
    created_at: '2026-01-02T00:00:00.000Z',
  }
}

function responseForModel(model: string) {
  if (model === 'catalogador-model') {
    return llmResult(JSON.stringify({
      similar_groups: [{ ids: ['t1', 't2'], titles: ['Tese 1', 'Tese 2'], reason: 'Sobreposição argumentativa.' }],
      low_quality_ids: [],
      thematic_gaps: ['Responsabilidade pré-contratual'],
      catalogue_summary: 'Banco compacto.',
    }), model, 120)
  }

  if (model === 'analista-model') {
    return llmResult(JSON.stringify([
      { group_ids: ['t1', 't2'], analysis: 'Há redundância relevante.', recommendation: 'merge', confidence: 0.91 },
    ]), model, 80)
  }

  if (model === 'compilador-model') {
    return llmResult(JSON.stringify({
      title: 'Tese compilada',
      content: 'Conteúdo compilado e superior.',
      summary: 'Síntese compilada.',
      legal_area_id: 'civil',
      tags: ['contratos'],
      quality_score: 88,
    }), model, 90)
  }

  if (model === 'curador-model') {
    return llmResult(JSON.stringify([
      {
        title: 'Nova tese do acervo',
        content: 'Conteúdo extraído do acervo.',
        summary: 'Síntese nova.',
        legal_area_id: 'civil',
        tags: ['acervo'],
        quality_score: 82,
      },
    ]), model, 70)
  }

  return llmResult(JSON.stringify({
    executive_summary: 'Sugestões revisadas.',
    suggestions: [
      {
        type: 'create',
        priority: 'medium',
        impact_score: 6,
        title: 'Criar tese do acervo',
        description: 'Aproveitar tese inédita.',
        rationale: 'Fonte nova.',
      },
    ],
  }), model, 60)
}

async function runDefaultAnalysis() {
  return analyzeThesisBank(
    'sk-test',
    [thesis('t1', 'Tese 1'), thesis('t2', 'Tese 2')],
    [acervoDoc('doc-1')],
    modelMap,
  )
}

describe('analyzeThesisBank parallel pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('starts Curador before the bank track completes when parallelism is available', async () => {
    vi.stubEnv('VITE_THESIS_ANALYSIS_PARALLEL_LIMIT', '2')
    const catalogador = deferred<ReturnType<typeof llmResult>>()
    const starts: string[] = []

    callLLMMock.mockImplementation(async (_apiKey, _system, _prompt, model: string) => {
      starts.push(model)
      if (model === 'catalogador-model') return catalogador.promise
      return responseForModel(model)
    })

    const analysisPromise = runDefaultAnalysis()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(starts).toContain('curador-model')
    expect(starts.indexOf('curador-model')).toBeLessThan(starts.indexOf('analista-model') === -1 ? Number.POSITIVE_INFINITY : starts.indexOf('analista-model'))

    catalogador.resolve(responseForModel('catalogador-model'))
    const result = await analysisPromise

    expect(result.pipeline_meta?.parallel_limit).toBe(2)
    expect(result.llm_executions.some(execution => execution.phase === 'thesis_curador')).toBe(true)
  })

  it('starts Revisor only after both parallel tracks finish', async () => {
    vi.stubEnv('VITE_THESIS_ANALYSIS_PARALLEL_LIMIT', '2')
    const starts: string[] = []
    const completed = new Set<string>()

    callLLMMock.mockImplementation(async (_apiKey, _system, _prompt, model: string) => {
      starts.push(model)
      if (model === 'revisor-model') {
        expect(completed.has('curador-model')).toBe(true)
        expect(completed.has('compilador-model')).toBe(true)
      }
      const result = responseForModel(model)
      completed.add(model)
      return result
    })

    await runDefaultAnalysis()

    expect(starts[starts.length - 1]).toBe('revisor-model')
  })

  it('serializes the Curador track when the top-level parallel limit is one', async () => {
    vi.stubEnv('VITE_THESIS_ANALYSIS_PARALLEL_LIMIT', '1')
    const starts: string[] = []

    callLLMMock.mockImplementation(async (_apiKey, _system, _prompt, model: string) => {
      starts.push(model)
      return responseForModel(model)
    })

    const result = await runDefaultAnalysis()

    expect(starts.indexOf('curador-model')).toBeGreaterThan(starts.indexOf('compilador-model'))
    expect(starts.indexOf('revisor-model')).toBeGreaterThan(starts.indexOf('curador-model'))
    expect(result.pipeline_meta?.parallel_limit).toBe(1)
  })

  it('returns pipeline metadata and runtime fields on usage executions', async () => {
    callLLMMock.mockImplementation(async (_apiKey, _system, _prompt, model: string) => responseForModel(model))

    const result = await runDefaultAnalysis()

    expect(result.pipeline_meta).toMatchObject({
      pipeline_version: 'thesis_parallel_v1',
      parallel_limit: expect.any(Number),
      compilador_parallel_limit: expect.any(Number),
      wall_clock_ms: expect.any(Number),
      total_agent_duration_ms: expect.any(Number),
      parallel_savings_ms: expect.any(Number),
      runtime_profile: expect.any(String),
      runtime_hints: expect.any(String),
      runtime_cap: expect.any(Number),
    })
    expect(result.pipeline_meta?.phase_durations_ms).toEqual(expect.objectContaining({
      inventario: expect.any(Number),
      curadoria_acervo: expect.any(Number),
      compilacao: expect.any(Number),
      revisao: expect.any(Number),
    }))

    for (const execution of result.llm_executions) {
      expect(execution.source_type).toBe('thesis_analysis')
      expect(typeof execution.runtime_profile).toBe('string')
      expect(typeof execution.runtime_hints).toBe('string')
      expect(typeof execution.runtime_concurrency).toBe('number')
      expect(typeof execution.runtime_cap).toBe('number')
      expect(execution.execution_state).toBe('completed')
    }
  })

  it('keeps the Revisor JSON repair pass working', async () => {
    callLLMMock.mockImplementation(async (_apiKey, system: string, _prompt, model: string) => {
      if (model === 'revisor-model' && !String(system).includes('corrige saídas JSON')) {
        return llmResult('{invalid-json', model, 20)
      }
      if (String(system).includes('corrige saídas JSON')) {
        return llmResult(JSON.stringify({
          executive_summary: 'JSON reparado.',
          suggestions: [
            { type: 'create', priority: 'high', impact_score: 8, title: 'Sugestão reparada', description: 'Ok', rationale: 'Ok' },
          ],
        }), model, 20)
      }
      return responseForModel(model)
    })

    const result = await runDefaultAnalysis()

    expect(result.executive_summary).toBe('JSON reparado.')
    expect(result.suggestions).toHaveLength(1)
    expect(result.llm_executions.map(execution => execution.phase)).toContain('thesis_revisor_repair')
  })
})
