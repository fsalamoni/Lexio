import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const callLLMMock = vi.fn()
const updateDocMock = vi.fn(async (..._args: unknown[]) => undefined)
const addDocMock = vi.fn(async (..._args: unknown[]) => ({ id: 'docX' }))
const collectionMock = vi.fn((..._args: unknown[]) => ({ __col: true }))
const docMock = vi.fn((..._args: unknown[]) => ({ __ref: true }))

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (...args: unknown[]) => collectionMock(...args),
  doc: (...args: unknown[]) => docMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}))

vi.mock('firebase/app', () => ({
  getApp: () => ({}),
}))

vi.mock('./llm-client', () => ({
  callLLMWithFallback: (...args: unknown[]) => callLLMMock(...args),
}))

vi.mock('./model-config', () => ({
  DOCUMENT_V3_PIPELINE_AGENT_DEFS: [
    { key: 'v3_intent_classifier', agentCategory: 'extraction' },
    { key: 'v3_request_parser', agentCategory: 'extraction' },
    { key: 'v3_legal_issue_spotter', agentCategory: 'reasoning' },
    { key: 'v3_prompt_architect', agentCategory: 'synthesis' },
    { key: 'v3_acervo_retriever', agentCategory: 'extraction' },
    { key: 'v3_thesis_retriever', agentCategory: 'extraction' },
    { key: 'v3_thesis_builder', agentCategory: 'reasoning' },
    { key: 'v3_devil_advocate', agentCategory: 'reasoning' },
    { key: 'v3_thesis_refiner', agentCategory: 'reasoning' },
    { key: 'v3_legislation_researcher', agentCategory: 'reasoning' },
    { key: 'v3_jurisprudence_researcher', agentCategory: 'reasoning' },
    { key: 'v3_doctrine_researcher', agentCategory: 'reasoning' },
    { key: 'v3_citation_verifier', agentCategory: 'extraction' },
    { key: 'v3_outline_planner', agentCategory: 'synthesis' },
    { key: 'v3_writer', agentCategory: 'writing' },
    { key: 'v3_writer_reviser', agentCategory: 'writing' },
    { key: 'v3_supervisor', agentCategory: 'reasoning' },
  ],
  loadFallbackPriorityConfig: async () => ({}),
  resolveFallbackModelsForCategory: () => [],
  loadResearchNotebookModels: async () => ({}),
  loadDocumentV3Models: async () => ({
    v3_intent_classifier: 'anthropic/claude-3.5-haiku',
    v3_request_parser: 'anthropic/claude-3.5-haiku',
    v3_legal_issue_spotter: 'anthropic/claude-3.5-haiku',
    v3_prompt_architect: 'anthropic/claude-sonnet-4',
    v3_acervo_retriever: 'anthropic/claude-3.5-haiku',
    v3_thesis_retriever: 'anthropic/claude-3.5-haiku',
    v3_thesis_builder: 'anthropic/claude-sonnet-4',
    v3_devil_advocate: 'anthropic/claude-sonnet-4',
    v3_thesis_refiner: 'anthropic/claude-sonnet-4',
    v3_legislation_researcher: 'anthropic/claude-sonnet-4',
    v3_jurisprudence_researcher: 'anthropic/claude-sonnet-4',
    v3_doctrine_researcher: 'anthropic/claude-sonnet-4',
    v3_citation_verifier: 'anthropic/claude-3.5-haiku',
    v3_outline_planner: 'anthropic/claude-sonnet-4',
    v3_writer: 'anthropic/claude-sonnet-4',
    v3_writer_reviser: 'anthropic/claude-sonnet-4',
    v3_supervisor: 'anthropic/claude-opus-4.5',
  }),
}))

vi.mock('./generation-service', () => ({
  AREA_NAMES: { civil: 'Direito Civil' },
  DOC_TYPE_NAMES: { parecer: 'Parecer Jurídico' },
  buildProfileBlock: () => '',
  getLLMOperationalUsageMeta: () => ({
    execution_state: 'completed' as const,
    retry_count: 0,
    used_fallback: null,
    fallback_from: null,
  }),
  getOpenRouterKey: async () => 'sk-or-v1-test',
}))

