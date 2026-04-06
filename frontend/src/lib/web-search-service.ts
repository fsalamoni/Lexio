/**
 * Web Search Service — External research via DuckDuckGo + Jina Reader
 *
 * Provides structured web search results by fetching DuckDuckGo HTML results
 * through Jina Reader (free CORS-friendly proxy), then optionally fetching
 * full page content for deep research.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_SOURCE_TEXT_LENGTH = 50_000
const MAX_WEB_SEARCH_CHARS = 3_000
const JINA_TIMEOUT = 8_000
const ALLORIGINS_TIMEOUT = 12_000
const SEARCH_RETRY_ATTEMPTS = 2
const CORS_PROXY_PREFIX = 'https://corsproxy.io/?'

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

export interface DeepSearchResult {
  results: WebSearchResult[]
  contents: Array<{ url: string; title: string; content: string }>
  durationMs: number
  fetchFailures: number
  diagnostics?: WebSearchDiagnostics
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
  strategy: 'ddg_jina' | 'ddg_lite' | 'ddg_proxy' | 'ddg_instant'
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
 * Fetches readable text from a URL using Jina Reader, falling back to
 * allorigins CORS proxy. Both are free, no-auth CORS-friendly services.
 */
export async function fetchUrlContent(url: string): Promise<string> {
  // Try Jina Reader first with short retries.
  for (let attempt = 0; attempt < SEARCH_RETRY_ATTEMPTS; attempt++) {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`
      const resp = await fetch(jinaUrl, {
        headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
        signal: AbortSignal.timeout(JINA_TIMEOUT + 5_000),
      })
      if (resp.ok) {
        const text = await resp.text()
        if (text && text.length > 100) return text.slice(0, MAX_SOURCE_TEXT_LENGTH)
      }
    } catch {
      // Try fallback providers below.
    }
    if (attempt < SEARCH_RETRY_ATTEMPTS - 1) {
      await wait(260 + attempt * 220)
    }
  }

  // Fallback 2: allorigins proxy (most reliable CORS proxy).
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(ALLORIGINS_TIMEOUT) })
    if (resp.ok) {
      const data = await resp.json() as { contents?: string }
      const raw = data.contents ?? ''
      const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s{3,}/g, ' ').trim()
      if (text.length > 100) return text.slice(0, MAX_SOURCE_TEXT_LENGTH)
    }
  } catch {
    // Try next fallback.
  }

  // Fallback 3: corsproxy.io (less reliable, may return 403).
  try {
    const proxyUrl = `${CORS_PROXY_PREFIX}${encodeURIComponent(url)}`
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(12_000) })
    if (resp.ok) {
      const raw = await resp.text()
      const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s{3,}/g, ' ').trim()
      if (text.length > 100) return text.slice(0, MAX_SOURCE_TEXT_LENGTH)
    }
  } catch {
    // Not available, return empty for graceful degradation.
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

  // Strategy 2: DuckDuckGo HTML through CORS proxy (raw HTML — fallback for Jina)
  const proxyOutcome = await searchViaDDGProxy(query, signal)
  strategyDiagnostics.push({
    strategy: proxyOutcome.strategy,
    resultsCount: proxyOutcome.results.length,
    errorType: proxyOutcome.errorType,
    message: proxyOutcome.message,
  })
  const merged1 = deduplicateResults([...jinaOutcome.results, ...proxyOutcome.results])
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

  // Strategy 3: DuckDuckGo Instant API (direct first, CORS proxy fallback)
  const instantOutcome = await searchViaDDGInstant(query, signal)
  strategyDiagnostics.push({
    strategy: instantOutcome.strategy,
    resultsCount: instantOutcome.results.length,
    errorType: instantOutcome.errorType,
    message: instantOutcome.message,
  })

  return {
    results: deduplicateResults([...merged1, ...instantOutcome.results]).slice(0, 10),
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
 * Fetch DuckDuckGo HTML results through AllOrigins proxy.
 * Primary fallback when Jina Reader is down or rate-limited.
 * AllOrigins wraps any URL and returns {contents: "html..."}.
 */
async function searchViaDDGProxy(query: string, signal?: AbortSignal): Promise<SearchStrategyOutcome> {
  if (signal?.aborted) {
    return { strategy: 'ddg_proxy', results: [], errorType: 'aborted', message: 'Busca cancelada' }
  }

  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(ddgUrl)}`

  try {
    const resp = await fetch(proxyUrl, {
      signal: signal ?? AbortSignal.timeout(12_000),
    })
    if (!resp.ok) {
      return {
        strategy: 'ddg_proxy',
        results: [],
        errorType: classifyStatus(resp.status),
        message: `AllOrigins retornou HTTP ${resp.status}`,
      }
    }
    const wrapper = await resp.json() as { contents?: string }
    const html = wrapper.contents ?? ''
    if (!html || html.length < 100) {
      return {
        strategy: 'ddg_proxy',
        results: [],
        errorType: 'empty',
        message: 'AllOrigins retornou conteúdo vazio',
      }
    }
    const results = extractResultsFromDDGHTML(html)
    return {
      strategy: 'ddg_proxy',
      results,
      errorType: results.length > 0 ? 'none' : 'empty',
      message: results.length > 0 ? undefined : 'Sem resultados extraídos do DuckDuckGo via proxy',
    }
  } catch (error) {
    const errorType = classifyFetchError(error)
    return {
      strategy: 'ddg_proxy',
      results: [],
      errorType,
      message: error instanceof Error ? error.message : 'Falha ao consultar DuckDuckGo via AllOrigins',
    }
  }
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

async function searchViaDDGInstant(query: string, signal?: AbortSignal): Promise<SearchStrategyOutcome> {
  const baseUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`

  // Try direct first, then AllOrigins proxy fallback
  const urls = [
    baseUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`,
  ]

  for (const url of urls) {
    if (signal?.aborted) {
      return { strategy: 'ddg_instant', results: [], errorType: 'aborted', message: 'Busca cancelada' }
    }
    try {
      const resp = await fetch(url, { signal: signal ?? AbortSignal.timeout(10_000) })
      if (!resp.ok) continue

      const data = await resp.json() as {
        AbstractText?: string
        AbstractURL?: string
        Heading?: string
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
      }
      const results: WebSearchResult[] = []
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || 'Result',
          url: data.AbstractURL,
          snippet: data.AbstractText.slice(0, 300),
        })
      }
      for (const t of (data.RelatedTopics ?? []).slice(0, 8)) {
        if (t.FirstURL && t.Text) {
          results.push({
            title: t.Text.slice(0, 120),
            url: t.FirstURL,
            snippet: t.Text.slice(0, 300),
          })
        }
      }

      return {
        strategy: 'ddg_instant',
        results,
        errorType: results.length > 0 ? 'none' : 'empty',
        message: results.length > 0 ? undefined : 'DuckDuckGo Instant sem resultados',
      }
    } catch {
      // Try next URL (proxy fallback)
      continue
    }
  }

  return {
    strategy: 'ddg_instant',
    results: [],
    errorType: 'network',
    message: 'Falha ao consultar DuckDuckGo Instant (direto + proxy)',
  }
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
 * Jina returns DuckDuckGo HTML as readable text with URLs embedded.
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

  const { results, diagnostics } = await searchWebResultsWithDiagnostics(query, signal)

  onProgress?.({
    phase: 'fetching',
    query,
    resultsFound: results.length,
    urlsFetched: 0,
    urlsTotal: Math.min(results.length, 10),
    currentUrl: '',
  })

  if (results.length === 0) {
    return {
      results: [],
      contents: [],
      durationMs: Math.round(performance.now() - start),
      fetchFailures: 0,
      diagnostics,
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
  }
}
