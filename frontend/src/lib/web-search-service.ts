/**
 * Web Search Service — External research via DuckDuckGo + Jina Reader
 *
 * Provides structured web search results by fetching DuckDuckGo HTML results
 * through Jina Reader (free CORS-friendly proxy), then optionally fetching
 * full page content for deep research.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_SOURCE_TEXT_LENGTH = 500_000
const MAX_WEB_SEARCH_CHARS = 3_000
const JINA_TIMEOUT = 15_000
const SEARCH_RETRY_ATTEMPTS = 3
const RESULT_FETCH_TIMEOUT = 20_000

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface DeepSearchProgress {
  phase: 'searching' | 'fetching' | 'done'
  query: string
  resultsFound: number
  urlsFetched: number
  urlsTotal: number
  currentUrl: string
}

export interface DeepSearchWarning {
  kind: 'fallback_to_snippets' | 'jina_fallback_used' | 'all_providers_failed'
  attempted: string[]
}

export interface DeepSearchResult {
  results: WebSearchResult[]
  contents: Array<{ url: string; title: string; content: string }>
  durationMs: number
  fetchFailures: number
  diagnostics?: WebSearchDiagnostics
  warnings?: DeepSearchWarning[]
}

export type WebSearchErrorType =
  | 'none'
  | 'aborted'
  | 'timeout'
  | 'rate_limit'
  | 'http'
  | 'network'
  | 'parse'
  | 'empty'

export interface WebSearchStrategyDiagnostic {
  strategy: 'ddg_jina' | 'ddg_lite' | 'ddg_proxy' | 'ddg_instant' | 'jina_search'
  resultsCount: number
  errorType: WebSearchErrorType
  message?: string
}

export interface WebSearchDiagnostics {
  query: string
  strategies: WebSearchStrategyDiagnostic[]
  hadTechnicalError: boolean
}

interface SearchStrategyOutcome {
  strategy: WebSearchStrategyDiagnostic['strategy']
  results: WebSearchResult[]
  errorType: WebSearchErrorType
  message?: string
}

// ── URL Content Fetching ───────────────────────────────────────────────────────

/**
 * Fetches readable text from a URL using Jina Reader.
 * Public CORS proxies proved unstable in production and are intentionally
 * avoided here to keep deep research deterministic.
 */
export async function fetchUrlContent(url: string): Promise<string> {
  for (let attempt = 0; attempt < SEARCH_RETRY_ATTEMPTS; attempt++) {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`
      const resp = await fetch(jinaUrl, {
        headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
        signal: AbortSignal.timeout(RESULT_FETCH_TIMEOUT + attempt * 2_000),
      })
      if (resp.ok) {
        const text = await resp.text()
        if (text && text.length > 100) return text.slice(0, MAX_SOURCE_TEXT_LENGTH)
      }
    } catch {
      // Retry below.
    }
    if (attempt < SEARCH_RETRY_ATTEMPTS - 1) {
      await wait(320 + attempt * 260)
    }
  }

  return ''
}

// ── Web Search (Lightweight) ───────────────────────────────────────────────────

/**
 * Lightweight search that returns a text snippet for chat enrichment.
 */
export async function searchWeb(query: string): Promise<string> {
  try {
    const ddgHtmlUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const readerUrl = `https://r.jina.ai/${ddgHtmlUrl}`
    const resp = await fetch(readerUrl, {
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(JINA_TIMEOUT),
    })
    if (!resp.ok) return ''
    const text = (await resp.text()).trim()
    if (text.length < 80) return ''
    return text.slice(0, MAX_WEB_SEARCH_CHARS)
  } catch {
    return ''
  }
}

// ── Structured Web Search ──────────────────────────────────────────────────────

/**
 * Search via DuckDuckGo HTML → Jina Reader and extract structured results.
 * Uses multiple extraction strategies for robustness.
 */
