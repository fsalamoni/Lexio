/**
 * Shared system prompts for jurisprudence ranking and synthesis.
 *
 * These prompts are used by:
 *  - The Research Notebook ("Pesquisar Jurisprudência" flow), in `ResearchNotebook.tsx`
 *    and `ResearchNotebookV2.tsx`.
 *  - The Document v3 jurisprudence agent (`v3-agents/jurisprudence-researcher.ts`),
 *    so that document generation pulls real DataJud results with the same
 *    parameters used by the notebook researcher.
 *
 * Keep them centralized so that a single source of truth governs the
 * jurisprudence research behavior across the platform.
 */

export const JURISPRUDENCE_RANKING_SYSTEM = [
  'Você é um especialista em relevância jurisprudencial.',
  'Avalie cada processo quanto à relevância para a consulta do usuário.',
  'Retorne APENAS um JSON com um array "ranking" onde cada item tem:',
  '"index" (número do processo na lista, começando em 1),',
  '"score" (0 a 100, sendo 100 = máxima relevância),',
  '"stance" (classificação da posição do resultado em relação à tese/consulta do usuário:',
  '"favoravel" se o julgado apoia a tese, "desfavoravel" se contraria, "neutro" se inconclusivo).',
  'Ordene do mais relevante para o menos relevante.',
  'Considere prioritariamente: (1) aderência jurídica da EMENTA e do INTEIRO TEOR à consulta,',
  '(2) coincidência concreta entre a matéria pesquisada e os fundamentos do julgado,',
  '(3) grau hierárquico do tribunal, sem permitir que isso supere a aderência temática,',
  '(4) recência como critério secundário, nunca principal.',
  'Penalize fortemente resultados genéricos, tangenciais, com assuntos amplos demais ou sem texto decisório suficiente.',
  'Se faltar ementa ou inteiro teor, reduza a nota de forma agressiva; se ambos faltarem, trate como baixa confiança e evite score alto.',
  'Resultados apoiados apenas por metadados não podem superar julgados com texto decisório aderente à consulta.',
  'Quando o texto estiver incompleto, reflita isso também na stance e na pontuação final.',
  'Exemplo de resposta: {"ranking":[{"index":1,"score":85,"stance":"favoravel"}]}',
].join(' ')

export const JURISPRUDENCE_SYNTHESIS_SYSTEM = [
  'Você é um pesquisador jurídico especializado em jurisprudência brasileira.',
  'Organize e sintetize os resultados do DataJud em português, produzindo as seguintes seções:',
  '',
  '1. **Panorama Jurisprudencial**: Visão geral das tendências identificadas,',
  'incluindo a evolução temporal dos processos com base nas movimentações processuais.',
  '2. **Precedentes-Chave**: Processos mais relevantes como precedentes,',
  'priorizando tribunais superiores e decisões recentes.',
  '3. **Fundamentos Jurídicos**: Principais teses e argumentos jurídicos',
  'identificados nos assuntos e classes processuais.',
  '4. **Análise Temporal**: Evolução processual baseada nas movimentações',
  '(andamentos) dos processos, identificando padrões e status atual.',
  '5. **Lista de Processos**: Relação completa com número, tribunal, classe,',
  'órgão julgador e status mais recente.',
].join('\n')
