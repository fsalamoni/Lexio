/**
 * Thesis Bank Analyzer — resilient thesis curation pipeline.
 *
 * Pipeline:
 *   1. Inventário local — deterministic similarity clustering of existing theses
 *   2. Analista        — deep analysis: duplicates / complementary / contradictory
 *   3. Compilador      — draft compiled thesis for each merge group
 *   4. Curador         — extract new theses from unanalyzed acervo documents
 *   5. Revisor Final   — rank, annotate and produce the final suggestion list
 *
 * The pipeline is user-triggered (never automatic) and produces a list of
 * AnalysisSuggestion objects that the user can accept, modify or reject.
 */

import { callLLMWithFallback, RELIABLE_TEXT_FALLBACK_MODEL, TransientLLMError, type LLMResult } from './llm-client'
import { type ThesisData, type AcervoDocumentData } from './firestore-service'
import { buildUsageSummary, createUsageExecutionRecord, type UsageExecutionRecord, type UsageSummary } from './cost-analytics'
import { type ThesisAnalystModelMap, validateModelMap, THESIS_ANALYST_AGENT_DEFS, buildPipelineFallbackResolver, loadFallbackPriorityConfig } from './model-config'
import {
  buildRuntimeProfileKey,
  formatAdaptiveConcurrency,
  formatRuntimeHints,
  getRuntimeConcurrencyHints,
  resolveAdaptiveConcurrencyWithDiagnostics,
  runWithConcurrency,
} from './runtime-concurrency'
import type { PipelineExecutionState } from './pipeline-execution-contract'
import { THESIS_PIPELINE_STAGES } from './thesis-pipeline'
import { createOrchestratorUsageExecution, resolveOrchestratorModel } from './pipeline-orchestrator'
import { humanizeError } from './error-humanizer'

// ── Public types ──────────────────────────────────────────────────────────────

export type SuggestionType = 'merge' | 'delete' | 'create' | 'improve'
export type SuggestionPriority = 'high' | 'medium' | 'low'

export interface AnalysisSuggestion {
  /** Unique ID generated client-side (for React keys and tracking). */
  id: string
  type: SuggestionType
  priority: SuggestionPriority
  /** Estimated value of applying this suggestion (1–10). */
  impact_score: number
  /** Short display title for the suggestion card. */
  title: string
  /** Human-readable description of what will happen. */
  description: string
  /** Detailed justification from the Revisor agent. */
  rationale: string
  /** IDs of theses affected (to merge or delete). */
  affected_thesis_ids?: string[]
  /** Titles of affected theses (for display without extra lookups). */
  affected_thesis_titles?: string[]
  /**
   * Proposed thesis data.
   * For type='merge': the compiled replacement.
   * For type='create': the new thesis.
   * For type='improve': the updated version.
   */
  proposed_thesis?: {
    title: string
    content: string
    summary: string
    legal_area_id: string
    tags?: string[]
    quality_score?: number
  }
}

export interface AgentProgress {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  message?: string
  executionState?: PipelineExecutionState
}

export interface ThesisAnalysisResult {
  session_id: string
  created_at: string
  total_theses_analyzed: number
  total_docs_analyzed: number
  new_doc_count: number
  suggestions: AnalysisSuggestion[]
  executive_summary: string
  usage_summary: UsageSummary
  llm_executions: UsageExecutionRecord[]
  pipeline_meta?: ThesisAnalysisPipelineMeta
}

export type ProgressCallback = (agents: AgentProgress[]) => void

export interface ThesisAnalysisPipelineMeta {
  pipeline_version: 'thesis_parallel_v1' | 'thesis_parallel_v2'
  phase_durations_ms: Record<string, number>
  total_agent_duration_ms: number
  wall_clock_ms: number
  parallel_savings_ms: number
  parallel_limit: number
  compilador_parallel_limit: number
  runtime_profile: string
  runtime_hints: string
  runtime_cap: number
  runtime_detail: string
  compilador_runtime_detail?: string
  theses_considered_count?: number
  docs_considered_count?: number
  docs_considered_ids?: string[]
  mark_analyzed_doc_ids?: string[]
  limit_notes?: string[]
  agent_failures?: Array<{ key: string; label: string; message?: string }>
}

const DEFAULT_THESIS_ANALYSIS_PARALLEL_LIMIT = 2
const MAX_THESIS_ANALYSIS_PARALLEL_LIMIT = 3
const DEFAULT_THESIS_COMPILADOR_BATCH_CONCURRENCY = 2
const MAX_THESIS_COMPILADOR_BATCH_CONCURRENCY = 4
const CATALOGUE_SUMMARY_CHARS = 120
const CURADOR_DOC_EXCERPT_CHARS = 1200
const MAX_CURADOR_DOC_PROMPT_CHARS = 3_600
const MAX_CURADOR_CATALOGUE_PROMPT_CHARS = 3_000
const MAX_THEMATIC_GAPS_FOR_CURADOR = 8
const MAX_ANALISTA_GROUPS = 10
const ANALISTA_THESIS_CONTENT_CHARS = 500
const COMPILADOR_THESIS_CONTENT_CHARS = 900
// Compiled legal theses can run to ~5k chars (title + full content + summary
// + tags + quality_score), so the model needs enough budget to emit a
// complete JSON object. 2500 was too tight and produced truncated payloads
// that the parser could not recover.
const COMPILADOR_MAX_TOKENS = 4000
const MAX_REVISOR_SUGGESTIONS = 30
const REVISOR_CREATE_SUMMARY_CHARS = 160
const LOW_QUALITY_MIN_CONTENT_CHARS = 180
const LOW_QUALITY_MIN_KEYWORDS = 8
const LOCAL_SIMILARITY_TITLE_THRESHOLD = 0.6
const LOCAL_SIMILARITY_KEYWORD_THRESHOLD = 0.45
const LOCAL_SIMILARITY_CROSS_THRESHOLD = 0.72
const SIMILARITY_STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'ate', 'com', 'como', 'contra', 'cujos', 'cujas', 'da', 'das', 'de', 'dela', 'dele',
  'deles', 'delas', 'do', 'dos', 'e', 'ela', 'ele', 'em', 'entre', 'essa', 'esse', 'esta', 'este', 'foi', 'ha',
  'ja', 'mais', 'mas', 'mesmo', 'muito', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas',
  'pelo', 'pelos', 'por', 'qual', 'quando', 'que', 'quem', 'se', 'sem', 'ser', 'seu', 'seus', 'sua', 'suas',
  'sobre', 'sob', 'tambem', 'tem', 'texto', 'uma', 'umas', 'uns', 'conteudo', 'conteudos',
  'juridico', 'juridica', 'juridicos', 'juridicas', 'resumo', 'robusto', 'robusta', 'tese', 'teses',
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid4(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
}

function compactJson(value: unknown): string {
  return JSON.stringify(value)
}

function stripJsonTrailingCommas(content: string): string {
  return content.replace(/,\s*([}\]])/g, '$1')
}

function extractBalancedJson(content: string): string | null {
  const startCandidates = [content.indexOf('{'), content.indexOf('[')].filter(index => index >= 0)
  if (startCandidates.length === 0) return null

  const start = Math.min(...startCandidates)
  const stack: string[] = []
  let inString = false
  let escaped = false

  for (let i = start; i < content.length; i += 1) {
    const char = content[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === '{') stack.push('}')
    if (char === '[') stack.push(']')
    if (char === '}' || char === ']') {
      const expected = stack.pop()
      if (expected !== char) return null
      if (stack.length === 0) return content.slice(start, i + 1)
    }
  }

  return null
}

