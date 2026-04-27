import {
  buildCaseContextBlock,
  runLLMAgent,
  safeParseJson,
  type AgentRunContext,
  type AgentRunResult,
  type AgentBriefings,
} from './types'

const SYSTEM = [
  'Você é o ARQUITETO DE PROMPTS da equipe v3.',
  'Sua função é consolidar a compreensão produzida pelos agentes anteriores e',
  'gerar BRIEFINGS focados para as próximas fases (análise, pesquisa, redação).',
  'Os briefings devem ser concisos (1-3 parágrafos cada) e instruir os agentes',
  'sobre PRIORIDADES e RISCOS específicos do caso, sem inventar fatos.',
  '',
  'Responda APENAS JSON puro, no formato:',
  '{',
  '  "tema": "frase única que sintetiza o tema",',
  '  "subtemas": ["..."],',
  '  "palavrasChave": ["..."],',
  '  "analise": "briefing para os agentes da Fase 2 (Analista jurídico)",',
  '  "pesquisa": "briefing para os agentes da Fase 3 (Pesquisa)",',
  '  "redacao": "briefing para os agentes da Fase 4 (Redação)"',
  '}',
].join('\n')

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean)
}

export async function runPromptArchitect(ctx: AgentRunContext): Promise<AgentRunResult<AgentBriefings>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, { include: ['intent', 'parsedFacts', 'legalIssues'] }),
    '',
    'Gere os briefings para as próximas fases.',
  ].join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 1500, temperature: 0.3 })
  const { parsed } = safeParseJson<Partial<AgentBriefings>>(llmResult.content)

  const fallbackTema = ctx.caseContext.legalIssues?.[0]?.titulo
    ?? ctx.caseContext.intent?.classification
    ?? ctx.caseContext.docTypeLabel

  const output: AgentBriefings = {
    tema: typeof parsed?.tema === 'string' && parsed.tema.trim() ? parsed.tema.trim() : fallbackTema,
    subtemas: asStringArray(parsed?.subtemas),
    palavrasChave: asStringArray(parsed?.palavrasChave),
    analise: typeof parsed?.analise === 'string' ? parsed.analise.trim() : '',
    pesquisa: typeof parsed?.pesquisa === 'string' ? parsed.pesquisa.trim() : '',
    redacao: typeof parsed?.redacao === 'string' ? parsed.redacao.trim() : '',
  }
  return { output, llmResult }
}
