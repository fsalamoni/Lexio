import {
  buildCaseContextBlock,
  runLLMAgent,
  safeParseJson,
  type AgentRunContext,
  type AgentRunResult,
  type ParsedRequest,
} from './types'

const SYSTEM = [
  'Você é o PARSER da solicitação jurídica. Extraia as informações ESSENCIAIS',
  'da solicitação do usuário SEM inventar dados. Se um campo não estiver presente',
  'no enunciado, retorne lista vazia ou string vazia para esse campo.',
  '',
  'Responda APENAS JSON puro, no formato:',
  '{',
  '  "partes": ["..."],',
  '  "fatos": ["fato 1", "fato 2"],',
  '  "pedidos": ["..."],',
  '  "prazos": ["..."],',
  '  "jurisdicao": "tribunal/comarca quando indicado",',
  '  "observacoes": "notas relevantes"',
  '}',
].join('\n')

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim())
    .filter(Boolean)
}

export async function runRequestParser(ctx: AgentRunContext): Promise<AgentRunResult<ParsedRequest>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, { include: [] }),
    '',
    'Extraia as informações conforme o esquema.',
  ].join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 900, temperature: 0.1 })
  const { parsed } = safeParseJson<Partial<ParsedRequest>>(llmResult.content)

  const output: ParsedRequest = {
    partes: asStringArray(parsed?.partes),
    fatos: asStringArray(parsed?.fatos),
    pedidos: asStringArray(parsed?.pedidos),
    prazos: asStringArray(parsed?.prazos),
    jurisdicao: typeof parsed?.jurisdicao === 'string' ? parsed.jurisdicao.trim() : undefined,
    observacoes: typeof parsed?.observacoes === 'string' ? parsed.observacoes.trim() : undefined,
  }
  return { output, llmResult }
}