function parseJson(raw: string): unknown {
  let content = raw.trim()

  // 1. Extract from ```json ... ``` block first
  const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)```/)
  if (jsonBlockMatch) {
    content = jsonBlockMatch[1].trim()
  } else {
    const codeBlockMatch = content.match(/```\s*([\s\S]*?)```/)
    if (codeBlockMatch) content = codeBlockMatch[1].trim()
  }

  // 2. Try direct parse first (fast path)
  try { return JSON.parse(content) } catch { /* fall through */ }
  try { return JSON.parse(stripJsonTrailingCommas(content)) } catch { /* fall through */ }

  // 3. Extract the first balanced JSON object/array, ignoring prose around it.
  const balancedJson = extractBalancedJson(content)
  if (balancedJson) {
    try { return JSON.parse(balancedJson) } catch { /* fall through */ }
    try { return JSON.parse(stripJsonTrailingCommas(balancedJson)) } catch { /* fall through */ }
  }

  // 4. Last resort: throw with context
  throw new SyntaxError(`Cannot extract JSON from LLM response. Preview: ${content.slice(0, 120)}`)
}

function parseJsonArray(raw: string): unknown[] {
  const parsed = parseJson(raw)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed = parseJson(raw)
  return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
    ? (parsed as Record<string, unknown>)
    : {}
}

/** Summarise theses as a compact JSON-friendly list for prompts. */
function thesesToCatalogueEntries(theses: ThesisData[]): Array<{
  id: string; title: string; summary: string; area: string
}> {
  return theses
    .filter(t => t.id)
    .map(t => ({
      id: t.id!,
      title: t.title.slice(0, 140),
      summary: t.summary?.slice(0, CATALOGUE_SUMMARY_CHARS) || t.content.slice(0, CATALOGUE_SUMMARY_CHARS),
      area: t.legal_area_id,
    }))
}

/** Extract a short but meaningful excerpt from an acervo document. */
function acervoExcerpt(doc: AcervoDocumentData, maxChars = 3000): string {
  return `[${doc.filename}]\n${(doc.text_content ?? '').slice(0, maxChars)}`
}

function takeItemsWithinCharBudget<T>(
  items: T[],
  render: (item: T) => string,
  budgetChars: number,
): { items: T[]; omittedCount: number } {
  if (budgetChars <= 0 || items.length === 0) {
    return { items: [], omittedCount: items.length }
  }

  const selected: T[] = []
  let usedChars = 0

  for (const item of items) {
    const rendered = render(item)
    const projectedChars = usedChars + rendered.length + (selected.length > 0 ? 6 : 0)
    if (selected.length > 0 && projectedChars > budgetChars) break
    selected.push(item)
    usedChars = projectedChars
  }

  return {
    items: selected,
    omittedCount: Math.max(0, items.length - selected.length),
  }
}

function withReliableTextFallback(primaryModel: string, fallbackModels: readonly string[]): string[] {
  const candidates = [...fallbackModels]
  const reliableFallback = RELIABLE_TEXT_FALLBACK_MODEL.trim()
  if (reliableFallback && reliableFallback !== primaryModel && !candidates.includes(reliableFallback)) {
    candidates.push(reliableFallback)
  }
  return candidates
}

function normalizeSimilarityText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeSimilarityText(value: string): string[] {
  return normalizeSimilarityText(value)
    .split(' ')
    .filter(token => token.length >= 4 && !SIMILARITY_STOP_WORDS.has(token))
}

function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens)]
}

function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) intersection += 1
  }
  const union = setA.size + setB.size - intersection
  return union > 0 ? intersection / union : 0
}

function buildLocalCatalogueResult(theses: ThesisData[]): {
  similar_groups: Array<{ ids: string[]; titles: string[]; reason: string }>
  low_quality_ids: string[]
  thematic_gaps: string[]
  catalogue_summary: string
} {
  const indexed = theses
    .filter((thesis): thesis is ThesisData & { id: string } => Boolean(thesis.id))
    .map(thesis => {
      const titleTokens = uniqueTokens(tokenizeSimilarityText(thesis.title))
      const summaryTokens = uniqueTokens(tokenizeSimilarityText(thesis.summary ?? ''))
      const summaryText = thesis.summary?.trim() ?? ''
      const contentTokens = uniqueTokens(tokenizeSimilarityText(thesis.content.slice(0, 800)))
      const tagTokens = uniqueTokens((thesis.tags ?? []).flatMap(tag => tokenizeSimilarityText(tag)))
      const keywordTokens = uniqueTokens([...titleTokens, ...summaryTokens, ...contentTokens, ...tagTokens])
      const normalizedTitle = normalizeSimilarityText(thesis.title)
      const titleLooksGeneric = /^(nova\s+tese|tese|teste|rascunho|modelo)(\s|$)/.test(normalizedTitle)
      const lowQuality = thesis.content.trim().length < LOW_QUALITY_MIN_CONTENT_CHARS
        || (keywordTokens.length < LOW_QUALITY_MIN_KEYWORDS && summaryText.length < 60)
        || (titleLooksGeneric && thesis.content.trim().length < 320)

      return {
        thesis,
        titleTokens,
        keywordTokens,
        normalizedTitle,
        lowQuality,
      }
    })

  const parent = new Map(indexed.map(item => [item.thesis.id, item.thesis.id]))
  const find = (id: string): string => {
    const current = parent.get(id) ?? id
    if (current === id) return current
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const union = (leftId: string, rightId: string) => {
    const leftRoot = find(leftId)
    const rightRoot = find(rightId)
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
  }

  for (let leftIndex = 0; leftIndex < indexed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < indexed.length; rightIndex += 1) {
      const left = indexed[leftIndex]
      const right = indexed[rightIndex]
      const sameArea = left.thesis.legal_area_id === right.thesis.legal_area_id
      const titleScore = jaccardSimilarity(left.titleTokens, right.titleTokens)
      const keywordScore = jaccardSimilarity(left.keywordTokens, right.keywordTokens)
      const titleContained = Boolean(
        left.normalizedTitle
        && right.normalizedTitle
        && (
          left.normalizedTitle.includes(right.normalizedTitle)
          || right.normalizedTitle.includes(left.normalizedTitle)
        ),
      )

      const similar = (sameArea && (titleContained || titleScore >= LOCAL_SIMILARITY_TITLE_THRESHOLD))
        || (sameArea && keywordScore >= LOCAL_SIMILARITY_KEYWORD_THRESHOLD)
        || (titleScore >= LOCAL_SIMILARITY_CROSS_THRESHOLD && keywordScore >= 0.3)

      if (similar) union(left.thesis.id, right.thesis.id)
    }
  }

  const groupsByRoot = new Map<string, typeof indexed>()
  for (const item of indexed) {
    const root = find(item.thesis.id)
    const group = groupsByRoot.get(root) ?? []
    group.push(item)
    groupsByRoot.set(root, group)
  }

  const similarGroups = [...groupsByRoot.values()]
    .filter(group => group.length > 1)
    .map(group => {
      const sharedKeywords = group.reduce<string[]>((shared, item, index) => {
        if (index === 0) return item.keywordTokens
        return shared.filter(token => item.keywordTokens.includes(token))
      }, [])
      return {
        ids: group.map(item => item.thesis.id),
        titles: group.map(item => item.thesis.title),
        reason: sharedKeywords.length > 0
          ? `Vocabulário central compartilhado: ${sharedKeywords.slice(0, 4).join(', ')}.`
          : 'Teses do mesmo tema com alta proximidade lexical em título, resumo e conteúdo.',
      }
    })
    .sort((left, right) => right.ids.length - left.ids.length)

  const groupedIds = new Set(similarGroups.flatMap(group => group.ids))
  const lowQualityIds = indexed
    .filter(item => item.lowQuality && !groupedIds.has(item.thesis.id))
    .map(item => item.thesis.id)

  const catalogueSummary = [
    `${indexed.length} tese(s) inventariadas localmente.`,
    similarGroups.length > 0 ? `${similarGroups.length} grupo(s) candidato(s) à análise aprofundada.` : 'Nenhum grupo redundante evidente identificado localmente.',
    lowQualityIds.length > 0 ? `${lowQualityIds.length} tese(s) isolada(s) com baixa densidade argumentativa.` : null,
  ].filter(Boolean).join(' ')

  return {
    similar_groups: similarGroups,
    low_quality_ids: lowQualityIds,
    thematic_gaps: [],
    catalogue_summary: catalogueSummary,
  }
}

// ── Agent 2: Analista de Redundâncias ─────────────────────────────────────────

const ANALISTA_SYSTEM = `Você é um Analista Jurídico especializado em identificar redundâncias em bancos de teses.
Para cada grupo de teses fornecido, analise profundamente o conteúdo completo e classifique:
- "duplicate": teses que dizem exatamente o mesmo — mesclar em uma
- "complementary": teses que se complementam — mesclar preservando ambas as perspectivas
- "contradictory": teses com posições opostas — manter separadas ou discutir
- "keep_separate": teses apenas superficialmente similares — manter como estão