export async function searchWebResults(query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
  const { results } = await searchWebResultsWithDiagnostics(query, signal)
  return results
}

/**
 * Search with diagnostics for differentiating "no results" from technical failures.
 */
export async function searchWebResultsWithDiagnostics(
  query: string,
  signal?: AbortSignal,
): Promise<{ results: WebSearchResult[]; diagnostics: WebSearchDiagnostics }> {
  // Strategy 1: DuckDuckGo HTML through Jina Reader (markdown output)
  const strategyDiagnostics: WebSearchStrategyDiagnostic[] = []

  const jinaOutcome = await searchViaDDGJina(query, signal)
  strategyDiagnostics.push({
    strategy: jinaOutcome.strategy,
    resultsCount: jinaOutcome.results.length,
    errorType: jinaOutcome.errorType,
    message: jinaOutcome.message,
  })
  if (jinaOutcome.results.length >= 3) {
    return {
      results: jinaOutcome.results,
      diagnostics: buildDiagnostics(query, strategyDiagnostics),
    }
  }

  if (signal?.aborted) {
    return {
      results: jinaOutcome.results,
      diagnostics: buildDiagnostics(query, strategyDiagnostics),
    }
  }

  // Strategy 2: DuckDuckGo Lite through Jina Reader.
  const liteOutcome = await searchViaDDGLite(query, signal)
  strategyDiagnostics.push({
    strategy: liteOutcome.strategy,
    resultsCount: liteOutcome.results.length,
    errorType: liteOutcome.errorType,
    message: liteOutcome.message,
  })
  const merged1 = deduplicateResults([...jinaOutcome.results, ...liteOutcome.results])
  if (merged1.length >= 2) {
    return {
      results: merged1.slice(0, 10),
      diagnostics: buildDiagnostics(query, strategyDiagnostics),
    }
  }

  if (signal?.aborted) {
    return {
      results: merged1,
      diagnostics: buildDiagnostics(query, strategyDiagnostics),
    }
  }

  // Strategy 3: DuckDuckGo HTML mirror through Jina Reader.
  const mirrorOutcome = await searchViaDDGMirror(query, signal)
  strategyDiagnostics.push({
    strategy: mirrorOutcome.strategy,
    resultsCount: mirrorOutcome.results.length,
    errorType: mirrorOutcome.errorType,
    message: mirrorOutcome.message,
  })

  return {
    results: deduplicateResults([...merged1, ...mirrorOutcome.results]).slice(0, 10),
    diagnostics: buildDiagnostics(query, strategyDiagnostics),
  }
}

/** Remove duplicate URLs, keeping the first occurrence */
function deduplicateResults(results: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>()
  return results.filter(r => {
    const key = normalizeUrlForDedup(r.url)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function searchViaDDGJina(query: string, signal?: AbortSignal): Promise<SearchStrategyOutcome> {
  const ddgHtmlUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const readerUrl = `https://r.jina.ai/${ddgHtmlUrl}`
  return searchViaJinaReader('ddg_jina', readerUrl, signal)
}

/**
 * Alternate DuckDuckGo layout via Jina Reader.
 */
async function searchViaDDGLite(query: string, signal?: AbortSignal): Promise<SearchStrategyOutcome> {
  const ddgLiteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  const readerUrl = `https://r.jina.ai/${ddgLiteUrl}`
  return searchViaJinaReader('ddg_lite', readerUrl, signal)
}

/**
 * Extract structured results from raw DuckDuckGo HTML.
 * Handles the redirect URLs (uddg parameter) and result blocks.
 */
function extractResultsFromDDGHTML(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const seen = new Set<string>()

  // Split by result blocks
  const blocks = html.split(/class="result[\s"]/)

  for (const block of blocks.slice(1)) {
    if (results.length >= 10) break

    // Extract URL from DDG redirect uddg parameter
    let url = ''
    const uddgMatch = block.match(/uddg=([^&"'\s]+)/)
    if (uddgMatch) {
      try { url = decodeURIComponent(uddgMatch[1]) } catch { /* skip */ }
    }

    // Fallback: direct href
    if (!url) {
      const hrefMatch = block.match(/href="(https?:\/\/[^"]+)"/)
      if (hrefMatch) url = cleanUrl(hrefMatch[1])
    }

    if (!url || !url.startsWith('http') || seen.has(url) || isDDGInternal(url)) continue
    seen.add(url)

    // Extract title
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/)
      ?? block.match(/<a[^>]+>([^<]{5,})</)
    const title = titleMatch
      ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200)
      : (() => { try { return new URL(url).hostname } catch { return url.slice(0, 60) } })()

    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+)/)
    const snippet = snippetMatch ? snippetMatch[1].replace(/\s+/g, ' ').trim().slice(0, 400) : ''

    if (title.length > 2) {
      results.push({ title, url: cleanUrl(url), snippet })
    }
  }

  return results
}

