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
import { collection, doc, updateDoc, addDoc, getFirestore } from 'firebase/firestore'
import { getApp } from 'firebase/app'
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
  resolveFallbackModelsForCategory,
  type AgentCategory,
  type FallbackPriorityConfig,
} from './model-config'
import { loadAdminDocumentTypes } from './firestore-service'
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
  SharedCaseContext,
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
  action: 'retry' | 'escalate' | 'second_round' | 'revise_citations'
  reason: string
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
  const db = getFirestore(getApp())
  const colRef = collection(db, 'users', uid, 'documents')
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
  const ref = await addDoc(colRef, docData)
  return { id: ref.id }
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
  const db = getFirestore(getApp())
  const docRef = doc(db, 'users', uid, 'documents', docId)
  const signal = options?.signal

  await updateDoc(docRef, {
    status: 'processando',
    updated_at: new Date().toISOString(),
  })

  const llmExecutions: UsageExecutionRecord[] = []
  const recordExecution = (
    phase: string,
    agentName: string,
    result: LLMResult | null,
  ) => {
    if (!result) return
    llmExecutions.push(createUsageExecutionRecord({
      source_type: 'document_generation',
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

    const [apiKey, agentModels, adminDocTypes, fallbackPriorities] = await Promise.all([
      getOpenRouterKey(uid),
      loadDocumentV3Models(uid),
      loadAdminDocumentTypes().catch(() => []),
      loadFallbackPriorityConfig(uid).catch(() => ({} as FallbackPriorityConfig)),
    ])

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
    const parallelLimit = Math.max(1, options?.parallelLimit ?? DOCUMENT_V3_DEFAULT_PARALLEL_LIMIT)

    // ── Phase 1: Compreensão (parallel) ─────────────────────────────────────
    await trackPhase('compreensao', async () => {
      reportProgress('v3_intent_classifier', 'Compreendendo a solicitação...', 5, {
        modelId: agentModels.v3_intent_classifier,
        executionState: 'waiting_io',
      })
      reportProgress('v3_request_parser', 'Extraindo fatos e partes...', 6, {
        modelId: agentModels.v3_request_parser,
        executionState: 'waiting_io',
      })
      reportProgress('v3_legal_issue_spotter', 'Identificando questões jurídicas...', 7, {
        modelId: agentModels.v3_legal_issue_spotter,
        executionState: 'waiting_io',
      })

      // Wrap each parallel task so that completion progress is reported
       // *as soon as that individual agent finishes*, rather than waiting for
       // the slowest sibling to complete the whole `Promise.all`. This keeps
       // perceived latency between consecutive activities short — the UI
       // advances the moment an agent is done instead of jumping all states
       // at the end of the phase.
      const [intentRes, parserRes, issuesRes] = await runWithConcurrency<unknown>(
        [
          async () => {
            const res = await runIntentClassifier(buildAgentCtx('v3_intent_classifier'))
            recordExecution('v3_intent_classifier', 'Classificador de Intenção', res.llmResult)
            recordAgentDuration(res.llmResult)
            reportProgress('v3_intent_classifier', 'Classificação concluída.', 9, { result: res.llmResult, executionState: 'completed' })
            return res
          },
          async () => {
            const res = await runRequestParser(buildAgentCtx('v3_request_parser'))
            recordExecution('v3_request_parser', 'Parser da Solicitação', res.llmResult)
            recordAgentDuration(res.llmResult)
            reportProgress('v3_request_parser', 'Parser concluído.', 10, { result: res.llmResult, executionState: 'completed' })
            return res
          },
          async () => {
            const res = await runLegalIssueSpotter(buildAgentCtx('v3_legal_issue_spotter'))
            recordExecution('v3_legal_issue_spotter', 'Identificador de Questões', res.llmResult)
            recordAgentDuration(res.llmResult)
            reportProgress('v3_legal_issue_spotter', 'Questões identificadas.', 11, { result: res.llmResult, executionState: 'completed' })
            return res
          },
        ],
        parallelLimit,
      ) as [
        Awaited<ReturnType<typeof runIntentClassifier>>,
        Awaited<ReturnType<typeof runRequestParser>>,
        Awaited<ReturnType<typeof runLegalIssueSpotter>>,
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
      reportProgress('v3_prompt_architect', 'Arquiteto consolidando briefings...', 13, {
        modelId: agentModels.v3_prompt_architect,
        executionState: 'running',
      })
      const architectRes = await superviseAgent({
        agentLabel: 'Arquiteto de Prompts',
        primaryModel: agentModels.v3_prompt_architect,
        escalationModel: supervisorModel,
        runner: async (model) => {
          const result = await runPromptArchitect({ ...buildAgentCtx('v3_prompt_architect'), model })
          recordExecution('v3_prompt_architect', 'Arquiteto de Prompts', result.llmResult)
          recordAgentDuration(result.llmResult)
          reportProgress('v3_prompt_architect', 'Briefings prontos.', 16, { result: result.llmResult, executionState: 'completed' })
          return result
        },
        validate: (res) => (
          res.output.tema && (res.output.analise || res.output.pesquisa || res.output.redacao)
            ? null
            : 'briefings_vazios'
        ),
      })
      caseContext.briefings = architectRes.output.output
      if (architectRes.usedEscalation) {
        supervisorActions.push({
          agent: 'v3_prompt_architect',
          action: 'escalate',
          reason: architectRes.reason,
        })
      } else if (architectRes.attempts > 1) {
        supervisorActions.push({
          agent: 'v3_prompt_architect',
          action: 'retry',
          reason: architectRes.reason,
        })
      }
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
      await updateDoc(docRef, { tema: caseContext.briefings.tema }).catch(() => {})
    }

    // ── Phase 2: Análise jurídica ───────────────────────────────────────────
    await trackPhase('analise', async () => {
      reportProgress('v3_acervo_retriever', 'Buscando acervo relevante...', 18, {
        modelId: agentModels.v3_acervo_retriever,
        executionState: 'waiting_io',
      })
      reportProgress('v3_thesis_retriever', 'Buscando teses do banco...', 19, {
        modelId: agentModels.v3_thesis_retriever,
        executionState: 'waiting_io',
      })
      const [acervoRes, thesisIORes] = await runWithConcurrency<unknown>(
        [
          async () => {
            const res = await runAcervoRetriever(buildAgentCtx('v3_acervo_retriever'), uid)
            if (res.llmResult) {
              recordExecution('v3_acervo_retriever', 'Buscador de Acervo', res.llmResult)
              recordAgentDuration(res.llmResult)
              reportProgress('v3_acervo_retriever', `Acervo (${res.output.selectedFilenames.length} docs).`, 22, { result: res.llmResult, executionState: 'completed' })
            } else {
              reportProgress('v3_acervo_retriever', 'Sem acervo aplicável.', 22, { executionState: 'completed' })
            }
            return res
          },
          async () => {
            const res = await runThesisRetriever(buildAgentCtx('v3_thesis_retriever'), uid)
            reportProgress('v3_thesis_retriever', `Teses (${res.output.count}).`, 24, { executionState: 'completed' })
            return res
          },
        ],
        parallelLimit,
      ) as [
        Awaited<ReturnType<typeof runAcervoRetriever>>,
        Awaited<ReturnType<typeof runThesisRetriever>>,
      ]
      caseContext.acervoSnippets = acervoRes.output.snippets
      caseContext.thesisSnippets = thesisIORes.output.snippets

      // Thesis builder
      reportProgress('v3_thesis_builder', 'Construindo teses...', 27, {
        modelId: agentModels.v3_thesis_builder,
        executionState: 'running',
      })
      const builderRes = await superviseAgent({
        agentLabel: 'Construtor de Teses',
        primaryModel: agentModels.v3_thesis_builder,
        escalationModel: supervisorModel,
        runner: async (model) => {
          const result = await runThesisBuilder({ ...buildAgentCtx('v3_thesis_builder'), model })
          recordExecution('v3_thesis_builder', 'Construtor de Teses', result.llmResult)
          recordAgentDuration(result.llmResult)
          reportProgress('v3_thesis_builder', 'Teses construídas.', 35, { result: result.llmResult, executionState: 'completed' })
          return result
        },
        validate: (res) => (res.output.text.length > 200 ? null : 'tese_curta'),
      })
      caseContext.theses = builderRes.output.output
      if (builderRes.usedEscalation) {
        supervisorActions.push({ agent: 'v3_thesis_builder', action: 'escalate', reason: builderRes.reason })
      }

      // Devil advocate
      reportProgress('v3_devil_advocate', 'Crítica do advogado do diabo...', 38, {
        modelId: agentModels.v3_devil_advocate,
      })
      const devilRes = await runDevilAdvocate(buildAgentCtx('v3_devil_advocate'))
      caseContext.critique = devilRes.output
      recordExecution('v3_devil_advocate', 'Advogado do Diabo', devilRes.llmResult)
      recordAgentDuration(devilRes.llmResult)
      reportProgress('v3_devil_advocate', `Crítica concluída (${devilRes.output.weaknesses} pontos).`, 42, { result: devilRes.llmResult, executionState: 'completed' })

      // Refiner — may loop with devil advocate based on supervisor decision (max 1 extra round)
      let refinerRes = await runThesisRefiner(buildAgentCtx('v3_thesis_refiner'), devilRes.output)
      caseContext.refinedTheses = refinerRes.output
      recordExecution('v3_thesis_refiner', 'Refinador de Teses', refinerRes.llmResult)
      recordAgentDuration(refinerRes.llmResult)
      reportProgress('v3_thesis_refiner', 'Teses refinadas.', 48, { result: refinerRes.llmResult, executionState: 'completed' })

      // Optional second round if the critique pointed many weaknesses
      if (devilRes.output.weaknesses >= SUPERVISOR_DEVIL_ROUND2_THRESHOLD) {
        const devilRound2 = await runDevilAdvocate(buildAgentCtx('v3_devil_advocate'))
        recordExecution('v3_devil_advocate', 'Advogado do Diabo (rodada 2)', devilRound2.llmResult)
        recordAgentDuration(devilRound2.llmResult)
        if (devilRound2.output.weaknesses < devilRes.output.weaknesses) {
          refinerRes = await runThesisRefiner(buildAgentCtx('v3_thesis_refiner'), devilRound2.output)
          caseContext.refinedTheses = refinerRes.output
          recordExecution('v3_thesis_refiner', 'Refinador de Teses (rodada 2)', refinerRes.llmResult)
          recordAgentDuration(refinerRes.llmResult)
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
      reportProgress('v3_legislation_researcher', 'Pesquisando legislação...', 52, {
        modelId: agentModels.v3_legislation_researcher,
        executionState: 'waiting_io',
      })
      reportProgress('v3_jurisprudence_researcher', 'Pesquisando jurisprudência...', 53, {
        modelId: agentModels.v3_jurisprudence_researcher,
        executionState: 'waiting_io',
      })
      reportProgress('v3_doctrine_researcher', 'Pesquisando doutrina...', 54, {
        modelId: agentModels.v3_doctrine_researcher,
        executionState: 'waiting_io',
      })
      // I. outline-planner é disparado em paralelo com a pesquisa: depende
      // apenas dos briefings + teses refinadas (já disponíveis).
      reportProgress('v3_outline_planner', 'Planejando estrutura (em paralelo)...', 55, {
        modelId: agentModels.v3_outline_planner,
        executionState: 'waiting_io',
      })
      const [legisRes, juriRes, doctRes, outlineRes] = await runWithConcurrency<unknown>(
        [
          () => runLegislationResearcher(buildAgentCtx('v3_legislation_researcher')),
          () => runJurisprudenceResearcher(buildAgentCtx('v3_jurisprudence_researcher')),
          () => runDoctrineResearcher(buildAgentCtx('v3_doctrine_researcher')),
          () => runOutlinePlanner(buildAgentCtx('v3_outline_planner'), customStructure),
        ],
        parallelLimit,
      ) as [
        Awaited<ReturnType<typeof runLegislationResearcher>>,
        Awaited<ReturnType<typeof runJurisprudenceResearcher>>,
        Awaited<ReturnType<typeof runDoctrineResearcher>>,
        Awaited<ReturnType<typeof runOutlinePlanner>>,
      ]
      caseContext.legislation = legisRes.output
      caseContext.jurisprudence = juriRes.output
      caseContext.doctrine = doctRes.output
      caseContext.outline = outlineRes.output
      recordExecution('v3_legislation_researcher', 'Pesquisador de Legislação', legisRes.llmResult)
      recordExecution('v3_jurisprudence_researcher', 'Pesquisador de Jurisprudência', juriRes.llmResult)
      recordExecution('v3_doctrine_researcher', 'Pesquisador de Doutrina', doctRes.llmResult)
      recordExecution('v3_outline_planner', 'Planejador da Estrutura', outlineRes.llmResult)
      recordAgentDuration(legisRes.llmResult)
      recordAgentDuration(juriRes.llmResult)
      recordAgentDuration(doctRes.llmResult)
      recordAgentDuration(outlineRes.llmResult)
      reportProgress('v3_legislation_researcher', 'Legislação concluída.', 60, { result: legisRes.llmResult, executionState: 'completed' })
      reportProgress('v3_jurisprudence_researcher', 'Jurisprudência concluída.', 62, { result: juriRes.llmResult, executionState: 'completed' })
      reportProgress('v3_doctrine_researcher', 'Doutrina concluída.', 64, { result: doctRes.llmResult, executionState: 'completed' })
      reportProgress('v3_outline_planner', 'Plano definido.', 66, { result: outlineRes.llmResult, executionState: 'completed' })

      // Citation verifier (sequential — depends on the research material)
      reportProgress('v3_citation_verifier', 'Verificando citações...', 68, {
        modelId: agentModels.v3_citation_verifier,
      })
      const citationRes = await runCitationVerifier(buildAgentCtx('v3_citation_verifier'))
      caseContext.citationCheck = citationRes.output
      recordExecution('v3_citation_verifier', 'Verificador de Citações', citationRes.llmResult)
      recordAgentDuration(citationRes.llmResult)
      reportProgress('v3_citation_verifier', `Citações verificadas (${citationRes.output.corrections} correções).`, 72, { result: citationRes.llmResult, executionState: 'completed' })
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
      reportProgress('v3_writer', 'Redigindo o documento...', 85, {
        modelId: agentModels.v3_writer,
      })
      const writerRes = await superviseAgent({
        agentLabel: 'Redator',
        primaryModel: agentModels.v3_writer,
        escalationModel: supervisorModel,
        runner: async (model) => {
          const result = await runWriter({ ...buildAgentCtx('v3_writer'), model })
          recordExecution('v3_writer', 'Redator', result.llmResult)
          recordAgentDuration(result.llmResult)
          reportProgress('v3_writer', 'Redação concluída.', 90, { result: result.llmResult, executionState: 'completed' })
          return result
        },
        validate: (res) => (res.output.length > 800 ? null : 'documento_curto'),
      })
      finalText = writerRes.output.output
      writerEscalated = writerRes.usedEscalation
      if (writerRes.usedEscalation) {
        supervisorActions.push({ agent: 'v3_writer', action: 'escalate', reason: writerRes.reason })
      }

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
        reportProgress('v3_writer_reviser', `Revisando ${draftCheck.unsupported.length} citações não fundamentadas...`, 91, {
          modelId: agentModels.v3_writer_reviser || agentModels.v3_writer,
        })
        const reviserResult = await runWriterReviser(
          { ...buildAgentCtx('v3_writer_reviser') },
          { draft: finalText, unsupportedCitations: draftCheck.unsupported },
        )
        recordExecution('v3_writer_reviser', 'Revisor de Redação', reviserResult.llmResult)
        recordAgentDuration(reviserResult.llmResult)
        if (reviserResult.output && reviserResult.output.length > 400) {
          finalText = reviserResult.output
        }
        supervisorActions.push({
          agent: 'v3_writer_reviser',
          action: 'revise_citations',
          reason: `unsupported_${draftCheck.unsupported.length}`,
        })
        reportProgress('v3_writer_reviser', 'Revisão de citações concluída.', 92, {
          result: reviserResult.llmResult,
          executionState: 'completed',
        })
      } else {
        // Mark the reviser step as completed without firing an LLM call so the
        // pipeline UI doesn't get stuck on a "pending" reviser badge.
        reportProgress('v3_writer_reviser', 'Sem revisão necessária.', 92, { executionState: 'completed' })
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
            executionState: 'completed',
          })
        }
      } catch (err) {
        // Don't fail the whole pipeline if the escalation attempt itself fails;
        // keep the original draft and let the quality_score reflect that.
        if (err instanceof DOMException && err.name === 'AbortError') throw err
      }
    }

    const usage_summary = buildUsageSummary(llmExecutions)
    const totals = llmExecutions.reduce(
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
      await updateDoc(docRef, {
        texto_completo: finalText,
        status: 'concluido',
        quality_score: quality.score,
        tema: caseContext.briefings?.tema ?? null,
        llm_tokens_in: totals.tin,
        llm_tokens_out: totals.tout,
        llm_cost_usd: parseFloat(totals.cost.toFixed(6)),
        llm_executions: llmExecutions,
        usage_summary,
        generation_meta: {
          pipeline_version: 'v3',
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
      })
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
    await updateDoc(docRef, {
      status: 'erro',
      updated_at: new Date().toISOString(),
    }).catch(() => {})
    throw err
  }
}
