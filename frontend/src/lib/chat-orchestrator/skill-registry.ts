import type { ChatTrailEvent } from '../firestore-types'
import type { Skill, SkillContext, SkillResult } from './types'
import { dispatchSpecialistAgent } from './dispatch'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from '../model-config'
import { buildSuperSkills } from './super-skills'
import { buildSidecarSkills } from './sidecar-skills'
import { parseAgentOutputPackage } from './agent-output'
import { EFFORT_PRESETS } from './effort-presets'

/**
 * Agent keys callable through the `call_agent` skill. Every specialist
 * except the orchestrator itself (which drives the loop) and the critic
 * (invoked through `critique_draft` and the auto-critic) is callable.
 */
export const CALLABLE_AGENT_KEYS = new Set<string>([
  'chat_planner',
  'chat_clarifier',
  'chat_legal_researcher',
  'chat_code_writer',
  'chat_fs_actor',
  'chat_summarizer',
  'chat_writer',
  'chat_argument_builder',
  'chat_ethics_auditor',
  'chat_artifact_architect',
  'chat_document_composer',
  'chat_data_builder',
  'chat_media_director',
  'chat_export_packager',
])

/** @deprecated kept for backwards compatibility with tests written for PR2. */
export const PR2_CALLABLE_AGENT_KEYS = CALLABLE_AGENT_KEYS

function nowIso(): string {
  return new Date().toISOString()
}

