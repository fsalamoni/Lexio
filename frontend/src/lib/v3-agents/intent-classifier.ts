import {
  buildCaseContextBlock,
  runLLMAgent,
  safeParseJson,
  type AgentRunContext,
  type AgentRunResult,
  type IntentSummary,
} from './types'

const SYSTEM = [
  'Você é o CLASSIFICADOR DE INTENÇÃO de uma equipe jurídica multi-agente.',
  'Sua função é classificar a solicitação do usuário em uma única passada,',
  'sem inventar fatos não presentes no enunciado.',
  '',
  'Responda APENAS JSON puro (sem markdown, sem texto extra), no formato:',
  '{',
  '  "classification": "tipo macro de demanda (ex: petição inicial cível, parecer consultivo, recurso de apelação)",',
  '  "complexity": 1-5,',
  '  "urgency": 1-5,',
  '  "notes": "observação curta em 1-2 frases"',
  '}',
].join('\n')

export interface IntentClassifierResult extends IntentSummary {}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.round(num)))
}

export async function runIntentClassifier(
  ctx: AgentRunContext,
): Promise<AgentRunResult<IntentClassifierResult>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, { include: [] }),
    '',
    'Classifique conforme instruído.',
  ].join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 400, temperature: 0.1 })
  const { parsed } = safeParseJson<Partial<IntentClassifierResult>>(llmResult.content)

  const output: IntentClassifierResult = {
    classification: typeof parsed?.classification === 'string' && parsed.classification.trim()
      ? parsed.classification.trim()
      : ctx.caseContext.docTypeLabel,
    complexity: clamp(parsed?.complexity, 1, 5, 3),
    urgency: clamp(parsed?.urgency, 1, 5, 3),
    notes: typeof parsed?.notes === 'string' ? parsed.notes.trim() : '',
  }

  return { output, llmResult }
}
