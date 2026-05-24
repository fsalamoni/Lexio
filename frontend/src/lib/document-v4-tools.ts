/**
 * Document v4 — tool registry.
 *
 * The v4 single-agent loop calls tools from this catalog. Tools are described
 * to the LLM via `renderSkillsManifest` (reused from chat-orchestrator) and
 * dispatched after parsing the agent's JSON decision via
 * `parseOrchestratorDecision` (also reused). The shared adapter has no
 * chat-specific logic — it only operates on the manifest/JSON contract, so
 * importing it here avoids a 80-LOC fork.
 */
import { callLLMWithFallback, type LLMResult } from './llm-client'
import { createUsageExecutionRecord, type UsageExecutionRecord } from './cost-analytics'
import { getLLMOperationalUsageMeta } from './generation-service'
import {
  DEFAULT_TRIBUNALS,
  formatDataJudResults,
  parseDataJudRankingResponse,
  rerankSelectedDataJudResults,
  searchDataJud,
  type DataJudResult,
} from './datajud-service'
import {
  JURISPRUDENCE_RANKING_SYSTEM,
} from './jurisprudence-prompts'
import {
  searchWebResults,
  deepWebSearch,
  type WebSearchResult,
} from './web-search-service'
import { runAcervoRetriever } from './v3-agents/acervo-retriever'
import { runThesisRetriever } from './v3-agents/thesis-retriever'
import { verifyDraftCitations } from './v3-agents/citation-verifier'
import { evaluateQuality } from './quality-evaluator'
import type { UserProfileForGeneration } from './generation-service'
import type { ContextDetailData } from './firestore-types'

// ── Types ──────────────────────────────────────────────────────────────────────

/** Slim case context the v4 agent receives — no v3 phase artifacts. */
export interface DocumentV4CaseContext {
  request: string
  docType: string
  docTypeLabel: string
  areas: string[]
  areaLabels: string[]
  requestContext?: Record<string, unknown>
  profile?: UserProfileForGeneration | null
  profileBlock: string
  contextDetail?: ContextDetailData | null
  /**
   * Working draft mutated by `save_draft_section` and read by
   * `submit_final_answer`. The orchestrator initializes this with empty
   * sections and exposes it through `ctx.draft` so tools can append/replace
   * sections without round-tripping the entire text through the LLM.
   */
  draft: DocumentV4Draft
}

export interface DocumentV4Draft {
  sections: Array<{ title: string; markdown: string }>
  /** Most recent full text composed by `submit_final_answer`. */
  fullText: string
}

/**
 * Per-tool parameter descriptor used by the UI to render a control. The runtime
 * never enforces these — each tool validates its own args.
 */
export interface DocumentV4ToolParam {
  key: string
  label: string
  description?: string
  type: 'boolean' | 'number' | 'text' | 'select'
  defaultValue: unknown
  min?: number
  max?: number
  options?: Array<{ value: string; label: string }>
}

export interface DocumentV4Tool {
  name: string
  description: string
  argsHint: Record<string, string>
  /** User-configurable parameters surfaced in the Admin tools card. */
  paramSchema?: DocumentV4ToolParam[]
  run: (args: Record<string, unknown>, ctx: DocumentV4ToolContext) => Promise<DocumentV4ToolResult>
}

export interface DocumentV4ToolContext {
  uid: string
  docId: string
  docType: string
  apiKey: string
  signal?: AbortSignal
  caseContext: DocumentV4CaseContext
  /**
   * Per-user params for THIS tool resolved from `DocumentV4ToolsConfig`. Tools
   * read knobs like `max_results` or `use_llm_rerank` from here.
   */
  toolParams: Record<string, unknown>
  /** Model map (v4_agent, v4_critic). Used by LLM-firing tools. */
  modelMap: Record<string, string>
  fallbackModels?: readonly string[]
  /** Append a usage record so the orchestrator persists it on the document. */
  recordUsage: (record: UsageExecutionRecord) => void
  /** Emit a progress event (orchestrator forwards to UI). */
  emitProgress: (phase: string, message: string, meta?: { modelId?: string; stageMeta?: string }) => void
}