vi.mock('./firestore-service', () => ({
  loadAdminDocumentTypes: async () => [],
  getAllAcervoDocumentsForSearch: async () => [],
  listTheses: async () => ({ items: [] }),
  writeUserScoped: async (uid: string, _contextLabel: string, operation: (db: Record<string, never>, effectiveUid: string) => Promise<unknown>) => operation({}, uid),
}))

// Force the v3 jurisprudence agent down its LLM-only fallback path during tests
// (no real DataJud network access). The agent catches non-abort errors from
// searchDataJud and falls back to the legacy LLM-only researcher prompt that
// the test router knows how to answer.
vi.mock('./datajud-service', () => ({
  DEFAULT_TRIBUNALS: [{ alias: 'stj', name: 'STJ' }],
  searchDataJud: async () => { throw new Error('datajud-disabled-in-tests') },
  formatDataJudResults: () => '',
}))

// ── System under test ────────────────────────────────────────────────────────

import { generateDocumentV3, createDocumentV3 } from './document-v3-orchestrator'
import { DOCUMENT_V3_PIPELINE_COMPLETED_PHASE } from './document-v3-pipeline'

interface RecordedCall {
  systemHead: string
  startedAt: number
  resolvedAt: number
}

function buildLLMResponses(): { content: string }[] {
  return [
    // Fase 1 — intent
    { content: '{"classification":"parecer","complexity":3,"urgency":2,"notes":"caso simples"}' },
    // Fase 1 — parser
    { content: '{"partes":["A","B"],"fatos":["fato 1"],"pedidos":["P1"],"prazos":[],"jurisdicao":"SP"}' },
    // Fase 1 — issues
    { content: '{"issues":[{"id":"Q1","titulo":"Questão A","resumo":"Explica","areas":["civil"]}]}' },
    // Fase 1 — architect
    {
      content: JSON.stringify({
        tema: 'Responsabilidade civil contratual',
        subtemas: ['inadimplemento', 'danos morais'],
        palavrasChave: ['cdc', 'consumidor'],
        analise: 'foque em culpa e nexo',
        pesquisa: 'STJ recente',
        redacao: 'tom técnico',
      }),
    },
    // Fase 2 — thesis builder
    {
      content: '## Tese 1 — Inadimplemento\n' + 'Argumento robusto. '.repeat(40),
    },
    // Fase 2 — devil advocate
    { content: '## Crítica à Tese 1\n- Fraqueza: prova frágil\n- Risco processual: nenhum\n- Sugestão de reforço: trazer provas adicionais' },
    // Fase 2 — refiner
    {
      content: '## Tese 1 — Inadimplemento (refinada)\n' + 'Argumento robusto reforçado. '.repeat(40),
    },
    // Fase 3 — legislation
    { content: '## Norma — CC art. 186\n- Dispositivo: art. 186, Lei 10.406/2002\n- Conteúdo: ato ilícito\n- Conexão: Tese 1 — culpa' },
    // Fase 3 — jurisprudence
    { content: '## Precedente — Resp. civil objetiva\n- Órgão: STJ\n- Tese fixada: ...' },
    // Fase 3 — doctrine
    { content: '## Posição doutrinária — Função social do contrato\n- Corrente: clássica' },
    // Fase 3 — citation verifier
    { content: '## Resumo da verificação\n- Itens verificados: 5\n- Correções aplicadas: 0\n## Sem correções' },
    // Fase 4 — outline planner
    { content: '## Plano\n1. Introdução\n2. Fundamentos\n3. Conclusão' },
    // Fase 4 — writer
    { content: 'PARECER JURÍDICO\n\n' + 'Texto extenso do documento. '.repeat(80) },
  ]
}