async function searchViaDDGMirror(query: string, signal?: AbortSignal): Promise<SearchStrategyOutcome> {
  const ddgMirrorUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const readerUrl = `https://r.jina.ai/${ddgMirrorUrl}`
  return searchViaJinaReader('ddg_lite', readerUrl, signal)
}

/**
 * Fallback search using Jina Search API (s.jina.ai).
 * Free, no API key required. Returns structured JSON results directly.
 */
async function searchViaJinaSearchAPI(
  query: string,
  signal?: AbortSignal,
): Promise<SearchStrategyOutcome> {
  const strategy = 'jina_search' as const

  for (let attempt = 0; attempt < SEARCH_RETRY_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      return { strategy, results: [], errorType: 'aborted', message: 'Busca cancelada' }
    }
    try {
      const url = `https://s.jina.ai/${encodeURIComponent(query)}`
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: signal ?? AbortSignal.timeout(JINA_TIMEOUT + attempt * 2_000),
      })
      if (!resp.ok) {
        const errorType = classifyStatus(resp.status)
        if (!isRetriableStatus(resp.status) || attempt === SEARCH_RETRY_ATTEMPTS - 1) {
          return {
            strategy,
            results: [],
            errorType,
            message: `Jina Search API retornou HTTP ${resp.status}`,
          }
        }
        await wait(220 + attempt * 260)
        continue
      }
      const json = await resp.json() as {
        data?: Array<{ title?: string; url?: string; description?: string; content?: string }>
      }
      const items = json.data ?? []
      const results: WebSearchResult[] = items
        .filter((item): item is { title: string; url: string; description?: string; content?: string } =>
          typeof item.url === 'string' && item.url.startsWith('http') && typeof item.title === 'string',
        )
        .slice(0, 10)
        .map(item => ({
          title: item.title.slice(0, 200),
          url: cleanUrl(item.url),
          snippet: (item.description || item.content || '').slice(0, 400),
        }))

      return {
        strategy,
        results,
        errorType: results.length > 0 ? 'none' : 'empty',
        message: results.length > 0 ? undefined : 'Jina Search API não retornou resultados',
      }
    } catch (error) {
      const errorType = classifyFetchError(error)
      if (errorType === 'aborted') {
        return { strategy, results: [], errorType, message: 'Busca cancelada' }
      }
      if (errorType === 'network') {
        return {
          strategy,
          results: [],
          errorType,
          message: error instanceof Error ? error.message : 'Falha de rede ao consultar Jina Search API',
        }
      }
      if (attempt === SEARCH_RETRY_ATTEMPTS - 1) {
        return {
          strategy,
          results: [],
          errorType,
          message: error instanceof Error ? error.message : 'Falha ao consultar Jina Search API',
        }
      }
      await wait(250 + attempt * 300)
    }
  }

  return { strategy, results: [], errorType: 'empty', message: 'Sem resultados' }
}

