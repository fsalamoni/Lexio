import type { ChatTrailEvent } from '../firestore-types'
import type { Skill, SkillContext, SkillResult } from './types'
import { dispatchSpecialistAgent } from './dispatch'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from '../model-config'
import { buildSuperSkills } from './super-skills'
import { buildSidecarSkills } from './sidecar-skills'
import { parseAgentOutputPackage } from './agent-output'

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
