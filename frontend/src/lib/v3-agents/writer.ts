import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
} from './types'

const SYSTEM = [
  'Você é o REDATOR jurídico. Sua missão é redigir o DOCUMENTO COMPLETO,',
  'seguindo o plano da estrutura, as teses refinadas e a pesquisa verificada.',
  '',
  'REGRAS:',
  '- Texto puro, sem markdown.',
  '- Títulos em MAIÚSCULAS, separados por linha em branco.',
  '- Mantenha rigor formal e técnico.',
  '- Use SOMENTE as informações do contexto. NÃO invente fatos, números de',
  '  processos ou referências doutrinárias não presentes na pesquisa verificada.',
  '- Adote o estilo, formalidade e expressões preferidas do perfil do usuário,',
  '  quando informado.',
  '- O texto deve ser autossuficiente e pronto para uso.',
].join('\n')

export interface WriterOptions {
  maxTokens?: number
  temperature?: number
}

export async function runWriter(
  ctx: AgentRunContext,
  options?: WriterOptions,
): Promise<AgentRunResult<string>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['intent', 'parsedFacts', 'legalIssues', 'briefings', 'refinedTheses', 'legislation', 'jurisprudence', 'doctrine', 'citationCheck', 'outline'],
    }),
    ctx.profileBlock,
    '',
    'Redija o documento completo.',
  ].filter(Boolean).join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, {
    maxTokens: options?.maxTokens ?? 6500,
    temperature: options?.temperature ?? 0.3,
  })
  return { output: llmResult.content.trim(), llmResult }
}