async function searchViaJinaReader(
  strategy: 'ddg_jina' | 'ddg_lite',
  readerUrl: string,
  signal?: AbortSignal,
): Promise<SearchStrategyOutcome> {
  for (let attempt = 0; attempt < SEARCH_RETRY_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      return { strategy, results: [], errorType: 'aborted', message: 'Busca cancelada' }
    }
    try {
      const resp = await fetch(readerUrl, {
        headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
        signal: signal ?? AbortSignal.timeout(JINA_TIMEOUT + attempt * 2_000),
      })
      if (!resp.ok) {
        const errorType = classifyStatus(resp.status)
        if (!isRetriableStatus(resp.status) || attempt === SEARCH_RETRY_ATTEMPTS - 1) {
          return {
            strategy,
            results: [],
            errorType,
            message: `Jina Reader retornou HTTP ${resp.status}`,
          }
        }
        await wait(220 + attempt * 260)
        continue
      }
      const text = await resp.text()
      const results = extractResultsFromJinaText(text)
      return {
        strategy,
        results,
        errorType: results.length > 0 ? 'none' : 'empty',
        message: results.length > 0 ? undefined : 'Sem links extraídos do resultado',
      }
    } catch (error) {
      const errorType = classifyFetchError(error)
      if (errorType === 'aborted') {
        return { strategy, results: [], errorType, message: 'Busca cancelada' }
      }
      // Network/CORS errors won't resolve with retry — fail fast to try next strategy
      if (errorType === 'network') {
        return {
          strategy,
          results: [],
          errorType,
          message: error instanceof Error ? error.message : 'Falha de rede ao consultar Jina Reader',
        }
      }
      if (attempt === SEARCH_RETRY_ATTEMPTS - 1) {
        return {
          strategy,
          results: [],
          errorType,
          message: error instanceof Error ? error.message : 'Falha de rede ao consultar Jina Reader',
        }
      }
      await wait(250 + attempt * 300)
    }
  }

  return { strategy, results: [], errorType: 'empty', message: 'Sem resultados' }
}

/**
 * Extract structured results from Jina Reader plain text output.
 * DuckDuckGo currently returns a title line followed by a bare domain/path line,
 * so the parser supports both explicit links and text-only result layouts.
 */
function extractResultsFromJinaText(text: string): WebSearchResult[] {
  const results: WebSearchResult[] = []
  const seen = new Set<string>()

  // Strategy A: Look for markdown-style links [title](url)
  const mdLinkRegex = /\[([^\]]{5,})\]\((https?:\/\/[^\s)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = mdLinkRegex.exec(text)) !== null) {
    if (results.length >= 10) break
    const title = match[1].trim()
    const url = cleanUrl(resolveDDGRedirect(match[2]))
    if (isDDGInternal(url) || seen.has(url)) continue
    seen.add(url)
    const snippet = extractSnippetAround(text, match.index, 300)
    results.push({ title, url, snippet })
  }

  // Strategy B: Look for bare URLs with surrounding context.
  if (results.length < 3) {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\]]+/g
    while ((match = urlRegex.exec(text)) !== null) {
      if (results.length >= 10) break
      const url = cleanUrl(resolveDDGRedirect(match[0]))
      if (isDDGInternal(url) || seen.has(url)) continue
      seen.add(url)
      const title = extractTitleBefore(text, match.index)
      const snippet = extractSnippetAround(text, match.index, 300)
      results.push({ title: title || url.split('/')[2] || url, url, snippet })
    }
  }

  // Strategy C: HTML anchor links when source was not converted to markdown.
  if (results.length < 3) {
    const htmlLinkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([^<]{3,})<\/a>/gi
    while ((match = htmlLinkRegex.exec(text)) !== null) {
      if (results.length >= 10) break
      const url = cleanUrl(resolveDDGRedirect(match[1]))
      if (!/^https?:\/\//i.test(url) || isDDGInternal(url) || seen.has(url)) continue
      seen.add(url)
      const title = match[2].trim().replace(/\s+/g, ' ').slice(0, 180)
      const snippet = extractSnippetAround(text, match.index, 300)
      results.push({ title: title || url.split('/')[2] || url, url, snippet })
    }
  }

  // Strategy D: plain text result blocks with title line followed by bare domain/path.
  if (results.length < 3) {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
    for (let index = 1; index < lines.length && results.length < 10; index++) {
      const url = toAbsoluteResultUrl(lines[index])
      if (!url || isDDGInternal(url) || seen.has(url)) continue

      const title = cleanResultTitle(lines[index - 1])
      if (!title || title.length < 4) continue

      const snippet = lines[index + 1] && !toAbsoluteResultUrl(lines[index + 1])
        ? lines[index + 1].slice(0, 400)
        : extractSnippetAround(text, text.indexOf(lines[index]), 300)

      seen.add(url)
      results.push({ title, url, snippet })
    }
  }

  return results
}

