import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const llmCallMock = vi.fn()
const updateDocMock = vi.fn(async (..._args: unknown[]) => undefined)
const addDocMock = vi.fn(async (..._args: unknown[]) => ({ id: 'docV4' }))
const collectionMock = vi.fn((..._args: unknown[]) => ({ __col: true }))
const docMock = vi.fn((..._args: unknown[]) => ({ __ref: true }))

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (...args: unknown[]) => collectionMock(...args),
  doc: (...args: unknown[]) => docMock(...args),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}))
vi.mock('firebase/app', () => ({ getApp: () => ({}) }))

vi.mock('./llm-client', () => ({
  // Both fallback variants share the same queued mock so tests can script the
  // full sequence (orchestrator loop + critic) in one ordered responses array.
  callLLMWithMessagesFallback: (...args: unknown[]) => llmCallMock(...args),
  callLLMWithFallback: (...args: unknown[]) => llmCallMock(...args),
  ModelUnavailableError: class {},
  TransientLLMError: class {},
}))

vi.mock('./model-config', () => ({
  DOCUMENT_V4_PIPELINE_AGENT_DEFS: [
    { key: 'v4_agent', agentCategory: 'writing' },
    { key: 'v4_critic', agentCategory: 'reasoning' },
  ],
  loadDocumentV4Models: async () => ({
    v4_agent: 'anthropic/claude-opus-4',
    v4_critic: 'anthropic/claude-sonnet-4',
  }),
  loadFallbackPriorityConfig: async () => ({}),
  resolveFallbackModelsForCategory: () => [],
}))

vi.mock('./generation-service', () => ({
  getLLMOperationalUsageMeta: () => ({ execution_state: 'completed' as const, retry_count: 0, used_fallback: null, fallback_from: null }),
  getOpenRouterKey: async () => 'sk-or-v1-test',
}))

vi.mock('./modules/documents', () => ({
  AREA_NAMES: { civil: 'Direito Civil' },
  DOC_TYPE_NAMES: { parecer: 'Parecer Jurídico' },
  buildProfileBlock: () => '',
}))

vi.mock('./firestore-service', () => ({
  loadAdminDocumentTypes: async () => [],
  getAllAcervoDocumentsForSearch: async () => [],
  listTheses: async () => ({ items: [] }),
  writeUserScoped: async (uid: string, _label: string, op: (db: unknown, effectiveUid: string) => Promise<unknown>) => op({}, uid),
}))

vi.mock('./document-v4-tools-config', () => ({
  loadDocumentV4ToolsConfig: async () => ({
    schema_version: 1,
    tools: {
      read_profile: { enabled: true, params: {} },
      read_context_detail: { enabled: true, params: {} },
      search_acervo: { enabled: true, params: { use_llm_rerank: false, max_results: 5 } },
      search_thesis_bank: { enabled: false, params: {} }, // disabled — should be filtered out
      search_jurisprudence: { enabled: true, params: {} },
      search_web: { enabled: true, params: {} },
      deep_research_web: { enabled: true, params: {} },
      verify_citations: { enabled: true, params: {} },
      evaluate_quality: { enabled: true, params: {} },
      save_draft_section: { enabled: true, params: {} },
      submit_final_answer: { enabled: true, params: {} },
    },
  }),
  getDefaultDocumentV4ToolsConfig: () => ({ schema_version: 1, tools: {} }),
  saveDocumentV4ToolsConfig: vi.fn(),
  resetDocumentV4ToolsConfig: vi.fn(),
}))

vi.mock('./datajud-service', () => ({
  DEFAULT_TRIBUNALS: [],
  searchDataJud: async () => ({ results: [] }),
  formatDataJudResults: () => '',
  parseDataJudRankingResponse: () => null,
  rerankSelectedDataJudResults: (_q: unknown, results: unknown[]) => ({ results }),
}))
vi.mock('./web-search-service', () => ({
  searchWebResults: async () => [],
  deepWebSearch: async () => ({ results: [], contents: [], durationMs: 1, fetchFailures: 0 }),
}))

// ── System under test ────────────────────────────────────────────────────────

import { generateDocumentV4, createDocumentV4 } from './document-v4-orchestrator'
import { DOCUMENT_V4_PIPELINE_COMPLETED_PHASE } from './document-v4-pipeline'

function makeLLMResult(content: string) {
  return {
    content,
    model: 'anthropic/claude-opus-4',
    tokens_in: 100,
    tokens_out: 200,
    cost_usd: 0.01,
    duration_ms: 30,
    operational: { totalRetryCount: 0 },
  }
}

