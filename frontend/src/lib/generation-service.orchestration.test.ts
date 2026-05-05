import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  callLLMMock: vi.fn(),
  callLLMWithFallbackMock: vi.fn(),
  updateDocMock: vi.fn(async () => undefined),
  loadAgentModelsMock: vi.fn(),
  loadApiKeyValuesMock: vi.fn(),
  listThesesMock: vi.fn(),
  getAcervoContextMock: vi.fn(),
  getAllAcervoDocumentsForSearchMock: vi.fn(),
  updateAcervoEmentaMock: vi.fn(async () => undefined),
  loadAdminDocumentTypesMock: vi.fn(),
  createUsageExecutionRecordMock: vi.fn((input: unknown) => input),
  buildUsageSummaryMock: vi.fn(() => ({ total_cost_usd: 0.01 })),
  evaluateQualityMock: vi.fn(() => ({ score: 92 })),
  flagStates: {} as Record<string, boolean>,
}))

vi.mock('firebase/firestore', () => ({
  doc: (..._args: unknown[]) => ({ __ref: true }),
  updateDoc: hoisted.updateDocMock,
}))

vi.mock('./firebase', () => ({
  firestore: {},
}))

vi.mock('./llm-client', () => ({
  callLLM: hoisted.callLLMMock,
  callLLMWithFallback: hoisted.callLLMWithFallbackMock,
}))

vi.mock('./model-config', () => ({
  PIPELINE_AGENT_DEFS: [
    { key: 'triagem', agentCategory: 'extraction' },
    { key: 'acervo_buscador', agentCategory: 'extraction' },
    { key: 'acervo_compilador', agentCategory: 'synthesis' },
    { key: 'acervo_revisor', agentCategory: 'synthesis' },
    { key: 'pesquisador', agentCategory: 'reasoning' },
    { key: 'jurista', agentCategory: 'reasoning' },
    { key: 'advogado_diabo', agentCategory: 'reasoning' },
    { key: 'jurista_v2', agentCategory: 'reasoning' },
    { key: 'fact_checker', agentCategory: 'extraction' },
    { key: 'moderador', agentCategory: 'synthesis' },
    { key: 'redator', agentCategory: 'writing' },
  ],
  CONTEXT_DETAIL_AGENT_DEFS: [],
  ACERVO_EMENTA_AGENT_DEFS: [],
  ACERVO_CLASSIFICADOR_AGENT_DEFS: [],
  ModelsNotConfiguredError: class ModelsNotConfiguredError extends Error {},
  loadAgentModels: hoisted.loadAgentModelsMock,
  loadContextDetailModels: async () => ({}),
  loadAcervoEmentaModels: async () => ({}),
  loadAcervoClassificadorModels: async () => ({}),
  validateModelMap: () => undefined,
  buildPipelineFallbackResolver: () => () => [],
  loadFallbackPriorityConfig: async () => ({}),
}))

vi.mock('./settings-store', () => ({
  loadApiKeyValues: hoisted.loadApiKeyValuesMock,
}))

vi.mock('./firestore-service', () => ({
  listTheses: hoisted.listThesesMock,
  getAcervoContext: hoisted.getAcervoContextMock,
  getAllAcervoDocumentsForSearch: hoisted.getAllAcervoDocumentsForSearchMock,
  updateAcervoEmenta: hoisted.updateAcervoEmentaMock,
  loadAdminDocumentTypes: hoisted.loadAdminDocumentTypesMock,
}))

vi.mock('./cost-analytics', () => ({
  createUsageExecutionRecord: hoisted.createUsageExecutionRecordMock,
  buildUsageSummary: hoisted.buildUsageSummaryMock,
}))

vi.mock('./quality-evaluator', () => ({
  evaluateQuality: hoisted.evaluateQualityMock,
}))

vi.mock('./generation-cache', () => ({
  getAcervoContextFromCache: () => null,
  getAdminDocTypesFromCache: () => null,
  getClassificacaoFromCache: () => null,
  getEmentaFromCache: () => null,
  setAcervoContextInCache: () => undefined,
  setAdminDocTypesInCache: () => undefined,
  setClassificacaoInCache: () => undefined,
  setEmentaInCache: () => undefined,
}))