function cleanUrl(url: string): string {
  return url
    .replace(/[),.;:!?'"]+$/, '')
    .replace(/\/$/, '')
    .split('#')[0]
}

function isDDGInternal(url: string): boolean {
  return /^https?:\/\/(www\.)?duckduckgo\.com\/?($|\?|js\/)|r\.search\.yahoo/i.test(url)
}

function toAbsoluteResultUrl(value: string): string | null {
  const candidate = value.trim().match(/^((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i)?.[1]
  if (!candidate) return null
  const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`
  return cleanUrl(resolveDDGRedirect(normalized))
}

function cleanResultTitle(value: string): string {
  return value
    .replace(/^PDF\s+/i, '')
    .replace(/^[#*•\-\d.]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/**
 * Resolve DuckDuckGo redirect URLs to their actual destination.
 * DDG wraps results as /l/?uddg=ENCODED_URL — extract the real URL.
 */
function resolveDDGRedirect(url: string): string {
  try {
    const parsed = new URL(url)
    if (/duckduckgo\.com/i.test(parsed.hostname) && parsed.pathname === '/l/') {
      const uddg = parsed.searchParams.get('uddg')
      if (uddg && /^https?:\/\//i.test(uddg)) return uddg
    }
  } catch { /* not a URL */ }
  return url
}

function normalizeUrlForDedup(url: string): string {
  try {
    const parsed = new URL(url)
    const protocol = 'https:'
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    const pathname = parsed.pathname.replace(/\/$/, '').toLowerCase()
    return `${protocol}//${host}${pathname}${parsed.search}`
  } catch {
    return cleanUrl(url).toLowerCase().replace(/^https?:\/\/www\./, 'https://')
  }
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function classifyStatus(status: number): WebSearchErrorType {
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'http'
  if (status >= 400) return 'http'
  return 'none'
}

function classifyFetchError(error: unknown): WebSearchErrorType {
  if (error instanceof DOMException && error.name === 'AbortError') {
    const msg = error.message.toLowerCase()
    return msg.includes('time') || msg.includes('timeout') ? 'timeout' : 'aborted'
  }
  if (error instanceof TypeError) return 'network'
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('timeout')) return 'timeout'
  if (message.includes('network')) return 'network'
  return 'network'
}

function buildDiagnostics(query: string, strategies: WebSearchStrategyDiagnostic[]): WebSearchDiagnostics {
  const hadTechnicalError = strategies.some(s => s.errorType !== 'none' && s.errorType !== 'empty' && s.errorType !== 'aborted')
  return { query, strategies, hadTechnicalError }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractSnippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 100)
  const end = Math.min(text.length, index + length)
  return text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, length)
}

