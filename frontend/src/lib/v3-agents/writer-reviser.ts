import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
} from './types'

const SYSTEM = [
  'Você é o REVISOR DE REDAÇÃO jurídica. Recebe um DOCUMENTO já redigido e uma',
  'lista de CITAÇÕES SUSPEITAS que não foram localizadas no material de pesquisa',
  'verificado. Sua tarefa é reescrever APENAS as passagens que mencionam essas',
  'citações suspeitas, substituindo-as por:',
  '  (a) referência genérica e prudente (ex.: "consoante entendimento dominante",',
  '      "conforme jurisprudência pacificada do STJ"), OU',
  '  (b) supressão controlada da referência mantendo o argumento jurídico, OU',
  '  (c) substituição por citação efetivamente presente no material verificado.',
  '',
  'REGRAS:',
  '- Mantenha o restante do texto INTACTO (mesmas seções, ordem e estilo).',
  '- Não invente novas citações.',
  '- Texto puro, sem markdown.',
  '- Devolva o documento INTEIRO já revisado.',
  '',
  'PRESERVAÇÃO DA PROFUNDIDADE ARGUMENTATIVA:',
  '- NÃO encurte passagens argumentativas. A revisão NÃO pode reduzir o',
  '  tamanho dos parágrafos de fundamentação nem eliminar etapas do',
  '  raciocínio (premissa → desenvolvimento → aplicação → conclusão).',
  '- Ao remover uma citação suspeita, REESCREVA a explicação em torno dela',
  '  para manter (ou reforçar) o desenvolvimento lógico-jurídico, com a mesma',
  '  densidade do parágrafo original.',
  '- Se a passagem original explicava POR QUE e COMO a citação se aplicava,',
  '  preserve essa explicação integralmente, apenas trocando o referente.',
].join('\n')

export interface WriterReviserInput {
  /** The current document text produced by the writer. */
  draft: string
  /** Citations the writer used that were not found in the verified research. */
  unsupportedCitations: string[]
}

export async function runWriterReviser(
  ctx: AgentRunContext,
  input: WriterReviserInput,
): Promise<AgentRunResult<string>> {
  const list = input.unsupportedCitations
    .slice(0, 30)
    .map((c, idx) => `${idx + 1}. ${c}`)
    .join('\n')

  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['briefings', 'legislation', 'jurisprudence', 'doctrine', 'citationCheck'],
    }),
    ctx.profileBlock,
    '',
    '<citacoes_suspeitas>',
    list,
    '</citacoes_suspeitas>',
    '',
    '<documento_atual>',
    input.draft,
    '</documento_atual>',
    '',
    'Revise apenas as passagens que mencionam as citações suspeitas listadas e',
    'devolva o documento completo já revisado.',
  ].filter(Boolean).join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, {
    maxTokens: 9000,
    temperature: 0.2,
  })
  return { output: llmResult.content.trim(), llmResult }
}
