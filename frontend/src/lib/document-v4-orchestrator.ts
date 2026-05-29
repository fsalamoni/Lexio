/**
 * Document v4 orchestrator — single-agent + tools generator.
 *
 * Runs ONE reasoning-tier agent in a loop. Each iteration:
 *   1. Calls `callLLMWithMessagesFallback` with the full chat history.
 *   2. Parses the response as JSON `{tool, args, rationale}`.
 *   3. Executes the tool from `DOCUMENT_V4_TOOLS_CATALOG`.
 *   4. Appends `TOOL_RESULT(name): …` to history.
 *   5. Repeats until `submit_final_answer` or hard caps (iterations / cost).
 *
 * Optionally runs a single critic pass on the final draft; if the verdict
 * score is below `CRITIC_THRESHOLD`, one revision iteration is forced.
 *
 * Persists the document at `users/{uid}/documents/{docId}` with the same
 * schema as v2/v3 (texto_completo, llm_executions, usage_summary, etc.) plus
 * `request_context.pipeline_version: 'v4'` so the docs list can distinguish.
 *
 * The v3 pipeline is NOT touched by this module.
 */
import { collection, doc, updateDoc, addDoc } from 'firebase/firestore'
import {
  getLLMOperationalUsageMeta,
  getOpenRouterKey,
  type UserProfileForGeneration,
} from './generation-service'
import { writeUserScoped, loadAdminDocumentTypes } from './firestore-service'
import { DEFAULT_DOC_STRUCTURES } from './document-structures'
import {
  buildUsageSummary,
  createUsageExecutionRecord,
  type UsageExecutionRecord,
} from './cost-analytics'
import { callLLMWithMessagesFallback, type ChatMessage, type LLMResult } from './llm-client'
import {
  loadDocumentV4Models,
  loadFallbackPriorityConfig,
  resolveFallbackModelsForCategory,
  type FallbackPriorityConfig,
} from './model-config'
import { parseOrchestratorDecision, OrchestratorDecisionParseError } from './chat-orchestrator/tools-adapter'
import {
  AREA_NAMES,
  DOC_TYPE_NAMES,
  buildProfileBlock,
} from './modules/documents'
import type { ContextDetailData } from './firestore-types'
import {
  DOCUMENT_V4_TOOLS_CATALOG,
  getDocumentV4ToolByName,
  type DocumentV4CaseContext,
  type DocumentV4Tool,
  type DocumentV4ToolContext,
} from './document-v4-tools'
import { loadDocumentV4ToolsConfig } from './document-v4-tools-config'
import { buildDocumentV4SystemPrompt } from './document-v4-system-prompt'
import { runDocumentV4Critic } from './document-v4-critic'
import {
  DOCUMENT_V4_PIPELINE_COMPLETED_PHASE,
  buildDocumentV4PipelineProgress,
  type DocumentV4PipelineProgress,
} from './document-v4-pipeline'

/** Hard cap on the number of (LLM call + tool exec) iterations. */
export const DOCUMENT_V4_MAX_ITERATIONS = 20

/**
 * Soft cost ceiling (USD). When exceeded the orchestrator forces
 * submit_final_answer. Sized to give the single agent the same room a full v3
 * premium run gets (research + several drafting turns + one revision) so that
 * the document is not truncated prematurely just to stay under budget.
 */
export const DOCUMENT_V4_SOFT_COST_CAP_USD = 4.0

/** Critic score threshold below which one revision iteration is forced. */
export const DOCUMENT_V4_CRITIC_THRESHOLD = 75

/**
 * Output-token budget for the single agent's turns. Matches the v3 Redator
 * (9000) so that drafting a section — and especially emitting the final
 * document via submit_final_answer — is not capped to a short summary.
 * Tool-decision turns naturally stop far below this cap, so a single generous
 * budget is safe across both the planning and the writing turns.
 */
export const DOCUMENT_V4_AGENT_MAX_TOKENS = 9000

/**
 * Sampling temperature for the agent turns. Matches the v3 Redator (0.3) for
 * natural legal prose; the JSON tool contract is recovered by the parser's
 * single retry when an occasional turn drifts from strict JSON.
 */
export const DOCUMENT_V4_AGENT_TEMPERATURE = 0.3

export type GenerationProgressV4 = DocumentV4PipelineProgress
export type ProgressCallbackV4 = (p: GenerationProgressV4) => void

