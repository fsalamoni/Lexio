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
import { loadDocumentV3Models } from './model-config'
import { loadAdminDocumentTypes } from './firestore-service'
import { buildUsageSummary, createUsageExecutionRecord, type UsageExecutionRecord } from './cost-analytics'
import {
  buildDocumentV3PipelineProgress,
  buildDocumentV3StageMeta,
  DOCUMENT_V3_PIPELINE_COMPLETED_PHASE,
  type DocumentV3PipelineProgress,
} from './document-v3-pipeline'
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
import { runCitationVerifier } from './v3-agents/citation-verifier'
import { runOutlinePlanner } from './v3-agents/outline-planner'
import { runWriter } from './v3-agents/writer'
import { evaluateQualityV3 } from './v3-agents/quality-evaluator-v3'
import { superviseAgent } from './v3-agents/supervisor'
import type {
  AgentRunContext,
  SharedCaseContext,
} from './v3-agents/types'

const RELIABLE_TEXT_FALLBACK_MODEL = 'google/gemini-2.0-flash'

export type GenerationProgressV3 = DocumentV3PipelineProgress
export type ProgressCallbackV3 = (p: GenerationProgressV3) => void

export interface GenerateDocumentV3Options {
  signal?: AbortSignal
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

    const [apiKey, agentModels, adminDocTypes] = await Promise.all([
      getOpenRouterKey(uid),
      loadDocumentV3Models(uid),
      loadAdminDocumentTypes().catch(() => []),
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

    if (context) {
      // We only carry the original context for downstream prompts; the structured
      // fields are extracted by the parser agent.
      caseContext.parsedFacts = undefined
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

    const buildAgentCtx = (agentKey: string): AgentRunContext => ({
      apiKey,
      model: agentModels[agentKey] || agentModels.v3_writer,
      fallbackModel: RELIABLE_TEXT_FALLBACK_MODEL,
      caseContext,
      profileBlock,
      signal,
    })

    const supervisorModel = agentModels.v3_supervisor || undefined

    // ── Phase 1: Compreensão (parallel) ─────────────────────────────────────
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

    const [intentRes, parserRes, issuesRes] = await Promise.all([
      runIntentClassifier(buildAgentCtx('v3_intent_classifier')),
      runRequestParser(buildAgentCtx('v3_request_parser')),
      runLegalIssueSpotter(buildAgentCtx('v3_legal_issue_spotter')),
    ])

    caseContext.intent = intentRes.output
    if (!caseContext.parsedFacts) caseContext.parsedFacts = parserRes.output
    caseContext.legalIssues = issuesRes.output

    recordExecution('v3_intent_classifier', 'Classificador de Intenção', intentRes.llmResult)
    recordExecution('v3_request_parser', 'Parser da Solicitação', parserRes.llmResult)
    recordExecution('v3_legal_issue_spotter', 'Identificador de Questões', issuesRes.llmResult)

    reportProgress('v3_intent_classifier', 'Classificação concluída.', 9, { result: intentRes.llmResult, executionState: 'completed' })
    reportProgress('v3_request_parser', 'Parser concluído.', 10, { result: parserRes.llmResult, executionState: 'completed' })
    reportProgress('v3_legal_issue_spotter', 'Questões identificadas.', 11, { result: issuesRes.llmResult, executionState: 'completed' })

    // Architect consolidates the comprehension phase
    reportProgress('v3_prompt_architect', 'Arquiteto consolidando briefings...', 13, {
      modelId: agentModels.v3_prompt_architect,
    })
    const architectRes = await superviseAgent({
      agentLabel: 'Arquiteto de Prompts',
      primaryModel: agentModels.v3_prompt_architect,
      escalationModel: supervisorModel,
      runner: async (model) => {
        const result = await runPromptArchitect({ ...buildAgentCtx('v3_prompt_architect'), model })
        recordExecution('v3_prompt_architect', 'Arquiteto de Prompts', result.llmResult)
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

    // tema persisted early so list view shows it during processing
    if (caseContext.briefings?.tema) {
      await updateDoc(docRef, { tema: caseContext.briefings.tema }).catch(() => {})
    }

    // ── Phase 2: Análise jurídica ───────────────────────────────────────────
    reportProgress('v3_acervo_retriever', 'Buscando acervo relevante...', 18, {
      modelId: agentModels.v3_acervo_retriever,
      executionState: 'waiting_io',
    })
    reportProgress('v3_thesis_retriever', 'Buscando teses do banco...', 19, {
      modelId: agentModels.v3_thesis_retriever,
      executionState: 'waiting_io',
    })
    const [acervoRes, thesisIORes] = await Promise.all([
      runAcervoRetriever(buildAgentCtx('v3_acervo_retriever'), uid),
      runThesisRetriever(buildAgentCtx('v3_thesis_retriever'), uid),
    ])
    caseContext.acervoSnippets = acervoRes.output.snippets
    caseContext.thesisSnippets = thesisIORes.output.snippets
    if (acervoRes.llmResult) {
      recordExecution('v3_acervo_retriever', 'Buscador de Acervo', acervoRes.llmResult)
      reportProgress('v3_acervo_retriever', `Acervo (${acervoRes.output.selectedFilenames.length} docs).`, 22, { result: acervoRes.llmResult, executionState: 'completed' })
    } else {
      reportProgress('v3_acervo_retriever', 'Sem acervo aplicável.', 22, { executionState: 'completed' })
    }
    reportProgress('v3_thesis_retriever', `Teses (${thesisIORes.output.count}).`, 24, { executionState: 'completed' })

    // Thesis builder
    reportProgress('v3_thesis_builder', 'Construindo teses...', 27, {
      modelId: agentModels.v3_thesis_builder,
    })
    const builderRes = await superviseAgent({
      agentLabel: 'Construtor de Teses',
      primaryModel: agentModels.v3_thesis_builder,
      escalationModel: supervisorModel,
      runner: async (model) => {
        const result = await runThesisBuilder({ ...buildAgentCtx('v3_thesis_builder'), model })
        recordExecution('v3_thesis_builder', 'Construtor de Teses', result.llmResult)
        reportProgress('v3_thesis_builder', 'Teses construídas.', 35, { result: result.llmResult, executionState: 'completed' })
        return result
      },
      validate: (res) => (res.output.text.length > 200 ? null : 'tese_curta'),
    })
    caseContext.theses = builderRes.output.output

    // Devil advocate
    reportProgress('v3_devil_advocate', 'Crítica do advogado do diabo...', 38, {
      modelId: agentModels.v3_devil_advocate,
    })
    const devilRes = await runDevilAdvocate(buildAgentCtx('v3_devil_advocate'))
    caseContext.critique = devilRes.output
    recordExecution('v3_devil_advocate', 'Advogado do Diabo', devilRes.llmResult)
    reportProgress('v3_devil_advocate', `Crítica concluída (${devilRes.output.weaknesses} pontos).`, 42, { result: devilRes.llmResult, executionState: 'completed' })

    // Refiner — may loop with devil advocate based on supervisor decision (max 1 extra round)
    let refinerRes = await runThesisRefiner(buildAgentCtx('v3_thesis_refiner'), devilRes.output)
    caseContext.refinedTheses = refinerRes.output
    recordExecution('v3_thesis_refiner', 'Refinador de Teses', refinerRes.llmResult)
    reportProgress('v3_thesis_refiner', 'Teses refinadas.', 48, { result: refinerRes.llmResult, executionState: 'completed' })

    // Optional second round if the critique pointed many weaknesses
    if (devilRes.output.weaknesses >= 4) {
      const devilRound2 = await runDevilAdvocate(buildAgentCtx('v3_devil_advocate'))
      recordExecution('v3_devil_advocate', 'Advogado do Diabo (rodada 2)', devilRound2.llmResult)
      if (devilRound2.output.weaknesses < devilRes.output.weaknesses) {
        refinerRes = await runThesisRefiner(buildAgentCtx('v3_thesis_refiner'), devilRound2.output)
        caseContext.refinedTheses = refinerRes.output
        recordExecution('v3_thesis_refiner', 'Refinador de Teses (rodada 2)', refinerRes.llmResult)
      }
    }

    // ── Phase 3: Pesquisa (parallel) ────────────────────────────────────────
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
    const [legisRes, juriRes, doctRes] = await Promise.all([
      runLegislationResearcher(buildAgentCtx('v3_legislation_researcher')),
      runJurisprudenceResearcher(buildAgentCtx('v3_jurisprudence_researcher')),
      runDoctrineResearcher(buildAgentCtx('v3_doctrine_researcher')),
    ])
    caseContext.legislation = legisRes.output
    caseContext.jurisprudence = juriRes.output
    caseContext.doctrine = doctRes.output
    recordExecution('v3_legislation_researcher', 'Pesquisador de Legislação', legisRes.llmResult)
    recordExecution('v3_jurisprudence_researcher', 'Pesquisador de Jurisprudência', juriRes.llmResult)
    recordExecution('v3_doctrine_researcher', 'Pesquisador de Doutrina', doctRes.llmResult)
    reportProgress('v3_legislation_researcher', 'Legislação concluída.', 60, { result: legisRes.llmResult, executionState: 'completed' })
    reportProgress('v3_jurisprudence_researcher', 'Jurisprudência concluída.', 62, { result: juriRes.llmResult, executionState: 'completed' })
    reportProgress('v3_doctrine_researcher', 'Doutrina concluída.', 64, { result: doctRes.llmResult, executionState: 'completed' })

    // Citation verifier
    reportProgress('v3_citation_verifier', 'Verificando citações...', 67, {
      modelId: agentModels.v3_citation_verifier,
    })
    const citationRes = await runCitationVerifier(buildAgentCtx('v3_citation_verifier'))
    caseContext.citationCheck = citationRes.output
    recordExecution('v3_citation_verifier', 'Verificador de Citações', citationRes.llmResult)
    reportProgress('v3_citation_verifier', `Citações verificadas (${citationRes.output.corrections} correções).`, 72, { result: citationRes.llmResult, executionState: 'completed' })

    // ── Phase 4: Redação (sequential) ───────────────────────────────────────
    reportProgress('v3_outline_planner', 'Planejando estrutura...', 76, {
      modelId: agentModels.v3_outline_planner,
    })
    const outlineRes = await runOutlinePlanner(buildAgentCtx('v3_outline_planner'), customStructure)
    caseContext.outline = outlineRes.output
    recordExecution('v3_outline_planner', 'Planejador da Estrutura', outlineRes.llmResult)
    reportProgress('v3_outline_planner', 'Plano definido.', 82, { result: outlineRes.llmResult, executionState: 'completed' })

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
        reportProgress('v3_writer', 'Redação concluída.', 92, { result: result.llmResult, executionState: 'completed' })
        return result
      },
      validate: (res) => (res.output.length > 800 ? null : 'documento_curto'),
    })
    const finalText = writerRes.output.output

    // ── Quality + persistence ───────────────────────────────────────────────
    reportProgress('qualidade', 'Avaliando qualidade...', 94, { executionState: 'running' })
    const quality = evaluateQualityV3(finalText, docType, { tema: caseContext.briefings?.tema })

    const usage_summary = buildUsageSummary(llmExecutions)
    const totals = llmExecutions.reduce(
      (acc, e) => ({ tin: acc.tin + e.tokens_in, tout: acc.tout + e.tokens_out, cost: acc.cost + e.cost_usd }),
      { tin: 0, tout: 0, cost: 0 },
    )

    reportProgress('salvando', 'Salvando documento...', 97, { executionState: 'persisting' })
    const saveStartedAt = Date.now()
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
      },
      updated_at: new Date().toISOString(),
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
