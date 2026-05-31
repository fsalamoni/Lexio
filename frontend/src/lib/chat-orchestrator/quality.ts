import type { ChatTrailEvent } from '../firestore-types'
import { dispatchSpecialistAgent } from './dispatch'
import type { SkillContext } from './types'

export interface CriticVerdict {
  score: number
  reasons: string[]
  shouldStop: boolean
}

export interface CriticOptions {
  artifactAuditContext?: string
  /**
   * When true, use the domain-aware, multi-axis rubric (FF_CHAT_ENGINE_PLUS).
   * The output JSON shape is unchanged ({score, reasons, should_stop}); the
   * model is just asked to reason across correctness/coverage/clarity/risk and
   * to weigh the relevant domain (jurídico/código/mídia).
   */
  enhanced?: boolean
}

const ENHANCED_RUBRIC = `Avalie de forma multi-eixo e ciente do domínio do pedido:
- Identifique o domínio predominante (jurídico, código/engenharia, mídia, dados, ou geral) e julgue pelo padrão desse domínio.
- Pontue mentalmente quatro eixos (0-100): corretude, cobertura do pedido, clareza e risco (quanto menor o risco, melhor).
- O "score" final deve refletir o pior eixo crítico — uma resposta com erro factual/jurídico não pode ter score alto mesmo se clara.
- Em "reasons", cite o eixo mais fraco e o que falta objetivamente para subir o score.`

/**
 * Run the critic on the current draft. The orchestrator invokes this
 * automatically every `criticInterval` iterations (and not at all when the
 * effort is `rapido`). The result is also emitted as a `critic` trail
 * event so the UI can render the score inline.
 */
export async function runCritic(draft: string, ctx: SkillContext, options: CriticOptions = {}): Promise<CriticVerdict> {
  const criticAgentKey = ctx.profile?.criticAgentKey ?? 'chat_critic'
  const callEvent: ChatTrailEvent = {
    type: 'agent_call',
    agent_key: criticAgentKey,
    task: 'Avaliar rascunho atual (auto)',
    ts: new Date().toISOString(),
  }
  ctx.emit(callEvent)

  const artifactContext = options.artifactAuditContext?.trim()
  const promptTask = `Avalie o rascunho abaixo. Responda APENAS com JSON válido no formato:
{"score": <0-100>, "reasons": [<motivos curtos>], "should_stop": <true|false>}
${options.enhanced ? `\n${ENHANCED_RUBRIC}\n` : ''}
Regras de entrega material:
- Prompt, descricao textual, Markdown, DOCX, PDF ou ZIP generico nao cumprem pedido de imagem/audio/video/formato nativo.
- Se o pedido exige artifact literal, should_stop so pode ser true quando o artifact correto existir e estiver pronto para download/preview.
${artifactContext ? `\nContexto de artifacts do turno:\n${artifactContext}\n` : ''}

Rascunho:
"""
${draft}
"""`

  const onToken = ctx.onAgentToken ? ((delta: string, total: string) => ctx.onAgentToken!(criticAgentKey, delta, total)) : undefined
  const { output, usage } = await dispatchSpecialistAgent({
    agentKey: criticAgentKey,
    task: promptTask,
    ctx,
    onToken,
  })

  const verdict = parseVerdict(output)

  const responseEvent: ChatTrailEvent = {
    type: 'agent_response',
    agent_key: criticAgentKey,
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