function clip(text: string, max = 500): string {
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

const callAgentSkill: Skill<{ agent_key?: string; task?: string }> = {
  name: 'call_agent',
  description: 'Invoca um agente especialista para resolver uma subtarefa. Use para planejar (chat_planner), comprimir o histórico (chat_summarizer) ou redigir a resposta final (chat_writer).',
  argsHint: {
    agent_key: 'chave do agente (ex.: "chat_planner", "chat_writer")',
    task: 'instrução clara e autocontida do que o agente deve fazer',
  },
  async run(args, ctx) {
    const agentKey = String(args.agent_key ?? '')
    const task = String(args.task ?? '')
    if (!CALLABLE_AGENT_KEYS.has(agentKey)) {
      return {
        tool_message: `Agente "${agentKey}" indisponível. Use um destes: ${[...CALLABLE_AGENT_KEYS].join(', ')}.`,
      }
    }
    if (!task.trim()) {
      return { tool_message: 'Erro: a tarefa do agente não pode ficar vazia.' }
    }
    const callEvent: ChatTrailEvent = { type: 'agent_call', agent_key: agentKey, task: clip(task, 240), ts: nowIso() }
    ctx.emit(callEvent)

    const onToken = ctx.onAgentToken ? ((delta: string, total: string) => ctx.onAgentToken!(agentKey, delta, total)) : undefined
    const { output, usage } = await dispatchSpecialistAgent({
      agentKey,
      task,
      ctx,
      onToken,
    })

    const parsed = parseAgentOutputPackage({
      rawOutput: output,
      agentKey,
      task,
      conversationId: ctx.conversationId,
      turnId: ctx.turnId,
      timestamp: nowIso(),
    })
    const workPackage = await prepareWorkPackageForDelivery(parsed.workPackage, ctx)

    const responseEvent: ChatTrailEvent = {
      type: 'agent_response',
      agent_key: agentKey,
      output: clip(parsed.displayMarkdown, 1200),
      ...(usage ? { usage } : {}),
      ts: nowIso(),
    }
    ctx.emit(responseEvent)

    const packageEvent: ChatTrailEvent = {
      type: 'agent_work_package',
      package: workPackage,
      ts: workPackage.completed_at ?? nowIso(),
    }
    ctx.emit(packageEvent)

    return {
      tool_message: buildAgentToolMessage(agentKey, parsed.displayMarkdown, workPackage),
    }
  },
}

interface ParallelAgentCall {
  agent_key?: string
  task?: string
}

const callAgentsParallelSkill: Skill<{ calls?: ParallelAgentCall[]; shared_context?: string }> = {
  name: 'call_agents_parallel',
  description: 'Invoca múltiplos agentes especialistas independentes em paralelo, respeitando o fan-out do esforço atual e travando agentes duplicados no mesmo lote. Use quando subtarefas não dependem uma da outra.',
  argsHint: {
    calls: 'array de { agent_key, task }. Máximo conforme esforço: rapido=2, medio=3, profundo=4, deep_research=5.',
    shared_context: 'contexto opcional acrescentado ao início de cada tarefa do lote',
  },
  async run(args, ctx) {
    const fanOut = EFFORT_PRESETS[ctx.effort]?.maxFanOut ?? 2
    const normalized = normalizeParallelAgentCalls(args.calls, fanOut, String(args.shared_context ?? ''))
    if (!normalized.accepted.length) {
      return {
        tool_message: normalized.messages.length
          ? `Nenhum agente paralelo pôde ser chamado. ${normalized.messages.join(' ')}`
          : 'Erro: call_agents_parallel requer ao menos uma chamada válida em calls[].',
      }
    }

    const results = await Promise.all(normalized.accepted.map(async call => runParallelAgentCall(call, ctx)))
    const successful = results.filter(result => result.ok)
    const failed = results.filter(result => !result.ok)
    const summaries = results.map(result => result.summary).join('\n\n')
    const guardrails = normalized.messages.length ? `\n\nAjustes do lote:\n${normalized.messages.map(message => `- ${message}`).join('\n')}` : ''
    const failures = failed.length ? `\n\nFalhas no lote: ${failed.map(result => result.agentKey).join(', ')}` : ''
    return {
      tool_message: [
        `Lote paralelo concluído: ${successful.length}/${results.length} agente(s) responderam.`,
        guardrails,
        failures,
        '',
        summaries,
      ].filter(Boolean).join('\n'),
    }
  },
}

function normalizeParallelAgentCalls(calls: unknown, fanOut: number, sharedContext: string): { accepted: Array<{ agentKey: string; task: string }>; messages: string[] } {
  const items = Array.isArray(calls) ? calls : []
  const accepted: Array<{ agentKey: string; task: string }> = []
  const messages: string[] = []
  const lockedAgents = new Set<string>()

  for (const item of items) {
    if (accepted.length >= fanOut) {
      messages.push(`Fan-out limitado a ${fanOut}; chamadas excedentes foram ignoradas.`)
      break
    }
    if (!item || typeof item !== 'object') {
      messages.push('Uma chamada foi ignorada por formato inválido.')
      continue
    }
    const record = item as Record<string, unknown>
    const agentKey = String(record.agent_key ?? '').trim()
    const task = String(record.task ?? '').trim()
    if (!CALLABLE_AGENT_KEYS.has(agentKey)) {
      messages.push(`Agente "${agentKey || 'vazio'}" indisponível no lote.`)
      continue
    }
    if (lockedAgents.has(agentKey)) {
      messages.push(`Agente "${agentKey}" já estava no lote; duplicata ignorada.`)
      continue
    }
    if (!task) {
      messages.push(`Chamada de "${agentKey}" ignorada porque a tarefa estava vazia.`)
      continue
    }
    lockedAgents.add(agentKey)
    accepted.push({
      agentKey,
      task: sharedContext.trim()
        ? [`Contexto compartilhado do lote:`, sharedContext.trim(), '', `Subtarefa específica:`, task].join('\n')
        : task,
    })
  }

  return { accepted, messages: Array.from(new Set(messages)) }
}

async function runParallelAgentCall(call: { agentKey: string; task: string }, ctx: SkillContext): Promise<{ ok: boolean; agentKey: string; summary: string }> {
  const callEvent: ChatTrailEvent = { type: 'agent_call', agent_key: call.agentKey, task: clip(call.task, 240), ts: nowIso() }
  ctx.emit(callEvent)
  try {
    const onToken = ctx.onAgentToken ? ((delta: string, total: string) => ctx.onAgentToken!(call.agentKey, delta, total)) : undefined
    const { output, usage } = await dispatchSpecialistAgent({
      agentKey: call.agentKey,
      task: call.task,
      ctx,
      onToken,
    })
    const parsed = parseAgentOutputPackage({
      rawOutput: output,
      agentKey: call.agentKey,
      task: call.task,
      conversationId: ctx.conversationId,
      turnId: ctx.turnId,
      timestamp: nowIso(),
    })
    const workPackage = await prepareWorkPackageForDelivery(parsed.workPackage, ctx)
    ctx.emit({
      type: 'agent_response',
      agent_key: call.agentKey,
      output: clip(parsed.displayMarkdown, 1200),
      ...(usage ? { usage } : {}),
      ts: nowIso(),
    })
    ctx.emit({
      type: 'agent_work_package',
      package: workPackage,
      ts: workPackage.completed_at ?? nowIso(),
    })
    return {
      ok: true,
      agentKey: call.agentKey,
      summary: buildAgentToolMessage(call.agentKey, parsed.displayMarkdown, workPackage),
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    const message = error instanceof Error ? error.message : String(error)
    ctx.emit({ type: 'error', message: `Falha em ${call.agentKey}: ${message}`, ts: nowIso() })
    return {
      ok: false,
      agentKey: call.agentKey,
      summary: `Falha em ${call.agentKey}: ${message}`,
    }
  }
}

function buildAgentToolMessage(
  agentKey: string,
  displayMarkdown: string,
  workPackage: ReturnType<typeof parseAgentOutputPackage>['workPackage'],
): string {
  const artifacts = workPackage.artifacts ?? []
  const artifactSummary = artifacts.length
    ? `\n\nArtefatos criados/atualizados:\n${artifacts.map(artifact => {
        const readyExports = (artifact.exports ?? []).filter(exportRef => exportRef.status === 'ready').map(exportRef => exportRef.label).join(', ')
        return `- ${artifact.title} (${artifact.kind}/${artifact.format}) v${artifact.version}${readyExports ? ` · exports prontos: ${readyExports}` : ''}`
      }).join('\n')}`
    : ''
  return `Resposta de ${agentKey}:\n${displayMarkdown}${artifactSummary}`
}

async function prepareWorkPackageForDelivery(
  workPackage: ReturnType<typeof parseAgentOutputPackage>['workPackage'],
  ctx: SkillContext,
) {
  let materialized = workPackage
  if ((workPackage.artifacts ?? []).length > 0) {
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
          summary: workPackage.thought?.summary || 'Pacote do agente criado.',
          risks: [...(workPackage.thought?.risks ?? []), `Falha ao materializar exports automaticamente: ${message}`].slice(0, 8),
        },
      }
    }
  }

  if (ctx.persistWorkPackage) {
    try {
      return await ctx.persistWorkPackage(materialized)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ...materialized,
        thought: {
          ...materialized.thought,
          summary: materialized.thought?.summary || 'Pacote do agente criado.',
          risks: [...(materialized.thought?.risks ?? []), `Falha ao persistir pacote no Firestore: ${message}`].slice(0, 8),
        },
      }
    }
  }

  return materialized
}

