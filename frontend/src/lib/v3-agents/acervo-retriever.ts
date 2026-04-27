import { getAllAcervoDocumentsForSearch } from '../firestore-service'
import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
} from './types'

const SYSTEM = [
  'Você é o BUSCADOR DE ACERVO. Recebe uma lista de documentos do acervo do',
  'usuário (filename + ementa curta) e seleciona os MAIS RELEVANTES para o caso.',
  '',
  'Responda SOMENTE com uma lista numerada (no máximo 5 itens) no formato:',
  '1. <filename> — <razão da escolha em 1 frase>',
].join('\n')

export interface AcervoRetrievalResult {
  /** Concatenated snippets ready to be injected in downstream agents. */
  snippets: string
  /** Filenames that were selected. */
  selectedFilenames: string[]
}

const MAX_DOCS_LISTED = 25
const MAX_SNIPPET_CHARS = 1200

export async function runAcervoRetriever(
  ctx: AgentRunContext,
  uid: string,
): Promise<AgentRunResult<AcervoRetrievalResult> | { output: AcervoRetrievalResult; llmResult: null }> {
  let allDocs: Awaited<ReturnType<typeof getAllAcervoDocumentsForSearch>> = []
  try {
    allDocs = await getAllAcervoDocumentsForSearch(uid)
  } catch {
    allDocs = []
  }

  if (allDocs.length === 0) {
    return { output: { snippets: '', selectedFilenames: [] }, llmResult: null }
  }

  // Pre-list a manageable subset (recently created first if available)
  const subset = allDocs.slice(0, MAX_DOCS_LISTED)
  const lines = subset.map((d, idx) => {
    const ementa = (d.ementa || '').trim().slice(0, 240)
    return `${idx + 1}. ${d.filename}${ementa ? ` — ${ementa}` : ''}`
  }).join('\n')

  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, { include: ['briefings', 'legalIssues'] }),
    '',
    'Documentos disponíveis:',
    lines,
    '',
    'Selecione os mais relevantes (no máximo 5).',
  ].join('\n')

  const llmResult = await runLLMAgent(ctx, SYSTEM, userPrompt, { maxTokens: 600, temperature: 0.1 })

  const selectedFilenames: string[] = []
  for (const line of llmResult.content.split('\n')) {
    const match = line.match(/^\s*\d+\.\s*([^\s—-][^—-]*?)\s*[—-]/)
    if (match) {
      const name = match[1].trim()
      if (name && !selectedFilenames.includes(name)) selectedFilenames.push(name)
    }
  }

  const selectedDocs = subset.filter(d => selectedFilenames.includes(d.filename))
  const snippets = selectedDocs
    .map(d => `### ${d.filename}\n${(d.ementa || d.text_content || '').slice(0, MAX_SNIPPET_CHARS)}`)
    .join('\n\n')

  return {
    output: { snippets, selectedFilenames },
    llmResult,
  }
}
