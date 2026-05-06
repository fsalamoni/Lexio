/**
 * Thesis Bank Analyzer — 5-agent pipeline for manual thesis curation.
 *
 * Pipeline:
 *   1. Catalogador   — inventory & similarity clustering of existing theses
 *   2. Analista      — deep analysis: duplicates / complementary / contradictory
 *   3. Compilador    — draft compiled thesis for each merge group
 *   4. Curador       — extract new theses from unanalyzed acervo documents
 *   5. Revisor Final — rank, annotate and produce the final suggestion list
 *
 * The pipeline is user-triggered (never automatic) and produces a list of
 * AnalysisSuggestion objects that the user can accept, modify or reject.
 */

import { callLLMWithFallback, TransientLLMError, type LLMResult } from './llm-client'
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
  pipeline_version: 'thesis_parallel_v1'
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
}

const DEFAULT_THESIS_ANALYSIS_PARALLEL_LIMIT = 2
const MAX_THESIS_ANALYSIS_PARALLEL_LIMIT = 3
const DEFAULT_THESIS_COMPILADOR_BATCH_CONCURRENCY = 2
const MAX_THESIS_COMPILADOR_BATCH_CONCURRENCY = 4

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid4(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
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

  // 3. Extract the first balanced JSON object/array, ignoring prose around it.
  const balancedJson = extractBalancedJson(content)
  if (balancedJson) {
    try { return JSON.parse(balancedJson) } catch { /* fall through */ }
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
      title: t.title,
      summary: t.summary?.slice(0, 180) || t.content.slice(0, 180),
      area: t.legal_area_id,
    }))
}

/** Extract a short but meaningful excerpt from an acervo document. */
function acervoExcerpt(doc: AcervoDocumentData, maxChars = 3000): string {
  return `[${doc.filename}]\n${(doc.text_content ?? '').slice(0, maxChars)}`
}

// ── Agent 1: Catalogador ──────────────────────────────────────────────────────

const CATALOGADOR_SYSTEM = `Você é um Catalogador especializado em bancos de teses jurídicas.
Sua tarefa é:
1. Analisar o inventário completo de teses.
2. Identificar GRUPOS de teses similares ou potencialmente redundantes (2+ teses por grupo).
3. Identificar teses de baixa qualidade isoladas (score < 50 ou conteúdo muito genérico).
4. Identificar LACUNAS temáticas importantes que estão ausentes no banco.

Retorne APENAS um JSON válido com esta estrutura:
{
  "similar_groups": [
    {
      "ids": ["id1","id2"],
      "titles": ["título1","título2"],
      "reason": "motivo da similaridade"
    }
  ],
  "low_quality_ids": ["id3"],
  "thematic_gaps": ["lacuna1","lacuna2"],
  "catalogue_summary": "resumo em 2-3 frases"
}`

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
  if (err instanceof TransientLLMError) return 'Erro transitório do LLM (tente novamente)'
  if (err instanceof Error) {
    if (err.name === 'ModelUnavailableError') return 'Modelo indisponível'
    if (err.message.includes('tempo limite')) return 'Tempo limite excedido'
    if (err.message.includes('empty response')) return 'Resposta vazia do LLM'
  }
  return 'Falha inesperada'
}


