import { callLLMWithFallback, type LLMResult } from '../llm-client'
import {
  searchDataJud,
  formatDataJudResults,
  DEFAULT_TRIBUNALS,
  type DataJudResult,
} from '../datajud-service'
import {
  JURISPRUDENCE_RANKING_SYSTEM,
  JURISPRUDENCE_SYNTHESIS_SYSTEM,
} from '../jurisprudence-prompts'
import {
  buildCaseContextBlock,
  runLLMAgent,
  type AgentRunContext,
  type AgentRunResult,
  type ResearchSection,
} from './types'

/** Same parameters used by the Research Notebook (`searchDataJud` config). */
const MAX_PER_TRIBUNAL = 5
const MAX_TEXT_ENRICHMENT = 10
/** Max number of selected results passed to ranking + synthesis. */
const MAX_RESULTS_FOR_LLM = 12
/** Cap query length to keep the DataJud Elasticsearch payload reasonable. */
const MAX_QUERY_CHARS = 280

const LEGACY_FALLBACK_SYSTEM = [
  'Você é o PESQUISADOR DE JURISPRUDÊNCIA. Identifique julgados RELEVANTES',
  'para sustentar as teses refinadas: STF, STJ, tribunais regionais e súmulas.',
  '',
  'IMPORTANTE:',
  '- Não invente números de processo. Quando não tiver alta confiança em um número',
  '  específico, use formulações como "REsp/2.ª Turma do STJ tem precedente no sentido".',
  '- Indique órgão julgador, ano e tese fixada (resumida).',
  '- Sinalize entendimentos divergentes/superados quando relevante.',
  '',
  'Formato (markdown):',
  '## Precedente — <ementa resumida>',
  '- Órgão: ...',
  '- Referência: ...',
  '- Tese fixada: ...',
  '- Conexão: Tese N — ...',
  '',
  'Comece direto, sem preâmbulos.',
].join('\n')

export interface JurisprudenceResearcherOptions {
  /** Optional override for the LLM model used to RANK the DataJud results. */
  rankerModel?: string
  /** Optional override for the LLM model used to SYNTHESIZE the final markdown. */
  synthesisModel?: string
  /** Optional progress callback to report substeps to the orchestrator UI. */
  onSubstep?: (message: string) => void
}

interface RankedItem {
  index: number
  score: number
  stance?: 'favoravel' | 'desfavoravel' | 'neutro'
}

const VALID_STANCES: ReadonlyArray<RankedItem['stance']> = ['favoravel', 'desfavoravel', 'neutro']

/** Build a focused query string from the case context. */
function buildJurisprudenceQuery(ctx: AgentRunContext): string {
  const parts: string[] = []
  const tema = ctx.caseContext.briefings?.tema?.trim()
  if (tema) parts.push(tema)
  const palavrasChave = ctx.caseContext.briefings?.palavrasChave ?? []
  if (palavrasChave.length > 0) parts.push(palavrasChave.slice(0, 6).join(' '))
  const titles = ctx.caseContext.refinedTheses?.titles ?? ctx.caseContext.theses?.titles ?? []
  if (titles.length > 0) parts.push(titles.slice(0, 3).join(' '))
  // Fallback to the original request if nothing else is available.
  if (parts.length === 0) parts.push(ctx.caseContext.request)
  const joined = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return joined.length > MAX_QUERY_CHARS ? joined.slice(0, MAX_QUERY_CHARS) : joined
}

