import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
  type ResearchSection,
} from './types'

const SYSTEM = [
  'Você é o PESQUISADOR DE JURISPRUDÊNCIA. Identifique julgados RELEVANTES',
  'para sustentar as teses refinadas: STF, STJ, tribunais regionais e súmulas.',
  '',
  'IMPORTANTE:',
  '- Não invente números de processo. Quando não tiver alta confiança em um número',
  '  específico, use formulações como "REsp/2.ª Turma do STJ tem precedente no sentido".',
  '- Indique órgão julgador, ano e tese fixada (resumida).',
  '- Sinalize entendimentos divergentes/superados quando relevante.',
  '',
  'Formato (markdown):',
  '## Precedente — <ementa resumida>',
  '- Órgão: ...',
  '- Referência: ...',
  '- Tese fixada: ...',
  '- Conexão: Tese N — ...',
  '',
  'Comece direto, sem preâmbulos.',
].join('\n')

export async function runJurisprudenceResearcher(ctx: AgentRunContext): Promise<AgentRunResult<ResearchSection>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['briefings', 'legalIssues', 'refinedTheses'],
    }),
    ctx.caseContext.briefings?.pesquisa
      ? `\nBriefing de pesquisa:\n${ctx.caseContext.briefings.pesquisa}`
      : '',
    '',
    'Liste os precedentes conforme instruído.',
  ].filter(Boolean).join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 1800, temperature: 0.25 })
  return { output: { text: llmResult.content.trim() }, llmResult }
}
