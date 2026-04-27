import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
  type ResearchSection,
} from './types'

const SYSTEM = [
  'Você é o PESQUISADOR DE LEGISLAÇÃO. Identifique a legislação ATUALIZADA',
  'aplicável às teses refinadas: Constituição, leis ordinárias, códigos,',
  'normas infralegais e súmulas vinculantes pertinentes.',
  '',
  'IMPORTANTE:',
  '- Cite somente normas que você tem alta confiança de existirem.',
  '- Indique sempre o artigo e a vigência (mencione "vigente" ou ano da norma).',
  '- Quando não houver legislação direta, cite o princípio aplicável.',
  '',
  'Formato (markdown):',
  '## Norma — <título>',
  '- Dispositivo: art. X, Lei Y/AAAA',
  '- Conteúdo essencial: ...',
  '- Conexão com a tese: Tese N — ...',
  '',
  'Comece direto, sem preâmbulos.',
].join('\n')

export async function runLegislationResearcher(ctx: AgentRunContext): Promise<AgentRunResult<ResearchSection>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['briefings', 'legalIssues', 'refinedTheses'],
    }),
    ctx.caseContext.briefings?.pesquisa
      ? `\nBriefing de pesquisa:\n${ctx.caseContext.briefings.pesquisa}`
      : '',
    '',
    'Liste a legislação aplicável conforme instruído.',
  ].filter(Boolean).join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 1800, temperature: 0.2 })
  return { output: { text: llmResult.content.trim() }, llmResult }
}
