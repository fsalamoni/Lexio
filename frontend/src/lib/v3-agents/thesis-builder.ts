import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
  type BuiltTheses,
} from './types'

const SYSTEM = [
  'Você é o CONSTRUTOR DE TESES. Para CADA questão jurídica identificada,',
  'desenvolva argumentação ROBUSTA e fundamentada, ancorada nos fatos do caso',
  'e no perfil do usuário (quando aplicável). Use o material de base do acervo',
  'e as teses do banco quando relevantes. NÃO invente jurisprudência ou doutrina',
  '— a pesquisa será feita em fase posterior; aqui foque na ESTRUTURA argumentativa',
  'e na linha de raciocínio jurídico.',
  '',
  'Formato (markdown):',
  '## Tese 1 — <título da questão>',
  '<argumentação completa em parágrafos>',
  '',
  '## Tese 2 — ...',
  '',
  'Comece direto. Sem preâmbulos.',
].join('\n')

export async function runThesisBuilder(ctx: AgentRunContext): Promise<AgentRunResult<BuiltTheses>> {
  const briefing = ctx.caseContext.briefings?.analise
  const acervo = ctx.caseContext.acervoSnippets
  const teses = ctx.caseContext.thesisSnippets

  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, { include: ['intent', 'parsedFacts', 'legalIssues', 'briefings'] }),
    briefing ? `\nBriefing do arquiteto:\n${briefing}` : '',
    acervo ? `\n<acervo_relevante>\n${acervo}\n</acervo_relevante>` : '',
    teses ? `\n<banco_de_teses>\n${teses}\n</banco_de_teses>` : '',
    ctx.profileBlock,
    '',
    'Desenvolva as teses conforme instruído.',
  ].filter(Boolean).join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 3200, temperature: 0.3 })

  const titles = (llmResult.content.match(/^##\s+([^\n]+)/gm) || [])
    .map(line => line.replace(/^##\s+/, '').trim())
    .filter(Boolean)

  return { output: { text: llmResult.content.trim(), titles }, llmResult }
}
