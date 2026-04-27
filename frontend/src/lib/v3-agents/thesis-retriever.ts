import { listTheses, type ThesisData } from '../firestore-service'
import type { AgentRunContext, AgentRunResult } from './types'

/**
 * Thesis retriever for the v3 pipeline.
 *
 * This is an I/O-only agent (no LLM call). It pulls the most relevant theses
 * from the user's bank using `listTheses`, scoped by the legal areas of the
 * request when available. The result is concatenated into a snippet block
 * that downstream agents can inject into their prompts.
 */

export interface ThesisRetrievalResult {
  snippets: string
  count: number
}

const MAX_THESES_PER_AREA = 8
const MAX_THESES_FALLBACK = 12
const MAX_THESES_INJECTED = 12
const MAX_SNIPPET_CHARS = 700

export async function runThesisRetriever(
  ctx: AgentRunContext,
  uid: string,
): Promise<AgentRunResult<ThesisRetrievalResult> | { output: ThesisRetrievalResult; llmResult: null }> {
  const areas = ctx.caseContext.areas
  const allTheses: ThesisData[] = []
  const seen = new Set<string>()

  try {
    const results = areas.length > 0
      ? await Promise.all(areas.map(area => listTheses(uid, { legalAreaId: area, limit: MAX_THESES_PER_AREA })))
      : [await listTheses(uid, { limit: MAX_THESES_FALLBACK })]
    for (const r of results) {
      for (const t of r.items) {
        if (t.id && !seen.has(t.id)) {
          seen.add(t.id)
          allTheses.push(t)
        }
      }
    }
  } catch {
    // ignore — empty bank is acceptable
  }

  if (allTheses.length === 0) {
    return { output: { snippets: '', count: 0 }, llmResult: null }
  }

  const snippets = allTheses
    .slice(0, MAX_THESES_INJECTED)
    .map(t => {
      const body = t.summary?.trim() || t.content || ''
      return `• ${t.title}\n  ${body.slice(0, MAX_SNIPPET_CHARS)}`
    })
    .join('\n\n')

  return {
    output: { snippets, count: Math.min(allTheses.length, MAX_THESES_INJECTED) },
    llmResult: null,
  }
}