const summarizeContextSkill: Skill<{ instructions?: string }> = {
  name: 'summarize_context',
  description: 'Comprime a conversa e resultados intermediários para liberar orçamento de tokens. O retorno substitui o histórico interno do orquestrador na próxima iteração.',
  argsHint: {
    instructions: 'aspectos específicos a preservar (opcional)',
  },
  async run(args, ctx) {
    const instructions = String(args.instructions ?? 'Preserve fatos jurídicos relevantes, pedidos do usuário e decisões já tomadas.')
    const callEvent: ChatTrailEvent = {
      type: 'agent_call',
      agent_key: 'chat_summarizer',
      task: clip(instructions, 240),
      ts: nowIso(),
    }
    ctx.emit(callEvent)

    const onToken = ctx.onAgentToken ? ((delta: string, total: string) => ctx.onAgentToken!('chat_summarizer', delta, total)) : undefined
    const { output, usage } = await dispatchSpecialistAgent({
      agentKey: 'chat_summarizer',
      task: instructions,
      ctx,
      onToken,
    })

    const responseEvent: ChatTrailEvent = {
      type: 'agent_response',
      agent_key: 'chat_summarizer',
      output: clip(output, 800),
      ...(usage ? { usage } : {}),
      ts: nowIso(),
    }
    ctx.emit(responseEvent)

    return { tool_message: `Resumo do contexto até agora:\n${output}` }
  },
}