export interface CreateDocumentV4Input {
  document_type_id: string
  original_request: string
  template_variant?: string | null
  legal_area_ids?: string[] | null
  request_context?: Record<string, unknown> | null
  context_detail?: ContextDetailData | null
}

export interface GenerateDocumentV4Options {
  signal?: AbortSignal
  /** Override the iteration cap for tests. */
  maxIterations?: number
  /** Override the cost cap for tests. */
  costCapUsd?: number
  /** Override the critic threshold for tests. */
  criticThreshold?: number
  /** When set, replaces `callLLMWithMessagesFallback` — used by tests. */
  llmCallOverride?: (params: {
    apiKey: string
    messages: ChatMessage[]
    model: string
    fallbackModels: readonly string[]
    signal?: AbortSignal
  }) => Promise<LLMResult>
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export async function createDocumentV4(uid: string, input: CreateDocumentV4Input): Promise<{ id: string }> {
  const now = new Date().toISOString()
  const docData = {
    document_type_id: input.document_type_id,
    original_request: input.original_request,
    template_variant: input.template_variant ?? null,
    legal_area_ids: input.legal_area_ids ?? [],
    request_context: { ...(input.request_context ?? {}), pipeline_version: 'v4' },
    context_detail: input.context_detail ?? null,
    tema: null,
    status: 'rascunho',
    quality_score: null,
    texto_completo: null,
    origem: 'web',
    created_at: now,
    updated_at: now,
  }
  return writeUserScoped(uid, 'createDocumentV4', async (db, effectiveUid) => {
    const colRef = collection(db, 'users', effectiveUid, 'documents')
    const ref = await addDoc(colRef, docData)
    return { id: ref.id }
  })
}

export async function generateDocumentV4(
  uid: string,
  docId: string,
  docType: string,
  request: string,
  areas: string[],
  context?: Record<string, unknown> | null,
  onProgress?: ProgressCallbackV4,
  profile?: UserProfileForGeneration | null,
  contextDetail?: ContextDetailData | null,
  options?: GenerateDocumentV4Options,
): Promise<void> {
  const signal = options?.signal
  const maxIterations = Math.max(1, options?.maxIterations ?? DOCUMENT_V4_MAX_ITERATIONS)
  const costCapUsd = Math.max(0, options?.costCapUsd ?? DOCUMENT_V4_SOFT_COST_CAP_USD)
  const criticThreshold = Math.max(0, Math.min(100, options?.criticThreshold ?? DOCUMENT_V4_CRITIC_THRESHOLD))

  const persistDocument = (data: Record<string, unknown>, contextLabel: string) =>
    writeUserScoped(uid, contextLabel, async (db, effectiveUid) => {
      const docRef = doc(db, 'users', effectiveUid, 'documents', docId)
      await updateDoc(docRef, data)
    })

  const llmExecutions: UsageExecutionRecord[] = []
  let totalCostUsd = 0
  const recordExecution = (
    phase: string,
    agentName: string,
    result: LLMResult | null,
  ) => {
    if (!result) return
    totalCostUsd += result.cost_usd ?? 0
    llmExecutions.push(createUsageExecutionRecord({
      source_type: 'document_generation_v4',
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

  const recordExternalUsage = (record: UsageExecutionRecord) => {
    totalCostUsd += record.cost_usd ?? 0
    llmExecutions.push(record)
  }

  const emitProgress = (phase: string, message: string, percent: number, meta?: Parameters<typeof buildDocumentV4PipelineProgress>[3]) => {
    if (signal?.aborted) return
    onProgress?.(buildDocumentV4PipelineProgress(phase, message, percent, meta))
  }

  await persistDocument({
    status: 'processando',
    updated_at: new Date().toISOString(),
  }, 'generateDocumentV4.start')

  const wallClockStart = Date.now()

  try {
    emitProgress('init', 'Carregando configurações...', 2, { executionState: 'waiting_io' })

    const [apiKey, modelMap, adminDocTypes, fallbackPriorities, toolsConfig] = await Promise.all([
      getOpenRouterKey(uid),
      loadDocumentV4Models(uid),
      loadAdminDocumentTypes().catch(() => []),
      loadFallbackPriorityConfig(uid).catch(() => ({} as FallbackPriorityConfig)),
      loadDocumentV4ToolsConfig(uid),
    ])

    const adminDocType = adminDocTypes.find(dt => dt.id === docType)
    // Mirror v3: ground the single agent in a concrete structure. Prefer the
    // admin's custom structure; otherwise fall back to the canonical template
    // for the document type so every document gets the same scaffolding the v3
    // outline planner + document-type templates provide to the v3 Redator.
    const customStructure = adminDocType?.structure?.trim() || DEFAULT_DOC_STRUCTURES[docType] || undefined

    const docTypeLabel = DOC_TYPE_NAMES[docType] ?? docType
    const areaLabels = areas.map(a => AREA_NAMES[a] ?? a)
    const profileBlock = buildProfileBlock(profile ?? undefined)

    const enabledTools: DocumentV4Tool[] = DOCUMENT_V4_TOOLS_CATALOG.filter(t => {
      const cfg = toolsConfig.tools[t.name]
      // submit_final_answer is non-negotiable — the loop has no other exit.
      if (t.name === 'submit_final_answer') return true
      return cfg ? cfg.enabled : true
    })
    const allowedToolNames = enabledTools.map(t => t.name)

    const primaryModel = modelMap.v4_agent
    if (!primaryModel) {
      throw new Error('O Agente Principal v4 não tem modelo configurado. Configure em /settings.')
    }
    const fallbackChain = resolveFallbackModelsForCategory(primaryModel, 'writing', fallbackPriorities)

    const caseContext: DocumentV4CaseContext = {
      request,
      docType,
      docTypeLabel,
      areas,
      areaLabels,
      requestContext: context && Object.keys(context).length > 0 ? { ...context } : undefined,
      profile: profile ?? null,
      profileBlock,
      contextDetail: contextDetail ?? null,
      draft: { sections: [], fullText: '' },
    }

    const systemPrompt = buildDocumentV4SystemPrompt({
      docTypeLabel,
      areaLabels,
      customStructure,
      enabledTools,
      profileBlock,
    })

    // Build the initial user message — describes the case for the agent.
    const initialUserMessage = [
      `Solicitação do usuário: ${request}`,
      areaLabels.length > 0 ? `Áreas envolvidas: ${areaLabels.join(', ')}` : '',
      contextDetail?.questions?.length
        ? `Detalhamento de contexto disponível: ${contextDetail.questions.length} perguntas (use read_context_detail para acessar).`
        : '',
      context && Object.keys(context).length > 0
        ? `Contexto adicional: ${JSON.stringify(context).slice(0, 800)}`
        : '',
      '',
      'Comece sua primeira chamada de ferramenta agora. Responda apenas com JSON.',
    ].filter(Boolean).join('\n')

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: initialUserMessage },
    ]

    emitProgress('init', 'Inicialização concluída.', 5, { executionState: 'completed', modelId: primaryModel })

    let finalAnswer: string | null = null
    let iteration = 0
    let lastForcedSubmission = false

    while (iteration < maxIterations && !finalAnswer) {
      if (signal?.aborted) throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
      iteration += 1

      const overBudget = totalCostUsd >= costCapUsd
      const overIterations = iteration >= maxIterations
      // When at the cap, inject a final synthetic user nudge forcing submit_final_answer.
      // Limited to once to avoid infinite loops if the agent ignores it.
      if ((overBudget || overIterations) && !lastForcedSubmission) {
        lastForcedSubmission = true
        messages.push({
          role: 'user',
          content: overBudget
            ? `BUDGET_REACHED: o custo acumulado atingiu o teto de US$ ${costCapUsd.toFixed(2)}. Termine AGORA chamando submit_final_answer com o melhor markdown possível a partir das seções já salvas.`
            : `ITERATION_CAP_REACHED: você atingiu o limite de ${maxIterations} iterações. Termine AGORA chamando submit_final_answer.`,
        })
      }

      emitProgress(`v4_agent`, `Iteração ${iteration}: agente decidindo próxima ação...`, 10 + Math.min(70, iteration * 4), {
        executionState: 'running',
        modelId: primaryModel,
        iteration,
      })

      let llmResult: LLMResult
      try {
        llmResult = options?.llmCallOverride
          ? await options.llmCallOverride({ apiKey, messages, model: primaryModel, fallbackModels: fallbackChain, signal })
          : await callLLMWithMessagesFallback(
              apiKey,
              messages,
              primaryModel,
              fallbackChain,
              DOCUMENT_V4_AGENT_MAX_TOKENS,
              DOCUMENT_V4_AGENT_TEMPERATURE,
              { signal },
            )
      } catch (err) {
        if (isAbortError(err)) throw err
        // Persist whatever we have so the user isn't stranded.
        throw new Error(`LLM falhou na iteração ${iteration}: ${(err as Error).message}`)
      }
      recordExecution('v4_agent', `V4: Agente Principal (it. ${iteration})`, llmResult)

      messages.push({ role: 'assistant', content: llmResult.content })

      let decision
      try {
        decision = parseOrchestratorDecision(llmResult.content, allowedToolNames)
      } catch (parseErr) {
        if (parseErr instanceof OrchestratorDecisionParseError) {
          // One retry with a stricter system message; if that also fails, force termination.
          messages.push({
            role: 'user',
            content: `Sua resposta anterior não foi JSON válido (${parseErr.message}). Responda APENAS com um objeto JSON no formato {"tool":"...","args":{...}}. Sem markdown, sem prosa.`,
          })
          continue
        }
        throw parseErr
      }

      const tool = getDocumentV4ToolByName(decision.tool)
      if (!tool) {
        messages.push({
          role: 'user',
          content: `TOOL_NOT_FOUND: a ferramenta "${decision.tool}" não está disponível neste fluxo. Tente uma das: ${allowedToolNames.join(', ')}.`,
        })
        continue
      }

      const toolParams = toolsConfig.tools[tool.name]?.params ?? {}
      const toolCtx: DocumentV4ToolContext = {
        uid,
        docId,
        docType,
        apiKey,
        signal,
        caseContext,
        toolParams,
        modelMap,
        fallbackModels: fallbackChain,
        recordUsage: recordExternalUsage,
        emitProgress: (phase, message, meta) => emitProgress(phase, message, 10 + Math.min(70, iteration * 4), { executionState: 'running', modelId: meta?.modelId, stageMeta: meta?.stageMeta }),
      }

      emitProgress(`v4_tool_${tool.name}`, `Ferramenta: ${tool.name}`, 10 + Math.min(70, iteration * 4 + 2), {
        executionState: 'running',
        iteration,
        tool: tool.name,
      })

      let toolResult
      try {
        toolResult = await tool.run(decision.args, toolCtx)
      } catch (err) {
        if (isAbortError(err)) throw err
        toolResult = { tool_message: `Ferramenta "${tool.name}" falhou: ${(err as Error).message}` }
      }

      messages.push({
        role: 'user',
        content: `TOOL_RESULT(${tool.name}):\n${toolResult.tool_message}`,
      })

      if (toolResult.final_answer) {
        finalAnswer = toolResult.final_answer
        break
      }
    }

    if (!finalAnswer) {
      // No submit_final_answer reached. Assemble from saved sections as a safety net.
      const assembled = caseContext.draft.sections
        .map(s => `## ${s.title}\n\n${s.markdown}`)
        .join('\n\n')
      finalAnswer = assembled || `# ${docTypeLabel} (rascunho incompleto)\n\nO agente não finalizou o documento dentro do orçamento. Solicitação original: ${request}`
    }

    // ── Optional critic pass (single round) ─────────────────────────────────
    let criticVerdict: { score: number; reasons: string[]; should_stop: boolean } | null = null
    const criticModel = modelMap.v4_critic
    if (criticModel) {
      emitProgress('v4_critic', 'Crítico avaliando rascunho...', 85, { executionState: 'running', modelId: criticModel })
      try {
        const criticRes = await runDocumentV4Critic({
          apiKey,
          model: criticModel,
          fallbackModels: fallbackChain,
          finalText: finalAnswer,
          docTypeLabel,
          signal,
        })
        recordExecution('v4_critic', 'V4: Crítico', criticRes.llmResult)
        criticVerdict = criticRes.verdict
        if (criticRes.verdict.score < criticThreshold && !criticRes.verdict.should_stop) {
          // One revision iteration of the primary agent.
          emitProgress('v4_agent', `Crítico apontou score ${criticRes.verdict.score} — uma rodada de revisão...`, 90, {
            executionState: 'retrying',
            modelId: primaryModel,
          })
          messages.push({
            role: 'user',
            content: [
              `CRITIC_VERDICT: score=${criticRes.verdict.score} (abaixo de ${criticThreshold}).`,
              'Motivos do crítico:',
              ...criticRes.verdict.reasons.map(r => `- ${r}`),
              '',
              'Reescreva o documento incorporando essas correções e chame submit_final_answer com a nova versão.',
            ].join('\n'),
          })
          try {
            const revisionResult = options?.llmCallOverride
              ? await options.llmCallOverride({ apiKey, messages, model: primaryModel, fallbackModels: fallbackChain, signal })
              : await callLLMWithMessagesFallback(
                  apiKey,
                  messages,
                  primaryModel,
                  fallbackChain,
                  DOCUMENT_V4_AGENT_MAX_TOKENS,
                  DOCUMENT_V4_AGENT_TEMPERATURE,
                  { signal },
                )
            recordExecution('v4_agent', 'V4: Agente Principal (revisão pós-crítico)', revisionResult)
            messages.push({ role: 'assistant', content: revisionResult.content })
            try {
              const revisionDecision = parseOrchestratorDecision(revisionResult.content, allowedToolNames)
              if (revisionDecision.tool === 'submit_final_answer') {
                const md = typeof revisionDecision.args.markdown === 'string' ? revisionDecision.args.markdown.trim() : ''
                if (md) finalAnswer = md
              }
            } catch {
              // Revision parse failure: keep the original draft.
            }
          } catch (err) {
            if (isAbortError(err)) throw err
            // Revision failure non-fatal — keep original.
          }
        }
      } catch (err) {
        if (isAbortError(err)) throw err
        // Critic failure is non-fatal.
      }
    }

    // ── Persist ─────────────────────────────────────────────────────────────
    emitProgress('finalize', 'Salvando documento...', 95, { executionState: 'persisting' })

    const loopExecution = createUsageExecutionRecord({
      source_type: 'document_generation_v4',
      source_id: docId,
      phase: 'v4_agent_loop',
      agent_name: 'V4: Loop do Agente (bookkeeping)',
      model: primaryModel,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      duration_ms: Date.now() - wallClockStart,
      execution_state: 'completed',
      retry_count: lastForcedSubmission ? 1 : 0,
      runtime_concurrency: 1,
      runtime_hints: `${iteration} iteração(ões); custo: US$ ${totalCostUsd.toFixed(4)}`,
      document_type_id: docType,
    })

    const persistedExecutions = [loopExecution, ...llmExecutions]
    const usage_summary = buildUsageSummary(persistedExecutions)
    const totals = persistedExecutions.reduce(
      (acc, e) => ({ tin: acc.tin + e.tokens_in, tout: acc.tout + e.tokens_out, cost: acc.cost + e.cost_usd }),
      { tin: 0, tout: 0, cost: 0 },
    )

    await persistDocument({
      texto_completo: finalAnswer,
      status: 'concluido',
      quality_score: criticVerdict?.score ?? null,
      tema: null,
      llm_tokens_in: totals.tin,
      llm_tokens_out: totals.tout,
      llm_cost_usd: parseFloat(totals.cost.toFixed(6)),
      llm_executions: persistedExecutions,
      usage_summary,
      generation_meta: {
        pipeline_version: 'v4',
        primary_agent: 'v4_agent',
        primary_model: primaryModel,
        critic_model: criticModel || null,
        critic_score: criticVerdict?.score ?? null,
        critic_reasons: criticVerdict?.reasons ?? null,
        iterations: iteration,
        forced_submission: lastForcedSubmission,
        wall_clock_ms: Date.now() - wallClockStart,
        total_cost_usd: parseFloat(totalCostUsd.toFixed(6)),
        max_iterations: maxIterations,
        soft_cost_cap_usd: costCapUsd,
        critic_threshold: criticThreshold,
      },
      updated_at: new Date().toISOString(),
    }, 'generateDocumentV4.complete')

    emitProgress(DOCUMENT_V4_PIPELINE_COMPLETED_PHASE, 'Documento v4 gerado com sucesso!', 100, { executionState: 'completed' })
  } catch (err) {
    if (!isAbortError(err)) {
      // For aborts the document keeps `processando` status until the page resets it.
      await persistDocument({
        status: 'erro',
        updated_at: new Date().toISOString(),
      }, 'generateDocumentV4.error').catch(() => {})
    }
    throw err
  }
}
