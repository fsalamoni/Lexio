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
  '- LINHA DE RACIOCÍNIO esperada — descreva, em uma frase para cada etapa, a',
  '  sequência argumentativa: (a) PREMISSA NORMATIVA que abre a seção,',
  '  (b) DESENVOLVIMENTO LÓGICO-JURÍDICO (sentido, alcance, princípios),',
  '  (c) APLICAÇÃO ao caso concreto, e (d) FECHAMENTO / conclusão parcial.',
  '- PONTOS DE APROFUNDAMENTO — marque expressamente onde o redator deve',
  '  alongar a explicação (mínimo de 3 parágrafos densos), citando os',
  '  fundamentos centrais que exigem desenvolvimento mais detalhado em vez de',
  '  meras citações.',
  '',
  'Quando uma estrutura específica for fornecida (custom_structure), respeite-a',
  'integralmente, mas continue indicando linha de raciocínio e pontos de',
  'aprofundamento dentro de cada seção exigida pela estrutura.',
  'Saída em markdown.',
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
