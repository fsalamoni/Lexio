/**
 * Shared types and helpers for the Document v3 multi-agent pipeline.
 *
 * Each v3 agent is a pure async function that receives an `AgentRunContext`
 * and returns an `AgentRunResult`. The orchestrator (`document-v3-orchestrator`)
 * is responsible for wiring agents together, persistence and supervision.
 */
import { callLLMWithFallback, type LLMResult } from '../llm-client'

// ── Shared Case Context ───────────────────────────────────────────────────────

/**
 * Structured snapshot of the case progressively built across phases. Every
 * agent receives the latest snapshot and is instructed to keep the response
 * coherent with it. Agents should never invent facts that are not present here.
 */
export interface SharedCaseContext {
  request: string
  docType: string
  docTypeLabel: string
  areas: string[]
  areaLabels: string[]
  /** Arbitrary context dictionary supplied by the caller (e.g. `{ processo: '0001234-…', tribunal: 'TJSP' }`). */
  requestContext?: Record<string, unknown>
  // Filled by Fase 1
  intent?: IntentSummary
  parsedFacts?: ParsedRequest
  legalIssues?: LegalIssue[]
  briefings?: AgentBriefings
  // Filled by Fase 2
  acervoSnippets?: string
  thesisSnippets?: string
  theses?: BuiltTheses
  critique?: ThesisCritique
  refinedTheses?: BuiltTheses
  // Filled by Fase 3
  legislation?: ResearchSection
  jurisprudence?: ResearchSection
  doctrine?: ResearchSection
  citationCheck?: CitationVerification
  // Filled by Fase 4
  outline?: DocumentOutline
  /**
   * Compacted summaries produced between phases. Agents may opt-in to receive
   * the compacted form (cheaper, anti-bloat) via `buildCaseContextBlock`'s
   * `useCompacted` flag. The writer and the quality evaluator continue to read
   * the full structured fields above.
   */
  compacted?: {
    compreensao?: string
    analise?: string
    pesquisa?: string
  }
}

export interface IntentSummary {
  classification: string
  complexity: number
  urgency: number
  notes: string
}

export interface ParsedRequest {
  partes: string[]
  fatos: string[]
  pedidos: string[]
  prazos: string[]
  jurisdicao?: string
  observacoes?: string
}

export interface LegalIssue {
  id: string
  titulo: string
  resumo: string
  areas: string[]
}

export interface AgentBriefings {
  tema: string
  subtemas: string[]
  palavrasChave: string[]
  analise: string
  pesquisa: string
  redacao: string
}

export interface BuiltTheses {
  text: string
  titles?: string[]
}

export interface ThesisCritique {
  text: string
  weaknesses: number
}

export interface ResearchSection {
  text: string
}

export interface CitationVerification {
  text: string
  corrections: number
}

export interface DocumentOutline {
  text: string
}

// ── Agent Run Plumbing ────────────────────────────────────────────────────────

export interface AgentRunContext {
  apiKey: string
  model: string
  /**
   * User-chosen fallback model(s) to try when the primary fails. May be a
   * single model ID (legacy callers) or an ordered priority list resolved
   * from the user's category-specific fallback configuration. The platform
   * never injects a fallback the user did not explicitly pick.
   */
  fallbackModel: string | readonly string[]
  caseContext: SharedCaseContext
  profileBlock: string
  signal?: AbortSignal
}

