import { describe, expect, it, vi } from 'vitest'

vi.mock('./firebase', () => ({ IS_FIREBASE: true }))
vi.mock('./llm-client', () => ({
  callLLMWithFallback: vi.fn(async () => ({ content: 'ok', model: 'm', tokens_in: 0, tokens_out: 0, cost_usd: 0, duration_ms: 1, operational: { totalRetryCount: 0 } })),
}))
vi.mock('./generation-service', () => ({
  getLLMOperationalUsageMeta: () => ({ execution_state: 'completed' as const, retry_count: 0, used_fallback: null, fallback_from: null }),
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
vi.mock('./v3-agents/acervo-retriever', () => ({ runAcervoRetriever: async () => ({ output: { snippets: '', selectedFilenames: [] }, llmResult: null }) }))
vi.mock('./v3-agents/thesis-retriever', () => ({ runThesisRetriever: async () => ({ output: { snippets: '', count: 0 }, llmResult: null }) }))
vi.mock('./firestore-service', () => ({
  getAllAcervoDocumentsForSearch: async () => [
    { filename: 'modelo-1.docx', ementa: 'Modelo de petição inicial sobre tema X', text_content: 'lorem ipsum' },
    { filename: 'parecer-2024.pdf', ementa: 'Parecer sobre cláusula penal', text_content: 'foo bar' },
  ],
}))

import { DOCUMENT_V4_TOOLS_CATALOG, getDocumentV4ToolByName, type DocumentV4ToolContext } from './document-v4-tools'

function makeCtx(overrides: Partial<DocumentV4ToolContext> = {}): DocumentV4ToolContext {
  return {
    uid: 'uid1',
    docId: 'doc1',
    docType: 'parecer',
    apiKey: 'sk-or-v1-test',
    signal: undefined,
    caseContext: {
      request: 'Pedido do caso',
      docType: 'parecer',
      docTypeLabel: 'Parecer Jurídico',
      areas: ['civil'],
      areaLabels: ['Direito Civil'],
      profile: null,
      profileBlock: 'PERFIL: Estilo formal acadêmico.',
      contextDetail: null,
      draft: { sections: [], fullText: '' },
    },
    toolParams: {},
    modelMap: { v4_agent: 'anthropic/claude-opus-4', v4_critic: 'anthropic/claude-sonnet-4' },
    fallbackModels: [],
    recordUsage: () => {},
    emitProgress: () => {},
    ...overrides,
  }
}

describe('Document v4 tools — catalog basics', () => {
  it('exposes a unique-name catalog with submit_final_answer present', () => {
    const names = DOCUMENT_V4_TOOLS_CATALOG.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('submit_final_answer')
    expect(names).toContain('read_profile')
    expect(names).toContain('search_acervo')
  })

  it('getDocumentV4ToolByName returns the tool or undefined', () => {
    expect(getDocumentV4ToolByName('read_profile')?.name).toBe('read_profile')
    expect(getDocumentV4ToolByName('nonexistent')).toBeUndefined()
  })
})

describe('Document v4 tools — pure tools', () => {
  it('read_profile returns the profile block', async () => {
    const tool = getDocumentV4ToolByName('read_profile')!
    const result = await tool.run({}, makeCtx())
    expect(result.tool_message).toContain('PERFIL: Estilo formal acadêmico.')
  })

  it('read_profile handles missing profile gracefully', async () => {
    const tool = getDocumentV4ToolByName('read_profile')!
    const ctx = makeCtx({ caseContext: { ...makeCtx().caseContext, profile: null, profileBlock: '' } })
    const result = await tool.run({}, ctx)
    expect(result.tool_message).toContain('não informado')
  })

  it('read_context_detail formats Q&A when present', async () => {
    const tool = getDocumentV4ToolByName('read_context_detail')!
    const ctx = makeCtx({
      caseContext: {
        ...makeCtx().caseContext,
        contextDetail: {
          analysis_summary: 'Resumo da anamnese',
          questions: [
            { id: 'q1', question: 'Há prazo?', answer: 'Sim, 30 dias.' },
            { id: 'q2', question: 'Há contrato?', answer: 'Sim, assinado em 2024.' },
          ],
        },
      },
    })
    const result = await tool.run({}, ctx)
    expect(result.tool_message).toContain('Há prazo?')
    expect(result.tool_message).toContain('Sim, 30 dias')
    expect(result.tool_message).toContain('Resumo da anamnese')
  })

  it('save_draft_section appends a section', async () => {
    const tool = getDocumentV4ToolByName('save_draft_section')!
    const ctx = makeCtx()
    const result = await tool.run({ title: 'INTRODUÇÃO', markdown: 'Texto da introdução.' }, ctx)
    expect(result.tool_message).toContain('Seção "INTRODUÇÃO" adicionada')
    expect(ctx.caseContext.draft.sections).toHaveLength(1)
    expect(ctx.caseContext.draft.sections[0].title).toBe('INTRODUÇÃO')
  })

  it('save_draft_section replace=true substitutes existing section', async () => {
    const tool = getDocumentV4ToolByName('save_draft_section')!
    const ctx = makeCtx()
    await tool.run({ title: 'INTRODUÇÃO', markdown: 'V1' }, ctx)
    const result = await tool.run({ title: 'introdução', markdown: 'V2', replace: true }, ctx)
    expect(result.tool_message).toContain('substituída')
    expect(ctx.caseContext.draft.sections).toHaveLength(1)
    expect(ctx.caseContext.draft.sections[0].markdown).toBe('V2')
  })

  it('save_draft_section rejects empty inputs', async () => {
    const tool = getDocumentV4ToolByName('save_draft_section')!
    const r1 = await tool.run({ markdown: 'x' }, makeCtx())
    expect(r1.tool_message).toContain('title')
    const r2 = await tool.run({ title: 'X', markdown: '' }, makeCtx())
    expect(r2.tool_message).toContain('markdown')
  })

  it('submit_final_answer returns final_answer when markdown is provided', async () => {
    const tool = getDocumentV4ToolByName('submit_final_answer')!
    const result = await tool.run({ markdown: 'TEXTO FINAL DO DOCUMENTO' }, makeCtx())
    expect(result.final_answer).toBe('TEXTO FINAL DO DOCUMENTO')
  })

  it('submit_final_answer falls back to assembled sections when markdown is empty', async () => {
    const tool = getDocumentV4ToolByName('submit_final_answer')!
    const ctx = makeCtx()
    ctx.caseContext.draft.sections.push({ title: 'A', markdown: 'Conteúdo de A.' })
    ctx.caseContext.draft.sections.push({ title: 'B', markdown: 'Conteúdo de B.' })
    const result = await tool.run({ markdown: '' }, ctx)
    expect(result.final_answer).toContain('## A')
    expect(result.final_answer).toContain('Conteúdo de B.')
  })

  it('evaluate_quality returns a numeric score for non-empty drafts', async () => {
    const tool = getDocumentV4ToolByName('evaluate_quality')!
    const ctx = makeCtx()
    ctx.caseContext.draft.sections.push({ title: 'X', markdown: 'algum texto'.repeat(40) })
    const result = await tool.run({}, ctx)
    expect(result.tool_message).toMatch(/score \d+\/100/)
  })

  it('verify_citations heuristic mode flags ungrounded citations', async () => {
    const tool = getDocumentV4ToolByName('verify_citations')!
    const ctx = makeCtx({ toolParams: { use_llm_review: false } })
    const draft = 'O REsp 1.234.567/SP firma esse entendimento. Lei nº 8.078/1990 também aplica.'
    const result = await tool.run({ draft, grounded_sources: ['Lei nº 8.078/1990'] }, ctx)
    expect(result.tool_message).toContain('Citações fundamentadas')
    expect(result.tool_message).toContain('Não fundamentadas')
    expect(result.tool_message).toContain('REsp 1.234.567/SP')
  })

  it('search_acervo lightweight path returns docs by recency without LLM', async () => {
    const tool = getDocumentV4ToolByName('search_acervo')!
    const ctx = makeCtx({ toolParams: { use_llm_rerank: false, max_results: 2 } })
    const result = await tool.run({}, ctx)
    expect(result.tool_message).toContain('modelo-1.docx')
    expect(result.tool_message).toContain('Acervo')
  })
})
