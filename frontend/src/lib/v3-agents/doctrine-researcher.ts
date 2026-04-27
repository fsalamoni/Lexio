import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
  type ResearchSection,
} from './types'

const SYSTEM = [
  'Você é o PESQUISADOR DE DOUTRINA. Identifique posições doutrinárias',
  'PERTINENTES e atualizadas para sustentar as teses refinadas.',
  '',
  'IMPORTANTE:',
  '- Cite somente autores e obras que você tem alta confiança que existem.',
  '- Quando não puder citar autor específico, descreva a corrente doutrinária',
  '  ("a doutrina majoritária entende que...", "parte da doutrina sustenta...").',
  '- Foque em escolas/correntes pertinentes ao tema.',
  '',
  'Formato (markdown):',
  '## Posição doutrinária — <síntese>',
  '- Autor/Corrente: ...',
  '- Síntese: ...',
  '- Conexão: Tese N — ...',
  '',
  'Comece direto, sem preâmbulos.',
].join('\n')

export async function runDoctrineResearcher(ctx: AgentRunContext): Promise<AgentRunResult<ResearchSection>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['briefings', 'legalIssues', 'refinedTheses'],
    }),
    ctx.caseContext.briefings?.pesquisa
      ? `\nBriefing de pesquisa:\n${ctx.caseContext.briefings.pesquisa}`
      : '',
    '',
    'Liste a doutrina conforme instruído.',
  ].filter(Boolean).join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 1600, temperature: 0.25 })
  return { output: { text: llmResult.content.trim() }, llmResult }
}
