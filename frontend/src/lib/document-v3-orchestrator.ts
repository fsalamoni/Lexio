/**
 * Document v3 orchestrator — supervisor-coordinated multi-agent generator.
 *
 * The orchestrator wires together the v3 agents in 4 phases (Compreensão →
 * Análise → Pesquisa → Redação), running tasks in parallel where possible,
 * supervising retries and finally persisting the result in the SAME Firestore
 * collection used by the v2 pipeline (`users/{uid}/documents/{docId}`) with
 * the SAME schema fields (`texto_completo`, `status`, `quality_score`,
 * `llm_executions`, `usage_summary`, `tema`, etc).
 *
 * No v2 code is modified by this module. The v2 pipeline in
 * `generation-service.ts` continues to be the only path used by `NewDocument`.
 */
import { collection, doc, updateDoc, addDoc } from 'firebase/firestore'
import {
  AREA_NAMES,
  DOC_TYPE_NAMES,
  buildProfileBlock,
  getLLMOperationalUsageMeta,
  getOpenRouterKey,
  type UserProfileForGeneration,
} from './generation-service'
import {
  DOCUMENT_V3_PIPELINE_AGENT_DEFS,
  loadDocumentV3Models,
  loadFallbackPriorityConfig,
  loadResearchNotebookModels,
  resolveFallbackModelsForCategory,
  type AgentCategory,
  type FallbackPriorityConfig,
  type ResearchNotebookModelMap,
} from './model-config'
import { loadAdminDocumentTypes, writeUserScoped } from './firestore-service'
import { buildUsageSummary, createUsageExecutionRecord, type UsageExecutionRecord } from './cost-analytics'
import {
  buildDocumentV3PipelineProgress,
  buildDocumentV3StageMeta,
  DOCUMENT_V3_PIPELINE_COMPLETED_PHASE,
  type DocumentV3PipelineProgress,
} from './document-v3-pipeline'
import { compactContext } from './context-compactor'
import { runWithConcurrency, DOCUMENT_V3_DEFAULT_PARALLEL_LIMIT } from './runtime-concurrency'
import type { LLMResult } from './llm-client'
import type { ContextDetailData } from './firestore-types'

import { runIntentClassifier } from './v3-agents/intent-classifier'
import { runRequestParser } from './v3-agents/request-parser'
import { runLegalIssueSpotter } from './v3-agents/legal-issue-spotter'
import { runPromptArchitect } from './v3-agents/prompt-architect'
import { runAcervoRetriever } from './v3-agents/acervo-retriever'
import { runThesisRetriever } from './v3-agents/thesis-retriever'
import { runThesisBuilder } from './v3-agents/thesis-builder'
import { runDevilAdvocate } from './v3-agents/devil-advocate'
import { runThesisRefiner } from './v3-agents/thesis-refiner'
import { runLegislationResearcher } from './v3-agents/legislation-researcher'
import { runJurisprudenceResearcher } from './v3-agents/jurisprudence-researcher'
import { runDoctrineResearcher } from './v3-agents/doctrine-researcher'
import { runCitationVerifier, verifyDraftCitations } from './v3-agents/citation-verifier'
import { runOutlinePlanner } from './v3-agents/outline-planner'
import { runWriter } from './v3-agents/writer'
import { runWriterReviser } from './v3-agents/writer-reviser'
import { evaluateQualityV3 } from './v3-agents/quality-evaluator-v3'
import { superviseAgent } from './v3-agents/supervisor'
import type {
  AgentRunContext,
  AgentRunResult,
  AgentBriefings,
  BuiltTheses,
  CitationVerification,
  DocumentOutline,
  IntentSummary,
  LegalIssue,
  ParsedRequest,
  ResearchSection,
  SharedCaseContext,
  ThesisCritique,
} from './v3-agents/types'

/**
 * Map every v3 agent key to the agent category that drives its fallback
 * priority list. Built once from `DOCUMENT_V3_PIPELINE_AGENT_DEFS` so the
 * orchestrator stays in sync if defs are reordered or renamed.
 */
const V3_AGENT_CATEGORY_BY_KEY: Record<string, AgentCategory> = (() => {
  const map: Record<string, AgentCategory> = {}
  for (const def of DOCUMENT_V3_PIPELINE_AGENT_DEFS) {
    if (def.agentCategory) {
      map[def.key] = def.agentCategory
    }
  }
  return map
})()

/**
 * Threshold of weaknesses (raised by the Devil's Advocate) above which the
 * Supervisor triggers an extra critique+refinement round. Empirically chosen
 * so that minor critiques (1–3 fraquezas) do not double the latency, while
 * heavy critiques (≥4) get a second pass to stabilize the theses.
 */
const SUPERVISOR_DEVIL_ROUND2_THRESHOLD = 4

/**
 * Quality score (0-100) under which the Supervisor re-runs the writer with
 * the escalation model (one extra attempt). Below 70 means the heuristic
 * evaluator considered the document weak (missing structure, too short, etc).
 */
const SUPERVISOR_QUALITY_ESCALATION_THRESHOLD = 70

/** Character budget for each compacted phase summary (anti-bloat). */
const PHASE_COMPACTION_CHAR_BUDGET = 3000

export type GenerationProgressV3 = DocumentV3PipelineProgress
export type ProgressCallbackV3 = (p: GenerationProgressV3) => void

export interface GenerateDocumentV3Options {
  signal?: AbortSignal
  /** Maximum concurrent agents in fan-out phases. Defaults to DOCUMENT_V3_DEFAULT_PARALLEL_LIMIT. */
  parallelLimit?: number
}

interface SupervisorAction {
  agent: string
  action: 'retry' | 'escalate' | 'second_round' | 'revise_citations' | 'local_fallback' | 'continue_without_agent'
  reason: string
}

type NullableAgentRunResult<T> = AgentRunResult<T> | { output: T; llmResult: null }

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function describeAgentFailure(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim().slice(0, 240)
  return String(err).slice(0, 240)
}

function fallbackIntent(ctx: SharedCaseContext): IntentSummary {
  return {
    classification: ctx.docTypeLabel,
    complexity: 3,
    urgency: 3,
    notes: 'Classificação local usada porque o LLM não respondeu durante a compreensão.',
  }
}

