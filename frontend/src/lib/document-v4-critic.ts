/**
 * Document v4 — evaluator-optimizer critic pass.
 *
 * After the agent calls `submit_final_answer`, the orchestrator optionally
 * runs a single critic LLM pass. If the verdict score is below the threshold,
 * one revision iteration of the primary agent is triggered (and accepted as
 * the final draft regardless of subsequent quality).
 *
 * Reuses the JSON contract from `chat-orchestrator/skill-registry.ts`
 * (critique_draft): `{score: 0-100, reasons: string[], should_stop: boolean}`.
 */
import { callLLMWithFallback, type LLMResult } from './llm-client'

export interface DocumentV4CriticVerdict {
  score: number
  reasons: string[]
  should_stop: boolean
}

export interface DocumentV4CriticInput {
  apiKey: string
  model: string
  fallbackModels?: readonly string[]
  finalText: string
  docTypeLabel: string
  signal?: AbortSignal
}

export interface DocumentV4CriticResult {
  verdict: DocumentV4CriticVerdict
  llmResult: LLMResult
}

const CRITIC_SYSTEM = [
  'Você é o CRÍTICO de um documento jurídico brasileiro recém-redigido.',
  'Avalie o rascunho final com rigor técnico — completude, fundamentação, ',
  'clareza, ausência de citações não fundamentadas, aderência ao tipo de documento.',
  '',
  'Responda APENAS com JSON válido no formato:',
  '{"score": <0-100>, "reasons": [<motivos curtos>], "should_stop": <true|false>}',
  '',
  '- score baixo (<60) → graves problemas (lacunas, citações suspeitas, raciocínio frágil).',
  '- score médio (60-79) → aprovável mas com melhorias evidentes.',
  '- score alto (≥80) → pronto para entrega.',
  '- should_stop=true APENAS quando o rascunho está pronto para o usuário ler agora.',
].join('\n')

export async function runDocumentV4Critic(input: DocumentV4CriticInput): Promise<DocumentV4CriticResult> {
  const userPrompt = [
    `Tipo do documento: ${input.docTypeLabel}.`,
    '',
    'Rascunho final a avaliar:',
    '"""',
    input.finalText.slice(0, 16_000),
    '"""',
  ].join('\n')
  const llmResult = await callLLMWithFallback(
    input.apiKey,
    CRITIC_SYSTEM,
    userPrompt,
    input.model,
    input.fallbackModels ?? [],
    700,
    0.1,
    { signal: input.signal },
  )
  return { verdict: parseCriticOutput(llmResult.content), llmResult }
}

export function parseCriticOutput(raw: string): DocumentV4CriticVerdict {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) {
      return { score: 0, reasons: ['Falha ao parsear veredito do crítico (sem JSON).'], should_stop: false }
    }
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return { score: 0, reasons: ['Falha ao parsear veredito do crítico (JSON inválido).'], should_stop: false }
    }
  }
  return validate(parsed)
}

function validate(value: unknown): DocumentV4CriticVerdict {
  if (!value || typeof value !== 'object') {
    return { score: 0, reasons: ['Saída do crítico não é objeto JSON.'], should_stop: false }
  }
  const obj = value as Record<string, unknown>
  const scoreRaw = Number(obj.score)
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, scoreRaw)) : 0
  const reasons = Array.isArray(obj.reasons) ? obj.reasons.map(r => String(r)).slice(0, 8) : []
  const shouldStop = Boolean(obj.should_stop)
  return { score, reasons, should_stop: shouldStop }
}