function rankResults(
  ctx: AgentRunContext,
  query: string,
  results: DataJudResult[],
  options: JurisprudenceResearcherOptions,
): Promise<{ ranked: DataJudResult[]; llmResult: LLMResult } | null> {
  const rankerModel = options.rankerModel?.trim()
  if (!rankerModel) return Promise.resolve(null)
  const promise = (async () => {
    const userPrompt = `Consulta: "${query}"\n\nProcessos para avaliar:\n${formatDataJudResults(results)}`
    const llmResult = await callLLMWithFallback(
      ctx.apiKey,
      JURISPRUDENCE_RANKING_SYSTEM,
      userPrompt,
      rankerModel,
      ctx.fallbackModel,
      800,
      0.1,
      { signal: ctx.signal },
    )
    let ranked = results
    try {
      const cleaned = llmResult.content.replace(/```(?:json)?\s*/g, '').trim()
      const parsed = JSON.parse(cleaned) as { ranking?: RankedItem[] }
      if (parsed.ranking && Array.isArray(parsed.ranking)) {
        const sorted = parsed.ranking
          .filter(r => Number.isFinite(r.index) && r.index >= 1 && r.index <= results.length)
          .sort((a, b) => b.score - a.score)
        const reordered: DataJudResult[] = []
        const seen = new Set<number>()
        for (const item of sorted) {
          const idx = item.index - 1
          if (seen.has(idx)) continue
          const process = results[idx]
          if (!process) continue
          seen.add(idx)
          const enriched: DataJudResult = { ...process, relevanceScore: item.score }
          const stance = item.stance
          if (stance && VALID_STANCES.includes(stance)) enriched.stance = stance
          reordered.push(enriched)
        }
        if (reordered.length > 0) ranked = reordered
      }
    } catch {
      // Keep original order on parse failure.
    }
    return { ranked, llmResult }
  })()
  return promise
}

async function synthesize(
  ctx: AgentRunContext,
  query: string,
  results: DataJudResult[],
  options: JurisprudenceResearcherOptions,
): Promise<{ text: string; llmResult: LLMResult }> {
  const synthesisModel = options.synthesisModel?.trim() || ctx.model
  const textContent = formatDataJudResults(results)
  const userPrompt = [
    `Consulta do usuário: "${query}"`,
    '',
    `Resultados DataJud (${results.length} processos selecionados, ordenados por relevância):`,
    textContent,
    '',
    'Produza uma síntese objetiva e acionável para uso na redação do documento.',
    'Destaque padrões nas movimentações processuais que indiquem tendências de',
    'julgamento e relacione cada precedente-chave às teses do caso (quando possível).',
  ].join('\n')
  const llmResult = await callLLMWithFallback(
    ctx.apiKey,
    JURISPRUDENCE_SYNTHESIS_SYSTEM,
    userPrompt,
    synthesisModel,
    ctx.fallbackModel,
    2800,
    0.2,
    { signal: ctx.signal },
  )
  return { text: llmResult.content.trim(), llmResult }
}

async function runLegacyLLMOnly(ctx: AgentRunContext): Promise<AgentRunResult<ResearchSection>> {
  const userPrompt = [
    buildCaseContextBlock(ctx.caseContext, {
      include: ['briefings', 'legalIssues', 'refinedTheses'],
    }),
    ctx.caseContext.briefings?.pesquisa
      ? `\nBriefing de pesquisa:\n${ctx.caseContext.briefings.pesquisa}`
      : '',
    '',
    'Liste os precedentes conforme instruído.',
  ].filter(Boolean).join('\n')
  const llmResult = await runLLMAgent(ctx, LEGACY_FALLBACK_SYSTEM, userPrompt, {
    maxTokens: 1800,
    temperature: 0.25,
  })
  return { output: { text: llmResult.content.trim() }, llmResult }
}

export async function runJurisprudenceResearcher(
  ctx: AgentRunContext,
  options: JurisprudenceResearcherOptions = {},
): Promise<AgentRunResult<ResearchSection>> {
  const onSubstep = options.onSubstep ?? (() => {})

  const query = buildJurisprudenceQuery(ctx)
  if (!query) return runLegacyLLMOnly(ctx)

  // Step 1: Real DataJud search using the same parameters as the notebook.
  let dj
  try {
    onSubstep(`Consultando ${DEFAULT_TRIBUNALS.length} tribunais no DataJud...`)
    dj = await searchDataJud(query, {
      tribunals: DEFAULT_TRIBUNALS,
      maxPerTribunal: MAX_PER_TRIBUNAL,
      enrichMissingText: true,
      maxTextEnrichment: MAX_TEXT_ENRICHMENT,
      signal: ctx.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    onSubstep('DataJud indisponível — usando fallback LLM-only para jurisprudência.')
    return runLegacyLLMOnly(ctx)
  }

  if (!dj.results || dj.results.length === 0) {
    onSubstep('Sem resultados no DataJud — usando fallback LLM-only para jurisprudência.')
    return runLegacyLLMOnly(ctx)
  }

  const initialPool = dj.results.slice(0, MAX_RESULTS_FOR_LLM)
  onSubstep(`${dj.results.length} julgado(s) recuperado(s); ranqueando os ${initialPool.length} mais aderentes...`)

  // Step 2: Rank with LLM (optional — only if a ranker model was supplied).
  const extras: Array<{ phase: string; agentName: string; llmResult: LLMResult }> = []
  let ranked: DataJudResult[] = initialPool
  try {
    const rankResult = await rankResults(ctx, query, initialPool, options)
    if (rankResult) {
      ranked = rankResult.ranked
      extras.push({
        phase: 'notebook_ranqueador_jurisprudencia',
        agentName: 'Ranqueador de Jurisprudência (v3)',
        llmResult: rankResult.llmResult,
      })
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    onSubstep('Ranqueamento LLM falhou — mantendo a ordem retornada pelo DataJud.')
  }

  // Step 3: Synthesize the final markdown using real precedents.
  onSubstep('Sintetizando jurisprudência real para a redação...')
  let synth
  try {
    synth = await synthesize(ctx, query, ranked, options)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    onSubstep('Síntese de jurisprudência falhou — usando fallback LLM-only.')
    return runLegacyLLMOnly(ctx)
  }

  return {
    output: { text: synth.text },
    llmResult: synth.llmResult,
    extraExecutions: extras,
  }
}