function fallbackParsedRequest(ctx: SharedCaseContext): ParsedRequest {
  return {
    partes: [],
    fatos: [ctx.request].filter(Boolean),
    pedidos: [],
    prazos: [],
    observacoes: 'Extração local mínima usada porque o LLM não respondeu.',
  }
}

function fallbackLegalIssues(ctx: SharedCaseContext): LegalIssue[] {
  return [{
    id: 'Q1',
    titulo: ctx.docTypeLabel,
    resumo: ctx.request.slice(0, 320) || 'Questão jurídica principal indicada pelo pedido.',
    areas: ctx.areas,
  }]
}

function fallbackBriefings(ctx: SharedCaseContext): AgentBriefings {
  const tema = ctx.legalIssues?.[0]?.titulo || ctx.intent?.classification || ctx.docTypeLabel
  const keywords = [
    ...ctx.areaLabels,
    ctx.docTypeLabel,
    ...(ctx.legalIssues ?? []).map(issue => issue.titulo),
  ].map(k => k.trim()).filter(Boolean).slice(0, 8)
  return {
    tema,
    subtemas: (ctx.legalIssues ?? []).map(issue => issue.titulo).slice(0, 6),
    palavrasChave: keywords,
    analise: 'Prosseguir com análise jurídica prudente a partir dos fatos informados, sem inventar dados.',
    pesquisa: 'Pesquisar fundamentos normativos e entendimentos seguros relacionados ao tema central.',
    redacao: 'Redigir documento formal, técnico e autocontido com base apenas no contexto disponível.',
  }
}

function fallbackTheses(ctx: SharedCaseContext): BuiltTheses {
  const issues = ctx.legalIssues?.length ? ctx.legalIssues : fallbackLegalIssues(ctx)
  const text = issues.map((issue, idx) => [
    `## Tese ${idx + 1} — ${issue.titulo}`,
    issue.resumo,
    'A argumentação deve ser desenvolvida de forma prudente, conectando os fatos narrados aos fundamentos jurídicos pertinentes e evitando referências não verificadas.',
  ].join('\n')).join('\n\n')
  return { text, titles: issues.map((issue, idx) => `Tese ${idx + 1} — ${issue.titulo}`) }
}

function fallbackCritique(): ThesisCritique {
  return {
    text: '## Crítica operacional\n- Fraqueza: crítica LLM indisponível; revisar manualmente a suficiência probatória e a aderência dos pedidos aos fatos narrados.',
    weaknesses: 1,
  }
}

function fallbackResearchSection(kind: string): ResearchSection {
  return {
    text: `## ${kind} não concluída automaticamente\nO agente de ${kind.toLowerCase()} não respondeu após retries. Prosseguir sem inventar citações; o redator deve usar linguagem prudente e apenas fundamentos presentes no contexto.`,
  }
}

function fallbackCitationVerification(): CitationVerification {
  return {
    text: '## Verificação parcial\n- Itens verificados: 0\n- Correções aplicadas: 0\nA verificação LLM não respondeu; citações novas devem ser evitadas ou formuladas de modo genérico e prudente.',
    corrections: 0,
  }
}

function fallbackOutline(ctx: SharedCaseContext): DocumentOutline {
  const tema = ctx.briefings?.tema || ctx.docTypeLabel
  return {
    text: [
      `## ${tema}`,
      '1. Síntese da solicitação e premissas fáticas informadas.',
      '2. Questões jurídicas relevantes e teses sustentáveis.',
      '3. Fundamentação jurídica prudente, sem citações não verificadas.',
      '4. Conclusão e encaminhamentos.',
    ].join('\n'),
  }
}

function fallbackEmergencyDocument(ctx: SharedCaseContext): string {
  const tema = ctx.briefings?.tema || ctx.docTypeLabel
  const facts = ctx.parsedFacts?.fatos?.length ? ctx.parsedFacts.fatos.join('; ') : ctx.request
  const theses = ctx.refinedTheses?.text || ctx.theses?.text || fallbackTheses(ctx).text
  const research = [
    ctx.legislation?.text,
    ctx.jurisprudence?.text,
    ctx.doctrine?.text,
    ctx.citationCheck?.text,
  ].filter(Boolean).join('\n\n')
  return [
    tema.toUpperCase(),
    '',
    'SÍNTESE',
    `Este rascunho foi concluído em modo de continuidade operacional porque o agente redator não respondeu após as tentativas de retomada. A solicitação original foi: ${ctx.request}`,
    `Fatos e contexto disponíveis: ${facts}`,
    '',
    'QUESTÕES E TESES',
    theses,
    '',
    'FUNDAMENTAÇÃO DISPONÍVEL',
    research || 'Não houve retorno completo dos agentes de pesquisa. Por segurança, este texto não acrescenta citações específicas não verificadas.',
    '',
    'CONCLUSÃO',
    'Recomenda-se revisão humana antes do protocolo ou uso externo, especialmente para completar citações, adequar pedidos e conferir documentos de suporte. Ainda assim, o pipeline foi preservado sem interromper a geração por falha transitória de LLM.',
  ].join('\n\n')
}

/**
 * Same input schema as the v2 `createDocument` plus an optional
 * `pipeline_version` marker stored in metadata.
 */
export async function createDocumentV3(uid: string, input: {
  document_type_id: string
  original_request: string
  template_variant?: string | null
  legal_area_ids?: string[] | null
  request_context?: Record<string, unknown> | null
  context_detail?: ContextDetailData | null
}): Promise<{ id: string }> {
  const now = new Date().toISOString()
  const docData = {
    document_type_id: input.document_type_id,
    original_request: input.original_request,
    template_variant: input.template_variant ?? null,
    legal_area_ids: input.legal_area_ids ?? [],
    request_context: { ...(input.request_context ?? {}), pipeline_version: 'v3' },
    context_detail: input.context_detail ?? null,
    tema: null,
    status: 'rascunho',
    quality_score: null,
    texto_completo: null,
    origem: 'web',
    created_at: now,
    updated_at: now,
  }
  return writeUserScoped(uid, 'createDocumentV3', async (db, effectiveUid) => {
    const colRef = collection(db, 'users', effectiveUid, 'documents')
    const ref = await addDoc(colRef, docData)
    return { id: ref.id }
  })
}

