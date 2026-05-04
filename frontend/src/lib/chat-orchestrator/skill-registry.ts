import type { ChatTrailEvent } from '../firestore-types'
import type { Skill, SkillContext, SkillResult } from './types'
import { dispatchSpecialistAgent } from './dispatch'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from '../model-config'
import { buildSuperSkills } from './super-skills'
import { buildSidecarSkills } from './sidecar-skills'

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

    const responseEvent: ChatTrailEvent = {
      type: 'agent_response',
      agent_key: agentKey,
      output: clip(output, 1200),
      ...(usage ? { usage } : {}),
      ts: nowIso(),
    }
    ctx.emit(responseEvent)

    return {
      tool_message: `Resposta de ${agentKey}:\n${output}`,
    }
  },
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