/**
 * Run the 5-agent thesis analysis pipeline.
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

  // Limit inputs to avoid token overflow
  const MAX_THESES_FOR_CATALOGUE = 120
  const thesesForCatalogue = theses.slice(0, MAX_THESES_FOR_CATALOGUE)
  const catalogue = thesesToCatalogueEntries(thesesForCatalogue)

  const MAX_DOCS_FOR_CURADOR = 4
  const docsForCurador = acervoDocs.slice(0, MAX_DOCS_FOR_CURADOR)
  const newThesisProposals: Array<{
    title: string; content: string; summary: string
    legal_area_id: string; tags?: string[]; quality_score?: number
  }> = []
  let thematicGaps: string[] = []

  const runCurador = async (): Promise<void> => {
    notify(
      'thesis_curador',
      'running',
      analysisParallelLimit > 1 ? 'Analisando documentos do acervo em paralelo...' : 'Analisando documentos do acervo...',
      'running',
    )

    if (docsForCurador.length > 0 || thematicGaps.length > 0) {
      try {
        const docsText = docsForCurador.map(d => acervoExcerpt(d)).join('\n\n===\n\n')
        const gapsText = thematicGaps.length > 0
          ? `\n\nLACUNAS TEMÁTICAS IDENTIFICADAS (priorize teses que preencham estas lacunas):\n${thematicGaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
          : ''
        const catalogueText = catalogue.length > 0
          ? `\n\nBANCO ATUAL (resumo compacto para evitar duplicidades):\n${JSON.stringify(catalogue.slice(0, 80), null, 2)}`
          : ''

        notify('thesis_curador', 'running', 'Curador aguardando resposta do modelo...', 'waiting_io')

        const res = await callLLMWithFallback(
          apiKey,
          CURADOR_SYSTEM,
          `Documentos do acervo não analisados:\n\n${docsText}${gapsText}${catalogueText}`,
          modelMap['thesis_curador'],
          resolveFb('thesis_curador', modelMap['thesis_curador']),
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
        notify('thesis_curador', 'error', `Curador: ${agentErrorMessage(err)}`)
        console.warn('Curador failed:', err)
      }
    }

    notify('thesis_curador', 'done', `${newThesisProposals.length} novas teses propostas`)
  }

  const curadorPromise = analysisParallelLimit > 1
    ? trackPhase('curadoria_acervo', runCurador)
    : null

  // ── Agent 1: Catalogador ─────────────────────────────────────────────────────

  notify('thesis_catalogador', 'running', 'Catalogando teses existentes...', 'waiting_io')

  let catalogueResult: {
    similar_groups?: Array<{ ids: string[]; titles: string[]; reason: string }>
    low_quality_ids?: string[]
    thematic_gaps?: string[]
    catalogue_summary?: string
  } = {}

  try {
    const res = await trackPhase('inventario', async () => callLLMWithFallback(
      apiKey,
      CATALOGADOR_SYSTEM,
      `Inventário de ${catalogue.length} teses jurídicas:\n${JSON.stringify(catalogue, null, 2)}`,
      modelMap['thesis_catalogador'],
      resolveFb('thesis_catalogador', modelMap['thesis_catalogador']),
      3000,
      0.1,
    ))
    recordAgentDuration(res)
    llmExecutions.push(createUsageExecutionRecord({
      source_type: 'thesis_analysis',
      source_id: sessionId,
      created_at: now,
      phase: 'thesis_catalogador',
      agent_name: 'Catalogador',
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
    catalogueResult = parseJsonObject(res.content) as typeof catalogueResult
    notify('thesis_catalogador', 'done', `${catalogueResult.similar_groups?.length ?? 0} grupos identificados`)
  } catch (err) {
    notify('thesis_catalogador', 'error', `Catalogador: ${agentErrorMessage(err)}`)
    console.warn('Catalogador failed:', err)
    catalogueResult = { similar_groups: [], low_quality_ids: [], thematic_gaps: [], catalogue_summary: '' }
  }

  const similarGroups = catalogueResult.similar_groups ?? []
  thematicGaps = catalogueResult.thematic_gaps ?? []

  // ── Agent 2: Analista ────────────────────────────────────────────────────────

  notify('thesis_analista', 'running', 'Analisando redundâncias nos grupos...', 'running')

  // Build full-content view for all theses in groups
  const thesisById = new Map(theses.filter(t => t.id).map(t => [t.id!, t]))
  const groupsWithContent = similarGroups.map(group => ({
    ...group,
    theses_content: group.ids
      .map(id => {
        const t = thesisById.get(id)
        return t ? { id, title: t.title, content: t.content.slice(0, 800) } : null
      })
      .filter((x): x is { id: string; title: string; content: string } => x !== null),
  }))

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
        `Grupos de teses para análise profunda:\n${JSON.stringify(groupsWithContent, null, 2)}`,
        modelMap['thesis_analista'],
        resolveFb('thesis_analista', modelMap['thesis_analista']),
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
      const parsed = parseJsonObject(res.content) as { analysis?: typeof analysisMergeGroups }
      analysisMergeGroups = (parsed.analysis ?? []).filter(g => g.action === 'merge')
    }
    notify('thesis_analista', 'done', `${analysisMergeGroups.length} grupos a compilar`)
  } catch (err) {
    notify('thesis_analista', 'error', `Analista: ${agentErrorMessage(err)}`)
    console.warn('Analista failed:', err)
    analysisMergeGroups = []
  }

  // Build delete suggestions from low-quality candidates flagged by Catalogador
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
          `VERSÃO ${i + 1} — "${t.title}":\n${t.content.slice(0, 1200)}`
        ).join('\n\n---\n\n')

        notify('thesis_compilador', 'running', `Compilador aguardando resposta para o grupo ${groupIndex + 1}/${analysisMergeGroups.length}...`, 'waiting_io')

        const res = await callLLMWithFallback(
          apiKey,
          COMPILADOR_SYSTEM,
          `Compile as seguintes ${groupTheses.length} teses jurídicas em uma única tese superior:\n\n${versionsText}`,
          modelMap['thesis_compilador'],
          resolveFb('thesis_compilador', modelMap['thesis_compilador']),
          2500,
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
        const compiled = parseJsonObject(res.content) as {
          title: string
          content: string
          summary: string
          legal_area_id: string
          tags?: string[]
          quality_score?: number
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
      source: 'catalogador',
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
  const revisorPayload = rawSuggestions.map(s => {
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
      return { temp_id: s.temp_id, type: s.type, title: d.title, summary: d.summary?.slice(0, 200), legal_area_id: d.legal_area_id, tags: d.tags }
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
        `Banco atual: ${theses.length} teses.\n\nSugestões para revisão:\n${JSON.stringify(revisorPayload, null, 2)}`,
        modelMap['thesis_revisor'],
        resolveFb('thesis_revisor', modelMap['thesis_revisor']),
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
          `A saída abaixo deveria ser um objeto JSON válido no formato {"executive_summary":"...","suggestions":[...]}. Corrija somente a sintaxe e preserve os campos úteis.\n\n${res.content}`,
          modelMap['thesis_revisor'],
          resolveFb('thesis_revisor', modelMap['thesis_revisor']),
          4000,
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
        // Enrich with the original compiled thesis data if available
        const original = rawSuggestions.find(r => r.temp_id === s.temp_id)
        let proposedThesis = s.proposed_thesis

        if (!proposedThesis && original?.type === 'merge') {
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
      notify('thesis_revisor', 'error', `Revisor: ${agentErrorMessage(err)}`)
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
    }
  } else {
    notify('thesis_revisor', 'done', 'Nenhuma sugestão gerada')
    executiveSummary = 'O banco de teses está bem estruturado. Nenhuma ação necessária no momento.'
  }

  const wallClockMs = Date.now() - wallClockStart
  const pipelineMeta: ThesisAnalysisPipelineMeta = {
    pipeline_version: 'thesis_parallel_v1',
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