vi.mock('./feature-flags', () => ({
  isEnabled: (flagKey: string) => Boolean(hoisted.flagStates[flagKey]),
  getFlagState: (flagKey: string) => ({
    enabled: flagKey === 'FF_DOC_REDATOR_10K' ? false : Boolean(hoisted.flagStates[flagKey]),
    source: flagKey === 'FF_DOC_REDATOR_10K' ? 'default' as const : 'runtime' as const,
  }),
  isTruthyFlag: (value?: string) => ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()),
}))

import { generateDocument } from './generation-service'

function llmResult(content: string, model: string) {
  return {
    content,
    model,
    tokens_in: 10,
    tokens_out: 20,
    cost_usd: 0.001,
    duration_ms: 75,
    operational: { totalRetryCount: 0, fallbackUsed: false, fallbackFrom: null },
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function buildDoc(id: string) {
  return {
    id,
    filename: `doc-${id}.docx`,
    created_at: '2026-05-05T10:00:00.000Z',
    text_content: 'Fundamentacao consolidada sobre nepotismo. '.repeat(300),
    ementa: 'Parecer sobre nepotismo e contratacao temporaria',
    ementa_keywords: ['nepotismo', 'contratacao'],
    natureza: 'consultivo',
    area_direito: ['administrative'],
    assuntos: ['nepotismo'],
    tipo_documento: 'parecer',
    contexto: ['municipio'],
  }
}

describe('generateDocument parallel pesquisador orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    hoisted.flagStates = {
      FF_PARALLEL_PESQUISADOR: true,
      FF_PARALLEL_ACERVO: true,
      FF_ACERVO_KEYWORD_PREFILTER: true,
      FF_ACERVO_LLM_PREFILTER: true,
      FF_THESIS_PREFETCH: false,
      FF_TEMPLATE_CACHE: false,
      FF_EMENTA_WARMUP_EXTENDED: false,
    }

    hoisted.loadApiKeyValuesMock.mockResolvedValue({ openrouter_api_key: 'sk-or-v1-test' })
    hoisted.loadAgentModelsMock.mockResolvedValue({
      triagem: 'triagem-model',
      acervo_buscador: 'acervo-buscador-model',
      acervo_compilador: 'acervo-compilador-model',
      acervo_revisor: 'acervo-revisor-model',
      pesquisador: 'pesquisador-model',
      jurista: 'jurista-model',
      advogado_diabo: 'advogado-diabo-model',
      jurista_v2: 'jurista-v2-model',
      fact_checker: 'fact-checker-model',
      moderador: 'moderador-model',
      redator: 'redator-model',
    })
    hoisted.listThesesMock.mockResolvedValue({ items: [] })
    hoisted.getAcervoContextMock.mockResolvedValue('')
    hoisted.getAllAcervoDocumentsForSearchMock.mockResolvedValue([buildDoc('1')])
    hoisted.loadAdminDocumentTypesMock.mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts the pesquisador in parallel before the acervo branch finishes', async () => {
    const callOrder: string[] = []
    const pesquisadorPrompts: string[] = []
    const pesquisadorStarted = createDeferred<void>()
    const pesquisadorDeferred = createDeferred<ReturnType<typeof llmResult>>()
    const revisorStarted = createDeferred<void>()
    const revisorDeferred = createDeferred<ReturnType<typeof llmResult>>()
    let pesquisadorCalls = 0

    hoisted.callLLMWithFallbackMock.mockImplementation(async (...args: unknown[]) => {
      const prompt = String(args[2])
      const model = String(args[3])

      switch (model) {
        case 'triagem-model':
          callOrder.push('triagem:start')
          return llmResult(JSON.stringify({ tema: 'Nepotismo', palavras_chave: ['nepotismo'] }), model)
        case 'acervo-buscador-model':
          callOrder.push('acervo_buscador:start')
          return llmResult(JSON.stringify({ selected: [{ id: '1', score: 0.92, reason: 'Alta aderencia ao tema.' }] }), model)
        case 'acervo-compilador-model':
          callOrder.push('acervo_compilador:start')
          return llmResult('Base compilada do acervo.', model)
        case 'acervo-revisor-model':
          callOrder.push('acervo_revisor:start')
          revisorStarted.resolve()
          return revisorDeferred.promise
        case 'pesquisador-model':
          pesquisadorCalls += 1
          callOrder.push(`pesquisador:start:${pesquisadorCalls}`)
          pesquisadorPrompts.push(prompt)
          if (pesquisadorCalls === 1) {
            pesquisadorStarted.resolve()
            return pesquisadorDeferred.promise
          }
          return llmResult('Pesquisa sequencial de contingencia.', model)
        case 'jurista-model':
          return llmResult('Teses iniciais.', model)
        case 'advogado-diabo-model':
          return llmResult('Criticas relevantes.', model)
        case 'jurista-v2-model':
          return llmResult('Teses refinadas.', model)
        case 'fact-checker-model':
          return llmResult('Citações verificadas.', model)
        case 'moderador-model':
          return llmResult('Plano final.', model)
        case 'redator-model':
          return llmResult('Documento final completo. '.repeat(120), model)
        default:
          throw new Error(`Modelo inesperado no teste: ${model}`)
      }
    })

    const generationPromise = generateDocument(
      'user-1',
      'doc-1',
      'parecer',
      'Preciso de um parecer sobre nepotismo em contratacao temporaria.',
      ['administrative'],
    )

    await revisorStarted.promise
    await Promise.race([
      pesquisadorStarted.promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Pesquisador nao iniciou enquanto o revisor do acervo ainda estava pendente.')), 150)
      }),
    ])

    expect(callOrder.indexOf('pesquisador:start:1')).toBeGreaterThan(-1)
    expect(pesquisadorPrompts[0]).not.toContain('<documento_base_acervo>')

    revisorDeferred.resolve(llmResult('Base revisada com pontos [COMPLEMENTAR].', 'acervo-revisor-model'))
    pesquisadorDeferred.resolve(llmResult('Pesquisa paralela concluida.', 'pesquisador-model'))

    await generationPromise

    expect(pesquisadorCalls).toBe(1)
  })

  it('falls back to a sequential pesquisador run after the parallel attempt fails', async () => {
    const callOrder: string[] = []
    const pesquisadorPrompts: string[] = []
    let pesquisadorCalls = 0

    hoisted.callLLMWithFallbackMock.mockImplementation(async (...args: unknown[]) => {
      const prompt = String(args[2])
      const model = String(args[3])

      switch (model) {
        case 'triagem-model':
          callOrder.push('triagem:start')
          return llmResult(JSON.stringify({ tema: 'Nepotismo', palavras_chave: ['nepotismo'] }), model)
        case 'acervo-buscador-model':
          callOrder.push('acervo_buscador:start')
          return llmResult(JSON.stringify({ selected: [{ id: '1', score: 0.92, reason: 'Alta aderencia ao tema.' }] }), model)
        case 'acervo-compilador-model':
          callOrder.push('acervo_compilador:start')
          return llmResult('Base compilada do acervo.', model)
        case 'acervo-revisor-model':
          callOrder.push('acervo_revisor:start')
          return llmResult('Base revisada com pontos [COMPLEMENTAR].', model)
        case 'pesquisador-model':
          pesquisadorCalls += 1
          callOrder.push(`pesquisador:start:${pesquisadorCalls}`)
          pesquisadorPrompts.push(prompt)
          if (pesquisadorCalls === 1) {
            throw new Error('parallel pesquisador failure')
          }
          return llmResult('Pesquisa sequencial de contingencia.', model)
        case 'jurista-model':
          return llmResult('Teses iniciais.', model)
        case 'advogado-diabo-model':
          return llmResult('Criticas relevantes.', model)
        case 'jurista-v2-model':
          return llmResult('Teses refinadas.', model)
        case 'fact-checker-model':
          return llmResult('Citações verificadas.', model)
        case 'moderador-model':
          return llmResult('Plano final.', model)
        case 'redator-model':
          return llmResult('Documento final completo. '.repeat(120), model)
        default:
          throw new Error(`Modelo inesperado no teste: ${model}`)
      }
    })

    await generateDocument(
      'user-1',
      'doc-1',
      'parecer',
      'Preciso de um parecer sobre nepotismo em contratacao temporaria.',
      ['administrative'],
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    )

    expect(pesquisadorCalls).toBe(2)
    expect(callOrder.indexOf('pesquisador:start:1')).toBeGreaterThan(-1)
    expect(callOrder.indexOf('pesquisador:start:2')).toBeGreaterThan(callOrder.indexOf('acervo_revisor:start'))
    expect(pesquisadorPrompts[0]).not.toContain('<documento_base_acervo>')
    expect(pesquisadorPrompts[1]).toContain('<documento_base_acervo>')
    expect(pesquisadorPrompts[1]).toContain('Base revisada com pontos [COMPLEMENTAR].')
  })
})