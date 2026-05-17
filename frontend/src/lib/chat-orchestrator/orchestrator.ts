import type { ChatAgentWorkPackage, ChatArtifactRef, ChatTrailEvent } from '../firestore-types'
import { createBudget } from './budget'
import { dispatchSpecialistAgent } from './dispatch'
import { callOrchestratorLLM, appendToolMessage } from './orchestrator-llm'
import { runCritic } from './quality'
import { buildSkillRegistry, listCallableAgentDescriptions } from './skill-registry'
import { OrchestratorDecisionParseError, parseOrchestratorDecision, renderSkillsManifest } from './tools-adapter'
import { EFFORT_PRESETS } from './effort-presets'
import { parseAgentOutputPackage } from './agent-output'
import { renderCurrentTurnUserContent } from '../chat-context-builder'
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
  const latestArtifactsByLogicalId = new Map<string, { artifact: ChatArtifactRef; agentKey?: string }>()
  const emitTrail = (event: ChatTrailEvent) => {
    collectLatestArtifacts(event, latestArtifactsByLogicalId)
    input.onTrail(event)
  }

  const ctx: SkillContext = {
    uid: input.uid,
    conversationId: input.conversationId,
    turnId: input.turnId,
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
    mock: Boolean(input.mock),
  }

  const systemPrompt = buildOrchestratorSystemPrompt(skills, input.effort)
  let history: OrchestratorMessage[] = [
    ...input.history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: renderCurrentTurnUserContent({ userInput: input.user_input, attachments: input.attachments, contextSources: input.contextSources }) },
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
      emitTrail({
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
        emitTrail({
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

    emitTrail({
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
      emitTrail({ type: 'error', message: `Falha em ${decision.tool}: ${message}`, ts: new Date().toISOString() })
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
        emitTrail({
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
      emitTrail({ type: 'error', message: `Finalização forçada falhou: ${message}`, ts: new Date().toISOString() })
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

    await ensureRequiredDeliverableBundle({
      input,
      draft,
      ctx,
      latestArtifactsByLogicalId,
      emitTrail,
    })

    draft = appendLatestArtifactSummary(draft, latestArtifactsByLogicalId)

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
    '## Documentos e artefatos criados',
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
  latestArtifactsByLogicalId: Map<string, { artifact: ChatArtifactRef; agentKey?: string }>
  emitTrail: (event: ChatTrailEvent) => void
}): Promise<void> {
  const { input, draft, ctx, latestArtifactsByLogicalId, emitTrail } = args
  if (!mustDeliverDownloadableBundle(input)) return
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

function mustDeliverDownloadableBundle(input: RunChatTurnInput): boolean {
  if (input.requireDeliverableBundle) return true
  return looksLikeDeliverableRequest(input.user_input)
}

function looksLikeDeliverableRequest(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const hasDownloadSignal = /\b(baixar|download|export(?:a|e|ar)|docx|pdf|zip|xlsx|csv|mp3|mp4)\b/.test(normalized)
  const hasDeliveryVerb = /\b(entreg(?:a|ue|ar|avel|aveis)|disponibiliz(?:a|e|ar)|anex(?:a|e|ar))\b/.test(normalized)
  const hasCreationVerb = /\b(fa(?:ca|zer)|crie|criar|gere|gerar|produza|produzir|elabore|elaborar|redija|redigir|monte|montar|prepare|preparar|construa|construir)\b/.test(normalized)
  const hasDeliverableNoun = /\b(documentos?|arquivos?|projeto|peticao|parecer|relatorio|apresentacao|slides?|planilha|imagem|imagens|audio|video)\b/.test(normalized)
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

  const onToken = ctx.onAgentToken
    ? (delta: string, total: string) => ctx.onAgentToken!(FINAL_FORCE_AGENT_KEY, delta, total)
    : undefined
  const { output } = await dispatchSpecialistAgent({
    agentKey: FINAL_FORCE_AGENT_KEY,
    task,
    ctx,
    onToken,
  })
  return parseAgentOutputPackage({
    rawOutput: output,
    agentKey: FINAL_FORCE_AGENT_KEY,
    task,
    conversationId: ctx.conversationId,
    turnId: ctx.turnId,
  }).displayMarkdown
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
    '- Use `request_user_approval` antes de Novo Documento, Caderno de Pesquisa, Storage grande, mídia paga, sidecar write/shell ou qualquer ação persistente/cara.',
    '- Use `call_agents_parallel` quando duas ou mais subtarefas independentes puderem rodar no mesmo lote; não use para tarefas com dependência sequencial.',
    '- Se o usuário pedir documentos, arquivos, projeto, apresentação, planilha, imagem, áudio ou vídeo, planeje entregáveis reais e só finalize depois de gerar artefatos ou pedir aprovação expressa para a trilha necessária.',
    '- Se faltar contexto, prefira chamar `chat_planner` antes de redigir.',
    '- Se o histórico estiver longo, chame `summarize_context` para liberar tokens.',
    '- Antes de finalizar, se estiver inseguro, chame `critique_draft` com o rascunho atual.',
    '- Nunca invente jurisprudência, doutrina, números de processo ou fatos do caso.',
  ].join('\n')
}