import type { ChatAgentWorkPackage, ChatArtifactFormat, ChatArtifactRef, ChatTrailEvent } from '../firestore-types'
import { createBudget } from './budget'
import { dispatchSpecialistAgent } from './dispatch'
import { callOrchestratorLLM, appendToolMessage } from './orchestrator-llm'
import { runCritic } from './quality'
import { buildSkillRegistry, listCallableAgentDescriptions, CALLABLE_AGENT_KEYS } from './skill-registry'
import { OrchestratorDecisionParseError, parseOrchestratorDecision, renderSkillsManifest } from './tools-adapter'
import { EFFORT_PRESETS } from './effort-presets'
import { parseAgentOutputPackage, stripAgentPackageArtifacts } from './agent-output'
import { isOperationalFailureMarkdown } from './operational-failure'
import { renderCurrentTurnUserContent } from '../chat-context-builder'
import { isEnabled } from '../feature-flags'
import {
  buildExpectedDeliverableFeedback,
  describeExpectedDeliverable,
  findUnsatisfiedExpectedDeliverables,
  hasSatisfiedExpectedDeliverables,
  inferExpectedDeliverablesFromText,
  shouldUseTextFallbackForExpectedDeliverables,
  type ChatExpectedDeliverable,
} from '../chat-deliverable-contract'
import type {
  ChatOrchestratorProfile,
  OrchestratorDecision,
  OrchestratorMessage,
  RunChatTurnInput,
  RunChatTurnOutput,
  Skill,
  SkillContext,
} from './types'

/**
 * Default profile — the original v1 behavior: full specialist roster,
 * `chat_orchestrator` lead, `chat_writer` finaliser, `chat_critic` gate, and
 * the complete skill registry. Used whenever `RunChatTurnInput.profile` is
 * omitted so v1 callers are unaffected by the v2 parameterization.
 */
export const DEFAULT_V1_PROFILE: ChatOrchestratorProfile = {
  id: 'v1',
  orchestratorAgentKey: 'chat_orchestrator',
  orchestratorLabel: 'Orquestrador',
  finalForceAgentKey: 'chat_writer',
  criticAgentKey: 'chat_critic',
  functionKey: 'chat_orchestrator',
  functionLabel: 'Orquestrador (Chat)',
  callableAgentKeys: CALLABLE_AGENT_KEYS,
  listCallableAgents: listCallableAgentDescriptions,
  buildSkills: buildSkillRegistry,
}

/**
 * Run a single chat turn end-to-end.
 *
 * Public entry point for the runtime. The UI layer (use-chat-controller)
 * subscribes to `onTrail` to render the orchestration in real time and
 * reads the returned `RunChatTurnOutput` to persist the turn's final state.
 */
/**
 * Skills whose result is already vetted/deterministic, so under lean
 * orchestration the extra critic hop is redundant movement and is skipped:
 *  - PC (sidecar) actions: concrete, validated by the sidecar.
 *  - `generate_*` skills: each runs its own internal quality pipeline
 *    (document v3 quality eval + rollback, studio critic, media renderers), so
 *    re-critiquing the chat summary on top adds a round-trip without value.
 */
const CRITIC_SKIP_SKILLS = new Set<string>([
  // PC (sidecar) actions
  'write_file', 'delete_file', 'rename_file', 'organize_files', 'undo_organize',
  'run_shell', 'grant_folder', 'git_commit', 'git_pull', 'git_push',
  // self-vetted generators
  'generate_document', 'generate_presentation', 'generate_audio', 'generate_video',
  'generate_image', 'generate_studio_artifact',
])

