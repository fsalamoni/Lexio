import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
  type DocumentOutline,
} from './types'

const SYSTEM = [
  'Você é o PLANEJADOR DA ESTRUTURA do documento jurídico final.',
  'A partir do contexto completo (questões, teses refinadas, pesquisa, citações),',
  'planeje as SEÇÕES e a ORDEM IDEAL para o documento final.',
  '',
  'Para cada seção indique:',
  '- Título',
  '- Objetivo',
  '- Conteúdos a abordar (bullet points)',
  '- Teses/Pesquisa a citar',
  '',
  'Quando uma estrutura específica for fornecida (custom_structure), respeite-a',
  'integralmente. Saída em markdown.',
].join('\n')

export async function runOutlinePlanner(
  ctx: AgentRunContext,
  customStructure?: string,
): Promise<AgentRunResult<DocumentOutline>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['intent', 'parsedFacts', 'legalIssues', 'briefings', 'refinedTheses', 'legislation', 'jurisprudence', 'doctrine', 'citationCheck'],
    }),
    customStructure ? `\n<custom_structure>\n${customStructure}\n</custom_structure>` : '',
    ctx.profileBlock,
    '',
    'Planeje a estrutura conforme instruído.',
  ].filter(Boolean).join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 1800, temperature: 0.25 })
  return { output: { text: llmResult.content.trim() }, llmResult }
}
