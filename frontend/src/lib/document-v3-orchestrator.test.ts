import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const callLLMMock = vi.fn()
const updateDocMock = vi.fn(async () => undefined)
const addDocMock = vi.fn(async () => ({ id: 'docX' }))
const collectionMock = vi.fn((_db: unknown, ..._segments: string[]) => ({ __col: _segments.join('/') }))
const docMock = vi.fn((_db: unknown, ..._segments: string[]) => ({ __ref: _segments.join('/') }))

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (...args: unknown[]) => collectionMock(...(args as [unknown, ...string[]])),
  doc: (...args: unknown[]) => docMock(...(args as [unknown, ...string[]])),
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
    const updateCalls = updateDocMock.mock.calls
    const statuses = updateCalls.map(c => (c[1] as { status?: string }).status).filter(Boolean)
    expect(statuses[0]).toBe('processando')
    expect(statuses).toContain('concluido')

    // Final update has texto_completo + quality_score + llm_executions
    const finalUpdate = updateCalls.find(c => (c[1] as { status?: string }).status === 'concluido')
    expect(finalUpdate).toBeDefined()
    const finalPayload = finalUpdate![1] as Record<string, unknown>
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
})

describe('createDocumentV3', () => {
  beforeEach(() => {
    addDocMock.mockClear()
  })

  it('persists pipeline_version=v3 in request_context', async () => {
    await createDocumentV3('u', { document_type_id: 'parecer', original_request: 'Req' })
    expect(addDocMock).toHaveBeenCalled()
    const payload = addDocMock.mock.calls[0][1] as { request_context: Record<string, unknown> }
    expect(payload.request_context.pipeline_version).toBe('v3')
  })
})
