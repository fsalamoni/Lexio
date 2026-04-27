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

// ── Pós-redação ──────────────────────────────────────────────────────────────

/**
 * Heuristic, deterministic check for citations introduced by the writer that
 * are NOT present in the verified research material. It targets common
 * Brazilian legal citation patterns (REsp, HC, RHC, AgRg, RE, ARE, MS, MI,
 * súmulas, "Lei nº ..." and "art. NN da Lei ..."). Citations present in the
 * research text are considered grounded; citations that appear only in the
 * draft are flagged for revision.
 */
const CITATION_PATTERNS: RegExp[] = [
  /\b(REsp|HC|RHC|AREsp|AgRg|RE|ARE|MS|MI|HCC|EREsp|RMS)\s+n[º°]?\s*[\d.\\/-]+/gi,
  /\bSúmula(?:\s+vinculante)?\s+n[º°]?\s*\d+/gi,
  /\bLei\s+(?:Complementar\s+)?n[º°]?\s*[\d.\\/-]+(?:\/\d{2,4})?/gi,
  /\bDecreto(?:-Lei)?\s+n[º°]?\s*[\d.\\/-]+(?:\/\d{2,4})?/gi,
]

function extractCitations(text: string): string[] {
  const found = new Set<string>()
  for (const pattern of CITATION_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      for (const m of matches) {
        const normalized = m.replace(/\s+/g, ' ').trim()
        if (normalized) found.add(normalized)
      }
    }
  }
  return Array.from(found)
}

function citationKey(c: string): string {
  return c.toLowerCase().replace(/\s+/g, ' ').replace(/[\u00b0\u00ba]/g, '').trim()
}

export interface PostWriteCitationCheck {
  /** Citations that the writer introduced and are NOT present in the research/grounded material. */
  unsupported: string[]
  /** All citations detected in the draft (after dedup). */
  detected: string[]
  /** All grounded citations (from verified research). */
  grounded: string[]
}

/**
 * Compare citations in the writer's draft against the verified research
 * material. Returns the list of unsupported citations that should be revised.
 *
 * This is a deterministic local check (no LLM call) so it has no cost.
 */
export function verifyDraftCitations(
  draft: string,
  groundedSources: Array<string | undefined | null>,
): PostWriteCitationCheck {
  const draftCitations = extractCitations(draft)
  const groundedCitations = new Set<string>()
  for (const source of groundedSources) {
    if (!source) continue
    for (const c of extractCitations(source)) {
      groundedCitations.add(citationKey(c))
    }
  }
  const unsupported = draftCitations.filter(c => !groundedCitations.has(citationKey(c)))
  return {
    unsupported,
    detected: draftCitations,
    grounded: Array.from(groundedCitations),
  }
}
