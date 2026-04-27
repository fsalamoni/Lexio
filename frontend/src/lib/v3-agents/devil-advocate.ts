import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
  type ThesisCritique,
} from './types'

const SYSTEM = [
  'Você é o ADVOGADO DO DIABO. Sua missão é encontrar as FRAQUEZAS, contradições',
  'e contra-argumentos das teses propostas. Não amenize: aponte explicitamente',
  'cada vulnerabilidade que a parte contrária poderia explorar.',
  '',
  'Formato (markdown):',
  '## Crítica à Tese N',
  '- Fraqueza: ...',
  '- Risco processual: ...',
  '- Contra-argumento provável da parte contrária: ...',
  '- Sugestão de reforço: ...',
  '',
  'Comece direto. Sem preâmbulos.',
].join('\n')

export async function runDevilAdvocate(ctx: AgentRunContext): Promise<AgentRunResult<ThesisCritique>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['intent', 'parsedFacts', 'legalIssues', 'briefings', 'theses'],
    }),
    '',
    'Critique cada tese conforme instruído.',
  ].join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 1800, temperature: 0.4 })
  const text = llmResult.content.trim()
  const weaknesses = (text.match(/\bFraqueza\s*:/gi) || []).length

  return { output: { text, weaknesses }, llmResult }
}