export async function runChatTurn(input: RunChatTurnInput): Promise<RunChatTurnOutput> {
  if (input.signal.aborted) {
    throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
  }

  const preset = EFFORT_PRESETS[input.effort]
  const profile = input.profile ?? DEFAULT_V1_PROFILE
  // Hard USD ceiling is opt-in (FF_CHAT_ENGINE_PLUS); without it only the token
  // cap / hard stop apply, preserving the original behavior.
  const budget = createBudget(preset.maxTokens, isEnabled('FF_CHAT_ENGINE_PLUS') ? preset.maxCostUsd : undefined)
  // The orchestrator commands the whole turn — under lean orchestration it is
  // never token-capped and never force-summarised: only an explicit hard stop
  // (user cancel) or the iteration ceiling end the loop.
  const leanOrchestration = isEnabled('FF_CHAT_LEAN_ORCHESTRATION')
  const skills = profile.buildSkills()
  const skillsByName = new Map<string, Skill>(skills.map(s => [s.name, s]))
  const llmCall = input.llmCall ?? callOrchestratorLLM
  const allowedTools = skills.map(s => s.name)
  const latestArtifactsByLogicalId = new Map<string, { artifact: ChatArtifactRef; agentKey?: string }>()
  const expectedDeliverables = inferExpectedDeliverablesFromText(input.user_input)
  const decisionLoopTracker = new Map<string, number>()
  const emitTrail = (event: ChatTrailEvent) => {
    collectLatestArtifacts(event, latestArtifactsByLogicalId)
    input.onTrail(event)
  }

  const ctx: SkillContext = {
    uid: input.uid,
    conversationId: input.conversationId,
    turnId: input.turnId,
    userInput: input.user_input,
    effort: input.effort,
    budget,
    signal: input.signal,
    emit: emitTrail,
    models: input.models,
    fallbackModels: input.fallbackModels,
    apiKey: input.apiKey,
    onAgentToken: input.onAgentToken,
    persistWorkPackage: input.persistWorkPackage,
    createApprovalRequest: input.createApprovalRequest,
    appendAuditEntry: input.appendAuditEntry,
    mock: Boolean(input.mock),
    profile,
    sidecar: input.sidecar,
  }

  const systemPrompt = buildOrchestratorSystemPrompt(skills, input.effort, expectedDeliverables, profile)
  let history: OrchestratorMessage[] = [
    ...input.history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: renderCurrentTurnUserContent({ userInput: input.user_input, attachments: input.attachments, contextSources: input.contextSources }) },
  ]

    let draft: string | null = null
    let stopReason: 'final_answer' | 'critic_stop' | 'max_iterations' | 'budget' = 'max_iterations'
    let consecutiveParseErrors = 0
    const startedAt = Date.now()
    let partialIterations = 0
    let deliverableGuardRejections = 0
    // Last real action skill executed (excludes finalisation/critique), used to
    // skip the redundant critic hop after a deterministic PC action.
    let lastActionSkill: string | null = null

    for (let i = 1; i <= preset.maxIterations; i++) {
      if (input.signal.aborted) {
        throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
      }
      const elapsedMs = Date.now() - startedAt
      emitTrail({
        type: 'iteration_start',
        i,
        ts: new Date().toISOString(),
        elapsed_ms: elapsedMs,
        budget_used_ratio: budget.usedRatio(),
      })

    let decision: OrchestratorDecision
    try {
      // Parse-error resilience (FF_CHAT_ENGINE_PLUS): nudge temperature up after
      // each consecutive failure so a stuck model varies its output before we
      // give up; tolerate one extra retry before forcing finalisation.
      const enginePlus = isEnabled('FF_CHAT_ENGINE_PLUS')
      const retryTemperature = enginePlus && consecutiveParseErrors > 0
        ? Math.min(0.2 + 0.2 * consecutiveParseErrors, 0.6)
        : undefined
      decision = await callOrchestratorAndParse({
        systemPrompt,
        history,
        ctx,
        llmCall,
        perCallTokenCap: preset.perCallTokenCap,
        allowedTools,
        temperature: retryTemperature,
      })
      consecutiveParseErrors = 0
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      consecutiveParseErrors += 1
      const maxParseRetries = isEnabled('FF_CHAT_ENGINE_PLUS') ? 3 : 2
      if (consecutiveParseErrors >= maxParseRetries) {
        // Too many parse failures in a row — give up on the loop and let the
        // forced finaliser produce a closing answer from whatever we have.
        emitTrail({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
        break
      }
      // Coach the orchestrator with an escalating reminder and try again. The
      // second attempt gets a concrete example to anchor the format.
      const reminder = consecutiveParseErrors >= 2
        ? 'Sua resposta continua inválida. Responda EXCLUSIVAMENTE com um objeto JSON, sem texto antes/depois, por exemplo: {"tool":"submit_final_answer","args":{"markdown":"..."}}'
        : 'Sua última resposta não pôde ser parseada como JSON. Responda APENAS com o objeto JSON do formato {"tool": "...", "args": {...}}.'
      history = appendToolMessage(history, reminder, 'parse_error')
      continue
    }

    emitTrail({
      type: 'decision',
      tool: decision.tool,
      ...(decision.rationale ? { rationale: decision.rationale } : {}),
      ts: new Date().toISOString(),
    })

    const loopCheck = recordDecisionAndDetectLoop(decisionLoopTracker, decision)
    if (loopCheck.repeated) {
      const message = loopCheck.exhausted
        ? `Loop de orquestração interrompido: a decisão ${decision.tool} com os mesmos argumentos foi repetida ${loopCheck.count} vezes.`
        : `Decisão repetida detectada (${decision.tool}). Escolha outra estratégia, ajuste os argumentos ou finalize com falha operacional clara.`
      emitTrail({ type: 'error', message, ts: new Date().toISOString() })
      history = appendToolMessage(history, message, 'decision_loop_guard')
      if (loopCheck.exhausted) break
      continue
    }

    const skill = skillsByName.get(decision.tool)
    if (!skill) {
      // Should never happen because we validated against `allowedTools`,
      // but guards keep TS narrowing honest.
      history = appendToolMessage(
        history,
        `Ferramenta "${decision.tool}" não existe.`,
        'unknown_tool',
      )
      continue
    }

    let result
    try {
      result = await skill.run(decision.args, ctx)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      const message = err instanceof Error ? err.message : String(err)
      emitTrail({ type: 'error', message: `Falha em ${decision.tool}: ${message}`, ts: new Date().toISOString() })
      history = appendToolMessage(
        history,
        `A ferramenta "${decision.tool}" falhou, mas o orquestrador deve continuar com outra estratégia ou finalizar com o contexto disponível. Erro: ${message}`,
        `${decision.tool}_error`,
      )
      continue
    }

    history = appendToolMessage(history, result.tool_message, decision.tool)

    if (decision.tool !== 'submit_final_answer' && decision.tool !== 'critique_draft') {
      lastActionSkill = decision.tool
    }

    if (result.awaiting_user) {
      // Pause the turn — the controller persists state and unblocks once
      // the user answers.
      return {
        status: 'awaiting_user',
        assistant_markdown: null,
        pending_question: {
          text: result.awaiting_user.question,
          options: result.awaiting_user.options,
          approval_id: result.awaiting_user.approval_id,
          resume_tool: result.awaiting_user.resume_tool,
          resume_args: result.awaiting_user.resume_args,
        },
        llm_executions: budget.records(),
      }
    }

      if (result.final_answer) {
        const missingExpected = findUnsatisfiedExpectedDeliverables(expectedDeliverables, latestArtifactsByLogicalId.values())
        if (
          missingExpected.length > 0
          && i < preset.maxIterations
          && deliverableGuardRejections < 2
          && !isOperationalFailureMarkdown(result.final_answer)
        ) {
          deliverableGuardRejections += 1
          history = appendToolMessage(
            history,
            buildExpectedDeliverableFeedback(missingExpected),
            'deliverable_compliance_feedback',
          )
          continue
        }
        draft = result.final_answer
        partialIterations = i
        // Provider/operational failure (e.g., OpenRouter 402 — no credits): stop
        // immediately with that single, clear message. Never run the critic on a
        // failure draft or loop on it (that produced the messy 3× repeat trail).
        if (isOperationalFailureMarkdown(result.final_answer)) {
          stopReason = 'final_answer'
          break
        }
        // Always attempt a critic pass before accepting the final answer.
        // The critic now runs iteratively — even after a skill declares
        // final_answer, we validate and can loop back for refinements.
        // Exception (lean orchestration): when the turn's last real action was a
        // self-vetted/deterministic skill (PC op or a generate_* pipeline that
        // already ran its own quality gate), skip the extra critic round-trip.
        const skipCriticForVettedAction = leanOrchestration && lastActionSkill !== null && CRITIC_SKIP_SKILLS.has(lastActionSkill)
        if (
          preset.criticInterval > 0
          && preset.criticInterval <= preset.maxIterations
          && i < preset.maxIterations
          && !skipCriticForVettedAction
        ) {
          try {
            const enginePlus = isEnabled('FF_CHAT_ENGINE_PLUS')
            const criticThreshold = enginePlus && typeof preset.criticThreshold === 'number' ? preset.criticThreshold : 75
            const verdict = await runCritic(draft, ctx, {
              artifactAuditContext: buildArtifactAuditContext(expectedDeliverables, latestArtifactsByLogicalId.values()),
              enhanced: enginePlus,
            })
            if (verdict.shouldStop || verdict.score >= criticThreshold) {
              stopReason = verdict.shouldStop ? 'critic_stop' : 'final_answer'
              break
            }
            // Draft needs improvement — feedback loops into next iteration.
            history = appendToolMessage(
              history,
              `Crítico rejeitou o rascunho (score ${verdict.score}/100). Razões: ${verdict.reasons.join('; ')}. Refine e tente novamente.`,
              'critique_feedback',
            )
            draft = null
            continue
          } catch (criticErr) {
            if (criticErr instanceof DOMException && criticErr.name === 'AbortError') throw criticErr
            // best-effort — accept the draft, but record on the trail that the
            // quality gate did not run, instead of swallowing it silently.
            emitTrail({
              type: 'error',
              message: `Crítico não pôde avaliar o rascunho: ${criticErr instanceof Error ? criticErr.message : String(criticErr)}`,
              ts: new Date().toISOString(),
            })
            stopReason = 'final_answer'
            break
          }
        }
        stopReason = 'final_answer'
        break
      }

      // Auto-summariser + token cap. The orchestrator drives all the work, so
      // under lean orchestration it is never token-capped and never
      // force-summarised — it runs until it finalises (or hits the iteration
      // ceiling). Without lean, the legacy budget cap + auto-summary apply.
      if (!leanOrchestration) {
        const summaryAlreadyInjected = history.some(m => m.tag === 'auto_summary')
        if (budget.usedRatio() >= preset.summarizeAt && !summaryAlreadyInjected) {
          try {
            const compacted = await injectAutoSummary(history, ctx)
            if (compacted) history = compacted
          } catch {
            // best-effort
          }
        }
      }

      const hardStopped = budget.isHardStopped()
      if (hardStopped.stopped || (!leanOrchestration && budget.exceeded())) {
        emitTrail({
          type: 'budget_hit',
          reason: hardStopped.reason ?? 'token_cap_reached',
          ts: new Date().toISOString(),
          elapsed_ms: Date.now() - startedAt,
        })
        stopReason = 'budget'
        break
      }
    }

  if (!draft) {
    try {
      draft = await forceFinalize(history, ctx)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      const rawMessage = err instanceof Error ? err.message : String(err)
      // Cap embedded strings so a pathological error / huge input cannot bloat
      // or corrupt the persisted turn record.
      const message = rawMessage.length > 600 ? `${rawMessage.slice(0, 599)}…` : rawMessage
      emitTrail({ type: 'error', message: `Finalização forçada falhou: ${message}`, ts: new Date().toISOString() })
      const userInputs = history.filter(m => !m.tool_summary && m.role === 'user').map(m => m.content)
      const rawLastUser = userInputs[userInputs.length - 1] ?? input.user_input
      const lastUser = rawLastUser.length > 600 ? `${rawLastUser.slice(0, 599)}…` : rawLastUser
      draft = [
        'Não consegui concluir a trilha multiagente completa, mas o turno ficou salvo para nova tentativa.',
        '',
        `**Pedido registrado:** ${lastUser}`,
        '',
        `**Detalhe técnico:** ${message}`,
      ].join('\n')
    }
    if (stopReason === 'max_iterations' && !leanOrchestration && budget.exceeded()) stopReason = 'budget'
  }

    // The final answer must never carry a raw lexio_agent_package block —
    // strip it before any section is appended or the turn is persisted.
    draft = stripAgentPackageArtifacts(draft)

    await ensureRequiredDeliverableBundle({
      input,
      draft,
      ctx,
      expectedDeliverables,
      latestArtifactsByLogicalId,
      emitTrail,
    })

    const missingExpected = findUnsatisfiedExpectedDeliverables(expectedDeliverables, latestArtifactsByLogicalId.values())
    if (missingExpected.length > 0) {
      draft = appendMissingExpectedDeliverableNotice(draft, missingExpected)
    }

    // The V2 timeline surfaces artifacts in the dedicated deliverables panel,
    // so the inline markdown listing would be a duplicate — skip it then.
    if (!isEnabled('FF_CHAT_TIMELINE_V2')) {
      draft = appendLatestArtifactSummary(draft, latestArtifactsByLogicalId)
    }

    const elapsedMs = Date.now() - startedAt
    emitTrail({
      type: 'final_answer',
      ts: new Date().toISOString(),
      elapsed_ms: elapsedMs,
      iterations: partialIterations || preset.maxIterations,
      budget_used_ratio: budget.usedRatio(),
    })

    return {
      status: 'done',
      assistant_markdown: draft,
      pending_question: null,
      llm_executions: budget.records(),
      elapsed_ms: elapsedMs,
    }
}

function collectLatestArtifacts(
  event: ChatTrailEvent,
  latestArtifactsByLogicalId: Map<string, { artifact: ChatArtifactRef; agentKey?: string }>,
): void {
  if (event.type === 'agent_work_package') {
    for (const artifact of event.package.artifacts ?? []) {
      if (artifact.is_latest === false) continue
      upsertLatestArtifact(latestArtifactsByLogicalId, artifact, event.package.agent_key)
    }
    return
  }

  if (event.type === 'agent_artifact_created' || event.type === 'agent_artifact_updated') {
    if (event.artifact.is_latest === false) return
    upsertLatestArtifact(latestArtifactsByLogicalId, event.artifact, event.agent_key)
  }
}

function upsertLatestArtifact(
  latestArtifactsByLogicalId: Map<string, { artifact: ChatArtifactRef; agentKey?: string }>,
  artifact: ChatArtifactRef,
  agentKey?: string,
): void {
  const current = latestArtifactsByLogicalId.get(artifact.logical_document_id)
  if (!current || artifact.version >= current.artifact.version) {
    latestArtifactsByLogicalId.set(artifact.logical_document_id, { artifact, agentKey })
  }
}

function recordDecisionAndDetectLoop(
  decisionLoopTracker: Map<string, number>,
  decision: OrchestratorDecision,
): { repeated: boolean; exhausted: boolean; count: number } {
  const key = buildDecisionLoopKey(decision)
  const count = (decisionLoopTracker.get(key) ?? 0) + 1
  decisionLoopTracker.set(key, count)
  return {
    repeated: count >= 2,
    exhausted: count >= 3,
    count,
  }
}

function buildDecisionLoopKey(decision: OrchestratorDecision): string {
  try {
    return `${decision.tool}:${stableStringify(decision.args)}`
  } catch {
    // Pathological args must never crash the loop-detection guard.
    return `${decision.tool}:[args-não-serializáveis]`
  }
}

function stableStringify(value: unknown, depth = 0): string {
  // Depth cap: decision args come from parsed LLM JSON; a cap keeps a
  // pathologically nested object from overflowing the stack.
  if (depth > 12) return '"[profundidade-excedida]"'
  if (value === null || typeof value !== 'object') {
    const primitive = JSON.stringify(value)
    return typeof primitive === 'string' ? primitive : String(value)
  }
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item, depth + 1)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key], depth + 1)}`).join(',')}}`
}