export interface AgentRunResult<T> {
  output: T
  llmResult: LLMResult
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the context block that every v3 agent prompt carries. */
export function buildCaseContextBlock(
  ctx: SharedCaseContext,
  opts?: {
    include?: Array<keyof SharedCaseContext>
    /**
     * When true and the requested phase has a compacted summary, use it instead
     * of expanding the raw structured fields for that phase. Falls back to the
     * raw fields when no compacted form is available.
     */
    useCompacted?: boolean
  },
): string {
  const parts: string[] = []
  parts.push('<contexto_caso>')
  parts.push(`Solicitação original: ${ctx.request}`)
  parts.push(`Tipo de documento: ${ctx.docTypeLabel} (${ctx.docType})`)
  if (ctx.areaLabels.length > 0) {
    parts.push(`Áreas: ${ctx.areaLabels.join(', ')}`)
  }
  if (ctx.requestContext && Object.keys(ctx.requestContext).length > 0) {
    parts.push('Contexto adicional fornecido:')
    for (const [key, value] of Object.entries(ctx.requestContext)) {
      if (value === null || value === undefined) continue
      const rendered = typeof value === 'string' ? value : JSON.stringify(value)
      if (!rendered) continue
      parts.push(`- ${key}: ${rendered}`)
    }
  }
  const include = opts?.include
  const want = (key: keyof SharedCaseContext): boolean => !include || include.includes(key)
  const useCompacted = opts?.useCompacted === true

  // Compacted compreensão (Fase 1) replaces intent/parsedFacts/legalIssues/briefings when requested.
  const compreensaoKeys: Array<keyof SharedCaseContext> = ['intent', 'parsedFacts', 'legalIssues', 'briefings']
  if (useCompacted && ctx.compacted?.compreensao && compreensaoKeys.some(k => want(k))) {
    parts.push('Resumo compactado da compreensão:')
    parts.push(ctx.compacted.compreensao)
  } else {
    if (want('intent') && ctx.intent) {
      parts.push(`Classificação: ${ctx.intent.classification} · complexidade ${ctx.intent.complexity}/5 · urgência ${ctx.intent.urgency}/5`)
      if (ctx.intent.notes) parts.push(`Notas de intenção: ${ctx.intent.notes}`)
    }
    if (want('parsedFacts') && ctx.parsedFacts) {
      if (ctx.parsedFacts.partes.length) parts.push(`Partes: ${ctx.parsedFacts.partes.join('; ')}`)
      if (ctx.parsedFacts.fatos.length) parts.push(`Fatos: ${ctx.parsedFacts.fatos.join('; ')}`)
      if (ctx.parsedFacts.pedidos.length) parts.push(`Pedidos: ${ctx.parsedFacts.pedidos.join('; ')}`)
      if (ctx.parsedFacts.prazos.length) parts.push(`Prazos: ${ctx.parsedFacts.prazos.join('; ')}`)
      if (ctx.parsedFacts.jurisdicao) parts.push(`Jurisdição: ${ctx.parsedFacts.jurisdicao}`)
    }
    if (want('legalIssues') && ctx.legalIssues?.length) {
      parts.push('Questões jurídicas identificadas:')
      for (const issue of ctx.legalIssues) {
        parts.push(`- (${issue.id}) ${issue.titulo}: ${issue.resumo}`)
      }
    }
    if (want('briefings') && ctx.briefings) {
      parts.push(`Tema consolidado: ${ctx.briefings.tema}`)
      if (ctx.briefings.subtemas.length) parts.push(`Subtemas: ${ctx.briefings.subtemas.join(', ')}`)
      if (ctx.briefings.palavrasChave.length) parts.push(`Palavras-chave: ${ctx.briefings.palavrasChave.join(', ')}`)
    }
  }

  // Compacted análise (Fase 2) replaces theses/refinedTheses when requested.
  const analiseKeys: Array<keyof SharedCaseContext> = ['theses', 'refinedTheses']
  if (useCompacted && ctx.compacted?.analise && analiseKeys.some(k => want(k))) {
    parts.push('Resumo compactado da análise:')
    parts.push(ctx.compacted.analise)
  } else {
    if (want('refinedTheses') && ctx.refinedTheses?.text) {
      parts.push('Teses refinadas:')
      parts.push(ctx.refinedTheses.text)
    } else if (want('theses') && ctx.theses?.text) {
      parts.push('Teses:')
      parts.push(ctx.theses.text)
    }
  }

  // Compacted pesquisa (Fase 3) replaces legislation/jurisprudence/doctrine/citationCheck when requested.
  const pesquisaKeys: Array<keyof SharedCaseContext> = ['legislation', 'jurisprudence', 'doctrine', 'citationCheck']
  if (useCompacted && ctx.compacted?.pesquisa && pesquisaKeys.some(k => want(k))) {
    parts.push('Resumo compactado da pesquisa:')
    parts.push(ctx.compacted.pesquisa)
  } else {
    if (want('legislation') && ctx.legislation?.text) {
      parts.push('Pesquisa de legislação:')
      parts.push(ctx.legislation.text)
    }
    if (want('jurisprudence') && ctx.jurisprudence?.text) {
      parts.push('Pesquisa de jurisprudência:')
      parts.push(ctx.jurisprudence.text)
    }
    if (want('doctrine') && ctx.doctrine?.text) {
      parts.push('Pesquisa de doutrina:')
      parts.push(ctx.doctrine.text)
    }
    if (want('citationCheck') && ctx.citationCheck?.text) {
      parts.push('Verificação de citações:')
      parts.push(ctx.citationCheck.text)
    }
  }

  if (want('outline') && ctx.outline?.text) {
    parts.push('Plano do documento:')
    parts.push(ctx.outline.text)
  }
  parts.push('</contexto_caso>')
  return parts.join('\n')
}

/** Strip markdown fences and extract the first JSON object/array from raw text. */
export function extractJsonPayload(raw: string, maxChars = 60_000): string {
  let jsonStr = raw.trim()
  if (jsonStr.length > maxChars) jsonStr = jsonStr.slice(0, maxChars)

  const fenceStart = jsonStr.indexOf('```')
  if (fenceStart >= 0) {
    const afterFence = jsonStr.indexOf('\n', fenceStart)
    const contentStart = afterFence >= 0 ? afterFence + 1 : fenceStart + 3
    const fenceEnd = jsonStr.indexOf('```', contentStart)
    if (fenceEnd > contentStart) {
      jsonStr = jsonStr.slice(contentStart, fenceEnd).trim()
    } else {
      jsonStr = jsonStr.slice(contentStart).trim()
    }
  }

  const objectStart = jsonStr.indexOf('{')
  const arrayStart = jsonStr.indexOf('[')
  let start = -1
  if (objectStart >= 0 && (arrayStart === -1 || objectStart < arrayStart)) start = objectStart
  else if (arrayStart >= 0) start = arrayStart

  const objectEnd = jsonStr.lastIndexOf('}')
  const arrayEnd = jsonStr.lastIndexOf(']')
  const end = Math.max(objectEnd, arrayEnd)
  if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1)
  return jsonStr
}

/** Wrapper around `callLLMWithFallback` with v3 defaults. */
export async function runLLMAgent(
  ctx: AgentRunContext,
  system: string,
  user: string,
  options?: { maxTokens?: number; temperature?: number },
): Promise<LLMResult> {
  return callLLMWithFallback(
    ctx.apiKey,
    system,
    user,
    ctx.model,
    ctx.fallbackModel,
    options?.maxTokens ?? 2400,
    options?.temperature ?? 0.2,
    { signal: ctx.signal },
  )
}

/** Safely parse a JSON LLM response. */
export function safeParseJson<T>(content: string): { parsed?: T; ok: boolean } {
  try {
    const parsed = JSON.parse(extractJsonPayload(content)) as T
    return { parsed, ok: true }
  } catch {
    return { ok: false }
  }
}