const critiqueDraftSkill: Skill<{ draft?: string }> = {
  name: 'critique_draft',
  description: 'Pede ao Crítico que avalie o rascunho atual e responda em JSON com `score` (0-100), `reasons[]` e `should_stop` (bool). Use antes de submit_final_answer quando estiver inseguro.',
  argsHint: {
    draft: 'rascunho de resposta a ser avaliado (markdown completo)',
  },
  async run(args, ctx) {
    const draft = String(args.draft ?? '')
    if (!draft.trim()) {
      return { tool_message: 'Erro: nenhum rascunho fornecido para o crítico.' }
    }
    const callEvent: ChatTrailEvent = {
      type: 'agent_call',
      agent_key: 'chat_critic',
      task: 'Avaliar rascunho atual',
      ts: nowIso(),
    }
    ctx.emit(callEvent)

    const promptTask = `Avalie o rascunho abaixo. Responda APENAS com JSON válido no formato:
{"score": <0-100>, "reasons": [<motivos curtos>], "should_stop": <true|false>}

Rascunho:
"""
${draft}
"""`

    const onToken = ctx.onAgentToken ? ((delta: string, total: string) => ctx.onAgentToken!('chat_critic', delta, total)) : undefined
    const { output, usage } = await dispatchSpecialistAgent({
      agentKey: 'chat_critic',
      task: promptTask,
      ctx,
      onToken,
    })

    let verdict: { score: number; reasons: string[]; should_stop: boolean }
    try {
      verdict = parseCriticOutput(output)
    } catch {
      verdict = { score: 0, reasons: ['Falha ao parsear veredito do crítico.'], should_stop: false }
    }

    const responseEvent: ChatTrailEvent = {
      type: 'agent_response',
      agent_key: 'chat_critic',
      output: clip(output, 600),
      ...(usage ? { usage } : {}),
      ts: nowIso(),
    }
    ctx.emit(responseEvent)
    const criticEvent: ChatTrailEvent = {
      type: 'critic',
      score: verdict.score,
      reasons: verdict.reasons,
      should_stop: verdict.should_stop,
      ts: nowIso(),
    }
    ctx.emit(criticEvent)

    return {
      tool_message: `Crítico avaliou o rascunho: score=${verdict.score}, should_stop=${verdict.should_stop}, motivos=${verdict.reasons.join(' | ')}`,
    }
  },
}

const askUserQuestionSkill: Skill<{ question?: string; options?: string[] }> = {
  name: 'ask_user_question',
  description: 'Interrompe o turno e pergunta ao usuário antes de prosseguir. Use quando uma decisão crítica depende de informação que só o usuário tem.',
  argsHint: {
    question: 'pergunta clara, em pt-BR',
    options: 'lista opcional de respostas pré-definidas (strings)',
  },
  async run(args, ctx): Promise<SkillResult> {
    const question = String(args.question ?? '').trim()
    const options = Array.isArray(args.options) ? args.options.filter(o => typeof o === 'string').slice(0, 8) : undefined
    if (!question) {
      return { tool_message: 'Erro: ask_user_question requer "question".' }
    }
    const event: ChatTrailEvent = {
      type: 'clarification_request',
      question,
      ...(options && options.length ? { options } : {}),
      ts: nowIso(),
    }
    ctx.emit(event)
    return {
      tool_message: `Aguardando resposta do usuário: ${question}`,
      awaiting_user: { question, options },
    }
  },
}

const requestUserApprovalSkill: Skill<{
  title?: string
  summary?: string
  action?: string
  risk_level?: 'low' | 'medium' | 'high'
  requested_permissions?: string[]
  estimated_cost?: string
  estimated_time?: string
}> = {
  name: 'request_user_approval',
  description: 'Solicita aprovação explícita do usuário antes de executar ações caras, persistentes, com Storage, sidecar, mídia paga, Novo Documento ou Caderno de Pesquisa.',
  argsHint: {
    title: 'título curto da ação que será aprovada',
    summary: 'resumo claro do que será criado, alterado, custo/tempo estimado e destino',
    action: 'ação pretendida (ex.: generate_document_v3, run_notebook_studio, export_media)',
    risk_level: 'low | medium | high',
    requested_permissions: 'permissões necessárias: read, write, delete, rename, execute, network',
    estimated_cost: 'estimativa textual de custo, se houver',
    estimated_time: 'estimativa textual de duração, se houver',
  },
  async run(args, ctx): Promise<SkillResult> {
    const title = clip(String(args.title || args.action || 'Aprovar ação do chat'), 120)
    const summaryParts = [
      String(args.summary || '').trim(),
      args.estimated_cost ? `Custo estimado: ${args.estimated_cost}` : '',
      args.estimated_time ? `Tempo estimado: ${args.estimated_time}` : '',
    ].filter(Boolean)
    const summary = clip(summaryParts.join('\n'), 1000) || 'O orquestrador precisa da sua aprovação antes de prosseguir.'
    const riskLevel = args.risk_level === 'high' || args.risk_level === 'medium' || args.risk_level === 'low'
      ? args.risk_level
      : 'medium'
    const requestedPermissions = normalizeRequestedPermissions(args.requested_permissions)
    let approvalId = `local-${Date.now()}`

    if (ctx.createApprovalRequest) {
      approvalId = await ctx.createApprovalRequest({
        command_ids: [],
        title,
        summary,
        risk_level: riskLevel,
        requested_permissions: requestedPermissions,
      })
    }

    const event: ChatTrailEvent = {
      type: 'approval_requested',
      approval_id: approvalId,
      title,
      summary,
      risk_level: riskLevel,
      ts: nowIso(),
    }
    ctx.emit(event)

    const question = [
      `${title}`,
      '',
      summary,
      '',
      'Responda "aprovar" para autorizar, "rejeitar" para cancelar ou descreva ajustes antes de executar.',
    ].join('\n')

    return {
      tool_message: `Aguardando aprovação do usuário (${approvalId}): ${title}`,
      awaiting_user: { question, options: ['aprovar', 'rejeitar', 'ajustar'], approval_id: approvalId },
    }
  },
}

