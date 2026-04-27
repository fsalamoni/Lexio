import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
  type BuiltTheses,
  type ThesisCritique,
} from './types'

const SYSTEM = [
  'Você é o REFINADOR DE TESES. Recebe as teses iniciais e a crítica do',
  'advogado do diabo. Reescreva as teses INCORPORANDO as críticas válidas e',
  'ANTECIPANDO os contra-argumentos identificados. Mantenha o formato de teses',
  'numeradas e a conexão com cada questão jurídica.',
  '',
  'Formato (markdown):',
  '## Tese 1 — <título>',
  '<argumentação refinada>',
  '',
  'Comece direto, sem preâmbulos.',
].join('\n')

export async function runThesisRefiner(
  ctx: AgentRunContext,
  critique: ThesisCritique,
): Promise<AgentRunResult<BuiltTheses>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['intent', 'parsedFacts', 'legalIssues', 'briefings', 'theses'],
    }),
    '',
    '<critica_advogado_diabo>',
    critique.text,
    '</critica_advogado_diabo>',
    '',
    'Reescreva as teses incorporando a crítica.',
  ].join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 3200, temperature: 0.25 })
  const titles = (llmResult.content.match(/^##\s+([^\n]+)/gm) || [])
    .map(line => line.replace(/^##\s+/, '').trim())

  return { output: { text: llmResult.content.trim(), titles }, llmResult }
}