Retorne APENAS um JSON válido com esta estrutura:
{
  "analysis": [
    {
      "group_ids": ["id1","id2"],
      "classification": "duplicate|complementary|contradictory|keep_separate",
      "action": "merge|keep|flag",
      "reasoning": "justificativa técnica detalhada",
      "merge_value": 8
    }
  ]
}`

// ── Agent 3: Compilador ───────────────────────────────────────────────────────

const COMPILADOR_SYSTEM = `Você é um Compilador Jurídico de alta precisão.
Sua tarefa é receber duas ou mais teses jurídicas e criar UMA ÚNICA tese superior que:
- Preserve TODOS os argumentos únicos de cada versão
- Elimine redundâncias e repetições
- Organize o conteúdo de forma lógica e progressiva
- Use linguagem jurídica formal e precisa
- Seja mais completa que qualquer versão individual

Retorne APENAS um JSON válido com esta estrutura:
{
  "title": "título da tese compilada (máx 120 chars)",
  "content": "conteúdo completo e estruturado da tese compilada",
  "summary": "resumo em 1-2 frases",
  "legal_area_id": "área do direito",
  "tags": ["tag1","tag2"],
  "quality_score": 85
}`

// ── Agent 4: Curador de Lacunas ───────────────────────────────────────────────

const CURADOR_SYSTEM = `Você é um Curador Jurídico especializado em enriquecer bancos de teses.
Com base nos documentos de acervo não analisados e nas lacunas temáticas identificadas:
1. Extraia TESES JURÍDICAS novas, independentes e reutilizáveis dos documentos
2. Priorize teses que preencham as lacunas temáticas informadas
3. Cada tese deve ser autossuficiente (sem referência a "o caso em questão")
4. Extraia entre 2 e 6 teses por chamada, focando nas mais valiosas

Retorne APENAS um JSON array com esta estrutura:
[
  {
    "title": "título da tese (máx 120 chars)",
    "content": "argumento jurídico completo",
    "summary": "resumo em 1-2 frases",
    "legal_area_id": "área do direito",
    "tags": ["tag1","tag2"],
    "quality_score": 80,
    "source_excerpt": "trecho do documento que originou esta tese"
  }
]`

// ── Agent 5: Revisor Final ────────────────────────────────────────────────────

const REVISOR_SYSTEM = `Você é o Revisor Final do processo de análise do banco de teses jurídicas.
Recebe sugestões brutas e deve:
1. Validar cada sugestão (descartar as de baixo valor ou incoerentes)
2. Enriquecer as justificativas com contexto jurídico
3. Atribuir priority: "high" | "medium" | "low"
4. Atribuir impact_score 1-10
5. Ordenar do mais para o menos impactante
6. Escrever executive_summary em 3-5 frases

IMPORTANTE: Responda EXCLUSIVAMENTE com um bloco \`\`\`json ... \`\`\` sem nenhum texto antes ou depois.
Estrutura obrigatória:
\`\`\`json
{
  "suggestions": [
    {
      "temp_id": "mesmo temp_id recebido",
      "type": "merge|delete|create|improve",
      "priority": "high|medium|low",
      "impact_score": 8,
      "title": "título da sugestão",
      "description": "descrição concisa",
      "rationale": "justificativa jurídica",
      "affected_thesis_ids": ["id1"],
      "affected_thesis_titles": ["título1"]
    }
  ],
  "executive_summary": "resumo executivo"
}
\`\`\``

function agentErrorMessage(err: unknown): string {
  if (err instanceof TypeError) return 'Erro de rede (tente novamente)'
  if (err instanceof TransientLLMError) {
    const message = err.message
    if (/key limit|monthly limit/i.test(message)) {
      // OpenRouter exposes a per-key monthly spend cap that is independent
      // of the account balance — the user can still have credits but the
      // specific key has hit its own ceiling. Be explicit so the user does
      // not look for a non-existent billing problem.
      return 'Limite mensal da chave atingido (não é falta de saldo) — ajuste o limite da chave no painel do provedor (openrouter.ai/settings/keys) ou use outra chave'
    }
    if (/insufficient.*credit|more credits|can only afford|quota/i.test(message)) {
      return 'Créditos do provedor esgotados — adicione saldo ou troque a chave em Configurações'
    }
    if (/timed out|timeout|tempo limite/i.test(message)) {
      return 'Tempo limite excedido (tente novamente)'
    }
    if (/rate.?limit|too many requests|429/i.test(message)) {
      return 'Limite de requisições do provedor — aguarde e tente novamente'
    }
    return 'Erro transitório do LLM (tente novamente)'
  }
  if (err instanceof SyntaxError) return 'Resposta inválida do modelo (JSON malformado)'
  if (err instanceof Error) {
    if (err.name === 'ModelUnavailableError') return 'Modelo indisponível'
    if (err.message.includes('tempo limite')) return 'Tempo limite excedido'
    if (err.message.includes('empty response')) return 'Resposta vazia do LLM'
  }
  const humanized = humanizeError(err)
  return humanized.title || 'Falha inesperada'
}


/**
 * Run the thesis analysis pipeline.
 *
 * @param apiKey      OpenRouter API key
 * @param theses      All theses from the user's bank
 * @param acervoDocs  Unanalyzed acervo documents (pre-filtered by caller)
 * @param modelMap    Model per agent (from loadThesisAnalystModels)
 * @param onProgress  Callback called after each agent completes
 */