function normalizeRequestedPermissions(value: unknown): Array<'read' | 'write' | 'delete' | 'rename' | 'execute' | 'network'> {
  const allowed = new Set(['read', 'write', 'delete', 'rename', 'execute', 'network'])
  const items = Array.isArray(value) ? value : []
  const normalized = items
    .map(item => String(item).trim().toLowerCase())
    .filter(item => allowed.has(item)) as Array<'read' | 'write' | 'delete' | 'rename' | 'execute' | 'network'>
  return normalized.length ? Array.from(new Set(normalized)) : ['network']
}

const submitFinalAnswerSkill: Skill<{ markdown?: string }> = {
  name: 'submit_final_answer',
  description: 'Finaliza o turno e envia ao usuário a resposta em markdown. Use exatamente uma vez, ao final.',
  argsHint: {
    markdown: 'resposta final em markdown rico (pt-BR)',
  },
  async run(args, _ctx): Promise<SkillResult> {
    const markdown = String(args.markdown ?? '').trim()
    if (!markdown) {
      return { tool_message: 'Erro: submit_final_answer requer "markdown" não vazio.' }
    }
    return {
      tool_message: 'Resposta final registrada.',
      final_answer: markdown,
    }
  },
}

/**
 * Build the complete skill registry available to the orchestrator.
 *
 * PR2 (base): call_agent, summarize_context, critique_draft,
 *             ask_user_question, submit_final_answer
 * PR3 (pipelines): generate_document, check_document_status,
 *                  search_jurisprudence, analyze_thesis
 * PR4 (sidecar): read_file, list_directory, write_file, run_shell
 */
export function buildSkillRegistry(): Skill[] {
  return [
    // PR2 — Base orchestration skills
    callAgentSkill,
    callAgentsParallelSkill,
    summarizeContextSkill,
    critiqueDraftSkill,
    askUserQuestionSkill,
    requestUserApprovalSkill,
    submitFinalAnswerSkill,
    // PR3 — Pipeline super-skills
    ...buildSuperSkills(),
    // PR4 — Desktop sidecar skills
    ...buildSidecarSkills(),
  ]
}

/** Registered agent keys (used in the system prompt to remind the orchestrator which keys exist). */
export function listCallableAgentDescriptions(): Array<{ key: string; label: string; description: string }> {
  return CHAT_ORCHESTRATOR_AGENT_DEFS
    .filter(agent => CALLABLE_AGENT_KEYS.has(agent.key))
    .map(agent => ({ key: agent.key, label: agent.label, description: agent.description }))
}

function parseCriticOutput(raw: string): { score: number; reasons: string[]; should_stop: boolean } {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  // Try the whole thing first; if that fails, try to find a JSON-looking
  // substring (some models prefix verdicts with prose despite instructions).
  try {
    return validateCritic(JSON.parse(stripped))
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON object found in critic output.')
    return validateCritic(JSON.parse(match[0]))
  }
}

function validateCritic(value: unknown): { score: number; reasons: string[]; should_stop: boolean } {
  if (!value || typeof value !== 'object') throw new Error('Critic output is not an object.')
  const obj = value as Record<string, unknown>
  const score = Number(obj.score)
  const reasons = Array.isArray(obj.reasons) ? obj.reasons.map(r => String(r)) : []
  const shouldStop = Boolean(obj.should_stop)
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    reasons: reasons.slice(0, 6),
    should_stop: shouldStop,
  }
}
