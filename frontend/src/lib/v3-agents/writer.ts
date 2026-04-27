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
  'REGRAS DE FORMA:',
  '- Texto puro, sem markdown.',
  '- Títulos em MAIÚSCULAS, separados por linha em branco.',
  '- Mantenha rigor formal e técnico.',
  '- Use SOMENTE as informações do contexto. NÃO invente fatos, números de',
  '  processos ou referências doutrinárias não presentes na pesquisa verificada.',
  '- Adote o estilo, formalidade e expressões preferidas do perfil do usuário,',
  '  quando informado.',
  '- O texto deve ser autossuficiente e pronto para uso.',
  '',
  'REGRAS DE FUNDAMENTAÇÃO (ANTI-SUPERFICIALIDADE):',
  'Cada argumento jurídico deve ser CONSTRUÍDO em quatro etapas explícitas,',
  'expostas no próprio texto (sem rótulos visíveis, mas presentes na lógica):',
  '  (1) PREMISSA NORMATIVA — apresente o dispositivo legal, súmula, precedente',
  '      ou posição doutrinária que abre o argumento.',
  '  (2) DESENVOLVIMENTO LÓGICO-JURÍDICO — explique o sentido e o alcance da',
  '      premissa, conectando-a a princípios, finalidades e ao sistema jurídico.',
  '      Trabalhe a ratio decidendi, distinções e analogias quando cabíveis.',
  '  (3) APLICAÇÃO AO CASO — subsuma os fatos do caso à premissa desenvolvida,',
  '      demonstrando, passo a passo, por que ela incide e quais consequências',
  '      jurídicas dela decorrem para o pedido formulado.',
  '  (4) CONCLUSÃO PARCIAL — feche o raciocínio com a tese sustentada antes de',
  '      passar ao próximo argumento.',
  '',
  'APROFUNDAMENTO OBRIGATÓRIO:',
  '- Após CADA citação (lei, súmula, julgado ou doutrina), escreva 2 a 4',
  '  períodos explicando POR QUE o dispositivo/precedente se aplica e COMO ele',
  '  sustenta a tese — nunca deixe a citação isolada.',
  '- Cada SEÇÃO argumentativa deve ter, no mínimo, 3 parágrafos de',
  '  fundamentação além das citações; argumentos centrais merecem 4 ou mais.',
  '- Encadeie expressamente os argumentos com conectores jurídicos ("nesse',
  '  passo", "por consequência", "à luz do exposto", "complementa esse',
  '  raciocínio") evitando texto telegráfico ou em forma de lista de citações.',
  '- Quando houver mais de uma fonte (lei + jurisprudência + doutrina) sobre o',
  '  mesmo ponto, ARTICULE-AS no parágrafo, mostrando convergência ou',
  '  diferenças e por que reforçam a conclusão.',
  '- Evite parágrafos de uma única frase em seções argumentativas; prefira',
  '  parágrafos densos que desenvolvam o raciocínio até a conclusão parcial.',
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
    maxTokens: options?.maxTokens ?? 9000,
    temperature: options?.temperature ?? 0.3,
  })
  return { output: llmResult.content.trim(), llmResult }
}
