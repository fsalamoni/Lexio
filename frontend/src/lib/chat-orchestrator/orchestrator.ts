import type { ChatTrailEvent } from '../firestore-types'
import { createBudget } from './budget'
import { callOrchestratorLLM, appendToolMessage } from './orchestrator-llm'
import { runCritic } from './quality'
import { buildSkillRegistry, listCallableAgentDescriptions } from './skill-registry'
import { OrchestratorDecisionParseError, parseOrchestratorDecision, renderSkillsManifest } from './tools-adapter'
import { EFFORT_PRESETS } from './effort-presets'
import type {
  OrchestratorDecision,
  OrchestratorMessage,
  RunChatTurnInput,
  RunChatTurnOutput,
  Skill,
  SkillContext,
} from './types'

const ORCHESTRATOR_AGENT_KEY = 'chat_orchestrator'
const FINAL_FORCE_AGENT_KEY = 'chat_writer'

/**
 * Run a single chat turn end-to-end.
 *
 * Public entry point for the runtime. The UI layer (use-chat-controller)
 * subscribes to `onTrail` to render the orchestration in real time and
 * reads the returned `RunChatTurnOutput` to persist the turn's final state.
 */
export async function runChatTurn(input: RunChatTurnInput): Promise<RunChatTurnOutput> {
  if (input.signal.aborted) {
    throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
  }

  const preset = EFFORT_PRESETS[input.effort]
  const budget = createBudget(preset.maxTokens)
  const skills = buildSkillRegistry()
  const skillsByName = new Map<string, Skill>(skills.map(s => [s.name, s]))
  const llmCall = input.llmCall ?? callOrchestratorLLM
  const allowedTools = skills.map(s => s.name)

  const ctx: SkillContext = {
    uid: input.uid,
    conversationId: input.conversationId,
    turnId: input.turnId,
    effort: input.effort,
    budget,
    signal: input.signal,
    emit: input.onTrail,
    models: input.models,
    fallbackModels: input.fallbackModels,
    apiKey: input.apiKey,
    onAgentToken: input.onAgentToken,
    mock: Boolean(input.mock),
  }

  const systemPrompt = buildOrchestratorSystemPrompt(skills, input.effort)
  let history: OrchestratorMessage[] = [
    ...input.history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: input.user_input },
  ]

    let draft: string | null = null
    let stopReason: 'final_answer' | 'critic_stop' | 'max_iterations' | 'budget' = 'max_iterations'
    let consecutiveParseErrors = 0
    const startedAt = Date.now()
    let partialIterations = 0

    for (let i = 1; i <= preset.maxIterations; i++) {
      if (input.signal.aborted) {
        throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
      }
      const elapsedMs = Date.now() - startedAt
      input.onTrail({
        type: 'iteration_start',
        i,
        ts: new Date().toISOString(),
        elapsed_ms: elapsedMs,
        budget_used_ratio: budget.usedRatio(),
      })

    let decision: OrchestratorDecision
    try {
      decision = await callOrchestratorAndParse({
        systemPrompt,
        history,
        ctx,
        llmCall,
        perCallTokenCap: preset.perCallTokenCap,
        allowedTools,
      })
      consecutiveParseErrors = 0
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      consecutiveParseErrors += 1
      if (consecutiveParseErrors >= 2) {
        // Two parse failures in a row — give up on the loop and let the
        // forced finaliser produce a closing answer from whatever we have.
        input.onTrail({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
        break
      }
      // Coach the orchestrator with a stricter reminder and try again.
      history = appendToolMessage(
        history,
        'Sua última resposta não pôde ser parseada como JSON. Responda APENAS com o objeto JSON do formato {"tool": "...", "args": {...}}.',
        'parse_error',
      )
      continue
    }

    input.onTrail({
      type: 'decision',
      tool: decision.tool,
      ...(decision.rationale ? { rationale: decision.rationale } : {}),
      ts: new Date().toISOString(),
    })

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
      input.onTrail({ type: 'error', message: `Falha em ${decision.tool}: ${message}`, ts: new Date().toISOString() })
      history = appendToolMessage(
        history,
        `A ferramenta "${decision.tool}" falhou, mas o orquestrador deve continuar com outra estratégia ou finalizar com o contexto disponível. Erro: ${message}`,
        `${decision.tool}_error`,
      )
      continue
    }

    history = appendToolMessage(history, result.tool_message, decision.tool)

    if (result.awaiting_user) {
      // Pause the turn — the controller persists state and unblocks once
      // the user answers.
      return {
        status: 'awaiting_user',
        assistant_markdown: null,
        pending_question: { text: result.awaiting_user.question, options: result.awaiting_user.options },
        llm_executions: budget.records(),
      }
    }

      if (result.final_answer) {
        draft = result.final_answer
        partialIterations = i
        // Always attempt a critic pass before accepting the final answer.
        // The critic now runs iteratively — even after a skill declares
        // final_answer, we validate and can loop back for refinements.
        if (
          preset.criticInterval > 0
          && preset.criticInterval <= preset.maxIterations
          && i < preset.maxIterations
        ) {
          try {
            const verdict = await runCritic(draft, ctx)
            if (verdict.shouldStop || verdict.score >= 75) {
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
          } catch {
            // best-effort — accept draft if critic fails
            stopReason = 'final_answer'
            break
          }
        }
        stopReason = 'final_answer'
        break
      }

      // Auto-summariser: when the budget approaches the threshold, ask the
      // summariser to compact the history. This is a single deterministic
      // injection per turn — repeated triggers would compound noise.
      if (budget.usedRatio() >= preset.summarizeAt && !history.some(m => m.tag === 'auto_summary')) {
        try {
          const compacted = await injectAutoSummary(history, ctx)
          if (compacted) history = compacted
        } catch {
          // best-effort
        }
      }

      if (budget.exceeded()) {
        input.onTrail({
          type: 'budget_hit',
          reason: budget.isHardStopped().reason ?? 'token_cap_reached',
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
      const message = err instanceof Error ? err.message : String(err)
      input.onTrail({ type: 'error', message: `Finalização forçada falhou: ${message}`, ts: new Date().toISOString() })
      const userInputs = history.filter(m => !m.tool_summary && m.role === 'user').map(m => m.content)
      const lastUser = userInputs[userInputs.length - 1] ?? input.user_input
      draft = [
        'Não consegui concluir a trilha multiagente completa, mas o turno ficou salvo para nova tentativa.',
        '',
        `**Pedido registrado:** ${lastUser}`,
        '',
        `**Detalhe técnico:** ${message}`,
      ].join('\n')
    }
    if (stopReason === 'max_iterations' && budget.exceeded()) stopReason = 'budget'
  }

    const elapsedMs = Date.now() - startedAt
    input.onTrail({
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

interface CallOrchestratorAndParseArgs {
  systemPrompt: string
  history: OrchestratorMessage[]
  ctx: SkillContext
  llmCall: typeof callOrchestratorLLM
  perCallTokenCap: number
  allowedTools: string[]
}

async function callOrchestratorAndParse(args: CallOrchestratorAndParseArgs): Promise<OrchestratorDecision> {
  const { systemPrompt, history, ctx, llmCall, perCallTokenCap, allowedTools } = args

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

  const { raw, usage } = await llmCall({
    systemPrompt,
    history,
    modelKey: ORCHESTRATOR_AGENT_KEY,
    models: ctx.models,
    fallbackModels: ctx.fallbackModels,
    apiKey: ctx.apiKey,
    signal: ctx.signal,
    budget: ctx.budget,
    perCallTokenCap,
    agentLabel: 'Orquestrador',
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

async function injectAutoSummary(history: OrchestratorMessage[], ctx: SkillContext): Promise<OrchestratorMessage[] | null> {
  const skills = buildSkillRegistry()
  const summarize = skills.find(s => s.name === 'summarize_context')
  if (!summarize) return null
  const result = await summarize.run({}, ctx)
  return [
    ...history,
    {
      role: 'user',
      content: result.tool_message,
      tool_summary: true,
      tag: 'auto_summary',
    },
  ]
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

  const { dispatchSpecialistAgent } = await import('./dispatch')

  const onToken = ctx.onAgentToken
    ? (delta: string, total: string) => ctx.onAgentToken!(FINAL_FORCE_AGENT_KEY, delta, total)
    : undefined
  const { output } = await dispatchSpecialistAgent({
    agentKey: FINAL_FORCE_AGENT_KEY,
    task,
    ctx,
    onToken,
  })
  return output
}

function buildOrchestratorSystemPrompt(skills: Skill[], effort: string): string {
  const manifest = renderSkillsManifest(skills)
  const callable = listCallableAgentDescriptions()
    .map(a => `- \`${a.key}\` (${a.label}): ${a.description}`)
    .join('\n')
  return [
    'Você é o **Orquestrador** de uma trilha multiagente jurídica em pt-BR.',
    `Esforço atual da conversa: **${effort}**. Adapte o número de chamadas e a profundidade da resposta ao orçamento.`,
    '',
    '**Como você responde:** a cada iteração você emite EXATAMENTE um objeto JSON, sem prosa adicional, sem fences de markdown, sem comentários. O objeto tem o formato:',
    '```',
    '{"tool": "<nome>", "args": { ... }, "rationale": "<explicação curta opcional>"}',
    '```',
    'Nada além desse objeto. Se você precisar pensar, faça isso silenciosamente e devolva apenas o JSON.',
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
    '- Se faltar contexto, prefira chamar `chat_planner` antes de redigir.',
    '- Se o histórico estiver longo, chame `summarize_context` para liberar tokens.',
    '- Antes de finalizar, se estiver inseguro, chame `critique_draft` com o rascunho atual.',
    '- Nunca invente jurisprudência, doutrina, números de processo ou fatos do caso.',
  ].join('\n')
}