import type { ChatTrailEvent } from '../firestore-types'
import { dispatchSpecialistAgent } from './dispatch'
import type { SkillContext } from './types'

export interface CriticVerdict {
  score: number
  reasons: string[]
  shouldStop: boolean
}

/**
 * Run the critic on the current draft. The orchestrator invokes this
 * automatically every `criticInterval` iterations (and not at all when the
 * effort is `rapido`). The result is also emitted as a `critic` trail
 * event so the UI can render the score inline.
 */
export async function runCritic(draft: string, ctx: SkillContext): Promise<CriticVerdict> {
  const callEvent: ChatTrailEvent = {
    type: 'agent_call',
    agent_key: 'chat_critic',
    task: 'Avaliar rascunho atual (auto)',
    ts: new Date().toISOString(),
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

  const verdict = parseVerdict(output)

  const responseEvent: ChatTrailEvent = {
    type: 'agent_response',
    agent_key: 'chat_critic',
    output: output.length > 600 ? `${output.slice(0, 599)}…` : output,
    ...(usage ? { usage } : {}),
    ts: new Date().toISOString(),
  }
  ctx.emit(responseEvent)

  const criticEvent: ChatTrailEvent = {
    type: 'critic',
    score: verdict.score,
    reasons: verdict.reasons,
    should_stop: verdict.shouldStop,
    ts: new Date().toISOString(),
  }
  ctx.emit(criticEvent)

  return verdict
}

function parseVerdict(raw: string): CriticVerdict {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  try {
    return validate(JSON.parse(cleaned))
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return { score: 0, reasons: ['Veredito do crítico não pôde ser parseado.'], shouldStop: false }
    try {
      return validate(JSON.parse(match[0]))
    } catch {
      return { score: 0, reasons: ['Veredito do crítico não pôde ser parseado.'], shouldStop: false }
    }
  }
}

function validate(value: unknown): CriticVerdict {
  if (!value || typeof value !== 'object') {
    return { score: 0, reasons: ['Resposta vazia.'], shouldStop: false }
  }
  const obj = value as Record<string, unknown>
  const score = Number(obj.score)
  const reasons = Array.isArray(obj.reasons) ? obj.reasons.map(r => String(r)).slice(0, 6) : []
  const shouldStop = Boolean(obj.should_stop)
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    reasons,
    shouldStop,
  }
}