describe('generateDocumentV3 orchestrator', () => {
  beforeEach(() => {
    callLLMMock.mockReset()
    updateDocMock.mockClear()
    addDocMock.mockClear()
  })

  it('runs all 4 phases, persists final document and emits the completion event', async () => {
    const responses = buildLLMResponses()
    let cursor = 0
    callLLMMock.mockImplementation(async () => {
      const r = responses[cursor++]
      return {
        content: r.content,
        model: 'anthropic/claude-sonnet-4',
        tokens_in: 100,
        tokens_out: 200,
        cost_usd: 0.003,
        duration_ms: 50,
        operational: { totalRetryCount: 0 },
      }
    })

    const phases: string[] = []
    await generateDocumentV3(
      'uid1', 'doc1', 'parecer', 'Quero parecer sobre tema X', ['civil'], null,
      (p) => { phases.push(p.phase) },
    )

    // Phase 1 phases reported
    expect(phases).toEqual(expect.arrayContaining([
      'config',
      'v3_intent_classifier', 'v3_request_parser', 'v3_legal_issue_spotter',
      'v3_prompt_architect',
      'v3_acervo_retriever', 'v3_thesis_retriever',
      'v3_thesis_builder', 'v3_devil_advocate', 'v3_thesis_refiner',
      'v3_legislation_researcher', 'v3_jurisprudence_researcher', 'v3_doctrine_researcher',
      'v3_citation_verifier',
      'v3_outline_planner', 'v3_writer',
      'qualidade', 'salvando',
      DOCUMENT_V3_PIPELINE_COMPLETED_PHASE,
    ]))

    // Persistence: status started as processando, ended as concluido
    const updateCalls = updateDocMock.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>
    const statuses = updateCalls.map(c => c[1].status as string | undefined).filter(Boolean) as string[]
    expect(statuses[0]).toBe('processando')
    expect(statuses).toContain('concluido')

    // Final update has texto_completo + quality_score + llm_executions
    const finalUpdate = updateCalls.find(c => c[1].status === 'concluido')
    expect(finalUpdate).toBeDefined()
    const finalPayload = finalUpdate![1]
    expect(finalPayload.texto_completo).toContain('PARECER JURÍDICO')
    expect(typeof finalPayload.quality_score).toBe('number')
    expect(Array.isArray(finalPayload.llm_executions)).toBe(true)
    expect((finalPayload.llm_executions as unknown[]).length).toBeGreaterThan(5)
  })

  it('runs Fase 1 agents in parallel (timestamps overlap)', async () => {
    const responses = buildLLMResponses()
    let cursor = 0
    const calls: RecordedCall[] = []
    callLLMMock.mockImplementation(async (_apiKey, system: string) => {
      const startedAt = Date.now()
      // The first three responses correspond to intent, parser, spotter
      await new Promise(resolve => setTimeout(resolve, 30))
      const r = responses[cursor++]
      const resolvedAt = Date.now()
      calls.push({ systemHead: system.slice(0, 40), startedAt, resolvedAt })
      return {
        content: r.content,
        model: 'anthropic/claude-sonnet-4',
        tokens_in: 1, tokens_out: 1, cost_usd: 0, duration_ms: 30,
        operational: { totalRetryCount: 0 },
      }
    })

    await generateDocumentV3('uid1', 'doc1', 'parecer', 'Req', [], null, () => {})

    // The first 3 calls (Fase 1 parallel) should have started before any of them resolved
    const firstThree = calls.slice(0, 3)
    const minStart = Math.min(...firstThree.map(c => c.startedAt))
    const minResolve = Math.min(...firstThree.map(c => c.resolvedAt))
    const maxStart = Math.max(...firstThree.map(c => c.startedAt))
    expect(maxStart).toBeLessThanOrEqual(minResolve) // started before any resolved
    expect(maxStart - minStart).toBeLessThan(20) // started effectively concurrently
  })

  it('supervisor retries the architect when output is invalid then accepts', async () => {
    const responses = buildLLMResponses()
    const validArchitectContent = responses[3].content
    let architectAttempts = 0

    callLLMMock.mockImplementation(async (_apiKey, system: string) => {
      const head = (system || '').slice(0, 60)
      let content: string
      if (head.startsWith('Você é o CLASSIFICADOR')) content = responses[0].content
      else if (head.startsWith('Você é o PARSER')) content = responses[1].content
      else if (head.startsWith('Você é o IDENTIFICADOR')) content = responses[2].content
      else if (head.startsWith('Você é o ARQUITETO')) {
        architectAttempts++
        content = architectAttempts === 1 ? 'NOT JSON AT ALL' : validArchitectContent
      }
      else if (head.startsWith('Você é o BUSCADOR DE ACERVO')) content = '1. doc.pdf — relevante'
      else if (head.startsWith('Você é o CONSTRUTOR DE TESES')) content = responses[4].content
      else if (head.startsWith('Você é o ADVOGADO DO DIABO')) content = responses[5].content
      else if (head.startsWith('Você é o REFINADOR DE TESES')) content = responses[6].content
      else if (head.startsWith('Você é o PESQUISADOR DE LEGISLAÇÃO')) content = responses[7].content
      else if (head.startsWith('Você é o PESQUISADOR DE JURISPRUDÊNCIA')) content = responses[8].content
      else if (head.startsWith('Você é o PESQUISADOR DE DOUTRINA')) content = responses[9].content
      else if (head.startsWith('Você é o VERIFICADOR DE CITAÇÕES')) content = responses[10].content
      else if (head.startsWith('Você é o PLANEJADOR DA ESTRUTURA')) content = responses[11].content
      else if (head.startsWith('Você é o REDATOR')) content = responses[12].content
      else content = '{}'

      return {
        content,
        model: 'anthropic/claude-sonnet-4',
        tokens_in: 1, tokens_out: 1, cost_usd: 0, duration_ms: 1,
        operational: { totalRetryCount: 0 },
      }
    })

    await generateDocumentV3('uid1', 'doc1', 'parecer', 'Req', [], null, () => {})
    expect(architectAttempts).toBe(2)
  })

  // ── New cases (complementary plan) ─────────────────────────────────────────

  function buildHeadRouter(responses: { content: string }[], overrides: Record<string, () => string> = {}) {
    return (system: string): string => {
      const head = (system || '').slice(0, 60)
      const findOverride = Object.entries(overrides).find(([k]) => head.startsWith(k))
      if (findOverride) return findOverride[1]()
      if (head.startsWith('Você é o CLASSIFICADOR')) return responses[0].content
      if (head.startsWith('Você é o PARSER')) return responses[1].content
      if (head.startsWith('Você é o IDENTIFICADOR')) return responses[2].content
      if (head.startsWith('Você é o ARQUITETO')) return responses[3].content
      if (head.startsWith('Você é o BUSCADOR DE ACERVO')) return '1. doc.pdf — relevante'
      if (head.startsWith('Você é o CONSTRUTOR DE TESES')) return responses[4].content
      if (head.startsWith('Você é o ADVOGADO DO DIABO')) return responses[5].content
      if (head.startsWith('Você é o REFINADOR DE TESES')) return responses[6].content
      if (head.startsWith('Você é o PESQUISADOR DE LEGISLAÇÃO')) return responses[7].content
      if (head.startsWith('Você é o PESQUISADOR DE JURISPRUDÊNCIA')) return responses[8].content
      if (head.startsWith('Você é o PESQUISADOR DE DOUTRINA')) return responses[9].content
      if (head.startsWith('Você é o VERIFICADOR DE CITAÇÕES')) return responses[10].content
      if (head.startsWith('Você é o PLANEJADOR DA ESTRUTURA')) return responses[11].content
      if (head.startsWith('Você é o REDATOR jurídico')) return responses[12].content
      if (head.startsWith('Você é o REVISOR DE REDAÇÃO')) return 'PARECER REVISADO\n\n' + 'Texto revisto e completo. '.repeat(60)
      return '{}'
    }
  }

  function defaultLLMResponse(content: string) {
    return {
      content,
      model: 'anthropic/claude-sonnet-4',
      tokens_in: 1, tokens_out: 1, cost_usd: 0, duration_ms: 1,
      operational: { totalRetryCount: 0 },
    }
  }

  it('F: preserves arbitrary caller `context` in the parser/architect prompts', async () => {
    const responses = buildLLMResponses()
    const router = buildHeadRouter(responses)
    const userPromptsByAgent: Record<string, string[]> = {}
    callLLMMock.mockImplementation(async (_apiKey, system: string, userPrompt: string) => {
      const head = (system || '').slice(0, 40)
      ;(userPromptsByAgent[head] = userPromptsByAgent[head] || []).push(userPrompt)
      return defaultLLMResponse(router(system))
    })

    await generateDocumentV3(
      'uid1', 'doc1', 'parecer', 'Req',
      [],
      { processo: '0001234-56.2024.8.26.0100', tribunal: 'TJSP' },
      () => {},
    )

    const parserPrompts = Object.entries(userPromptsByAgent).find(([k]) => k.startsWith('Você é o PARSER'))?.[1] ?? []
    expect(parserPrompts.length).toBeGreaterThan(0)
    expect(parserPrompts[0]).toContain('processo')
    expect(parserPrompts[0]).toContain('0001234-56.2024.8.26.0100')
    expect(parserPrompts[0]).toContain('TJSP')

    const architectPrompts = Object.entries(userPromptsByAgent).find(([k]) => k.startsWith('Você é o ARQUITETO'))?.[1] ?? []
    expect(architectPrompts[0]).toContain('TJSP')
  })

  it('B: respects parallelLimit=1 — Phase-1 calls run sequentially', async () => {
    const responses = buildLLMResponses()
    const router = buildHeadRouter(responses)
    const intervals: Array<{ agent: string; started: number; ended: number }> = []
    callLLMMock.mockImplementation(async (_apiKey, system: string) => {
      const head = (system || '').slice(0, 40)
      if (head.startsWith('Você é o CLASSIFICADOR') || head.startsWith('Você é o PARSER') || head.startsWith('Você é o IDENTIFICADOR')) {
        const started = Date.now()
        await new Promise(r => setTimeout(r, 30))
        intervals.push({ agent: head, started, ended: Date.now() })
      }
      return defaultLLMResponse(router(system))
    })

    await generateDocumentV3(
      'uid1', 'doc1', 'parecer', 'Req', [], null, () => {},
      undefined, undefined,
      { parallelLimit: 1 },
    )

    const phase1 = intervals.filter(i =>
      i.agent.startsWith('Você é o CLASSIFICADOR')
      || i.agent.startsWith('Você é o PARSER')
      || i.agent.startsWith('Você é o IDENTIFICADOR'),
    )
    expect(phase1).toHaveLength(3)
    phase1.sort((a, b) => a.started - b.started)
    // No overlapping intervals — strict serialization
    for (let i = 1; i < phase1.length; i++) {
      expect(phase1[i].started + 5).toBeGreaterThanOrEqual(phase1[i - 1].ended)
    }
  })

  it('C: triggers writer-reviser when the writer introduces unsupported citations', async () => {
    const responses = buildLLMResponses()
    // Writer output mentions a REsp number that is NOT in the research material.
    const fakeWriterText = 'PARECER JURÍDICO\n\nConforme REsp 9.876.543/SP, o caso aplica-se. ' + 'Texto extenso. '.repeat(80)
    const router = buildHeadRouter(responses, {
      'Você é o REDATOR jurídico': () => fakeWriterText,
    })
    let reviserCalled = false
    callLLMMock.mockImplementation(async (_apiKey, system: string) => {
      const head = (system || '').slice(0, 40)
      if (head.startsWith('Você é o REVISOR DE REDAÇÃO')) {
        reviserCalled = true
        return defaultLLMResponse('PARECER REVISADO\n\n' + 'Texto revisto sem citações fictícias. '.repeat(60))
      }
      return defaultLLMResponse(router(system))
    })

    await generateDocumentV3('uid1', 'doc1', 'parecer', 'Req', [], null, () => {})

    expect(reviserCalled).toBe(true)
    const updateCalls = updateDocMock.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>
    const finalUpdate = updateCalls.find(c => c[1].status === 'concluido')!
    const meta = finalUpdate[1].generation_meta as { supervisor_actions: Array<{ agent: string; action: string }> }
    expect(meta.supervisor_actions.some(a => a.agent === 'v3_writer_reviser' && a.action === 'revise_citations')).toBe(true)
  })

  it('I: outline-planner runs in parallel with Phase-3 research agents', async () => {
    const responses = buildLLMResponses()
    const router = buildHeadRouter(responses)
    const startedAt: Record<string, number> = {}
    callLLMMock.mockImplementation(async (_apiKey, system: string) => {
      const head = (system || '').slice(0, 40)
      if (
        head.startsWith('Você é o PESQUISADOR DE LEGISLAÇÃO')
        || head.startsWith('Você é o PESQUISADOR DE JURISPRUDÊNCIA')
        || head.startsWith('Você é o PESQUISADOR DE DOUTRINA')
        || head.startsWith('Você é o PLANEJADOR DA ESTRUTURA')
      ) {
        startedAt[head] = Date.now()
        await new Promise(r => setTimeout(r, 25))
      }
      return defaultLLMResponse(router(system))
    })

    await generateDocumentV3('uid1', 'doc1', 'parecer', 'Req', [], null, () => {},
      undefined, undefined,
      { parallelLimit: 4 },
    )

    const heads = Object.keys(startedAt)
    expect(heads.some(h => h.startsWith('Você é o PLANEJADOR'))).toBe(true)
    expect(heads.some(h => h.startsWith('Você é o PESQUISADOR DE LEGISLAÇÃO'))).toBe(true)
    const times = Object.values(startedAt)
    const span = Math.max(...times) - Math.min(...times)
    // All four started within a small window — i.e. concurrently.
    expect(span).toBeLessThan(20)
  })

  it('J: persists phase_durations_ms, parallel_savings_ms and supervisor_actions in generation_meta', async () => {
    const responses = buildLLMResponses()
    const router = buildHeadRouter(responses)
    callLLMMock.mockImplementation(async (_apiKey, system: string) => {
      return { ...defaultLLMResponse(router(system)), duration_ms: 50 }
    })
    await generateDocumentV3('uid1', 'doc1', 'parecer', 'Req', [], null, () => {})

    const updateCalls = updateDocMock.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>
    const finalUpdate = updateCalls.find(c => c[1].status === 'concluido')!
    const meta = finalUpdate[1].generation_meta as Record<string, unknown>
    expect(meta.pipeline_version).toBe('v3')
    expect(meta.phase_durations_ms).toBeTypeOf('object')
    const phases = meta.phase_durations_ms as Record<string, number>
    expect(typeof phases.compreensao).toBe('number')
    expect(typeof phases.analise).toBe('number')
    expect(typeof phases.pesquisa).toBe('number')
    expect(typeof phases.redacao).toBe('number')
    expect(typeof meta.parallel_savings_ms).toBe('number')
    expect(Array.isArray(meta.supervisor_actions)).toBe(true)
  })

  it('E: aborts when the AbortSignal fires before completion', async () => {
    const responses = buildLLMResponses()
    const router = buildHeadRouter(responses)
    const controller = new AbortController()
    callLLMMock.mockImplementation(async (_apiKey, system: string) => {
      // Simulate a slow first call; abort during it.
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 50)
        controller.signal.addEventListener('abort', () => {
          clearTimeout(t)
          const err = new DOMException('Aborted', 'AbortError')
          reject(err)
        })
      })
      return defaultLLMResponse(router(system))
    })
    setTimeout(() => controller.abort(), 5)
    await expect(
      generateDocumentV3(
        'uid1', 'doc1', 'parecer', 'Req', [], null, () => {},
        undefined, undefined,
        { signal: controller.signal },
      ),
    ).rejects.toThrow()
  })
})

describe('createDocumentV3', () => {
  beforeEach(() => {
    addDocMock.mockClear()
  })

  it('persists pipeline_version=v3 in request_context', async () => {
    await createDocumentV3('u', { document_type_id: 'parecer', original_request: 'Req' })
    expect(addDocMock).toHaveBeenCalled()
    const calls = addDocMock.mock.calls as unknown as Array<[unknown, { request_context: Record<string, unknown> }]>
    const payload = calls[0][1]
    expect(payload.request_context.pipeline_version).toBe('v3')
  })
})
