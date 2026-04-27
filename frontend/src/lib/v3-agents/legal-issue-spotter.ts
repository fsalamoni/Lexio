import {
  buildCaseContextBlock,
  runLLMAgent,
  safeParseJson,
  type AgentRunContext,
  type AgentRunResult,
  type LegalIssue,
} from './types'

const SYSTEM = [
  'Você é o IDENTIFICADOR DE QUESTÕES JURÍDICAS.',
  'A partir do contexto fornecido, identifique TODAS as questões jurídicas',
  'implicadas (substantivas e processuais). Não invente questões não amparadas',
  'pelos fatos. Cada questão deve ser independente e relevante para a estratégia.',
  '',
  'Responda APENAS JSON puro, no formato:',
  '{',
  '  "issues": [',
  '    { "id": "Q1", "titulo": "frase curta", "resumo": "1-2 frases", "areas": ["civil", "consumer"] }',
  '  ]',
  '}',
].join('\n')

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean)
}

export async function runLegalIssueSpotter(ctx: AgentRunContext): Promise<AgentRunResult<LegalIssue[]>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext),
    '',
    'Liste as questões jurídicas conforme o esquema.',
  ].join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 1100, temperature: 0.15 })
  const { parsed } = safeParseJson<{ issues?: Array<Partial<LegalIssue>> }>(llmResult.content)

  const issues: LegalIssue[] = []
  const rawList = Array.isArray(parsed?.issues) ? parsed!.issues! : []
  rawList.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') return
    const titulo = typeof raw.titulo === 'string' ? raw.titulo.trim() : ''
    const resumo = typeof raw.resumo === 'string' ? raw.resumo.trim() : ''
    if (!titulo && !resumo) return
    issues.push({
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `Q${idx + 1}`,
      titulo: titulo || `Questão ${idx + 1}`,
      resumo: resumo || titulo,
      areas: asStringArray(raw.areas),
    })
  })

  if (issues.length === 0) {
    issues.push({
      id: 'Q1',
      titulo: ctx.caseContext.docTypeLabel,
      resumo: ctx.caseContext.request.slice(0, 240),
      areas: ctx.caseContext.areas,
    })
  }

  return { output: issues, llmResult }
}