/**
 * Generate a document with the v3 multi-phase orchestrated pipeline.
 *
 * The signature mirrors `generateDocument` from generation-service.ts so that
 * UI callers can swap implementations easily.
 */
export async function generateDocumentV3(
  uid: string,
  docId: string,
  docType: string,
  request: string,
  areas: string[],
  context?: Record<string, unknown> | null,
  onProgress?: ProgressCallbackV3,
  profile?: UserProfileForGeneration | null,
  contextDetail?: ContextDetailData | null,
  options?: GenerateDocumentV3Options,
): Promise<void> {
  const signal = options?.signal
  const persistDocument = (data: Record<string, unknown>, contextLabel: string) => {
    return writeUserScoped(uid, contextLabel, async (db, effectiveUid) => {
      const docRef = doc(db, 'users', effectiveUid, 'documents', docId)
      await updateDoc(docRef, data)
    })
  }

  await persistDocument({
    status: 'processando',
    updated_at: new Date().toISOString(),
  }, 'generateDocumentV3.start')

  const llmExecutions: UsageExecutionRecord[] = []
  const recordExecution = (
    phase: string,
    agentName: string,
    result: LLMResult | null,
  ) => {
    if (!result) return
    llmExecutions.push(createUsageExecutionRecord({
      source_type: 'document_generation_v3',
      source_id: docId,
      phase,
      agent_name: agentName,
      model: result.model,
      tokens_in: result.tokens_in,
      tokens_out: result.tokens_out,
      cost_usd: result.cost_usd,
      duration_ms: result.duration_ms,
      document_type_id: docType,
      ...getLLMOperationalUsageMeta(result),
    }))
  }

  const reportProgress = (
    phase: string,
    message: string,
    percent: number,
    options?: {
      modelId?: string
      stageMeta?: string
      executionState?: GenerationProgressV3['executionState']
      result?: LLMResult
    },
  ) => {
    if (signal?.aborted) return
    if (options?.result) {
      const result = options.result
      const retryCount = result.operational?.totalRetryCount ?? 0
      onProgress?.(buildDocumentV3PipelineProgress(phase, message, percent, {
        executionState: options.executionState ?? (retryCount > 0 ? 'retrying' : 'running'),
        modelId: result.model,
        stageMeta: buildDocumentV3StageMeta(result),
        costUsd: result.cost_usd,
        durationMs: result.duration_ms,
        retryCount,
        usedFallback: result.operational?.fallbackUsed,
        fallbackFrom: result.operational?.fallbackFrom,
      }))
    } else {
      onProgress?.(buildDocumentV3PipelineProgress(phase, message, percent, {
        executionState: options?.executionState ?? 'running',
        modelId: options?.modelId,
        stageMeta: options?.stageMeta,
      }))
    }
  }

  try {
    // ── Stage 0: Configuration ──────────────────────────────────────────────
    reportProgress('config', 'Carregando configurações...', 2, {
      stageMeta: 'Resolvendo chave, modelos e estrutura de documento',
      executionState: 'waiting_io',
    })

    // Telemetry: track wall-clock per phase so we can compute parallel savings.
    const wallClockStart = Date.now()
    const phaseDurationsMs: Record<string, number> = {}
    const supervisorActions: SupervisorAction[] = []
    let totalAgentDurationMs = 0
    const recordAgentDuration = (result: LLMResult | null | undefined) => {
      if (result?.duration_ms && result.duration_ms > 0) {
        totalAgentDurationMs += result.duration_ms
      }
    }
    const trackPhase = async <T,>(phaseKey: string, fn: () => Promise<T>): Promise<T> => {
      const startedAt = Date.now()
      try {
        return await fn()
      } finally {
        phaseDurationsMs[phaseKey] = (phaseDurationsMs[phaseKey] ?? 0) + (Date.now() - startedAt)
      }
    }

    const [apiKey, agentModels, adminDocTypes, fallbackPriorities, notebookModelsLoaded] = await Promise.all([
      getOpenRouterKey(uid),
      loadDocumentV3Models(uid),
      loadAdminDocumentTypes().catch(() => []),
      loadFallbackPriorityConfig(uid).catch(() => ({} as FallbackPriorityConfig)),
      loadResearchNotebookModels(uid).catch(() => ({} as ResearchNotebookModelMap)),
    ])
    const notebookModels: ResearchNotebookModelMap = notebookModelsLoaded

    const adminDocType = adminDocTypes.find(dt => dt.id === docType)
    const customStructure = adminDocType?.structure?.trim() || undefined

    const docTypeLabel = DOC_TYPE_NAMES[docType] ?? docType
    const areaLabels = areas.map(a => AREA_NAMES[a] ?? a)

    const caseContext: SharedCaseContext = {
      request,
      docType,
      docTypeLabel,
      areas,
      areaLabels,
    }

    // F. Preserve arbitrary context supplied by the caller — exposed to every
    // agent through the `<contexto_caso>` block without overriding anything
    // produced by later agents.
    if (context && Object.keys(context).length > 0) {
      caseContext.requestContext = { ...context }
    }
    if (contextDetail?.questions?.length) {
      caseContext.parsedFacts = {
        partes: [],
        fatos: contextDetail.questions.map(q => `${q.question}: ${q.answer}`).filter(Boolean),
        pedidos: [],
        prazos: [],
        observacoes: contextDetail.analysis_summary,
      }
    }

    const profileBlock = buildProfileBlock(profile)

    /**
     * Build the per-agent run context. The fallback list is sourced strictly
     * from the user's category-specific fallback configuration (settings
     * page → "Fallback de Modelos") with the failed primary model removed.
     * The platform never injects a model the user did not explicitly pick.
     */
    const buildAgentCtx = (agentKey: string): AgentRunContext => {
      const primary = agentModels[agentKey] || agentModels.v3_writer
      const category = V3_AGENT_CATEGORY_BY_KEY[agentKey]
      const fallbackList = resolveFallbackModelsForCategory(primary, category, fallbackPriorities)
      return {
        apiKey,
        model: primary,
        fallbackModel: fallbackList,
        caseContext,
        profileBlock,
        signal,
      }
    }

    const supervisorModel = agentModels.v3_supervisor || undefined
    const orchestratorModel = agentModels.v3_pipeline_orchestrator || supervisorModel
    const parallelLimit = Math.max(1, options?.parallelLimit ?? DOCUMENT_V3_DEFAULT_PARALLEL_LIMIT)
    reportProgress('v3_pipeline_orchestrator', 'Orquestrador monitorando execução, retries e continuidade...', 3, {
      modelId: orchestratorModel,
      executionState: 'running',
      stageMeta: `Limite paralelo: ${parallelLimit}`,
    })

    const recordAgentResult = (
      phase: string,
      agentName: string,
      result: { llmResult: LLMResult | null; extraExecutions?: ReadonlyArray<{ phase: string; agentName: string; llmResult: LLMResult }> },
    ) => {
      if (result.llmResult) {
        recordExecution(phase, agentName, result.llmResult)
        recordAgentDuration(result.llmResult)
      }
      for (const extra of result.extraExecutions ?? []) {
        recordExecution(extra.phase, extra.agentName, extra.llmResult)
        recordAgentDuration(extra.llmResult)
      }
    }

    const recordSupervisorRecovery = (
      agent: string,
      agentLabel: string,
      action: SupervisorAction['action'],
      reason: string,
      percent: number,
    ) => {
      supervisorActions.push({ agent, action, reason })
      const actionMessages: Record<SupervisorAction['action'], string> = {
        retry: 'retentativa supervisionada',
        escalate: 'escalonamento supervisionado',
        second_round: 'segunda rodada supervisionada',
        revise_citations: 'revisão de citações',
        local_fallback: 'fallback local seguro',
        continue_without_agent: 'seguindo sem bloquear a fase',
      }
      reportProgress('v3_pipeline_orchestrator', `Orquestrador: ${agentLabel} — ${actionMessages[action]}.`, percent, {
        modelId: orchestratorModel,
        executionState: 'retrying',
        stageMeta: reason,
      })
    }

    const runResilientAgent = async <T,>(opts: {
      agentKey: string
      agentLabel: string
      startMessage: string
      completedMessage: (output: T) => string
      fallbackMessage: string
      startPercent: number
      completedPercent: number
      runner: (ctx: AgentRunContext) => Promise<NullableAgentRunResult<T>>
      fallbackOutput: () => T
      validate?: (result: NullableAgentRunResult<T>) => string | null
      maxRetries?: number
      recoveryAction?: SupervisorAction['action']
    }): Promise<NullableAgentRunResult<T>> => {
      reportProgress(opts.agentKey, opts.startMessage, opts.startPercent, {
        modelId: agentModels[opts.agentKey],
        executionState: 'running',
      })
      try {
        const supervised = await superviseAgent({
          agentLabel: opts.agentLabel,
          primaryModel: agentModels[opts.agentKey] || agentModels.v3_writer,
          escalationModel: supervisorModel,
          maxRetries: opts.maxRetries ?? 2,
          runner: async (model, attempt) => {
            if (attempt > 0) {
              reportProgress(opts.agentKey, `Orquestrador retomando ${opts.agentLabel} (tentativa ${attempt + 1})...`, opts.startPercent, {
                modelId: model,
                executionState: 'retrying',
              })
            }
            return opts.runner({ ...buildAgentCtx(opts.agentKey), model })
          },
          validate: opts.validate,
        })
        const result = supervised.output
        recordAgentResult(opts.agentKey, opts.agentLabel, result)
        if (supervised.usedEscalation) {
          supervisorActions.push({ agent: opts.agentKey, action: 'escalate', reason: supervised.reason })
        } else if (supervised.attempts > 1) {
          supervisorActions.push({ agent: opts.agentKey, action: 'retry', reason: supervised.reason })
        }
        reportProgress(opts.agentKey, opts.completedMessage(result.output), opts.completedPercent, result.llmResult
          ? { result: result.llmResult, executionState: 'running' }
          : { executionState: 'running' })
        return result
      } catch (err) {
        if (isAbortError(err)) throw err
        const reason = describeAgentFailure(err)
        const action = opts.recoveryAction ?? 'local_fallback'
        recordSupervisorRecovery(opts.agentKey, opts.agentLabel, action, reason, opts.startPercent)
        const fallback = { output: opts.fallbackOutput(), llmResult: null }
        reportProgress(opts.agentKey, opts.fallbackMessage, opts.completedPercent, {
          executionState: 'running',
          stageMeta: `Fallback local: ${reason}`,
        })
        return fallback
      }
    }

    // ── Phase 1: Compreensão (parallel) ─────────────────────────────────────
    await trackPhase('compreensao', async () => {
      // Wrap each parallel task so that progress is reported the instant the
      // agent actually starts (and again when it finishes). This avoids the
      // "waiting_io" pre-emission gap that previously sat between phases.
      const [intentRes, parserRes, issuesRes] = await runWithConcurrency<unknown>(
        [
          () => runResilientAgent({
            agentKey: 'v3_intent_classifier',
            agentLabel: 'Classificador de Intenção',
            startMessage: 'Compreendendo a solicitação...',
            completedMessage: () => 'Classificação concluída.',
            fallbackMessage: 'Classificação local aplicada.',
            startPercent: 5,
            completedPercent: 9,
            runner: runIntentClassifier,
            fallbackOutput: () => fallbackIntent(caseContext),
          }),
          () => runResilientAgent({
            agentKey: 'v3_request_parser',
            agentLabel: 'Parser da Solicitação',
            startMessage: 'Extraindo fatos e partes...',
            completedMessage: () => 'Parser concluído.',
            fallbackMessage: 'Extração local mínima aplicada.',
            startPercent: 6,
            completedPercent: 10,
            runner: runRequestParser,
            fallbackOutput: () => fallbackParsedRequest(caseContext),
          }),
          () => runResilientAgent({
            agentKey: 'v3_legal_issue_spotter',
            agentLabel: 'Identificador de Questões',
            startMessage: 'Identificando questões jurídicas...',
            completedMessage: () => 'Questões identificadas.',
            fallbackMessage: 'Questão jurídica local aplicada.',
            startPercent: 7,
            completedPercent: 11,
            runner: runLegalIssueSpotter,
            fallbackOutput: () => fallbackLegalIssues(caseContext),
            validate: (res) => res.output.length > 0 ? null : 'questoes_vazias',
          }),
        ],
        parallelLimit,
      ) as [
        NullableAgentRunResult<IntentSummary>,
        NullableAgentRunResult<ParsedRequest>,
        NullableAgentRunResult<LegalIssue[]>,
      ]

      caseContext.intent = intentRes.output
      // Parser should not overwrite parsedFacts already filled from contextDetail.
      if (!caseContext.parsedFacts) caseContext.parsedFacts = parserRes.output
      caseContext.legalIssues = issuesRes.output

      // Per-agent completion progress is already emitted inside each wrapped
      // task above (see runWithConcurrency callbacks), so the UI advances
      // immediately when each individual agent finishes — no redundant
      // emission here.

      // Architect consolidates the comprehension phase
      const architectRes = await runResilientAgent({
        agentKey: 'v3_prompt_architect',
        agentLabel: 'Arquiteto de Prompts',
        startMessage: 'Arquiteto consolidando briefings...',
        completedMessage: () => 'Briefings prontos.',
        fallbackMessage: 'Briefings locais aplicados.',
        startPercent: 13,
        completedPercent: 16,
        runner: runPromptArchitect,
        fallbackOutput: () => fallbackBriefings(caseContext),
        validate: (res) => (
          res.output.tema && (res.output.analise || res.output.pesquisa || res.output.redacao)
            ? null
            : 'briefings_vazios'
        ),
      })
      caseContext.briefings = architectRes.output
    })

    // A. Compactar a compreensão (Fase 1) — agentes da Fase 2 e 3 lerão a versão
    // compactada para reduzir tokens injetados; o writer continua usando os
    // campos estruturados originais (intent/parsedFacts/legalIssues/briefings).
    {
      const sources: { label: string; text: string; priority?: number }[] = []
      if (caseContext.intent) {
        sources.push({
          label: 'compreensao.intent',
          text: `${caseContext.intent.classification} · complexidade ${caseContext.intent.complexity}/5 · urgência ${caseContext.intent.urgency}/5\n${caseContext.intent.notes ?? ''}`,
          priority: 0,
        })
      }
      if (caseContext.parsedFacts) {
        const pf = caseContext.parsedFacts
        sources.push({
          label: 'compreensao.parsedFacts',
          text: [
            pf.partes.length ? `Partes: ${pf.partes.join('; ')}` : '',
            pf.fatos.length ? `Fatos: ${pf.fatos.join('; ')}` : '',
            pf.pedidos.length ? `Pedidos: ${pf.pedidos.join('; ')}` : '',
            pf.prazos.length ? `Prazos: ${pf.prazos.join('; ')}` : '',
            pf.jurisdicao ? `Jurisdição: ${pf.jurisdicao}` : '',
            pf.observacoes ? `Observações: ${pf.observacoes}` : '',
          ].filter(Boolean).join('\n'),
          priority: 0,
        })
      }
      if (caseContext.legalIssues?.length) {
        sources.push({
          label: 'compreensao.legalIssues',
          text: caseContext.legalIssues.map(i => `(${i.id}) ${i.titulo}: ${i.resumo}`).join('\n'),
          priority: 1,
        })
      }
      if (caseContext.briefings) {
        sources.push({
          label: 'compreensao.briefings',
          text: [
            `Tema: ${caseContext.briefings.tema}`,
            caseContext.briefings.subtemas.length ? `Subtemas: ${caseContext.briefings.subtemas.join(', ')}` : '',
            caseContext.briefings.palavrasChave.length ? `Palavras-chave: ${caseContext.briefings.palavrasChave.join(', ')}` : '',
            caseContext.briefings.analise ? `Briefing análise: ${caseContext.briefings.analise}` : '',
            caseContext.briefings.pesquisa ? `Briefing pesquisa: ${caseContext.briefings.pesquisa}` : '',
            caseContext.briefings.redacao ? `Briefing redação: ${caseContext.briefings.redacao}` : '',
          ].filter(Boolean).join('\n'),
          priority: 0,
        })
      }
      if (sources.length > 0) {
        const compacted = compactContext(sources, PHASE_COMPACTION_CHAR_BUDGET)
        caseContext.compacted = { ...(caseContext.compacted ?? {}), compreensao: compacted.text }
      }
    }

    // tema persisted early so list view shows it during processing
    if (caseContext.briefings?.tema) {
      await persistDocument({ tema: caseContext.briefings.tema }, 'generateDocumentV3.tema').catch(() => {})
    }

    // ── Phase 2: Análise jurídica ───────────────────────────────────────────
    await trackPhase('analise', async () => {
      const [acervoRes, thesisIORes] = await runWithConcurrency<unknown>(
        [
          () => runResilientAgent({
            agentKey: 'v3_acervo_retriever',
            agentLabel: 'Buscador de Acervo',
            startMessage: 'Buscando acervo relevante...',
            completedMessage: output => output.selectedFilenames.length > 0 ? `Acervo (${output.selectedFilenames.length} docs).` : 'Sem acervo aplicável.',
            fallbackMessage: 'Acervo ignorado para não bloquear a geração.',
            startPercent: 18,
            completedPercent: 22,
            runner: ctx => runAcervoRetriever(ctx, uid),
            fallbackOutput: () => ({ snippets: '', selectedFilenames: [] as string[] }),
            recoveryAction: 'continue_without_agent',
          }),
          () => runResilientAgent({
            agentKey: 'v3_thesis_retriever',
            agentLabel: 'Buscador de Teses',
            startMessage: 'Buscando teses do banco...',
            completedMessage: output => `Teses (${output.count}).`,
            fallbackMessage: 'Banco de teses ignorado para não bloquear a geração.',
            startPercent: 19,
            completedPercent: 24,
            runner: ctx => runThesisRetriever(ctx, uid),
            fallbackOutput: () => ({ snippets: '', count: 0 }),
            recoveryAction: 'continue_without_agent',
          }),
        ],
        parallelLimit,
      ) as [
        Awaited<ReturnType<typeof runAcervoRetriever>>,
        Awaited<ReturnType<typeof runThesisRetriever>>,
      ]
      caseContext.acervoSnippets = acervoRes.output.snippets
      caseContext.thesisSnippets = thesisIORes.output.snippets

      // Thesis builder
      const builderRes = await runResilientAgent({
        agentKey: 'v3_thesis_builder',
        agentLabel: 'Construtor de Teses',
        startMessage: 'Construindo teses...',
        completedMessage: () => 'Teses construídas.',
        fallbackMessage: 'Teses locais mínimas aplicadas.',
        startPercent: 27,
        completedPercent: 35,
        runner: runThesisBuilder,
        fallbackOutput: () => fallbackTheses(caseContext),
        validate: (res) => (res.output.text.length > 200 ? null : 'tese_curta'),
      })
      caseContext.theses = builderRes.output

      // Devil advocate
      const devilRes = await runResilientAgent({
        agentKey: 'v3_devil_advocate',
        agentLabel: 'Advogado do Diabo',
        startMessage: 'Crítica do advogado do diabo...',
        completedMessage: output => `Crítica concluída (${output.weaknesses} pontos).`,
        fallbackMessage: 'Crítica local mínima aplicada.',
        startPercent: 38,
        completedPercent: 42,
        runner: runDevilAdvocate,
        fallbackOutput: fallbackCritique,
        recoveryAction: 'continue_without_agent',
      })
      caseContext.critique = devilRes.output

      // Refiner — may loop with devil advocate based on supervisor decision (max 1 extra round)
      let refinerRes = await runResilientAgent({
        agentKey: 'v3_thesis_refiner',
        agentLabel: 'Refinador de Teses',
        startMessage: 'Refinando teses...',
        completedMessage: () => 'Teses refinadas.',
        fallbackMessage: 'Mantendo teses construídas sem refino LLM.',
        startPercent: 44,
        completedPercent: 48,
        runner: ctx => runThesisRefiner(ctx, devilRes.output),
        fallbackOutput: () => caseContext.theses ?? fallbackTheses(caseContext),
      })
      caseContext.refinedTheses = refinerRes.output

      // Optional second round if the critique pointed many weaknesses
      if (devilRes.output.weaknesses >= SUPERVISOR_DEVIL_ROUND2_THRESHOLD) {
        const devilRound2 = await runResilientAgent({
          agentKey: 'v3_devil_advocate',
          agentLabel: 'Advogado do Diabo (rodada 2)',
          startMessage: 'Reavaliando crítica...',
          completedMessage: output => `Crítica rodada 2 (${output.weaknesses} pontos).`,
          fallbackMessage: 'Rodada 2 ignorada para manter continuidade.',
          startPercent: 43,
          completedPercent: 44,
          runner: runDevilAdvocate,
          fallbackOutput: () => devilRes.output,
          recoveryAction: 'continue_without_agent',
          maxRetries: 1,
        })
        if (devilRound2.output.weaknesses < devilRes.output.weaknesses) {
          refinerRes = await runResilientAgent({
            agentKey: 'v3_thesis_refiner',
            agentLabel: 'Refinador de Teses (rodada 2)',
            startMessage: 'Refinando teses após rodada 2...',
            completedMessage: () => 'Teses refinadas na rodada 2.',
            fallbackMessage: 'Mantendo refino anterior.',
            startPercent: 45,
            completedPercent: 48,
            runner: ctx => runThesisRefiner(ctx, devilRound2.output),
            fallbackOutput: () => caseContext.refinedTheses ?? caseContext.theses ?? fallbackTheses(caseContext),
            maxRetries: 1,
          })
          caseContext.refinedTheses = refinerRes.output
          supervisorActions.push({
            agent: 'v3_thesis_refiner',
            action: 'second_round',
            reason: `weaknesses_${devilRes.output.weaknesses}_to_${devilRound2.output.weaknesses}`,
          })
        }
      }
    })

    // A. Compactar a análise (Fase 2) para a Fase 3 e Fase 4 (exceto writer/qualidade).
    {
      const sources: { label: string; text: string; priority?: number }[] = []
      if (caseContext.refinedTheses?.text) {
        sources.push({ label: 'analise.refinedTheses', text: caseContext.refinedTheses.text, priority: 0 })
      } else if (caseContext.theses?.text) {
        sources.push({ label: 'analise.theses', text: caseContext.theses.text, priority: 0 })
      }
      if (caseContext.acervoSnippets) {
        sources.push({ label: 'analise.acervo', text: caseContext.acervoSnippets, priority: 1 })
      }
      if (caseContext.thesisSnippets) {
        sources.push({ label: 'analise.banco_teses', text: caseContext.thesisSnippets, priority: 1 })
      }
      if (sources.length > 0) {
        const compacted = compactContext(sources, PHASE_COMPACTION_CHAR_BUDGET)
        caseContext.compacted = { ...(caseContext.compacted ?? {}), analise: compacted.text }
      }
    }

    // ── Phase 3: Pesquisa (parallel) + outline em paralelo (otimização I) ───
    await trackPhase('pesquisa', async () => {
      const [legisRes, juriRes, doctRes, outlineRes] = await runWithConcurrency<unknown>(
        [
          () => runResilientAgent({
            agentKey: 'v3_legislation_researcher',
            agentLabel: 'Pesquisador de Legislação',
            startMessage: 'Pesquisando legislação...',
            completedMessage: () => 'Legislação concluída.',
            fallbackMessage: 'Pesquisa de legislação ignorada com orientação prudente.',
            startPercent: 52,
            completedPercent: 60,
            runner: runLegislationResearcher,
            fallbackOutput: () => fallbackResearchSection('Legislação'),
            recoveryAction: 'continue_without_agent',
          }),
          () => runResilientAgent({
            agentKey: 'v3_jurisprudence_researcher',
            agentLabel: 'Pesquisador de Jurisprudência',
            startMessage: 'Consultando DataJud (jurisprudência real)...',
            completedMessage: () => 'Jurisprudência concluída.',
            fallbackMessage: 'Pesquisa de jurisprudência ignorada com orientação prudente.',
            startPercent: 53,
            completedPercent: 62,
            runner: ctx => runJurisprudenceResearcher(
              ctx,
              {
                rankerModel: notebookModels.notebook_ranqueador_jurisprudencia || undefined,
                synthesisModel: notebookModels.notebook_pesquisador_jurisprudencia || undefined,
                onSubstep: (msg) => {
                  reportProgress('v3_jurisprudence_researcher', msg, 56, {
                    modelId: agentModels.v3_jurisprudence_researcher,
                    executionState: 'running',
                  })
                },
              },
            ),
            fallbackOutput: () => fallbackResearchSection('Jurisprudência'),
            recoveryAction: 'continue_without_agent',
          }),
          () => runResilientAgent({
            agentKey: 'v3_doctrine_researcher',
            agentLabel: 'Pesquisador de Doutrina',
            startMessage: 'Pesquisando doutrina...',
            completedMessage: () => 'Doutrina concluída.',
            fallbackMessage: 'Pesquisa de doutrina ignorada com orientação prudente.',
            startPercent: 54,
            completedPercent: 64,
            runner: runDoctrineResearcher,
            fallbackOutput: () => fallbackResearchSection('Doutrina'),
            recoveryAction: 'continue_without_agent',
          }),
          () => runResilientAgent({
            agentKey: 'v3_outline_planner',
            agentLabel: 'Planejador da Estrutura',
            startMessage: 'Planejando estrutura (em paralelo)...',
            completedMessage: () => 'Plano definido.',
            fallbackMessage: 'Plano local mínimo definido.',
            startPercent: 55,
            completedPercent: 66,
            runner: ctx => runOutlinePlanner(ctx, customStructure),
            fallbackOutput: () => fallbackOutline(caseContext),
          }),
        ],
        parallelLimit,
      ) as [
        NullableAgentRunResult<ResearchSection>,
        NullableAgentRunResult<ResearchSection>,
        NullableAgentRunResult<ResearchSection>,
        NullableAgentRunResult<DocumentOutline>,
      ]
      caseContext.legislation = legisRes.output
      caseContext.jurisprudence = juriRes.output
      caseContext.doctrine = doctRes.output
      caseContext.outline = outlineRes.output

      // Citation verifier (sequential — depends on the research material)
      const citationRes = await runResilientAgent({
        agentKey: 'v3_citation_verifier',
        agentLabel: 'Verificador de Citações',
        startMessage: 'Verificando citações...',
        completedMessage: output => `Citações verificadas (${output.corrections} correções).`,
        fallbackMessage: 'Verificação local parcial aplicada.',
        startPercent: 68,
        completedPercent: 72,
        runner: runCitationVerifier,
        fallbackOutput: fallbackCitationVerification,
        recoveryAction: 'continue_without_agent',
      })
      caseContext.citationCheck = citationRes.output
    })

    // A. Compactar a pesquisa (Fase 3) para o writer-reviser (writer
    // continua usando os campos estruturados originais).
    {
      const sources: { label: string; text: string; priority?: number }[] = []
      if (caseContext.legislation?.text) sources.push({ label: 'pesquisa.legislacao', text: caseContext.legislation.text, priority: 0 })
      if (caseContext.jurisprudence?.text) sources.push({ label: 'pesquisa.jurisprudencia', text: caseContext.jurisprudence.text, priority: 0 })
      if (caseContext.doctrine?.text) sources.push({ label: 'pesquisa.doutrina', text: caseContext.doctrine.text, priority: 1 })
      if (caseContext.citationCheck?.text) sources.push({ label: 'pesquisa.verificacao', text: caseContext.citationCheck.text, priority: 1 })
      if (sources.length > 0) {
        const compacted = compactContext(sources, PHASE_COMPACTION_CHAR_BUDGET)
        caseContext.compacted = { ...(caseContext.compacted ?? {}), pesquisa: compacted.text }
      }
    }

    // ── Phase 4: Redação ────────────────────────────────────────────────────
    let finalText = ''
    let writerEscalated = false
    await trackPhase('redacao', async () => {
      const writerRes = await runResilientAgent({
        agentKey: 'v3_writer',
        agentLabel: 'Redator',
        startMessage: 'Redigindo o documento...',
        completedMessage: () => 'Redação concluída.',
        fallbackMessage: 'Rascunho de continuidade gerado localmente.',
        startPercent: 85,
        completedPercent: 90,
        runner: runWriter,
        fallbackOutput: () => fallbackEmergencyDocument(caseContext),
        validate: (res) => (res.output.length > 800 ? null : 'documento_curto'),
      })
      finalText = writerRes.output
      writerEscalated = supervisorActions.some(a => a.agent === 'v3_writer' && a.action === 'escalate')

      // C. Verificação determinística pós-redação contra o material da Fase 3.
      // Quando o writer introduz citações que não constam do material verificado,
      // o supervisor dispara o reviser uma única vez para revisar essas passagens.
      const draftCheck = verifyDraftCitations(finalText, [
        caseContext.legislation?.text,
        caseContext.jurisprudence?.text,
        caseContext.doctrine?.text,
        caseContext.citationCheck?.text,
      ])
      if (draftCheck.unsupported.length > 0) {
        const reviserResult = await runResilientAgent({
          agentKey: 'v3_writer_reviser',
          agentLabel: 'Revisor de Redação',
          startMessage: `Revisando ${draftCheck.unsupported.length} citações não fundamentadas...`,
          completedMessage: () => 'Revisão de citações concluída.',
          fallbackMessage: 'Revisão LLM ignorada; mantendo rascunho atual.',
          startPercent: 91,
          completedPercent: 92,
          runner: ctx => runWriterReviser(
            ctx,
            { draft: finalText, unsupportedCitations: draftCheck.unsupported },
          ),
          fallbackOutput: () => finalText,
          recoveryAction: 'continue_without_agent',
          maxRetries: 1,
        })
        if (reviserResult.output && reviserResult.output.length > 400) {
          finalText = reviserResult.output
        }
        supervisorActions.push({
          agent: 'v3_writer_reviser',
          action: 'revise_citations',
          reason: `unsupported_${draftCheck.unsupported.length}`,
        })
      } else {
        // Mark the reviser step as completed without firing an LLM call so the
        // pipeline UI doesn't get stuck on a "pending" reviser badge.
        reportProgress('v3_writer_reviser', 'Sem revisão necessária.', 92, { executionState: 'running' })
      }
    })

    // ── Quality + escalonamento opcional ────────────────────────────────────
    let quality = await trackPhase('qualidade', async () => {
      reportProgress('qualidade', 'Avaliando qualidade...', 94, { executionState: 'running' })
      return evaluateQualityV3(finalText, docType, { tema: caseContext.briefings?.tema })
    })

    // D. Loop de qualidade do writer com escalonamento (máx. 1 re-execução).
    if (
      quality.score < SUPERVISOR_QUALITY_ESCALATION_THRESHOLD
      && !writerEscalated
      && supervisorModel
      && supervisorModel !== agentModels.v3_writer
    ) {
      reportProgress('v3_writer', `Qualidade baixa (${quality.score}). Re-executando com modelo escalado...`, 94, {
        modelId: supervisorModel,
        executionState: 'retrying',
      })
      try {
        const retryResult = await runWriter({
          ...buildAgentCtx('v3_writer'),
          model: supervisorModel,
        })
        if (retryResult.output && retryResult.output.length > 800) {
          recordExecution('v3_writer', 'Redator (escalado por qualidade)', retryResult.llmResult)
          recordAgentDuration(retryResult.llmResult)
          finalText = retryResult.output
          quality = evaluateQualityV3(finalText, docType, { tema: caseContext.briefings?.tema })
          supervisorActions.push({
            agent: 'v3_writer',
            action: 'escalate',
            reason: `quality_score_${quality.score}_below_${SUPERVISOR_QUALITY_ESCALATION_THRESHOLD}`,
          })
          reportProgress('v3_writer', 'Redação reescrita (modelo escalado).', 95, {
            result: retryResult.llmResult,
            executionState: 'running',
          })
        }
      } catch (err) {
        // Don't fail the whole pipeline if the escalation attempt itself fails;
        // keep the original draft and let the quality_score reflect that.
        if (err instanceof DOMException && err.name === 'AbortError') throw err
      }
    }

    const orchestratorRecoveryCount = supervisorActions.filter(action =>
      action.action === 'retry'
      || action.action === 'escalate'
      || action.action === 'local_fallback'
      || action.action === 'continue_without_agent'
      || action.action === 'second_round'
      || action.action === 'revise_citations',
    ).length
    const orchestratorExecution = createUsageExecutionRecord({
      source_type: 'document_generation_v3',
      source_id: docId,
      phase: 'v3_pipeline_orchestrator',
      agent_name: 'Orquestrador do Pipeline',
      model: orchestratorModel ?? null,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      duration_ms: Date.now() - wallClockStart,
      execution_state: orchestratorRecoveryCount > 0 ? 'retrying' : 'completed',
      retry_count: orchestratorRecoveryCount,
      used_fallback: supervisorActions.some(action => action.action === 'local_fallback' || action.action === 'continue_without_agent'),
      runtime_concurrency: parallelLimit,
      runtime_hints: supervisorActions.length > 0
        ? `${supervisorActions.length} ação(ões) de supervisão`
        : 'Execução supervisionada sem recuperações',
      document_type_id: docType,
    })
    const persistedExecutions = [orchestratorExecution, ...llmExecutions]
    const usage_summary = buildUsageSummary(persistedExecutions)
    const totals = persistedExecutions.reduce(
      (acc, e) => ({ tin: acc.tin + e.tokens_in, tout: acc.tout + e.tokens_out, cost: acc.cost + e.cost_usd }),
      { tin: 0, tout: 0, cost: 0 },
    )

    reportProgress('salvando', 'Salvando documento...', 97, { executionState: 'persisting' })
    const saveStartedAt = Date.now()
    await trackPhase('salvando', async () => {
      const wallClockMs = Date.now() - wallClockStart
      // J. Telemetria estendida: salvamos durações por fase e estimativa de
      // economia por paralelismo (soma das durações dos agentes − wall-clock).
      const parallelSavingsMs = Math.max(0, totalAgentDurationMs - wallClockMs)
      await persistDocument({
        texto_completo: finalText,
        status: 'concluido',
        quality_score: quality.score,
        tema: caseContext.briefings?.tema ?? null,
        llm_tokens_in: totals.tin,
        llm_tokens_out: totals.tout,
        llm_cost_usd: parseFloat(totals.cost.toFixed(6)),
        llm_executions: persistedExecutions,
        usage_summary,
        generation_meta: {
          pipeline_version: 'v3',
          orchestrator_agent: 'v3_pipeline_orchestrator',
          orchestrator_model: orchestratorModel ?? null,
          orchestrator_recovery_count: orchestratorRecoveryCount,
          quality_passed: quality.passed,
          quality_failed: quality.failed,
          phase_durations_ms: phaseDurationsMs,
          total_agent_duration_ms: totalAgentDurationMs,
          wall_clock_ms: wallClockMs,
          parallel_savings_ms: parallelSavingsMs,
          supervisor_actions: supervisorActions,
          parallel_limit: parallelLimit,
        },
        updated_at: new Date().toISOString(),
      }, 'generateDocumentV3.complete')
    })

    reportProgress(
      DOCUMENT_V3_PIPELINE_COMPLETED_PHASE,
      'Documento gerado com sucesso!',
      100,
      {
        executionState: 'completed',
        stageMeta: `Persistido em ${Math.max(1, Date.now() - saveStartedAt)}ms`,
      },
    )
  } catch (err) {
    await persistDocument({
      status: 'erro',
      updated_at: new Date().toISOString(),
    }, 'generateDocumentV3.error').catch(() => {})
    throw err
  }
}