export interface DocumentV4ToolResult {
  /** Message appended to the agent's history describing what happened. */
  tool_message: string
  /** Set by `submit_final_answer` to terminate the loop. */
  final_answer?: string
  /** Optional extras the orchestrator may surface (currently unused). */
  metadata?: Record<string, unknown>
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function clip(text: string, max: number): string {
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Build a v3-style AgentRunContext for the few v3 retrievers we reuse. */
function buildV3ReusableCtx(ctx: DocumentV4ToolContext, model?: string) {
  return {
    apiKey: ctx.apiKey,
    model: model ?? ctx.modelMap.v4_agent ?? '',
    fallbackModel: ctx.fallbackModels ?? [],
    caseContext: {
      request: ctx.caseContext.request,
      docType: ctx.caseContext.docType,
      docTypeLabel: ctx.caseContext.docTypeLabel,
      areas: ctx.caseContext.areas,
      areaLabels: ctx.caseContext.areaLabels,
      requestContext: ctx.caseContext.requestContext,
    },
    profileBlock: ctx.caseContext.profileBlock,
    signal: ctx.signal,
  }
}

// ── Tools ──────────────────────────────────────────────────────────────────────

const readProfileTool: DocumentV4Tool = {
  name: 'read_profile',
  description: 'Lê o perfil profissional do usuário (instituição, áreas, estilo de redação, expressões preferidas). Sem custo — retorna dados locais.',
  argsHint: {},
  async run(_args, ctx) {
    const profileBlock = ctx.caseContext.profileBlock?.trim() ?? ''
    const profile = ctx.caseContext.profile
    if (profileBlock) {
      return { tool_message: `Perfil profissional do usuário:\n${profileBlock}` }
    }
    if (profile) {
      return { tool_message: `Perfil profissional do usuário:\n${JSON.stringify(profile, null, 2)}` }
    }
    return { tool_message: 'Perfil do usuário: não informado. Trabalhe com estilo neutro e formal.' }
  },
}

const readContextDetailTool: DocumentV4Tool = {
  name: 'read_context_detail',
  description: 'Lê o detalhamento de contexto (Q&A capturado na Anamnese Layer 2). Sem custo — retorna dados locais.',
  argsHint: {},
  async run(_args, ctx) {
    const cd = ctx.caseContext.contextDetail
    if (!cd || !cd.questions?.length) {
      return { tool_message: 'Detalhamento de contexto: não informado.' }
    }
    const lines = cd.questions.map(q => `- ${q.question}\n  Resposta: ${q.answer}`).join('\n')
    return {
      tool_message: `Detalhamento de contexto (${cd.questions.length} perguntas):\n${lines}\n\nResumo: ${cd.analysis_summary || '—'}`,
    }
  },
}

const searchAcervoTool: DocumentV4Tool = {
  name: 'search_acervo',
  description: 'Busca documentos relevantes no acervo do usuário (modelos, peças anteriores, anexos indexados). Use para inspirar estrutura e localizar precedentes do próprio escritório.',
  argsHint: {
    query: 'opcional — texto-livre da busca (default: tema do caso)',
  },
  paramSchema: [
    { key: 'use_llm_rerank', label: 'Re-ranquear via LLM', type: 'boolean', defaultValue: false, description: 'Quando true, usa o modelo do agente principal para re-ranquear os top-25 (consome tokens).' },
    { key: 'max_results', label: 'Máximo de resultados', type: 'number', defaultValue: 5, min: 1, max: 10 },
  ],
  async run(_args, ctx) {
    const useLlmRerank = asBool(ctx.toolParams.use_llm_rerank, false)
    const maxResults = Math.min(10, Math.max(1, asNumber(ctx.toolParams.max_results, 5)))
    if (!useLlmRerank) {
      // Lightweight path: rely on the v3 retriever's pre-listing, skip the LLM ranking,
      // and return up to `maxResults` docs by recency.
      const { getAllAcervoDocumentsForSearch } = await import('./firestore-service')
      let allDocs: Awaited<ReturnType<typeof getAllAcervoDocumentsForSearch>> = []
      try {
        allDocs = await getAllAcervoDocumentsForSearch(ctx.uid)
      } catch {
        return { tool_message: 'Acervo: erro ao consultar; o agente deve prosseguir sem o acervo.' }
      }
      if (allDocs.length === 0) {
        return { tool_message: 'Acervo: vazio. O agente deve prosseguir sem precedentes do usuário.' }
      }
      const top = allDocs.slice(0, maxResults)
      const snippets = top.map(d => `### ${d.filename}\n${(d.ementa || d.text_content || '').slice(0, 800)}`).join('\n\n')
      return {
        tool_message: `Acervo (${top.length} docs por recência):\n${snippets}`,
      }
    }
    // LLM rerank path: reuse v3's runAcervoRetriever and record its LLM usage.
    const v3Ctx = buildV3ReusableCtx(ctx, ctx.modelMap.v4_agent)
    const result = await runAcervoRetriever(v3Ctx, ctx.uid)
    if (result.llmResult) {
      ctx.recordUsage(createUsageExecutionRecord({
        source_type: 'document_generation_v4',
        source_id: ctx.docId,
        phase: 'v4_tool_search_acervo',
        agent_name: 'V4: search_acervo (LLM rerank)',
        model: result.llmResult.model,
        tokens_in: result.llmResult.tokens_in,
        tokens_out: result.llmResult.tokens_out,
        cost_usd: result.llmResult.cost_usd,
        duration_ms: result.llmResult.duration_ms,
        document_type_id: ctx.docType,
        ...getLLMOperationalUsageMeta(result.llmResult),
      }))
    }
    return {
      tool_message: result.output.snippets
        ? `Acervo (${result.output.selectedFilenames.length} selecionados via LLM):\n${result.output.snippets}`
        : 'Acervo: nenhum documento relevante selecionado.',
    }
  },
}

const searchThesisBankTool: DocumentV4Tool = {
  name: 'search_thesis_bank',
  description: 'Busca teses do banco do usuário relacionadas ao caso. Apenas I/O — sem custo de LLM.',
  argsHint: {},
  paramSchema: [
    { key: 'max_results', label: 'Máximo de teses', type: 'number', defaultValue: 12, min: 3, max: 20 },
  ],
  async run(_args, ctx) {
    const v3Ctx = buildV3ReusableCtx(ctx)
    const result = await runThesisRetriever(v3Ctx, ctx.uid)
    if (!result.output.snippets) {
      return { tool_message: 'Banco de teses: vazio para as áreas do caso.' }
    }
    return {
      tool_message: `Banco de teses (${result.output.count} encontradas):\n${result.output.snippets}`,
    }
  },
}

const searchJurisprudenceTool: DocumentV4Tool = {
  name: 'search_jurisprudence',
  description: 'Busca jurisprudência REAL no DataJud (STF/STJ/tribunais brasileiros). Retorna processos formatados (ementa, órgão, datas). Use cedo para basear seu raciocínio em precedentes verificáveis.',
  argsHint: {
    query: 'opcional — termos da busca (default: tema do caso)',
  },
  paramSchema: [
    { key: 'use_llm_rerank', label: 'Re-ranquear via LLM', type: 'boolean', defaultValue: false, description: 'Re-ranqueia os resultados via LLM antes de devolver (mais preciso, consome tokens).' },
    { key: 'max_per_tribunal', label: 'Máximo por tribunal', type: 'number', defaultValue: 5, min: 1, max: 10 },
  ],
  async run(args, ctx) {
    const useLlmRerank = asBool(ctx.toolParams.use_llm_rerank, false)
    const maxPerTribunal = Math.min(10, Math.max(1, asNumber(ctx.toolParams.max_per_tribunal, 5)))
    const explicitQuery = asString(args.query).trim()
    const query = (explicitQuery || ctx.caseContext.request).slice(0, 280)
    if (!query) {
      return { tool_message: 'Jurisprudência: consulta vazia. Forneça `query` ou garanta que o pedido do caso esteja preenchido.' }
    }
    let dj
    try {
      dj = await searchDataJud(query, {
        tribunals: DEFAULT_TRIBUNALS,
        maxPerTribunal,
        enrichMissingText: true,
        maxTextEnrichment: 10,
        signal: ctx.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Jurisprudência: DataJud indisponível (${(err as Error).message}). Prossiga com linguagem prudente sem citações de processos específicos.` }
    }
    if (!dj.results?.length) {
      return { tool_message: `Jurisprudência: nenhum resultado para "${clip(query, 80)}". Prossiga com linguagem prudente sem citações de processos específicos.` }
    }
    let results: DataJudResult[] = rerankSelectedDataJudResults(query, dj.results.slice(0, 12)).results
    if (useLlmRerank) {
      try {
        const rankModel = ctx.modelMap.v4_agent
        if (rankModel) {
          const userPrompt = `Consulta: "${query}"\n\nProcessos para avaliar:\n${formatDataJudResults(results)}`
          const llmResult = await callLLMWithFallback(
            ctx.apiKey,
            JURISPRUDENCE_RANKING_SYSTEM,
            userPrompt,
            rankModel,
            ctx.fallbackModels ?? [],
            800,
            0.1,
            { signal: ctx.signal },
          )
          const reranked = rerankSelectedDataJudResults(query, results, {
            ranking: parseDataJudRankingResponse(llmResult.content),
          })
          results = reranked.results
          ctx.recordUsage(createUsageExecutionRecord({
            source_type: 'document_generation_v4',
            source_id: ctx.docId,
            phase: 'v4_tool_search_jurisprudence',
            agent_name: 'V4: search_jurisprudence (LLM rerank)',
            model: llmResult.model,
            tokens_in: llmResult.tokens_in,
            tokens_out: llmResult.tokens_out,
            cost_usd: llmResult.cost_usd,
            duration_ms: llmResult.duration_ms,
            document_type_id: ctx.docType,
            ...getLLMOperationalUsageMeta(llmResult),
          }))
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err
        // Ranking failure is non-fatal; we keep the heuristic order.
      }
    }
    return {
      tool_message: `Jurisprudência DataJud (${results.length} julgados ranqueados):\n${formatDataJudResults(results)}`,
    }
  },
}

const searchWebTool: DocumentV4Tool = {
  name: 'search_web',
  description: 'Busca na web aberta (Jina/DuckDuckGo com fallbacks). Retorna título + url + trecho. Use para doutrina, notícias e contexto factual.',
  argsHint: {
    query: 'termos da busca',
  },
  paramSchema: [
    { key: 'max_results', label: 'Máximo de resultados', type: 'number', defaultValue: 8, min: 3, max: 15 },
  ],
  async run(args, ctx) {
    const query = asString(args.query).trim()
    const maxResults = Math.min(15, Math.max(3, asNumber(ctx.toolParams.max_results, 8)))
    if (!query) return { tool_message: 'Web: forneça `query`.' }
    let results: WebSearchResult[] = []
    try {
      results = await searchWebResults(query, ctx.signal)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Web: erro na busca (${(err as Error).message}).` }
    }
    if (!results.length) {
      return { tool_message: `Web: nenhum resultado para "${clip(query, 80)}".` }
    }
    const formatted = results.slice(0, maxResults).map((r, idx) =>
      `${idx + 1}. ${r.title}\n   URL: ${r.url}\n   ${clip(r.snippet || '', 240)}`,
    ).join('\n\n')
    return {
      tool_message: `Web (${Math.min(maxResults, results.length)} resultados para "${clip(query, 60)}"):\n${formatted}`,
    }
  },
}

const deepResearchWebTool: DocumentV4Tool = {
  name: 'deep_research_web',
  description: 'Pesquisa profunda na web — busca + extrai o conteúdo das páginas top. Mais lenta e cara que `search_web`. Indicada para tópicos complexos sem precedentes claros.',
  argsHint: {
    query: 'termos da busca',
  },
  paramSchema: [
    { key: 'max_pages', label: 'Máximo de páginas extraídas', type: 'number', defaultValue: 3, min: 1, max: 6 },
  ],
  async run(args, ctx) {
    const query = asString(args.query).trim()
    const maxPages = Math.min(6, Math.max(1, asNumber(ctx.toolParams.max_pages, 3)))
    if (!query) return { tool_message: 'Pesquisa profunda: forneça `query`.' }
    try {
      const result = await deepWebSearch(query, undefined, ctx.signal)
      const contents = (result.contents ?? []).slice(0, maxPages)
      if (contents.length === 0) {
        return { tool_message: `Pesquisa profunda — "${clip(query, 60)}": busca executada mas nenhuma página extraída. Resultados crus: ${result.results.length}.` }
      }
      const blocks = contents.map((c, idx) =>
        `### ${idx + 1}. ${c.title || c.url}\nURL: ${c.url}\n\n${clip(c.content, 2400)}`,
      ).join('\n\n')
      return {
        tool_message: `Pesquisa profunda — "${clip(query, 60)}" (${contents.length} páginas extraídas, ${result.fetchFailures} falhas):\n\n${blocks}`,
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      return { tool_message: `Pesquisa profunda: falhou (${(err as Error).message}). Use search_web como fallback.` }
    }
  },
}

const verifyCitationsTool: DocumentV4Tool = {
  name: 'verify_citations',
  description: 'Verifica se as citações do rascunho atual constam dos materiais coletados nas pesquisas (acervo/jurisprudência/web). Modo padrão é heurístico (determinístico, sem LLM); pode subir para LLM via param.',
  argsHint: {
    draft: 'opcional — texto a verificar (default: rascunho corrente)',
    grounded_sources: 'opcional — array de textos de referência',
  },
  paramSchema: [
    { key: 'use_llm_review', label: 'Revisão por LLM além do heurístico', type: 'boolean', defaultValue: false, description: 'Quando true, executa também uma revisão por LLM (custo extra).' },
  ],
  async run(args, ctx) {
    const draft = asString(args.draft) || ctx.caseContext.draft.fullText || ctx.caseContext.draft.sections.map(s => `## ${s.title}\n${s.markdown}`).join('\n\n')
    if (!draft.trim()) {
      return { tool_message: 'Verificação de citações: o rascunho está vazio. Use save_draft_section primeiro.' }
    }
    const groundedRaw = Array.isArray(args.grounded_sources) ? args.grounded_sources : []
    const grounded = groundedRaw.map(item => typeof item === 'string' ? item : '').filter(Boolean)
    const check = verifyDraftCitations(draft, grounded)
    const summary = [
      `Citações detectadas no rascunho: ${check.detected.length}`,
      `Citações fundamentadas: ${check.grounded.length}`,
      `Não fundamentadas (revisar): ${check.unsupported.length}`,
    ].join('\n')
    const unsupported = check.unsupported.length
      ? `\n\nLista de não fundamentadas:\n${check.unsupported.map(c => `- ${c}`).join('\n')}`
      : ''
    // LLM review path intentionally lightweight in this release — flag-controlled.
    if (asBool(ctx.toolParams.use_llm_review, false) && check.unsupported.length > 0) {
      const reviewModel = ctx.modelMap.v4_critic || ctx.modelMap.v4_agent
      if (reviewModel) {
        try {
          const userPrompt = [
            'Avalie a plausibilidade das citações listadas abaixo no contexto do rascunho. Para cada uma, diga (a) se parece plausível, (b) sugestão de revisão prudente quando necessário.',
            '',
            'Citações não fundamentadas:',
            ...check.unsupported.map(c => `- ${c}`),
            '',
            'Rascunho:',
            clip(draft, 8000),
          ].join('\n')
          const llmResult = await callLLMWithFallback(
            ctx.apiKey,
            'Você é um revisor de citações jurídicas brasileiras. Seja preciso e prudente. Responda em markdown.',
            userPrompt,
            reviewModel,
            ctx.fallbackModels ?? [],
            1200,
            0.2,
            { signal: ctx.signal },
          )
          ctx.recordUsage(createUsageExecutionRecord({
            source_type: 'document_generation_v4',
            source_id: ctx.docId,
            phase: 'v4_tool_verify_citations',
            agent_name: 'V4: verify_citations (LLM review)',
            model: llmResult.model,
            tokens_in: llmResult.tokens_in,
            tokens_out: llmResult.tokens_out,
            cost_usd: llmResult.cost_usd,
            duration_ms: llmResult.duration_ms,
            document_type_id: ctx.docType,
            ...getLLMOperationalUsageMeta(llmResult),
          }))
          return { tool_message: `${summary}${unsupported}\n\nRevisão LLM:\n${llmResult.content.trim()}` }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err
        }
      }
    }
    return { tool_message: `${summary}${unsupported}` }
  },
}

const evaluateQualityTool: DocumentV4Tool = {
  name: 'evaluate_quality',
  description: 'Avalia qualidade heurística do rascunho corrente (score 0-100, regras passadas/falhadas). Sem custo de LLM.',
  argsHint: {},
  async run(_args, ctx) {
    const text = ctx.caseContext.draft.fullText || ctx.caseContext.draft.sections.map(s => `## ${s.title}\n${s.markdown}`).join('\n\n')
    if (!text.trim()) {
      return { tool_message: 'Qualidade: o rascunho está vazio. Salve seções primeiro.' }
    }
    const result = evaluateQuality(text, ctx.docType, {})
    const passed = result.passed?.map(r => `+ ${r}`).join('\n') ?? ''
    const failed = result.failed?.map(r => `- ${r}`).join('\n') ?? ''
    return {
      tool_message: `Qualidade heurística: score ${result.score}/100.\nRegras OK:\n${passed || '(nenhuma)'}\n\nRegras pendentes:\n${failed || '(nenhuma)'}`,
    }
  },
}

const saveDraftSectionTool: DocumentV4Tool = {
  name: 'save_draft_section',
  description: 'Acrescenta (ou substitui) uma seção do rascunho. O rascunho é montado seção a seção; quando estiver completo, chame submit_final_answer.',
  argsHint: {
    title: 'título da seção (use MAIÚSCULAS para títulos de capítulo)',
    markdown: 'conteúdo da seção em texto/markdown',
    replace: 'opcional — true para substituir uma seção existente com o mesmo título (default: false, acrescenta nova)',
  },
  async run(args, ctx) {
    const title = asString(args.title).trim()
    const markdown = asString(args.markdown).trim()
    const replace = asBool(args.replace, false)
    if (!title) return { tool_message: 'save_draft_section: forneça `title`.' }
    if (!markdown) return { tool_message: 'save_draft_section: forneça `markdown` (vazio).' }
    if (replace) {
      const idx = ctx.caseContext.draft.sections.findIndex(s => s.title.toLowerCase() === title.toLowerCase())
      if (idx >= 0) {
        ctx.caseContext.draft.sections[idx] = { title, markdown }
        return { tool_message: `Seção "${title}" substituída (${markdown.length} chars).` }
      }
    }
    ctx.caseContext.draft.sections.push({ title, markdown })
    return { tool_message: `Seção "${title}" adicionada (${markdown.length} chars). Total: ${ctx.caseContext.draft.sections.length} seções.` }
  },
}

const submitFinalAnswerTool: DocumentV4Tool = {
  name: 'submit_final_answer',
  description: 'Finaliza o documento. O `markdown` é o texto completo do documento jurídico, pronto para o usuário. Use exatamente UMA vez, depois de salvar todas as seções necessárias.',
  argsHint: {
    markdown: 'texto final completo do documento (markdown puro, sem JSON)',
  },
  async run(args, ctx) {
    const markdown = asString(args.markdown).trim()
    if (!markdown) {
      // Last-resort fallback: assemble sections if the agent forgot to pass markdown
      const assembled = ctx.caseContext.draft.sections.map(s => `## ${s.title}\n\n${s.markdown}`).join('\n\n')
      if (!assembled) return { tool_message: 'submit_final_answer: nenhum markdown fornecido e o rascunho está vazio. Salve seções e chame de novo.' }
      ctx.caseContext.draft.fullText = assembled
      return { tool_message: 'Documento finalizado a partir das seções salvas.', final_answer: assembled }
    }
    ctx.caseContext.draft.fullText = markdown
    return { tool_message: 'Documento finalizado.', final_answer: markdown }
  },
}

/**
 * Static catalog of available tools. The orchestrator filters this list by
 * the user's enabled-tools config before passing to the LLM.
 */
export const DOCUMENT_V4_TOOLS_CATALOG: DocumentV4Tool[] = [
  readProfileTool,
  readContextDetailTool,
  searchAcervoTool,
  searchThesisBankTool,
  searchJurisprudenceTool,
  searchWebTool,
  deepResearchWebTool,
  verifyCitationsTool,
  evaluateQualityTool,
  saveDraftSectionTool,
  submitFinalAnswerTool,
]

export function getDocumentV4ToolByName(name: string): DocumentV4Tool | undefined {
  return DOCUMENT_V4_TOOLS_CATALOG.find(t => t.name === name)
}