export async function analyzeThesisBank(
  apiKey: string,
  theses: ThesisData[],
  acervoDocs: AcervoDocumentData[],
  modelMap: ThesisAnalystModelMap,
  onProgress?: ProgressCallback,
): Promise<ThesisAnalysisResult> {
  if (theses.length === 0 && acervoDocs.length === 0) {
    throw new Error('Nenhuma tese ou documento para analisar.')
  }

  // Validate all agent models are configured
  validateModelMap(modelMap, THESIS_ANALYST_AGENT_DEFS, 'thesis_analyst_models')

  const sessionId = uid4()
  const now = new Date().toISOString()
  const llmExecutions: UsageExecutionRecord[] = []
  const wallClockStart = Date.now()
  const orchestratorStartedAt = wallClockStart
  const orchestratorModel = resolveOrchestratorModel(modelMap, 'thesis_pipeline_orchestrator', ['thesis_revisor', 'thesis_analista'])
  const phaseDurationsMs: Record<string, number> = {}
  let totalAgentDurationMs = 0
  let compiladorParallelLimit = 1
  let compiladorRuntimeDetail: string | undefined
  const limitNotes: string[] = []

  const trackPhase = async <T,>(phaseKey: string, fn: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now()
    try {
      return await fn()
    } finally {
      phaseDurationsMs[phaseKey] = (phaseDurationsMs[phaseKey] ?? 0) + (Date.now() - startedAt)
    }
  }

  const fallbackConfig = await trackPhase('config', async () => loadFallbackPriorityConfig().catch(() => ({})))
  const resolveFb = buildPipelineFallbackResolver(THESIS_ANALYST_AGENT_DEFS, fallbackConfig)
  const resolveAgentFallbacks = (agentKey: string, primaryModel: string): string[] =>
    withReliableTextFallback(primaryModel, resolveFb(agentKey, primaryModel))

  const analysisRuntimeHints = getRuntimeConcurrencyHints()
  const analysisConcurrencyDiagnostics = resolveAdaptiveConcurrencyWithDiagnostics({
    envValue: import.meta.env.VITE_THESIS_ANALYSIS_PARALLEL_LIMIT as string | undefined,
    fallback: DEFAULT_THESIS_ANALYSIS_PARALLEL_LIMIT,
    min: 1,
    max: MAX_THESIS_ANALYSIS_PARALLEL_LIMIT,
    hints: analysisRuntimeHints,
  })
  const analysisParallelLimit = analysisConcurrencyDiagnostics.resolved
  const analysisRuntimeHintsLabel = formatRuntimeHints(analysisRuntimeHints)
  const analysisRuntimeDetail = formatAdaptiveConcurrency(analysisConcurrencyDiagnostics)
  const analysisRuntimeProfile = buildRuntimeProfileKey(analysisRuntimeHints, analysisConcurrencyDiagnostics)
  const analysisRuntimeUsageMeta = {
    runtime_profile: analysisRuntimeProfile,
    runtime_hints: analysisRuntimeHintsLabel,
    runtime_concurrency: analysisParallelLimit,
    runtime_cap: analysisConcurrencyDiagnostics.runtimeCap,
  }

  const buildExecutionTelemetry = (
    result: LLMResult,
    runtimeMeta: typeof analysisRuntimeUsageMeta = analysisRuntimeUsageMeta,
  ) => ({
    execution_state: (result.operational?.totalRetryCount ?? 0) > 0 ? 'retrying' : 'completed',
    retry_count: result.operational?.totalRetryCount ?? 0,
    used_fallback: result.operational?.fallbackUsed ?? null,
    fallback_from: result.operational?.fallbackFrom ?? null,
    ...runtimeMeta,
  })

  const recordAgentDuration = (result: LLMResult | null | undefined) => {
    if (result?.duration_ms && result.duration_ms > 0) {
      totalAgentDurationMs += result.duration_ms
    }
  }

  // Initialise progress state
  const agents: AgentProgress[] = THESIS_PIPELINE_STAGES
    .filter(stage => stage.modelKey)
    .map(stage => ({ key: stage.key, label: stage.label, status: 'pending' as const, executionState: 'queued' as const }))

  const resolveAgentExecutionState = (
    status: AgentProgress['status'],
    executionState?: PipelineExecutionState,
  ): PipelineExecutionState => {
    if (executionState) return executionState
    switch (status) {
      case 'pending':
        return 'queued'
      case 'done':
        return 'completed'
      case 'error':
        return 'failed'
      default:
        return 'running'
    }
  }

  const notify = (
    key: string,
    status: AgentProgress['status'],
    message?: string,
    executionState?: PipelineExecutionState,
  ) => {
    const idx = agents.findIndex(a => a.key === key)
    if (idx >= 0) {
      agents[idx] = {
        ...agents[idx],
        status,
        message,
        executionState: resolveAgentExecutionState(status, executionState),
      }
    }
    onProgress?.([...agents])
  }

  notify(
    'thesis_pipeline_orchestrator',
    'running',
    'Orquestrador monitorando execução, retries, paralelismo e continuidade...',
    'running',
  )

  const catalogue = thesesToCatalogueEntries(theses)

  const { items: docsForCurador, omittedCount: omittedDocsFromCurador } = takeItemsWithinCharBudget(
    acervoDocs,
    doc => acervoExcerpt(doc, CURADOR_DOC_EXCERPT_CHARS),
    MAX_CURADOR_DOC_PROMPT_CHARS,
  )
  if (omittedDocsFromCurador > 0) {
    limitNotes.push(
      `${omittedDocsFromCurador} documento(s) do acervo ficaram para uma próxima rodada por limite de contexto do Curador.`,
    )
  }
  const newThesisProposals: Array<{
    title: string; content: string; summary: string
    legal_area_id: string; tags?: string[]; quality_score?: number
  }> = []
  let thematicGaps: string[] = []

  let curadorFailure: unknown = null

  const runCurador = async (): Promise<void> => {
    notify(
      'thesis_curador',
      'running',
      analysisParallelLimit > 1 ? 'Analisando documentos do acervo em paralelo...' : 'Analisando documentos do acervo...',
      'running',
    )

    if (docsForCurador.length > 0 || thematicGaps.length > 0) {
      try {
        const docsText = docsForCurador.map(d => acervoExcerpt(d, CURADOR_DOC_EXCERPT_CHARS)).join('\n\n===\n\n')
        const gapsText = thematicGaps.length > 0
          ? `\n\nLACUNAS TEMÁTICAS IDENTIFICADAS (priorize teses que preencham estas lacunas):\n${thematicGaps.slice(0, MAX_THEMATIC_GAPS_FOR_CURADOR).map((g, i) => `${i + 1}. ${g.slice(0, 180)}`).join('\n')}`
          : ''
        const {
          items: catalogueForCurador,
          omittedCount: omittedCatalogueEntriesForCurador,
        } = takeItemsWithinCharBudget(
          catalogue,
          entry => compactJson(entry),
          MAX_CURADOR_CATALOGUE_PROMPT_CHARS,
        )
        if (omittedCatalogueEntriesForCurador > 0) {
          limitNotes.push(
            `${omittedCatalogueEntriesForCurador} tese(s) do banco ficaram fora do contexto do Curador para caber na janela do modelo.`,
          )
        }
        const catalogueText = catalogueForCurador.length > 0
          ? `\n\nBANCO ATUAL (resumo compacto para evitar duplicidades):\n${compactJson(catalogueForCurador)}`
          : ''

        notify('thesis_curador', 'running', 'Curador aguardando resposta do modelo...', 'waiting_io')

        const res = await callLLMWithFallback(
          apiKey,
          CURADOR_SYSTEM,
          `Documentos do acervo não analisados:\n\n${docsText}${gapsText}${catalogueText}`,
          modelMap['thesis_curador'],
          resolveAgentFallbacks('thesis_curador', modelMap['thesis_curador']),
          3500,
          0.2,
        )
        recordAgentDuration(res)
        llmExecutions.push(createUsageExecutionRecord({
          source_type: 'thesis_analysis',
          source_id: sessionId,
          created_at: now,
          phase: 'thesis_curador',
          agent_name: 'Curador de Lacunas',
          model: res.model,
          provider_id: res.provider_id ?? res.operational?.providerId,
          provider_label: res.provider_label ?? res.operational?.providerLabel,
          requested_model: res.operational?.requestedModel,
          resolved_model: res.operational?.resolvedModel,
          tokens_in: res.tokens_in,
          tokens_out: res.tokens_out,
          cost_usd: res.cost_usd,
          duration_ms: res.duration_ms,
          ...buildExecutionTelemetry(res),
        }))
        const proposals = parseJsonArray(res.content) as typeof newThesisProposals
        newThesisProposals.push(...proposals.filter(p => p.title && p.content))
      } catch (err) {
        curadorFailure = err
        console.warn('Curador failed:', err)
      }
    }

    if (curadorFailure) {
      const reason = agentErrorMessage(curadorFailure)
      notify('thesis_curador', 'error', `Curador: ${reason}`)
      limitNotes.push(
        `Curador falhou (${reason}); novas teses do acervo não foram propostas nesta rodada.`,
      )
    } else {
      notify('thesis_curador', 'done', `${newThesisProposals.length} novas teses propostas`)
    }
  }

  const curadorPromise = analysisParallelLimit > 1
    ? trackPhase('curadoria_acervo', runCurador)
    : null

  const catalogueResult = await trackPhase('inventario', async () => buildLocalCatalogueResult(theses))

  const similarGroups = catalogueResult.similar_groups ?? []
  thematicGaps = catalogueResult.thematic_gaps ?? []

  // ── Agent 2: Analista ────────────────────────────────────────────────────────

  notify('thesis_analista', 'running', 'Analisando redundâncias nos grupos...', 'running')

  // Build full-content view for all theses in groups
  const thesisById = new Map(theses.filter(t => t.id).map(t => [t.id!, t]))
  const thesisIds = new Set(thesisById.keys())
  const groupsWithContent = similarGroups.slice(0, MAX_ANALISTA_GROUPS).map(group => ({
    ...group,
    theses_content: group.ids
      .map(id => {
        const t = thesisById.get(id)
        return t ? { id, title: t.title.slice(0, 140), content: t.content.slice(0, ANALISTA_THESIS_CONTENT_CHARS) } : null
      })
      .filter((x): x is { id: string; title: string; content: string } => x !== null),
  }))

  const normalizeClassification = (value: unknown): 'duplicate' | 'complementary' | 'contradictory' | 'keep_separate' => {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (normalized.startsWith('du')) return 'duplicate'
    if (normalized.startsWith('com')) return 'complementary'
    if (normalized.startsWith('con')) return 'contradictory'
    if (normalized.startsWith('keep')) return 'keep_separate'
    return 'keep_separate'
  }

  const normalizeMergeAction = (value: unknown, classification: ReturnType<typeof normalizeClassification>): 'merge' | 'keep' | 'flag' => {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (normalized === 'merge' || normalized === 'keep' || normalized === 'flag') return normalized
    if (classification === 'duplicate' || classification === 'complementary') return 'merge'
    if (classification === 'contradictory') return 'flag'
    return 'keep'
  }

  const normalizeMergeGroups = (
    analysis: unknown,
  ): Array<{
    group_ids: string[]
    classification: string
    action: string
    reasoning: string
    merge_value: number
  }> => {
    if (!Array.isArray(analysis)) return []
    return analysis
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const raw = entry as Record<string, unknown>
        const groupIds = Array.isArray(raw.group_ids)
          ? raw.group_ids.filter((id): id is string => typeof id === 'string' && thesisIds.has(id))
          : []
        if (groupIds.length < 2) return null
        const classification = normalizeClassification(raw.classification)
        const action = normalizeMergeAction(raw.action, classification)
        const mergeValueRaw = typeof raw.merge_value === 'number' ? raw.merge_value : Number(raw.merge_value)
        const mergeValue = Number.isFinite(mergeValueRaw) ? Math.max(1, Math.min(10, Math.round(mergeValueRaw))) : 5
        return {
          group_ids: [...new Set(groupIds)],
          classification,
          action,
          reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : 'Classificação normalizada após validação local.',
          merge_value: mergeValue,
        }
      })
      .filter((group): group is NonNullable<typeof group> => group !== null)
  }

  const buildLocalAnalistaFallback = () => normalizeMergeGroups(
    groupsWithContent.map(group => ({
      group_ids: group.ids,
      classification: 'complementary',
      action: 'merge',
      reasoning: 'Fallback local aplicado com base no inventário determinístico para manter continuidade da análise.',
      merge_value: 6,
    })),
  )

  let analysisMergeGroups: Array<{
    group_ids: string[]
    classification: string
    action: string
    reasoning: string
    merge_value: number
  }> = []

  try {
    if (groupsWithContent.length > 0) {
      notify('thesis_analista', 'running', 'Analista aguardando resposta do modelo...', 'waiting_io')
      const res = await trackPhase('redundancia', async () => callLLMWithFallback(
        apiKey,
        ANALISTA_SYSTEM,
        `Grupos de teses para análise profunda:\n${compactJson(groupsWithContent)}`,
        modelMap['thesis_analista'],
        resolveAgentFallbacks('thesis_analista', modelMap['thesis_analista']),
        4000,
        0.1,
      ))
      recordAgentDuration(res)
      llmExecutions.push(createUsageExecutionRecord({
        source_type: 'thesis_analysis',
        source_id: sessionId,
        created_at: now,
        phase: 'thesis_analista',
        agent_name: 'Analista de Redundâncias',
        model: res.model,
        provider_id: res.provider_id ?? res.operational?.providerId,
        provider_label: res.provider_label ?? res.operational?.providerLabel,
        requested_model: res.operational?.requestedModel,
        resolved_model: res.operational?.resolvedModel,
        tokens_in: res.tokens_in,
        tokens_out: res.tokens_out,
        cost_usd: res.cost_usd,
        duration_ms: res.duration_ms,
        ...buildExecutionTelemetry(res),
      }))
      let parsedAnalysis: unknown
      try {
        const parsed = parseJsonObject(res.content) as { analysis?: unknown }
        parsedAnalysis = parsed.analysis ?? []
      } catch (parseError) {
        console.warn('Analista retornou JSON inválido; solicitando reparo:', parseError)
        notify('thesis_analista', 'running', 'Analista corrigindo JSON retornado...', 'waiting_io')
        try {
          const repair = await trackPhase('redundancia_repair', async () => callLLMWithFallback(
            apiKey,
            'Você corrige saídas JSON inválidas do Analista de redundâncias. Retorne APENAS um objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.',
            `A saída abaixo deveria ser um objeto JSON válido no formato {"analysis":[...]}. Corrija somente a sintaxe e preserve os campos úteis.\n\n${res.content.slice(0, 12_000)}`,
            modelMap['thesis_analista'],
            resolveAgentFallbacks('thesis_analista', modelMap['thesis_analista']),
            2200,
            0,
          ))
          recordAgentDuration(repair)
          llmExecutions.push(createUsageExecutionRecord({
            source_type: 'thesis_analysis',
            source_id: sessionId,
            created_at: now,
            phase: 'thesis_analista_repair',
            agent_name: 'Analista de Redundâncias (reparo JSON)',
            model: repair.model,
            provider_id: repair.provider_id ?? repair.operational?.providerId,
            provider_label: repair.provider_label ?? repair.operational?.providerLabel,
            requested_model: repair.operational?.requestedModel,
            resolved_model: repair.operational?.resolvedModel,
            tokens_in: repair.tokens_in,
            tokens_out: repair.tokens_out,
            cost_usd: repair.cost_usd,
            duration_ms: repair.duration_ms,
            ...buildExecutionTelemetry(repair),
          }))
          const repaired = parseJsonObject(repair.content) as { analysis?: unknown }
          parsedAnalysis = repaired.analysis ?? []
        } catch (repairError) {
          console.warn('Analista JSON repair failed; applying deterministic local fallback:', repairError)
          limitNotes.push('Analista retornou JSON inválido em todas as tentativas; fallback determinístico local aplicado para manter a continuidade.')
          parsedAnalysis = buildLocalAnalistaFallback()
        }
      }
      analysisMergeGroups = normalizeMergeGroups(parsedAnalysis).filter(g => g.action === 'merge')
    }
    notify('thesis_analista', 'done', `${analysisMergeGroups.length} grupos a compilar`)
  } catch (err) {
    const reason = agentErrorMessage(err)
    console.warn('Analista failed:', err)
    const localFallback = buildLocalAnalistaFallback().filter(g => g.action === 'merge')
    analysisMergeGroups = localFallback
    if (localFallback.length > 0) {
      limitNotes.push(
        `Analista falhou (${reason}); fallback determinístico local aplicado com ${localFallback.length} grupo(s) de mesclagem do inventário.`,
      )
      notify(
        'thesis_analista',
        'error',
        `Analista: ${reason} — usando inventário local (${localFallback.length} grupo(s))`,
      )
    } else {
      notify('thesis_analista', 'error', `Analista: ${reason}`)
    }
  }

  // Build delete suggestions from low-quality candidates flagged by the local inventory
  const deleteCandidates = (catalogueResult.low_quality_ids ?? [])
    .map(id => thesisById.get(id))
    .filter((t): t is ThesisData => !!t)

  // ── Agent 3: Compilador (one call per merge group) ────────────────────────────

  notify('thesis_compilador', 'running', `Compilando ${analysisMergeGroups.length} grupos...`, 'running')

  const compiledGroupsByIndex: Array<{
    source_ids: string[]
    source_titles: string[]
    compiled: {
      title: string; content: string; summary: string
      legal_area_id: string; tags?: string[]; quality_score?: number
    }
  } | null> = new Array(analysisMergeGroups.length).fill(null)

  const compiladorHints = getRuntimeConcurrencyHints()
  const compiladorConcurrencyDiagnostics = resolveAdaptiveConcurrencyWithDiagnostics({
    envValue: import.meta.env.VITE_THESIS_COMPILADOR_BATCH_CONCURRENCY as string | undefined,
    fallback: DEFAULT_THESIS_COMPILADOR_BATCH_CONCURRENCY,
    min: 1,
    max: MAX_THESIS_COMPILADOR_BATCH_CONCURRENCY,
    hints: compiladorHints,
  })
  const compiladorWorkerCount = Math.max(1, Math.min(compiladorConcurrencyDiagnostics.resolved, analysisMergeGroups.length || 1))
  compiladorParallelLimit = compiladorWorkerCount
  compiladorRuntimeDetail = formatAdaptiveConcurrency(compiladorConcurrencyDiagnostics)
  const compiladorRuntimeUsageMeta = {
    runtime_profile: buildRuntimeProfileKey(compiladorHints, compiladorConcurrencyDiagnostics),
    runtime_hints: formatRuntimeHints(compiladorHints),
    runtime_concurrency: compiladorWorkerCount,
    runtime_cap: compiladorConcurrencyDiagnostics.runtimeCap,
  }

  let completedMergeCalls = 0
  let failedMergeCalls = 0

  await trackPhase('compilacao', async () => {
    const compiladorTasks = analysisMergeGroups.map((group, groupIndex) => async () => {
      const groupTheses = group.group_ids.map(id => thesisById.get(id)).filter((t): t is ThesisData => !!t)

      if (groupTheses.length < 2) {
        completedMergeCalls += 1
        return
      }

      try {
        const versionsText = groupTheses.map((t, i) =>
          `VERSÃO ${i + 1} — "${t.title}":\n${t.content.slice(0, COMPILADOR_THESIS_CONTENT_CHARS)}`
        ).join('\n\n---\n\n')

        notify('thesis_compilador', 'running', `Compilador aguardando resposta para o grupo ${groupIndex + 1}/${analysisMergeGroups.length}...`, 'waiting_io')

        const res = await callLLMWithFallback(
          apiKey,
          COMPILADOR_SYSTEM,
          `Compile as seguintes ${groupTheses.length} teses jurídicas em uma única tese superior:\n\n${versionsText}`,
          modelMap['thesis_compilador'],
          resolveAgentFallbacks('thesis_compilador', modelMap['thesis_compilador']),
          COMPILADOR_MAX_TOKENS,
          0.15,
        )
        recordAgentDuration(res)
        llmExecutions.push(createUsageExecutionRecord({
          source_type: 'thesis_analysis',
          source_id: sessionId,
          created_at: now,
          phase: 'thesis_compilador',
          agent_name: 'Compilador',
          model: res.model,
          provider_id: res.provider_id ?? res.operational?.providerId,
          provider_label: res.provider_label ?? res.operational?.providerLabel,
          requested_model: res.operational?.requestedModel,
          resolved_model: res.operational?.resolvedModel,
          tokens_in: res.tokens_in,
          tokens_out: res.tokens_out,
          cost_usd: res.cost_usd,
          duration_ms: res.duration_ms,
          ...buildExecutionTelemetry(res, compiladorRuntimeUsageMeta),
        }))
        type CompiledThesis = {
          title: string
          content: string
          summary: string
          legal_area_id: string
          tags?: string[]
          quality_score?: number
        }
        let compiled: CompiledThesis
        try {
          compiled = parseJsonObject(res.content) as CompiledThesis
        } catch (parseError) {
          console.warn(`Compilador returned invalid JSON for group ${groupIndex + 1}; requesting repair pass:`, parseError)
          notify('thesis_compilador', 'running', `Compilador corrigindo JSON do grupo ${groupIndex + 1}/${analysisMergeGroups.length}...`, 'waiting_io')
          const repair = await callLLMWithFallback(
            apiKey,
            'Você corrige saídas JSON inválidas do Compilador de teses jurídicas. Retorne APENAS um objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.',
            `A saída abaixo deveria ser um objeto JSON válido com os campos {"title","content","summary","legal_area_id","tags","quality_score"}. Corrija a sintaxe, preserve os campos úteis e, se algum campo estiver truncado, conclua-o de forma consistente.\n\n${res.content.slice(0, 12_000)}`,
            modelMap['thesis_compilador'],
            resolveAgentFallbacks('thesis_compilador', modelMap['thesis_compilador']),
            COMPILADOR_MAX_TOKENS,
            0,
          )
          recordAgentDuration(repair)
          llmExecutions.push(createUsageExecutionRecord({
            source_type: 'thesis_analysis',
            source_id: sessionId,
            created_at: now,
            phase: 'thesis_compilador_repair',
            agent_name: 'Compilador (reparo JSON)',
            model: repair.model,
            provider_id: repair.provider_id ?? repair.operational?.providerId,
            provider_label: repair.provider_label ?? repair.operational?.providerLabel,
            requested_model: repair.operational?.requestedModel,
            resolved_model: repair.operational?.resolvedModel,
            tokens_in: repair.tokens_in,
            tokens_out: repair.tokens_out,
            cost_usd: repair.cost_usd,
            duration_ms: repair.duration_ms,
            ...buildExecutionTelemetry(repair, compiladorRuntimeUsageMeta),
          }))
          compiled = parseJsonObject(repair.content) as CompiledThesis
        }
        compiledGroupsByIndex[groupIndex] = {
          source_ids: group.group_ids,
          source_titles: groupTheses.map(t => t.title),
          compiled,
        }
      } catch (err) {
        failedMergeCalls += 1
        console.warn(`Compilador failed for group ${group.group_ids}:`, err)
      } finally {
        completedMergeCalls += 1
        const successfulCalls = completedMergeCalls - failedMergeCalls
        notify(
          'thesis_compilador',
          'running',
          `Compilações prontas: ${successfulCalls}/${analysisMergeGroups.length}${failedMergeCalls > 0 ? ` (falhas: ${failedMergeCalls})` : ''}`,
          'running',
        )
      }
    })

    await runWithConcurrency(compiladorTasks, compiladorWorkerCount)
  })

  const compiledGroups = compiledGroupsByIndex.filter((group): group is NonNullable<typeof group> => group !== null)

  notify(
    'thesis_compilador',
    'done',
    `${compiledGroups.length} compilações prontas${failedMergeCalls > 0 ? ` (${failedMergeCalls} falhas)` : ''}`,
  )

  // ── Agent 4: Curador de Lacunas ───────────────────────────────────────────────

  if (curadorPromise) {
    await curadorPromise
  } else {
    await trackPhase('curadoria_acervo', runCurador)
  }

  // ── Agent 5: Revisor Final ────────────────────────────────────────────────────

  notify('thesis_revisor', 'running', 'Revisando e priorizando sugestões...', 'running')

  // Build the raw suggestion payload for the Revisor
  const rawSuggestions: Array<{
    temp_id: string
    type: SuggestionType
    source: string
    data: unknown
  }> = [
    ...compiledGroups.map(cg => ({
      temp_id: uid4(),
      type: 'merge' as SuggestionType,
      source: 'compilador',
      data: {
        source_ids: cg.source_ids,
        source_titles: cg.source_titles,
        compiled: cg.compiled,
      },
    })),
    ...deleteCandidates.map(t => ({
      temp_id: uid4(),
      type: 'delete' as SuggestionType,
      source: 'inventario_local',
      data: { id: t.id, title: t.title, summary: t.summary, reason: 'Baixa qualidade ou conteúdo genérico' },
    })),
    ...newThesisProposals.map(p => ({
      temp_id: uid4(),
      type: 'create' as SuggestionType,
      source: 'curador',
      data: p,
    })),
  ]

  // Slim version for the Revisor — strip full thesis content to keep the prompt small
  const revisorPayload = rawSuggestions.slice(0, MAX_REVISOR_SUGGESTIONS).map(s => {
    if (s.type === 'merge') {
      const d = s.data as { source_ids: string[]; source_titles: string[] }
      return { temp_id: s.temp_id, type: s.type, source_ids: d.source_ids, source_titles: d.source_titles }
    }
    if (s.type === 'delete') {
      const d = s.data as { id: string; title: string; reason: string }
      return { temp_id: s.temp_id, type: s.type, id: d.id, title: d.title, reason: d.reason }
    }
    if (s.type === 'create') {
      const d = s.data as { title: string; summary: string; legal_area_id: string; tags: string[] }
      return { temp_id: s.temp_id, type: s.type, title: d.title?.slice(0, 140), summary: d.summary?.slice(0, REVISOR_CREATE_SUMMARY_CHARS), legal_area_id: d.legal_area_id, tags: d.tags?.slice(0, 6) }
    }
    return { temp_id: s.temp_id, type: s.type }
  })

  let finalSuggestions: AnalysisSuggestion[] = []
  let executiveSummary = 'Análise concluída. Revise as sugestões abaixo.'

  if (rawSuggestions.length > 0) {
    try {
      notify('thesis_revisor', 'running', 'Revisor aguardando resposta do modelo...', 'waiting_io')
      const res = await trackPhase('revisao', async () => callLLMWithFallback(
        apiKey,
        REVISOR_SYSTEM,
        `Banco atual: ${theses.length} teses. Revisar até ${revisorPayload.length} sugestões priorizadas.\n\nSugestões para revisão:\n${compactJson(revisorPayload)}`,
        modelMap['thesis_revisor'],
        resolveAgentFallbacks('thesis_revisor', modelMap['thesis_revisor']),
        4000,
        0.1,
      ))
      recordAgentDuration(res)
      llmExecutions.push(createUsageExecutionRecord({
        source_type: 'thesis_analysis',
        source_id: sessionId,
        created_at: now,
        phase: 'thesis_revisor',
        agent_name: 'Revisor Final',
        model: res.model,
        provider_id: res.provider_id ?? res.operational?.providerId,
        provider_label: res.provider_label ?? res.operational?.providerLabel,
        requested_model: res.operational?.requestedModel,
        resolved_model: res.operational?.resolvedModel,
        tokens_in: res.tokens_in,
        tokens_out: res.tokens_out,
        cost_usd: res.cost_usd,
        duration_ms: res.duration_ms,
        ...buildExecutionTelemetry(res),
      }))
      type RevisorParsed = {
        suggestions?: Array<{
          temp_id?: string
          type?: string
          priority?: string
          impact_score?: number
          title?: string
          description?: string
          rationale?: string
          affected_thesis_ids?: string[]
          affected_thesis_titles?: string[]
          proposed_thesis?: AnalysisSuggestion['proposed_thesis']
        }>
        executive_summary?: string
      }

      let parsed: RevisorParsed
      try {
        parsed = parseJsonObject(res.content) as RevisorParsed
      } catch (parseError) {
        console.warn('Revisor returned invalid JSON; requesting one repair pass:', parseError)
        notify('thesis_revisor', 'running', 'Revisor corrigindo JSON retornado...', 'waiting_io')
        const repair = await trackPhase('revisao_repair', async () => callLLMWithFallback(
          apiKey,
          'Você corrige saídas JSON inválidas. Retorne APENAS um objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.',
          `A saída abaixo deveria ser um objeto JSON válido no formato {"executive_summary":"...","suggestions":[...]}. Corrija somente a sintaxe e preserve os campos úteis.\n\n${res.content.slice(0, 12_000)}`,
          modelMap['thesis_revisor'],
          resolveAgentFallbacks('thesis_revisor', modelMap['thesis_revisor']),
          2500,
          0,
        ))
        recordAgentDuration(repair)
        llmExecutions.push(createUsageExecutionRecord({
          source_type: 'thesis_analysis',
          source_id: sessionId,
          created_at: now,
          phase: 'thesis_revisor_repair',
          agent_name: 'Revisor Final (reparo JSON)',
          model: repair.model,
          provider_id: repair.provider_id ?? repair.operational?.providerId,
          provider_label: repair.provider_label ?? repair.operational?.providerLabel,
          requested_model: repair.operational?.requestedModel,
          resolved_model: repair.operational?.resolvedModel,
          tokens_in: repair.tokens_in,
          tokens_out: repair.tokens_out,
          cost_usd: repair.cost_usd,
          duration_ms: repair.duration_ms,
          ...buildExecutionTelemetry(repair),
        }))
        parsed = parseJsonObject(repair.content) as RevisorParsed
      }

      executiveSummary = parsed.executive_summary ?? executiveSummary

      // Map Revisor output back to AnalysisSuggestion, preserving compiled content
      finalSuggestions = (parsed.suggestions ?? []).map(s => {
        // Enrich with the original compiled thesis data if available.
        // LLMs frequently drop the temp_id we send in the payload, so we
        // also fall back to matching by suggestion type + affected_thesis_ids.
        const original = rawSuggestions.find(r => r.temp_id === s.temp_id)
        let proposedThesis = s.proposed_thesis
        const suggestionType = (s.type ?? original?.type) as SuggestionType | undefined

        if (!proposedThesis && (original?.type === 'merge' || suggestionType === 'merge')) {
          const cg = compiledGroups.find(c =>
            c.source_ids.some(id => s.affected_thesis_ids?.includes(id))
          )
          if (cg) {
            proposedThesis = {
              title: cg.compiled.title,
              content: cg.compiled.content,
              summary: cg.compiled.summary,
              legal_area_id: cg.compiled.legal_area_id,
              tags: cg.compiled.tags,
              quality_score: cg.compiled.quality_score,
            }
          }
        }

        if (!proposedThesis && original?.type === 'create') {
          const d = original.data as typeof newThesisProposals[0]
          proposedThesis = {
            title: d.title,
            content: d.content,
            summary: d.summary,
            legal_area_id: d.legal_area_id,
            tags: d.tags,
            quality_score: d.quality_score,
          }
        }

        return {
          id: uid4(),
          type: (s.type ?? 'improve') as SuggestionType,
          priority: (s.priority ?? 'medium') as SuggestionPriority,
          impact_score: typeof s.impact_score === 'number' ? s.impact_score : 5,
          title: s.title ?? 'Sugestão sem título',
          description: s.description ?? '',
          rationale: s.rationale ?? '',
          affected_thesis_ids: s.affected_thesis_ids,
          affected_thesis_titles: s.affected_thesis_titles,
          proposed_thesis: proposedThesis,
        } satisfies AnalysisSuggestion
      })

      notify('thesis_revisor', 'done', `${finalSuggestions.length} sugestões finalizadas`)
    } catch (err) {
      console.warn('Revisor failed, using raw suggestions:', err)

      // Fallback: build suggestions directly from raw data without Revisor
      finalSuggestions = rawSuggestions.map(r => {
        if (r.type === 'merge') {
          const cg = r.data as (typeof compiledGroups)[0]
          return {
            id: uid4(),
            type: 'merge',
            priority: 'medium',
            impact_score: 6,
            title: `Compilar: ${cg.source_titles?.slice(0, 2).join(' + ') ?? 'teses similares'}`,
            description: `Mesclar ${cg.source_ids?.length ?? 2} teses em uma versão mais completa`,
            rationale: 'Teses identificadas como similares pelo Analista de Redundâncias.',
            affected_thesis_ids: cg.source_ids,
            affected_thesis_titles: cg.source_titles,
            proposed_thesis: cg.compiled,
          } satisfies AnalysisSuggestion
        }
        if (r.type === 'delete') {
          const d = r.data as { id: string; title: string; reason: string }
          return {
            id: uid4(),
            type: 'delete',
            priority: 'low',
            impact_score: 3,
            title: `Excluir: ${d.title}`,
            description: 'Tese candidata a exclusão por baixa qualidade ou conteúdo genérico.',
            rationale: d.reason ?? '',
            affected_thesis_ids: [d.id],
            affected_thesis_titles: [d.title],
          } satisfies AnalysisSuggestion
        }
        const p = r.data as (typeof newThesisProposals)[0]
        return {
          id: uid4(),
          type: 'create',
          priority: 'medium',
          impact_score: 5,
          title: `Nova tese: ${p.title}`,
          description: 'Nova tese extraída de documento do acervo.',
          rationale: 'Tese proposta pelo Curador de Lacunas.',
          proposed_thesis: {
            title: p.title,
            content: p.content,
            summary: p.summary,
            legal_area_id: p.legal_area_id,
            tags: p.tags,
            quality_score: p.quality_score,
          },
        } satisfies AnalysisSuggestion
      })
      notify('thesis_revisor', 'done', `${finalSuggestions.length} sugestões finalizadas com revisão local`)
    }
  } else {
    const failedAgents = agents.filter(agent => agent.status === 'error')
    notify(
      'thesis_revisor',
      'done',
      failedAgents.length > 0 ? 'Nenhuma sugestão gerada; revise as falhas acima.' : 'Nenhuma sugestão gerada',
    )
    executiveSummary = failedAgents.length > 0
      ? 'A análise foi concluída parcialmente, mas alguns agentes falharam. Revise as mensagens de erro e execute uma nova rodada para processar o restante.'
      : 'O banco de teses está bem estruturado. Nenhuma ação necessária no momento.'
  }

  const failedAgents = agents
    .filter(agent => agent.status === 'error')
    .map(agent => ({ key: agent.key, label: agent.label, message: agent.message }))
  const markAnalyzedDocIds = failedAgents.some(agent => agent.key === 'thesis_curador')
    ? []
    : docsForCurador.map(doc => doc.id).filter((id): id is string => Boolean(id))

  const wallClockMs = Date.now() - wallClockStart
  const pipelineMeta: ThesisAnalysisPipelineMeta = {
    pipeline_version: 'thesis_parallel_v2',
    phase_durations_ms: phaseDurationsMs,
    total_agent_duration_ms: totalAgentDurationMs,
    wall_clock_ms: wallClockMs,
    parallel_savings_ms: Math.max(0, totalAgentDurationMs - wallClockMs),
    parallel_limit: analysisParallelLimit,
    compilador_parallel_limit: compiladorParallelLimit,
    runtime_profile: analysisRuntimeProfile,
    runtime_hints: analysisRuntimeHintsLabel,
    runtime_cap: analysisConcurrencyDiagnostics.runtimeCap,
    runtime_detail: analysisRuntimeDetail,
    compilador_runtime_detail: compiladorRuntimeDetail,
    theses_considered_count: catalogue.length,
    docs_considered_count: docsForCurador.length,
    docs_considered_ids: docsForCurador.map(doc => doc.id).filter((id): id is string => Boolean(id)),
    mark_analyzed_doc_ids: markAnalyzedDocIds,
    limit_notes: limitNotes,
    agent_failures: failedAgents,
  }

  llmExecutions.unshift(createOrchestratorUsageExecution({
    sourceType: 'thesis_analysis',
    sourceId: sessionId,
    createdAt: now,
    phase: 'thesis_pipeline_orchestrator',
    agentName: 'Orquestrador do Pipeline',
    model: orchestratorModel,
    startedAt: orchestratorStartedAt,
    runtimeProfile: analysisRuntimeProfile,
    runtimeHints: analysisRuntimeHintsLabel,
    runtimeConcurrency: analysisParallelLimit,
    runtimeCap: analysisConcurrencyDiagnostics.runtimeCap,
  }))

  return {
    session_id: sessionId,
    created_at: now,
    total_theses_analyzed: theses.length,
    total_docs_analyzed: docsForCurador.length,
    new_doc_count: acervoDocs.length,
    suggestions: finalSuggestions,
    executive_summary: executiveSummary,
    usage_summary: buildUsageSummary(llmExecutions),
    llm_executions: llmExecutions,
    pipeline_meta: pipelineMeta,
  }
}

// Re-export for convenience
export type { ThesisData, AcervoDocumentData }