function appendLatestArtifactSummary(
  markdown: string,
  latestArtifactsByLogicalId: Map<string, { artifact: ChatArtifactRef; agentKey?: string }>,
): string {
  const artifacts = [...latestArtifactsByLogicalId.values()]
  if (!artifacts.length) return markdown

  const lines = artifacts
    .sort((a, b) => a.artifact.title.localeCompare(b.artifact.title, 'pt-BR'))
    .map(({ artifact, agentKey }) => {
      const source = agentKey ? ` · agente ${agentKey}` : ''
      const exports = (artifact.exports ?? [])
        .map(exportRef => `${exportRef.label} (${formatExportStatus(exportRef.status)})`)
        .join(', ')
      const exportText = exports ? ` · exports: ${exports}` : ''
      return `- **${artifact.title}** — ${artifact.kind}/${artifact.format} v${artifact.version}${source}${exportText}`
    })

  return [
    markdown.trimEnd(),
    '',
    '## Documentos e artefatos do turno',
    ...lines,
  ].join('\n')
}

function formatExportStatus(status: string): string {
  if (status === 'ready') return 'pronto'
  if (status === 'planned') return 'planejado'
  if (status === 'failed') return 'falhou'
  if (status === 'unavailable') return 'indisponível'
  return status
}

async function ensureRequiredDeliverableBundle(args: {
  input: RunChatTurnInput
  draft: string
  ctx: SkillContext
  expectedDeliverables: ChatExpectedDeliverable[]
  latestArtifactsByLogicalId: Map<string, { artifact: ChatArtifactRef; agentKey?: string }>
  emitTrail: (event: ChatTrailEvent) => void
}): Promise<void> {
  const { input, draft, ctx, expectedDeliverables, latestArtifactsByLogicalId, emitTrail } = args
  if (!mustDeliverDownloadableBundle(input, expectedDeliverables)) return

  if (expectedDeliverables.length > 0 && hasSatisfiedExpectedDeliverables(expectedDeliverables, latestArtifactsByLogicalId.values())) {
    return
  }

  const missingExpected = findUnsatisfiedExpectedDeliverables(expectedDeliverables, latestArtifactsByLogicalId.values())
  if (missingExpected.length > 0 && !shouldUseTextFallbackForExpectedDeliverables(expectedDeliverables)) {
    const createdAt = new Date().toISOString()
    let workPackage = buildMissingExpectedDeliverablePackage({ input, missing: missingExpected, createdAt })
    if (ctx.persistWorkPackage) {
      try {
        workPackage = await ctx.persistWorkPackage(workPackage)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        workPackage = {
          ...workPackage,
          thought: {
            ...workPackage.thought,
            summary: workPackage.thought?.summary || 'Entrega literal ficou pendente.',
            risks: [...(workPackage.thought?.risks ?? []), `Falha ao persistir bloqueio de entrega literal: ${message}`].slice(0, 8),
          },
        }
      }
    }
    emitTrail({ type: 'agent_work_package', package: workPackage, ts: workPackage.completed_at ?? new Date().toISOString() })
    emitTrail({ type: 'error', message: buildExpectedDeliverableFeedback(missingExpected), ts: new Date().toISOString() })
    return
  }

  if (hasDownloadableArtifact(latestArtifactsByLogicalId)) return

  const createdAt = new Date().toISOString()
  const workPackage = buildFinalAnswerDeliverablePackage({ input, draft, createdAt })
  let materialized = workPackage

  try {
    const { materializeChatAgentWorkPackageExports } = await import('../chat-artifact-exporters')
    materialized = await materializeChatAgentWorkPackageExports(workPackage, {
      userId: ctx.uid,
      conversationId: ctx.conversationId,
      turnId: ctx.turnId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    materialized = {
      ...workPackage,
      thought: {
        ...workPackage.thought,
        summary: workPackage.thought?.summary || 'Pacote final criado a partir da resposta do chat.',
        risks: [...(workPackage.thought?.risks ?? []), `Falha ao materializar exports finais: ${message}`].slice(0, 8),
      },
    }
  }

  if (ctx.persistWorkPackage) {
    try {
      materialized = await ctx.persistWorkPackage(materialized)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      materialized = {
        ...materialized,
        thought: {
          ...materialized.thought,
          summary: materialized.thought?.summary || 'Pacote final criado a partir da resposta do chat.',
          risks: [...(materialized.thought?.risks ?? []), `Falha ao persistir pacote final: ${message}`].slice(0, 8),
        },
      }
    }
  }

  emitTrail({
    type: 'agent_work_package',
    package: materialized,
    ts: materialized.completed_at ?? new Date().toISOString(),
  })
}

function mustDeliverDownloadableBundle(input: RunChatTurnInput, expectedDeliverables: ChatExpectedDeliverable[]): boolean {
  if (!isEnabled('FF_CHAT_DELIVERABLE_BUNDLE')) return false
  if (input.requireDeliverableBundle) return true
  if (expectedDeliverables.length > 0) return true
  return looksLikeDeliverableRequest(input.user_input)
}

function looksLikeDeliverableRequest(text: string): boolean {
  if (inferExpectedDeliverablesFromText(text).length > 0) return true
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const hasDownloadSignal = /\b(baixar|download|export(?:a|e|ar)|docx|pdf|zip|xlsx|csv|mp3|mp4|png|jpe?g|webp|wav|webm)\b/.test(normalized)
  const hasDeliveryVerb = /\b(entreg(?:a|ue|ar|avel|aveis)|disponibiliz(?:a|e|ar)|anex(?:a|e|ar))\b/.test(normalized)
  const hasCreationVerb = /\b(fa(?:ca|zer)|crie|criar|gere|gerar|produza|produzir|elabore|elaborar|redija|redigir|monte|montar|prepare|preparar|construa|construir)\b/.test(normalized)
  const hasDeliverableNoun = /\b(documentos?|arquivos?|projeto|peticao|parecer|relatorio|apresentacao|slides?|planilha|imagem|imagens|renderizacao|audio|video)\b/.test(normalized)
  return hasDownloadSignal || ((hasDeliveryVerb || hasCreationVerb) && hasDeliverableNoun)
}

function hasDownloadableArtifact(latestArtifactsByLogicalId: Map<string, { artifact: ChatArtifactRef; agentKey?: string }>): boolean {
  for (const { artifact } of latestArtifactsByLogicalId.values()) {
    if (artifact.download_url) return true
    if ((artifact.exports ?? []).some(exportRef => exportRef.status === 'ready' && Boolean(exportRef.download_url))) return true
  }
  return false
}

function buildFinalAnswerDeliverablePackage(args: { input: RunChatTurnInput; draft: string; createdAt: string }): ChatAgentWorkPackage {
  const { input, draft, createdAt } = args
  const title = buildDeliverableTitle(input.user_input)
  const artifactId = `chat-final-deliverable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    conversation_id: input.conversationId,
    turn_id: input.turnId,
    agent_key: 'chat_export_packager',
    task: 'Materializar a resposta final do chat como pacote baixável porque o pedido exigia arquivos/entregáveis.',
    thought: {
      summary: 'Pacote final criado automaticamente a partir da resposta consolidada do orquestrador.',
      decisions: ['Usar a resposta final como fonte canônica inicial.', 'Gerar formatos textuais baixáveis para impedir finalização sem entrega.'],
      risks: ['Este pacote garante download imediato; pipelines específicos ainda podem produzir versões mais ricas após aprovação.'],
      next_steps: ['Se o usuário pedir formato especializado, acionar a trilha correspondente com aprovação expressa.'],
    },
    result_markdown: draft,
    artifacts: [
      {
        artifact_id: artifactId,
        logical_document_id: 'chat-final-deliverable',
        title,
        kind: 'legal_document',
        format: 'markdown',
        version: 1,
        summary: 'Pacote baixável gerado automaticamente a partir da resposta final do chat.',
        content_preview: draft,
        is_latest: true,
        exports: [
          { label: 'Markdown', format: 'markdown', status: 'planned' },
          { label: 'DOCX', format: 'docx', status: 'planned' },
          { label: 'PDF', format: 'pdf', status: 'planned' },
          { label: 'ZIP', format: 'zip', status: 'planned' },
        ],
      },
    ],
    created_at: createdAt,
    completed_at: createdAt,
  }
}

function buildMissingExpectedDeliverablePackage(args: {
  input: RunChatTurnInput
  missing: ChatExpectedDeliverable[]
  createdAt: string
}): ChatAgentWorkPackage {
  const { input, missing, createdAt } = args
  return {
    conversation_id: input.conversationId,
    turn_id: input.turnId,
    agent_key: 'chat_deliverable_guard',
    task: 'Bloquear finalizacao falsa porque o pedido exigia artifact literal de tipo/formato especifico.',
    thought: {
      summary: 'Entrega literal pendente: o chat nao encontrou artifact pronto com o tipo/formato solicitado.',
      decisions: ['Nao gerar pacote textual substituto para um pedido de midia/arquivo especifico.'],
      risks: ['O usuario precisa configurar provider/chave, aprovar a skill adequada ou tentar novamente com rota literal disponivel.'],
      next_steps: ['Acionar a skill correta, por exemplo generate_image para PNG/JPG, ou retornar falha operacional clara.'],
    },
    result_markdown: buildExpectedDeliverableFeedback(missing),
    artifacts: missing.map((expected, index) => buildMissingExpectedArtifact(input, expected, index)),
    created_at: createdAt,
    completed_at: createdAt,
  }
}

function buildMissingExpectedArtifact(input: RunChatTurnInput, expected: ChatExpectedDeliverable, index: number): ChatArtifactRef {
  const format: ChatArtifactFormat = expected.accepted_formats[0] ?? 'other'
  const reason = `${describeExpectedDeliverable(expected)} solicitado, mas nenhum artifact pronto desse tipo/formato foi produzido neste turno.`
  return {
    artifact_id: `missing-${expected.kind}-${Date.now()}-${index}`,
    logical_document_id: `expected-${expected.kind}-${index}`,
    version: 1,
    title: `Entrega pendente - ${describeExpectedDeliverable(expected)}`,
    kind: expected.kind,
    format,
    summary: reason,
    content_preview: `Pedido original: ${input.user_input}`,
    manifest_json: {
      expected_kind: expected.kind,
      accepted_formats: expected.accepted_formats,
      reason,
      strict: expected.strict,
    },
    is_latest: true,
    exports: expected.accepted_formats.map(exportFormat => ({
      label: exportFormat.toUpperCase(),
      format: exportFormat,
      status: 'unavailable' as const,
      reason,
    })),
  }
}

function appendMissingExpectedDeliverableNotice(markdown: string, missing: ChatExpectedDeliverable[]): string {
  if (!missing.length) return markdown
  const lines = missing.map(item => `- ${describeExpectedDeliverable(item)}`)
  return [
    markdown.trimEnd(),
    '',
    '## Entrega literal pendente',
    'O pedido ainda nao foi cumprido como arquivo literal do tipo/formato solicitado.',
    ...lines,
  ].join('\n')
}

function buildArtifactAuditContext(
  expectedDeliverables: ChatExpectedDeliverable[],
  artifacts: Iterable<{ artifact: ChatArtifactRef; agentKey?: string }>,
): string {
  const lines: string[] = []
  if (expectedDeliverables.length) {
    lines.push('Entregaveis esperados neste turno:')
    for (const expected of expectedDeliverables) {
      lines.push(`- ${describeExpectedDeliverable(expected)}${expected.strict ? ' (obrigatorio/literal)' : ''}`)
    }
  }

  const artifactLines = [...artifacts].map(({ artifact, agentKey }) => {
    const readyExports = (artifact.exports ?? [])
      .filter(exportRef => exportRef.status === 'ready' && exportRef.download_url)
      .map(exportRef => exportRef.format.toUpperCase())
      .join('/')
    return `- ${artifact.title}: ${artifact.kind}/${artifact.format}${readyExports ? ` exports=${readyExports}` : ''}${agentKey ? ` via ${agentKey}` : ''}`
  })
  if (artifactLines.length) {
    lines.push('Artifacts materiais ja criados:')
    lines.push(...artifactLines)
  } else {
    lines.push('Artifacts materiais ja criados: nenhum.')
  }

  return lines.join('\n')
}

function buildDeliverableTitle(userInput: string): string {
  const clipped = userInput.replace(/\s+/g, ' ').trim().slice(0, 72)
  return clipped ? `Pacote de entrega - ${clipped}` : 'Pacote de entrega do chat'
}

interface CallOrchestratorAndParseArgs {
  systemPrompt: string
  history: OrchestratorMessage[]
  ctx: SkillContext
  llmCall: typeof callOrchestratorLLM
  perCallTokenCap: number
  allowedTools: string[]
  temperature?: number
}

async function callOrchestratorAndParse(args: CallOrchestratorAndParseArgs): Promise<OrchestratorDecision> {
  const { systemPrompt, history, ctx, llmCall, perCallTokenCap, allowedTools, temperature } = args

  // ─ Streaming: emit `orchestrator_thought` events token-by-token ─
  let accumulated = ''
  const onToken = (delta: string, total: string) => {
    accumulated = total
    ctx.emit({
      type: 'orchestrator_thought',
      delta,
      total,
      ts: new Date().toISOString(),
    })
  }

  const profile = ctx.profile ?? DEFAULT_V1_PROFILE
  const { raw, usage } = await llmCall({
    systemPrompt,
    history,
    modelKey: profile.orchestratorAgentKey,
    models: ctx.models,
    fallbackModels: ctx.fallbackModels,
    apiKey: ctx.apiKey,
    signal: ctx.signal,
    budget: ctx.budget,
    perCallTokenCap,
    ...(typeof temperature === 'number' ? { temperature } : {}),
    agentLabel: profile.orchestratorLabel,
    functionKey: profile.functionKey,
    functionLabel: profile.functionLabel,
    onToken,
  })
  if (usage) {
    ctx.budget.recordUsage({ ...usage, source_id: ctx.turnId })
  }
  try {
    return parseOrchestratorDecision(raw, allowedTools)
  } catch (err) {
    if (err instanceof OrchestratorDecisionParseError) {
      throw err
    }
    throw err
  }
}

/**
 * Renders the working history into a transcript string the summariser can
 * actually compress. Without this the summariser receives no conversation and
 * ends up "summarising" its own system prompt.
 */
function buildHistoryTranscript(history: OrchestratorMessage[]): string {
  const lines: string[] = []
  for (const message of history) {
    if (message.role === 'system') continue
    const label = message.role === 'user'
      ? (message.tool_summary ? 'ferramenta' : 'usuário')
      : 'assistente'
    const content = message.content.length > 1600
      ? `${message.content.slice(0, 1599)}…`
      : message.content
    lines.push(`[${label}] ${content}`)
  }
  const joined = lines.join('\n\n')
  return joined.length > 24_000 ? `${joined.slice(0, 23_999)}…` : joined
}

async function injectAutoSummary(history: OrchestratorMessage[], ctx: SkillContext): Promise<OrchestratorMessage[] | null> {
  const skills = buildSkillRegistry()
  const summarize = skills.find(s => s.name === 'summarize_context')
  if (!summarize) return null
  // Pass the real conversation — the summariser must compress the history,
  // not its own instruction string.
  const result = await summarize.run({ transcript: buildHistoryTranscript(history) }, ctx)
  const summaryMessage: OrchestratorMessage = {
    role: 'user',
    content: result.tool_message,
    tool_summary: true,
    tag: 'auto_summary',
  }
  return [...history, summaryMessage]
}

async function forceFinalize(history: OrchestratorMessage[], ctx: SkillContext): Promise<string> {
  // Walk back through the history and grab the last meaningful tool result;
  // if nothing useful was produced, ask the writer to emit a graceful
  // fallback answer.
  const recentToolSummaries = history
    .filter(m => m.tool_summary)
    .map(m => m.content)
    .slice(-3)
  const userInputs = history.filter(m => !m.tool_summary && m.role === 'user').map(m => m.content)
  const lastUser = userInputs[userInputs.length - 1] ?? ''

  const task = [
    `Pedido do usuário: ${lastUser}`,
    'Trilha do orquestrador (resumida):',
    ...recentToolSummaries.map((s, idx) => `(${idx + 1}) ${s}`),
    '',
    'Produza a resposta final em markdown rico (pt-BR), respeitando o que foi descoberto. Se faltar informação, declare isso explicitamente em vez de inventar.',
  ].join('\n')

  const finalForceAgentKey = ctx.profile?.finalForceAgentKey ?? 'chat_writer'
  const onToken = ctx.onAgentToken
    ? (delta: string, total: string) => ctx.onAgentToken!(finalForceAgentKey, delta, total)
    : undefined
  const { output } = await dispatchSpecialistAgent({
    agentKey: finalForceAgentKey,
    task,
    ctx,
    onToken,
  })
  return parseAgentOutputPackage({
    rawOutput: output,
    agentKey: finalForceAgentKey,
    task,
    conversationId: ctx.conversationId,
    turnId: ctx.turnId,
  }).displayMarkdown
}

function buildOrchestratorSystemPrompt(skills: Skill[], effort: string, expectedDeliverables: ChatExpectedDeliverable[], profile: ChatOrchestratorProfile): string {
  const manifest = renderSkillsManifest(skills)
  const hasPcTools = skills.some(s => s.name === 'write_file' || s.name === 'organize_files' || s.name === 'run_shell')
  const callable = profile.listCallableAgents()
    .map(a => `- \`${a.key}\` (${a.label}): ${a.description}`)
    .join('\n')
  const expectedBlock = expectedDeliverables.length
    ? [
        '**Entregáveis detectados neste turno:**',
        ...expectedDeliverables.map(item => `- ${describeExpectedDeliverable(item)}${item.strict ? ' — literal obrigatório, com preview/download quando aplicável' : ''}`),
        '',
      ]
    : []
  return [
    'Você é o **Orquestrador** de uma trilha multiagente jurídica em pt-BR.',
    `Esforço atual da conversa: **${effort}**. Adapte o número de chamadas e a profundidade da resposta ao orçamento.`,
    '',
    ...expectedBlock,
    '**Como você responde:** a cada iteração você emite EXATAMENTE um objeto JSON, sem prosa adicional, sem fences de markdown, sem comentários. O objeto tem o formato:',
    '```',
    '{"tool": "<nome>", "args": { ... }, "rationale": "<explicação curta opcional>"}',
    '```',
    'Nada além desse objeto: o primeiro caractere da resposta deve ser `{` e o último `}`. Não escreva frase, título, raciocínio nem comentário antes ou depois — pense silenciosamente e devolva somente o JSON. (Errado: escrever "Vou analisar..." e depois o JSON. Certo: a resposta inteira é apenas o objeto.)',
    '',
    '**Tools disponíveis:**',
    manifest,
    '',
    '**Agentes especialistas que você pode chamar via `call_agent`:**',
    callable,
    '',
    '**Regras**:',
    '- Encerre o turno chamando `submit_final_answer` exatamente uma vez quando a resposta estiver pronta.',
    '- Use `ask_user_question` apenas quando uma decisão depende de informação que só o usuário tem.',
    '- Para tools que já suportam `approved: true` após confirmação (por exemplo `generate_image`, `generate_audio`, `generate_video`, `generate_presentation`, `generate_document`, `generate_studio_artifact`), chame a própria tool e deixe a skill pedir aprovação. Use `request_user_approval` direto apenas quando não houver tool com retomada embutida.',
    '- Use `call_agents_parallel` quando duas ou mais subtarefas independentes puderem rodar no mesmo lote; não use para tarefas com dependência sequencial.',
    '- Se houver mais de um entregável/formato ou uma entrega material complexa, chame `call_agent` com `chat_artifact_architect` ou `chat_media_director` antes da execução para coordenar versões, formatos e agentes.',
    '- Quando houver anexos com análise multimodal pronta, chame os especialistas `chat_image_evidence_specialist`, `chat_audio_evidence_specialist`, `chat_video_evidence_specialist` ou `chat_multimodal_evidence_synthesizer` antes de redigir conclusões probatórias.',
    '- Se o usuário pedir documentos, arquivos, projeto, apresentação, planilha, imagem, áudio ou vídeo, planeje entregáveis reais e só finalize depois de gerar artefatos ou pedir aprovação expressa para a trilha necessária.',
    '- Para imagem, renderização, PNG, JPG, JPEG ou WebP, use `generate_image`; prompt para gerador externo não é imagem entregue.',
    '- Para áudio, narração, podcast, locução, MP3 ou WAV, use `generate_audio`; um roteiro textual não é áudio entregue.',
    '- Para apresentação, deck ou slides, use `generate_presentation`; ele gera o deck e, quando aprovado, os visuais literais dos slides com export PPTX.',
    '- Para vídeo, clipe, animação ou MP4, use `generate_video`; ele produz um vídeo real por IA. Não entregue roteiro nem slideshow como substituto do vídeo.',
    '- Se faltar provider/chave para mídia literal, finalize apenas com falha operacional acionável; não substitua o arquivo por Markdown, DOCX, PDF, ZIP ou descrição textual.',
    '- Se faltar contexto, prefira chamar `chat_planner` antes de redigir.',
    '- Se o histórico estiver longo, chame `summarize_context` para liberar tokens.',
    '- Antes de finalizar, se estiver inseguro, chame `critique_draft` com o rascunho atual.',
    '- Nunca invente jurisprudência, doutrina, números de processo ou fatos do caso.',
    ...(hasPcTools
      ? [
          '- **Ações no PC (pasta local):** você já tem as tools de PC (`list_directory`, `read_file`, `write_file`, `organize_files`, `undo_organize`, `run_shell`, `grant_folder`). Para uma ação direta (ler, escrever, mover, organizar, rodar comando, autorizar pasta), CHAME A TOOL diretamente — não delegue ao `chat_fs_actor`, que só devolve um plano e custa uma ida e volta a mais. Reserve `chat_fs_actor` para planejar uma sequência longa, ambígua ou arriscada antes de executar.',
          '- **Organizar/arrumar arquivos:** prefira `organize_files` — um único plano, uma aprovação, com backup e desfazer via `undo_organize` — em vez de encadear vários `write_file`/`run_shell`/`rename_file`.',
          '- **Sem reescrita redundante:** quando uma tool de PC já executou e o retorno dela já resume o que foi feito, finalize com `submit_final_answer` direto; não chame `chat_writer`/`chat_summarizer` apenas para reformatar o resultado da ação.',
        ]
      : []),
    ...(isEnabled('FF_CHAT_LEAN_ORCHESTRATION')
      ? [
          '- **Eficiência:** se uma skill já entregou o resultado e um texto suficiente, finalize com `submit_final_answer` diretamente; não chame `chat_writer` apenas para reformular.',
          '- **Eficiência:** para um pedido simples de um único entregável, vá direto à skill que o produz, sem gastar uma iteração apenas planejando.',
          '- **Critério para especialistas:** antes de chamar `call_agent`, avalie se aquele especialista agrega profundidade, expertise específica ou verificação independente que você não entregaria sozinho com a mesma qualidade. Se a subtarefa for direta e você já tem o necessário, resolva-a você mesmo e siga em frente — não gaste uma chamada. Acione um especialista apenas quando há margem real de aprimoramento ou aprofundamento da entrega.',
          '- **Latência:** cada chamada é uma ida e volta ao provedor. Agrupe subtarefas independentes em um único `call_agents_parallel` em vez de encadeá-las, e busque o menor número de iterações que ainda entregue o resultado completo — reduzir movimento sem sacrificar qualidade.',
        ]
      : []),
  ].join('\n')
}