function extractTitleBefore(text: string, urlIndex: number): string {
  const before = text.slice(Math.max(0, urlIndex - 200), urlIndex)
  const lines = before.split('\n').filter(l => l.trim().length > 3)
  const lastLine = lines[lines.length - 1]?.trim() ?? ''
  // Clean markdown headers or bullet points
  return lastLine.replace(/^[#*•\-\d.]+\s*/, '').slice(0, 180)
}

// ── Deep Web Search ────────────────────────────────────────────────────────────

/**
 * Deep web search: finds results, then fetches full content from top URLs.
 * Used for "Pesquisa Externa Profunda".
 */
export async function deepWebSearch(
  query: string,
  onProgress?: (progress: DeepSearchProgress) => void,
  signal?: AbortSignal,
): Promise<DeepSearchResult> {
  const start = performance.now()

  // Step 1: Get search results
  onProgress?.({
    phase: 'searching',
    query,
    resultsFound: 0,
    urlsFetched: 0,
    urlsTotal: 0,
    currentUrl: '',
  })

  const { results: initialResults, diagnostics } = await searchWebResultsWithDiagnostics(query, signal)
  const warnings: DeepSearchWarning[] = []

  // Jina Search API fallback when DuckDuckGo strategies returned nothing
  let results = initialResults
  if (results.length === 0 && !signal?.aborted) {
    const jinaSearchOutcome = await searchViaJinaSearchAPI(query, signal)
    diagnostics.strategies.push({
      strategy: jinaSearchOutcome.strategy,
      resultsCount: jinaSearchOutcome.results.length,
      errorType: jinaSearchOutcome.errorType,
      message: jinaSearchOutcome.message,
    })
    if (jinaSearchOutcome.errorType !== 'none' && jinaSearchOutcome.errorType !== 'empty') {
      diagnostics.hadTechnicalError = true
    }
    if (jinaSearchOutcome.results.length > 0) {
      results = deduplicateResults([...results, ...jinaSearchOutcome.results])
      warnings.push({
        kind: 'jina_fallback_used',
        attempted: diagnostics.strategies.map(s => s.strategy),
      })
    }
  }

  onProgress?.({
    phase: 'fetching',
    query,
    resultsFound: results.length,
    urlsFetched: 0,
    urlsTotal: Math.min(results.length, 10),
    currentUrl: '',
  })

  if (results.length === 0) {
    warnings.push({
      kind: 'all_providers_failed',
      attempted: diagnostics.strategies.map(s => s.strategy),
    })
    return {
      results: [],
      contents: [],
      durationMs: Math.round(performance.now() - start),
      fetchFailures: 0,
      diagnostics,
      warnings,
    }
  }

  // Step 2: Fetch full content from top 10 URLs in parallel
  const topResults = results.slice(0, 10)
  const contents: Array<{ url: string; title: string; content: string }> = []
  let fetchFailures = 0
  let fetchedCount = 0

  const fetchPromises = topResults.map(async (r) => {
    if (signal?.aborted) return null
    try {
      const content = await fetchUrlContent(r.url)
      fetchedCount++
      onProgress?.({
        phase: 'fetching',
        query,
        resultsFound: results.length,
        urlsFetched: fetchedCount,
        urlsTotal: topResults.length,
        currentUrl: r.url,
      })
      if (content.length >= 120) {
        return { url: r.url, title: r.title, content }
      }
    } catch {
      fetchedCount++
      fetchFailures++
    }
    return null
  })

  const fetched = await Promise.allSettled(fetchPromises)
  for (const result of fetched) {
    if (result.status === 'fulfilled' && result.value) {
      contents.push(result.value)
    }
  }

  // Warn when results exist but no full content could be fetched
  if (results.length > 0 && contents.length === 0) {
    warnings.push({
      kind: 'fallback_to_snippets',
      attempted: topResults.map(r => r.url),
    })
  }

  onProgress?.({
    phase: 'done',
    query,
    resultsFound: results.length,
    urlsFetched: contents.length,
    urlsTotal: topResults.length,
    currentUrl: '',
  })

  return {
    results,
    contents,
    durationMs: Math.round(performance.now() - start),
    fetchFailures,
    diagnostics,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}
