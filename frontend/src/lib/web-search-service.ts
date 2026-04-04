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
const JINA_TIMEOUT = 15_000
const ALLORIGINS_TIMEOUT = 12_000

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
}

// ── URL Content Fetching ───────────────────────────────────────────────────────

/**
 * Fetches readable text from a URL using Jina Reader, falling back to
 * allorigins CORS proxy. Both are free, no-auth CORS-friendly services.
 */
export async function fetchUrlContent(url: string): Promise<string> {
  // Try Jina Reader — returns clean readable text
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
  } catch { /* try next */ }

  // Fallback: allorigins proxy
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(ALLORIGINS_TIMEOUT) })
    if (resp.ok) {
      const data = await resp.json() as { contents?: string }
      const raw = data.contents ?? ''
      const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s{3,}/g, ' ').trim()
      if (text.length > 100) return text.slice(0, MAX_SOURCE_TEXT_LENGTH)
    }
  } catch { /* not available */ }

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
  // Strategy 1: DuckDuckGo HTML through Jina Reader (markdown output)
  const jinaResults = await searchViaDDGJina(query, signal)
  if (jinaResults.length >= 3) return jinaResults

  if (signal?.aborted) return jinaResults

  // Strategy 2: DuckDuckGo Lite (lighter HTML, sometimes more reliable)
  const liteResults = await searchViaDDGLite(query, signal)
  const merged1 = deduplicateResults([...jinaResults, ...liteResults])
  if (merged1.length >= 2) return merged1.slice(0, 10)

  if (signal?.aborted) return merged1

  // Strategy 3: DuckDuckGo Instant API (limited but always CORS-friendly)
  const instantResults = await searchViaDDGInstant(query, signal)
  return deduplicateResults([...merged1, ...instantResults]).slice(0, 10)
}

/** Remove duplicate URLs, keeping the first occurrence */
function deduplicateResults(results: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>()
  return results.filter(r => {
    const key = r.url.replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function searchViaDDGJina(query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
  try {
    const ddgHtmlUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const readerUrl = `https://r.jina.ai/${ddgHtmlUrl}`
    const resp = await fetch(readerUrl, {
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
      signal: signal ?? AbortSignal.timeout(JINA_TIMEOUT),
    })
    if (!resp.ok) return []
    const text = await resp.text()
    return extractResultsFromJinaText(text)
  } catch {
    return []
  }
}

async function searchViaDDGLite(query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
  try {
    const ddgLiteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
    const readerUrl = `https://r.jina.ai/${ddgLiteUrl}`
    const resp = await fetch(readerUrl, {
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
      signal: signal ?? AbortSignal.timeout(JINA_TIMEOUT),
    })
    if (!resp.ok) return []
    const text = await resp.text()
    return extractResultsFromJinaText(text)
  } catch {
    return []
  }
}

async function searchViaDDGInstant(query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const resp = await fetch(url, { signal: signal ?? AbortSignal.timeout(8_000) })
    if (!resp.ok) return []
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
    return results
  } catch {
    return []
  }
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
    const url = cleanUrl(match[2])
    if (isDDGInternal(url) || seen.has(url)) continue
    seen.add(url)
    const snippet = extractSnippetAround(text, match.index, 300)
    results.push({ title, url, snippet })
  }

  // Strategy B: Look for bare URLs with surrounding context
  if (results.length < 3) {
    const urlRegex = /https?:\/\/(?!duckduckgo\.com)[^\s<>"{}|\\^`)\]]{10,}/g
    while ((match = urlRegex.exec(text)) !== null) {
      if (results.length >= 10) break
      const url = cleanUrl(match[0])
      if (isDDGInternal(url) || seen.has(url)) continue
      seen.add(url)
      const title = extractTitleBefore(text, match.index)
      const snippet = extractSnippetAround(text, match.index, 300)
      results.push({ title: title || url.split('/')[2] || url, url, snippet })
    }
  }

  return results
}

function cleanUrl(url: string): string {
  return url.replace(/[),.;:!?'"]+$/, '').replace(/\/$/, '')
}

function isDDGInternal(url: string): boolean {
  return /duckduckgo\.com|r\.search\.yahoo/i.test(url)
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

  const results = await searchWebResults(query, signal)

  onProgress?.({
    phase: 'fetching',
    query,
    resultsFound: results.length,
    urlsFetched: 0,
    urlsTotal: Math.min(results.length, 5),
    currentUrl: '',
  })

  if (results.length === 0) {
    return { results: [], contents: [], durationMs: Math.round(performance.now() - start) }
  }

  // Step 2: Fetch full content from top 5 URLs in parallel
  const topResults = results.slice(0, 5)
  const contents: Array<{ url: string; title: string; content: string }> = []
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
  }
}