describe('generateDocumentV4 orchestrator', () => {
  beforeEach(() => {
    llmCallMock.mockReset()
    updateDocMock.mockClear()
    addDocMock.mockClear()
  })

  it('runs a happy-path loop and persists with v4 metadata', async () => {
    // Sequence: read_profile → save_draft_section → submit_final_answer → critic OK
    let i = 0
    const responses = [
      JSON.stringify({ tool: 'read_profile', args: {} }),
      JSON.stringify({ tool: 'save_draft_section', args: { title: 'INTRODUÇÃO', markdown: 'Texto da introdução suficiente para o teste passar nas validações mínimas. '.repeat(20) } }),
      JSON.stringify({ tool: 'submit_final_answer', args: { markdown: 'PARECER JURÍDICO\n\n' + 'Texto final do documento gerado pelo v4. '.repeat(80) } }),
      // Critic verdict
      JSON.stringify({ score: 85, reasons: ['Bom raciocínio'], should_stop: true }),
    ]
    llmCallMock.mockImplementation(async () => makeLLMResult(responses[i++]))

    const phases: string[] = []
    await generateDocumentV4(
      'uid1', 'docV4', 'parecer', 'Quero parecer sobre X', ['civil'], null,
      (p) => { phases.push(p.phase) },
    )

    expect(phases).toContain('init')
    expect(phases).toContain('v4_agent')
    expect(phases).toContain('v4_critic')
    expect(phases).toContain('finalize')
    expect(phases).toContain(DOCUMENT_V4_PIPELINE_COMPLETED_PHASE)

    const updateCalls = updateDocMock.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>
    const finalUpdate = updateCalls.find(c => c[1].status === 'concluido')
    expect(finalUpdate).toBeDefined()
    const payload = finalUpdate![1]
    expect(payload.texto_completo).toContain('PARECER JURÍDICO')
    expect(Array.isArray(payload.llm_executions)).toBe(true)
    const meta = payload.generation_meta as Record<string, unknown>
    expect(meta.pipeline_version).toBe('v4')
    expect(meta.primary_agent).toBe('v4_agent')
    expect(meta.critic_score).toBe(85)
    expect(meta.iterations).toBeGreaterThanOrEqual(3)
  })

  it('forces submit_final_answer when iteration cap is reached', async () => {
    // Agent keeps reading the profile without ever submitting — cap forces submission.
    let i = 0
    llmCallMock.mockImplementation(async () => {
      i += 1
      if (i >= 5) {
        // After the budget nudge, the agent finally submits
        return makeLLMResult(JSON.stringify({ tool: 'submit_final_answer', args: { markdown: 'TEXTO FINAL FORÇADO PELO CAP DE ITERAÇÕES.' } }))
      }
      return makeLLMResult(JSON.stringify({ tool: 'read_profile', args: {} }))
    })

    await generateDocumentV4(
      'uid1', 'docV4', 'parecer', 'Req', [], null, () => {},
      undefined, undefined,
      { maxIterations: 4 }, // tight cap
    )

    const updateCalls = updateDocMock.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>
    const finalUpdate = updateCalls.find(c => c[1].status === 'concluido')
    expect(finalUpdate).toBeDefined()
    const meta = finalUpdate![1].generation_meta as Record<string, unknown>
    expect(meta.forced_submission).toBe(true)
  })

  it('rejects calls to disabled tools and re-prompts the agent', async () => {
    // First decision: pick a disabled tool. Second: pick submit_final_answer.
    let i = 0
    const responses = [
      JSON.stringify({ tool: 'search_thesis_bank', args: {} }), // disabled in mock config
      JSON.stringify({ tool: 'submit_final_answer', args: { markdown: 'TEXTO MÍNIMO FINAL ' + 'X '.repeat(60) } }),
    ]
    llmCallMock.mockImplementation(async () => makeLLMResult(responses[Math.min(i++, responses.length - 1)]))

    await generateDocumentV4(
      'uid1', 'docV4', 'parecer', 'Req', [], null, () => {},
    )

    // The first call's tool was disabled; the orchestrator should have echoed the
    // TOOL_NOT_FOUND error and asked the agent to retry. We can verify that the
    // re-prompt happened by checking the LLM was called at least twice.
    expect(llmCallMock).toHaveBeenCalled()
    expect(llmCallMock.mock.calls.length).toBeGreaterThanOrEqual(2)

    // Final persistence still succeeded via the second call's submit_final_answer.
    const updateCalls = updateDocMock.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>
    expect(updateCalls.some(c => c[1].status === 'concluido')).toBe(true)
  })

  it('triggers a revision when the critic verdict is below threshold', async () => {
    let i = 0
    const responses = [
      JSON.stringify({ tool: 'submit_final_answer', args: { markdown: 'PRIMEIRA VERSÃO ' + 'X '.repeat(60) } }),
      // Critic verdict: low score
      JSON.stringify({ score: 40, reasons: ['Falta fundamentação'], should_stop: false }),
      // Revision: agent submits again
      JSON.stringify({ tool: 'submit_final_answer', args: { markdown: 'SEGUNDA VERSÃO REVISADA ' + 'Y '.repeat(60) } }),
    ]
    llmCallMock.mockImplementation(async () => makeLLMResult(responses[i++]))

    await generateDocumentV4(
      'uid1', 'docV4', 'parecer', 'Req', [], null, () => {},
    )

    const updateCalls = updateDocMock.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>
    const finalUpdate = updateCalls.find(c => c[1].status === 'concluido')
    expect(finalUpdate).toBeDefined()
    expect(finalUpdate![1].texto_completo).toContain('SEGUNDA VERSÃO REVISADA')
    const meta = finalUpdate![1].generation_meta as Record<string, unknown>
    expect(meta.critic_score).toBe(40)
  })

  it('creates a document with the v4 pipeline_version marker', async () => {
    const result = await createDocumentV4('uid1', {
      document_type_id: 'parecer',
      original_request: 'meu pedido',
      legal_area_ids: ['civil'],
    })
    expect(result.id).toBe('docV4')
    expect(addDocMock).toHaveBeenCalled()
    const payload = addDocMock.mock.calls[0][1] as Record<string, unknown>
    expect((payload.request_context as Record<string, unknown>).pipeline_version).toBe('v4')
  })
})
