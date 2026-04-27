import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
  type CitationVerification,
} from './types'

const SYSTEM = [
  'Você é o VERIFICADOR DE CITAÇÕES. Recebe a pesquisa de legislação,',
  'jurisprudência e doutrina e verifica:',
  '1. Se as citações de artigos/leis estão coerentes (número, ano, alcance).',
  '2. Se as referências jurisprudenciais usam linguagem prudente quando o número',
  '   exato do processo não puder ser confirmado.',
  '3. Se as referências doutrinárias não atribuem ideias incorretamente.',
  '',
  'Quando identificar uma imprecisão evidente, REESCREVA a referência de forma',
  'mais segura (sem inventar). Quando a citação parecer plausível, mantenha-a.',
  '',
  'Formato (markdown):',
  '## Resumo da verificação',
  '- Itens verificados: N',
  '- Correções aplicadas: M',
  '',
  '## Correções',
  '- Antes: <citação original>',
  '- Depois: <citação revisada>',
  '- Motivo: ...',
  '',
  'Se nenhuma correção for necessária, escreva "## Sem correções" após o resumo.',
].join('\n')

export async function runCitationVerifier(ctx: AgentRunContext): Promise<AgentRunResult<CitationVerification>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['briefings', 'legislation', 'jurisprudence', 'doctrine'],
    }),
    '',
    'Verifique as citações e corrija imprecisões aparentes.',
  ].join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 1400, temperature: 0.1 })
  const text = llmResult.content.trim()
  const corrections = (text.match(/\bAntes\s*:/gi) || []).length
  return { output: { text, corrections }, llmResult }
}
