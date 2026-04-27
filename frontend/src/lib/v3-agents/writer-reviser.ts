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
    maxTokens: 6500,
    temperature: 0.2,
  })
  return { output: llmResult.content.trim(), llmResult }
}
