/**
 * DataJud API Client — Pesquisa de jurisprudência nos tribunais brasileiros
 *
 * A API Pública do DataJud (CNJ) utiliza Elasticsearch e oferece acesso público
 * com uma APIKey compartilhada. Esta camada abstrai a comunicação com múltiplos
 * tribunais em paralelo e retorna resultados formatados.
 *
 * @see https://datajud-wiki.cnj.jus.br/api-publica/
 */

import { loadApiKeyValues } from './settings-store'

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Public API key provided by CNJ for DataJud API access.
 * This is NOT a secret — it is a shared public key published by CNJ
 * at https://datajud-wiki.cnj.jus.br/api-publica/ for all consumers.
 */
const DATAJUD_API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='

async function getDataJudApiKey(): Promise<string> {
  try {
    const apiKeys = await loadApiKeyValues()
    return apiKeys.datajud_api_key || DATAJUD_API_KEY
  } catch {
    return DATAJUD_API_KEY
  }
}

/** Base URL for all DataJud endpoints */
const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br'

/** Concurrency limit for parallel tribunal queries */
const BATCH_SIZE = 4

/** Timeout per tribunal request (ms) */
const REQUEST_TIMEOUT = 15_000
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 250

/** Max results per tribunal */
const RESULTS_PER_TRIBUNAL = 5

/**
 * DataJud request routing (multi-strategy with fallback):
 *
 * 1. Firebase Hosting (lexio.web.app) → POST /api/datajud (Cloud Function rewrite)
 * 2. Any host → POST directly to Cloud Function public URL
 * 3. Direct → POST to DataJud CNJ API with Authorization header (CORS fallback)
 *
 * The service tries endpoints in priority order based on the hosting environment.
 * Once a working endpoint is found, it is cached for subsequent requests.
 */

/** Cloud Function public URL */
const CLOUD_FUNCTION_URL = 'https://southamerica-east1-hocapp-44760.cloudfunctions.net/datajudProxy'

/** Sentinel value indicating direct DataJud API access (no proxy) */
const DIRECT_ENDPOINT = '__direct__'

/** Cached working endpoint — avoids re-probing on every tribunal query */
let _resolvedEndpoint: string | null = null

/** Timestamp of last successful endpoint resolution (ms since epoch) */
let _resolvedAt = 0

/** TTL for the cached endpoint (30 minutes). After this, the endpoint is re-probed. */
const ENDPOINT_CACHE_TTL_MS = 30 * 60 * 1000

/** @internal Reset the cached endpoint (for testing) */
export function _resetEndpointCache(): void {
  _resolvedEndpoint = null
  _resolvedAt = 0
}

/**
 * Build an ordered list of endpoint candidates based on the hosting environment.
 * Avoids candidates known to fail (e.g. relative paths on static hosting).
 */
function getEndpointCandidates(): string[] {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const isFirebase = host === 'lexio.web.app' || host.endsWith('.firebaseapp.com')
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '0.0.0.0'
  const isStaticHosting = host.endsWith('.github.io') || host.endsWith('.netlify.app') || host.endsWith('.vercel.app')

  if (isFirebase) {
    // Firebase Hosting: rewrite /api/datajud → Cloud Function (primary path)
    return ['/api/datajud', CLOUD_FUNCTION_URL]
  }

  if (isLocal) {
    // Local dev: Vite proxy forwards /api/* to backend; Cloud Function is a safe fallback.
    return ['/api/datajud', CLOUD_FUNCTION_URL, DIRECT_ENDPOINT]
  }

  if (isStaticHosting) {
    // Static hosting (GitHub Pages, Netlify, Vercel): no server-side proxy.
    // Avoid direct browser calls to DataJud because CNJ endpoints do not provide stable CORS headers.
    return [CLOUD_FUNCTION_URL]
  }

  // Unknown host: prefer managed proxies only to avoid browser-side CORS failures.
  return [CLOUD_FUNCTION_URL, '/api/datajud']
}

/** Small delay between batches to avoid overwhelming the proxy */
const INTER_BATCH_DELAY = 300

/**
 * Execute a single fetch against a DataJud endpoint (proxy or direct).
 *
 * Retries only for transient errors (429, 5xx, timeout, network).
 * Non-retriable errors (400, 403, 404, 405) fail immediately so the
 * caller can try the next endpoint candidate without delay.
 */
async function fetchFromEndpoint(
  endpoint: string,
  tribunalAlias: string,
  esBody: object,
  signal?: AbortSignal,
): Promise<Array<{ _source?: Record<string, unknown> }>> {
  const isDirect = endpoint === DIRECT_ENDPOINT
  const dataJudApiKey = isDirect ? await getDataJudApiKey() : null
  const url = isDirect
    ? `${DATAJUD_BASE_URL}/api_publica_${tribunalAlias}/_search`
    : endpoint

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (isDirect) {
    headers['Authorization'] = `APIKey ${dataJudApiKey}`
  }

  const reqBody = isDirect
    ? JSON.stringify(esBody)
    : JSON.stringify({ tribunal: tribunalAlias, body: esBody })

  let lastError: Error = new Error('Falha ao consultar DataJud')

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
    const onAbort = () => controller.abort()
    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    let shouldRetry = false

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: reqBody,
        signal: controller.signal,
      })

      if (resp.ok) {
        const data = await resp.json() as { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } }
        return data.hits?.hits ?? []
      }

      // Non-OK response — check if retriable
      lastError = new Error(`DataJud ${isDirect ? 'direct' : 'proxy'} HTTP ${resp.status}`)
      shouldRetry = resp.status === 429 || resp.status >= 500
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (signal?.aborted) throw err
        // Timeout — retriable
        lastError = new Error(`DataJud ${isDirect ? 'direct' : 'proxy'} timeout`)
        shouldRetry = true
      } else {
        // Network or CORS error — may be transient
        lastError = err instanceof Error ? err : new Error(String(err))
        shouldRetry = true
      }
    } finally {
      clearTimeout(timeoutId)
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    if (!shouldRetry || attempt >= MAX_RETRIES) break
    await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * (2 ** attempt)))
  }

  throw lastError
}

/**
 * Execute a DataJud request with automatic endpoint resolution and caching.
 *
 * Tries endpoints in priority order (proxy → Cloud Function → direct API).
 * Once a working endpoint is found, it is cached for subsequent calls.
 * If the cached endpoint later fails with an endpoint-level error (404, 405,
 * timeout), the cache is reset and all candidates are retried.
 */
async function fetchDataJudHits(
  tribunalAlias: string,
  esBody: object,
  signal?: AbortSignal,
): Promise<Array<{ _source?: Record<string, unknown> }>> {
  if (signal?.aborted) throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')

  // Expire cache after TTL
  if (_resolvedEndpoint && Date.now() - _resolvedAt > ENDPOINT_CACHE_TTL_MS) {
    _resolvedEndpoint = null
    _resolvedAt = 0
  }

  // Fast path: use the previously resolved working endpoint
  if (_resolvedEndpoint) {
    try {
      return await fetchFromEndpoint(_resolvedEndpoint, tribunalAlias, esBody, signal)
    } catch (err) {
      // User cancelled — propagate immediately
      if (err instanceof DOMException && err.name === 'AbortError' && signal?.aborted) throw err

      // Only reset cache for endpoint-level failures (404, 405, connection issues).
      // Tribunal-level errors (400, 401, 403, data issues) should propagate as-is
      // since switching endpoints won't help.
      const msg = err instanceof Error ? err.message : ''
      const isEndpointIssue = err instanceof TypeError ||
        /HTTP (404|405)/.test(msg) || msg.includes('timeout')

      if (isEndpointIssue) {
        _resolvedEndpoint = null
        _resolvedAt = 0
        // Fall through to try all candidates below
      } else {
        throw err
      }
    }
  }

  // Probe all endpoint candidates in order
  const candidates = getEndpointCandidates()
  let lastError: unknown = null

  for (const candidate of candidates) {
    if (signal?.aborted) throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')

    try {
      const result = await fetchFromEndpoint(candidate, tribunalAlias, esBody, signal)
      _resolvedEndpoint = candidate // Cache the working endpoint
      _resolvedAt = Date.now()
      return result
    } catch (err) {
      lastError = err
      // User cancelled — propagate immediately
      if (err instanceof DOMException && err.name === 'AbortError' && signal?.aborted) throw err
      // This candidate failed — try next one
      continue
    }
  }

  const detail = lastError instanceof Error ? lastError.message : 'erro desconhecido'
  throw new Error(`Nenhum endpoint DataJud disponível (${detail}). Verifique sua conexão ou tente novamente.`)
}

// ── Tribunal Registry ──────────────────────────────────────────────────────────

export interface TribunalInfo {
  alias: string
  name: string
  category: TribunalCategory
}

export type TribunalCategory =
  | 'superiores'
  | 'federal'
  | 'estadual'
  | 'trabalho'
  | 'eleitoral'
  | 'militar'

const TRIBUNAIS_SUPERIORES: TribunalInfo[] = [
  { alias: 'stf',  name: 'Supremo Tribunal Federal', category: 'superiores' },
  { alias: 'stj',  name: 'Superior Tribunal de Justiça', category: 'superiores' },
  { alias: 'tst',  name: 'Tribunal Superior do Trabalho', category: 'superiores' },
  { alias: 'tse',  name: 'Tribunal Superior Eleitoral', category: 'superiores' },
  { alias: 'stm',  name: 'Superior Tribunal Militar', category: 'superiores' },
]

const JUSTICA_FEDERAL: TribunalInfo[] = [
  { alias: 'trf1', name: 'TRF da 1ª Região', category: 'federal' },
  { alias: 'trf2', name: 'TRF da 2ª Região', category: 'federal' },
  { alias: 'trf3', name: 'TRF da 3ª Região', category: 'federal' },
  { alias: 'trf4', name: 'TRF da 4ª Região', category: 'federal' },
  { alias: 'trf5', name: 'TRF da 5ª Região', category: 'federal' },
  { alias: 'trf6', name: 'TRF da 6ª Região', category: 'federal' },
]

const JUSTICA_ESTADUAL: TribunalInfo[] = [
  { alias: 'tjac', name: 'TJAC — Acre', category: 'estadual' },
  { alias: 'tjal', name: 'TJAL — Alagoas', category: 'estadual' },
  { alias: 'tjam', name: 'TJAM — Amazonas', category: 'estadual' },
  { alias: 'tjap', name: 'TJAP — Amapá', category: 'estadual' },
  { alias: 'tjba', name: 'TJBA — Bahia', category: 'estadual' },
  { alias: 'tjce', name: 'TJCE — Ceará', category: 'estadual' },
  { alias: 'tjdft', name: 'TJDFT — Distrito Federal', category: 'estadual' },
  { alias: 'tjes', name: 'TJES — Espírito Santo', category: 'estadual' },
  { alias: 'tjgo', name: 'TJGO — Goiás', category: 'estadual' },
  { alias: 'tjma', name: 'TJMA — Maranhão', category: 'estadual' },
  { alias: 'tjmg', name: 'TJMG — Minas Gerais', category: 'estadual' },
  { alias: 'tjms', name: 'TJMS — Mato Grosso do Sul', category: 'estadual' },
  { alias: 'tjmt', name: 'TJMT — Mato Grosso', category: 'estadual' },
  { alias: 'tjpa', name: 'TJPA — Pará', category: 'estadual' },
  { alias: 'tjpb', name: 'TJPB — Paraíba', category: 'estadual' },
  { alias: 'tjpe', name: 'TJPE — Pernambuco', category: 'estadual' },
  { alias: 'tjpi', name: 'TJPI — Piauí', category: 'estadual' },
  { alias: 'tjpr', name: 'TJPR — Paraná', category: 'estadual' },
  { alias: 'tjrj', name: 'TJRJ — Rio de Janeiro', category: 'estadual' },
  { alias: 'tjrn', name: 'TJRN — Rio Grande do Norte', category: 'estadual' },
  { alias: 'tjro', name: 'TJRO — Rondônia', category: 'estadual' },
  { alias: 'tjrr', name: 'TJRR — Roraima', category: 'estadual' },
  { alias: 'tjrs', name: 'TJRS — Rio Grande do Sul', category: 'estadual' },
  { alias: 'tjsc', name: 'TJSC — Santa Catarina', category: 'estadual' },
  { alias: 'tjse', name: 'TJSE — Sergipe', category: 'estadual' },
  { alias: 'tjsp', name: 'TJSP — São Paulo', category: 'estadual' },
  { alias: 'tjto', name: 'TJTO — Tocantins', category: 'estadual' },
]

const JUSTICA_TRABALHO: TribunalInfo[] = Array.from({ length: 24 }, (_, i) => ({
  alias: `trt${i + 1}`,
  name: `TRT da ${i + 1}ª Região`,
  category: 'trabalho' as const,
}))

const JUSTICA_ELEITORAL: TribunalInfo[] = [
  'ac','al','am','ap','ba','ce','df','es','go','ma','mg','ms','mt',
  'pa','pb','pe','pi','pr','rj','rn','ro','rr','rs','sc','se','sp','to',
].map(uf => ({
  alias: `tre-${uf}`,
  name: `TRE-${uf.toUpperCase()}`,
  category: 'eleitoral' as const,
}))

const JUSTICA_MILITAR: TribunalInfo[] = [
  { alias: 'tjmmg', name: 'TJM de Minas Gerais', category: 'militar' },
  { alias: 'tjmrs', name: 'TJM do Rio Grande do Sul', category: 'militar' },
  { alias: 'tjmsp', name: 'TJM de São Paulo', category: 'militar' },
]

/** All known tribunals */
export const ALL_TRIBUNALS: TribunalInfo[] = [
  ...TRIBUNAIS_SUPERIORES,
  ...JUSTICA_FEDERAL,
  ...JUSTICA_ESTADUAL,
  ...JUSTICA_TRABALHO,
  ...JUSTICA_ELEITORAL,
  ...JUSTICA_MILITAR,
]

/**
 * Smart default subset of ~20 high-volume tribunals.
 * Covers Superiores + all TRFs + top TJs by case volume.
 */
export const DEFAULT_TRIBUNALS: TribunalInfo[] = [
  ...TRIBUNAIS_SUPERIORES,
  ...JUSTICA_FEDERAL,
  // Top TJs by volume
  ...['tjsp', 'tjrj', 'tjmg', 'tjrs', 'tjpr', 'tjba', 'tjdft', 'tjpe', 'tjsc', 'tjgo']
    .map(alias => JUSTICA_ESTADUAL.find(t => t.alias === alias)!)
    .filter(Boolean),
]

/** Tribunal groups for UI selection */
export const TRIBUNAL_GROUPS: Array<{ category: TribunalCategory; label: string; tribunals: TribunalInfo[] }> = [
  { category: 'superiores', label: 'Tribunais Superiores', tribunals: TRIBUNAIS_SUPERIORES },
  { category: 'federal', label: 'Justiça Federal', tribunals: JUSTICA_FEDERAL },
  { category: 'estadual', label: 'Justiça Estadual', tribunals: JUSTICA_ESTADUAL },
  { category: 'trabalho', label: 'Justiça do Trabalho', tribunals: JUSTICA_TRABALHO },
  { category: 'eleitoral', label: 'Justiça Eleitoral', tribunals: JUSTICA_ELEITORAL },
  { category: 'militar', label: 'Justiça Militar', tribunals: JUSTICA_MILITAR },
]

/** Known grau values for filtering */
export const DATAJUD_GRAUS = [
  { value: 'G1', label: '1ª Instância' },
  { value: 'G2', label: '2ª Instância' },
  { value: 'JE', label: 'Juizado Especial' },
  { value: 'REsp', label: 'Recurso Especial' },
  { value: 'RE', label: 'Recurso Extraordinário' },
]

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DataJudResult {
  tribunal: string
  tribunalName: string
  numeroProcesso: string
  classe: string
  classeCode: number
  assuntos: string[]
  orgaoJulgador: string
  dataAjuizamento: string
  grau: string
  formato: string
  movimentos: Array<{ nome: string; dataHora: string }>
  /** Ementa integral da decisão, quando disponível na API DataJud. */
  ementa?: string
  /** Inteiro teor da decisão, quando disponível na API DataJud. */
  inteiroTeor?: string
  /** Relevance score (0–100) assigned by the ranking LLM. */
  relevanceScore?: number
  /** Stance classification relative to the user's query: favoravel | desfavoravel | neutro. */
  stance?: 'favoravel' | 'desfavoravel' | 'neutro'
}

export interface DataJudSearchProgress {
  phase: 'querying' | 'processing' | 'done'
  tribunalsQueried: number
  tribunalsTotal: number
  resultsFound: number
  currentTribunal: string
  errors: number
}

export interface DataJudSearchOptions {
  /** Override default tribunal subset */
  tribunals?: TribunalInfo[]
  /** Max results per tribunal (default: 5) */
  maxPerTribunal?: number
  /** Total max results across all tribunals (default: 30) */
  maxTotal?: number
  /** Filter: minimum date (YYYY-MM-DD) for dataAjuizamento */
  dateFrom?: string
  /** Filter: maximum date (YYYY-MM-DD) for dataAjuizamento */
  dateTo?: string
  /** Filter: restrict to specific grau values (e.g. ['G1', 'G2', 'JE']) */
  graus?: string[]
  /** Progress callback */
  onProgress?: (progress: DataJudSearchProgress) => void
  /** Abort signal */
  signal?: AbortSignal
}

export interface DataJudSearchResult {
  results: DataJudResult[]
  tribunalsQueried: number
  tribunalsWithResults: number
  errors: string[]
  errorDetails: DataJudErrorDetail[]
  durationMs: number
}

export type DataJudErrorType =
  | 'aborted'
  | 'timeout'
  | 'rate_limit'
  | 'auth'
  | 'http'
  | 'network'
  | 'unknown'

export interface DataJudErrorDetail {
  tribunalAlias: string
  tribunalName: string
  type: DataJudErrorType
  status?: number
  retryable: boolean
  message: string
}

class DataJudRequestError extends Error {
  readonly type: DataJudErrorType
  readonly status?: number
  readonly retryable: boolean

  constructor(message: string, type: DataJudErrorType, status?: number, retryable = false) {
    super(message)
    this.name = 'DataJudRequestError'
    this.type = type
    this.status = status
    this.retryable = retryable
  }
}

// ── Core Search Function ───────────────────────────────────────────────────────

/**
 * Search DataJud across multiple tribunals in parallel.
 * Uses the public CNJ API key — no user configuration needed.
 */
export async function searchDataJud(
  query: string,
  options: DataJudSearchOptions = {},
): Promise<DataJudSearchResult> {
  const start = performance.now()
  const tribunals = options.tribunals ?? DEFAULT_TRIBUNALS
  const maxPerTribunal = options.maxPerTribunal ?? RESULTS_PER_TRIBUNAL
  const maxTotal = options.maxTotal ?? 30
  const onProgress = options.onProgress
  const signal = options.signal

  const allResults: DataJudResult[] = []
  const errors: string[] = []
  const errorDetails: DataJudErrorDetail[] = []
  let tribunalsQueried = 0
  let tribunalsWithResults = 0

  // Build Elasticsearch query body with optional filters
  const boolQuery: Record<string, unknown> = {
    should: [
      { match: { 'assuntos.nome': { query, boost: 3 } } },
      { match: { 'classe.nome': { query, boost: 2 } } },
      { match: { 'orgaoJulgador.nome': { query, boost: 1 } } },
    ],
    minimum_should_match: 1,
  }

  // Add date range and grau filters if specified
  const filters: Array<Record<string, unknown>> = []
  if (options.dateFrom || options.dateTo) {
    const range: Record<string, string> = {}
    if (options.dateFrom) range.gte = options.dateFrom
    if (options.dateTo) range.lte = options.dateTo
    filters.push({ range: { dataAjuizamento: range } })
  }
  if (options.graus && options.graus.length > 0) {
    filters.push({ terms: { grau: options.graus } })
  }
  if (filters.length > 0) {
    boolQuery.filter = filters
  }

  const esBody = {
    size: maxPerTribunal,
    query: { bool: boolQuery },
    sort: [{ dataAjuizamento: { order: 'desc' } }],
  }

  const fetchTribunalData = async (tribunal: TribunalInfo) => {
    if (signal?.aborted) throw new DataJudRequestError('Operação cancelada pelo usuário.', 'aborted')

    try {
      const hits = await fetchDataJudHits(tribunal.alias, esBody, signal)
      return { tribunal, hits }
    } catch (err) {
      // Classify the error
      if (err instanceof DOMException && err.name === 'AbortError') {
        const msg = err.message?.toLowerCase?.() ?? ''
        const isTimeout = msg.includes('time') || msg.includes('timeout')
        throw new DataJudRequestError(
          isTimeout ? `${tribunal.alias}: timeout` : 'Operação cancelada pelo usuário.',
          isTimeout ? 'timeout' : 'aborted',
          undefined,
          isTimeout,
        )
      }
      if (err instanceof Error) {
        const statusMatch = err.message.match(/HTTP (\d{3})/)
        if (statusMatch) {
          const status = Number(statusMatch[1])
          throw new DataJudRequestError(
            `${tribunal.alias}: HTTP ${status}`,
            classifyStatus(status),
            status,
            status === 429 || status >= 500,
          )
        }
      }
      throw new DataJudRequestError(
        `${tribunal.alias}: ${err instanceof Error ? err.message : 'falha na requisição'}`,
        'network',
        undefined,
        true,
      )
    }
  }

  // Process tribunals in batches
  for (let i = 0; i < tribunals.length; i += BATCH_SIZE) {
    if (signal?.aborted) break
    if (allResults.length >= maxTotal) break

    const batch = tribunals.slice(i, i + BATCH_SIZE)

    const batchResults = await Promise.allSettled(
      batch.map((tribunal) => fetchTribunalData(tribunal)),
    )

    for (const [idx, result] of batchResults.entries()) {
      tribunalsQueried++

      if (result.status === 'rejected') {
        const detail = toErrorDetail(result.reason, batch[idx] ?? batch[0])
        errors.push(`${detail.tribunalAlias}: ${detail.message}`)
        errorDetails.push(detail)
        continue
      }

      const { tribunal, hits } = result.value
      if (hits.length > 0) tribunalsWithResults++

      for (const hit of hits) {
        if (allResults.length >= maxTotal) break
        const src = hit._source ?? {}
        allResults.push(parseDataJudHit(src, tribunal))
      }
    }

    onProgress?.({
      phase: i + BATCH_SIZE >= tribunals.length ? 'done' : 'querying',
      tribunalsQueried,
      tribunalsTotal: tribunals.length,
      resultsFound: allResults.length,
      currentTribunal: batch[batch.length - 1]?.name ?? '',
      errors: errors.length,
    })

    // Small delay between batches to avoid overwhelming CORS proxy
    if (i + BATCH_SIZE < tribunals.length && !signal?.aborted) {
      await new Promise(resolve => setTimeout(resolve, INTER_BATCH_DELAY))
    }
  }

  // Sort all results by date descending
  allResults.sort((a, b) => b.dataAjuizamento.localeCompare(a.dataAjuizamento))

  return {
    results: allResults.slice(0, maxTotal),
    tribunalsQueried,
    tribunalsWithResults,
    errors,
    errorDetails,
    durationMs: Math.round(performance.now() - start),
  }
}

// ── Search by Process Number ───────────────────────────────────────────────────

/**
 * Search for a specific process number across all tribunals.
 */
export async function searchDataJudByNumber(
  numero: string,
  signal?: AbortSignal,
): Promise<DataJudResult | null> {
  const clean = numero.replace(/[^\d]/g, '')
  if (clean.length < 10) return null

  // Try all tribunals — number search should be fast
  const esBody = {
    size: 1,
    query: { match: { numeroProcesso: clean } },
  }

  for (const tribunal of ALL_TRIBUNALS) {
    if (signal?.aborted) break
    try {
      const hits = await fetchDataJudHits(tribunal.alias, esBody, signal)
      const hit = hits[0]
      if (hit?._source) return parseDataJudHit(hit._source, tribunal)
    } catch {
      continue
    }
  }
  return null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDataJudHit(src: Record<string, unknown>, tribunal: TribunalInfo): DataJudResult {
  const assuntosRaw = src.assuntos as Array<{ nome?: string; codigo?: number }> | undefined
  const movimentosRaw = src.movimentos as Array<{ nome?: string; dataHora?: string }> | undefined
  const classe = src.classe as { nome?: string; codigo?: number } | undefined
  const orgao = src.orgaoJulgador as { nome?: string } | undefined
  const formato = src.formato as { nome?: string } | undefined

  // Extract ementa — may be a top-level string field in the DataJud _source
  const ementaRaw = src.ementa
  const ementa = typeof ementaRaw === 'string' && ementaRaw.trim()
    ? ementaRaw.trim()
    : undefined

  // Extract inteiro_teor — may be nested as { conteudo?: string } or a plain string.
  // The fallback chain checks both Portuguese property names (conteudo, texto) and
  // the English alias (content) because some tribunal-specific DataJud indexes use
  // inconsistent schemas for this nested field.
  const inteiroTeorRaw = src.inteiro_teor
  let inteiroTeor: string | undefined
  if (typeof inteiroTeorRaw === 'string' && inteiroTeorRaw.trim()) {
    inteiroTeor = inteiroTeorRaw.trim()
  } else if (inteiroTeorRaw && typeof inteiroTeorRaw === 'object') {
    const obj = inteiroTeorRaw as Record<string, unknown>
    const conteudo = obj.conteudo ?? obj.texto ?? obj.content
    if (typeof conteudo === 'string' && conteudo.trim()) {
      inteiroTeor = conteudo.trim()
    }
  }

  return {
    tribunal: tribunal.alias.toUpperCase(),
    tribunalName: tribunal.name,
    numeroProcesso: String(src.numeroProcesso ?? ''),
    classe: classe?.nome ?? '',
    classeCode: classe?.codigo ?? 0,
    assuntos: (assuntosRaw ?? []).map(a => a.nome ?? '').filter(Boolean),
    orgaoJulgador: orgao?.nome ?? '',
    dataAjuizamento: String(src.dataAjuizamento ?? '').slice(0, 10),
    grau: String(src.grau ?? ''),
    formato: formato?.nome ?? '',
    movimentos: (movimentosRaw ?? [])
      .slice(0, 5)
      .map(m => ({ nome: m.nome ?? '', dataHora: String(m.dataHora ?? '').slice(0, 10) })),
    ementa,
    inteiroTeor,
  }
}

/**
 * Format DataJud results as human-readable text for LLM consumption.
 * Includes ementa, inteiro_teor (when available), and movements for richer analysis.
 */
export function formatDataJudResults(results: DataJudResult[]): string {
  if (results.length === 0) return 'Nenhum resultado encontrado.'

  return results.map((r, i) => {
    const lines = [
      `[${i + 1}] Processo ${r.numeroProcesso} — ${r.tribunal}`,
      `   Classe: ${r.classe || '—'}`,
      `   Órgão Julgador: ${r.orgaoJulgador || '—'}`,
      `   Data Ajuizamento: ${r.dataAjuizamento || '—'}`,
      `   Grau: ${r.grau || '—'}`,
    ]
    if (r.assuntos.length > 0) {
      lines.push(`   Assuntos: ${r.assuntos.slice(0, 5).join('; ')}`)
    }
    if (r.ementa) {
      lines.push(`   Ementa: ${r.ementa}`)
    }
    if (r.inteiroTeor) {
      // Include up to 2000 chars of inteiro teor to keep LLM context manageable
      const snippet = r.inteiroTeor.length > 2000
        ? r.inteiroTeor.slice(0, 2000) + '… [texto truncado]'
        : r.inteiroTeor
      lines.push(`   Inteiro Teor: ${snippet}`)
    }
    if (r.movimentos.length > 0) {
      const displayedMovements = r.movimentos.slice(0, 5)
      const hasTruncatedMovements = r.movimentos.length > 5
      lines.push(
        hasTruncatedMovements
          ? `   Movimentações processuais (mostrando ${displayedMovements.length} de ${r.movimentos.length}):`
          : `   Movimentações processuais (${displayedMovements.length}):`,
      )
      for (const m of displayedMovements) {
        lines.push(`     • ${m.dataHora} — ${m.nome}`)
      }
    }
    return lines.join('\n')
  }).join('\n\n')
}

/**
 * Get tribunals by category.
 */
export function getTribunalsByCategory(category: TribunalCategory): TribunalInfo[] {
  return ALL_TRIBUNALS.filter(t => t.category === category)
}

// ── Jurisprudence area classification ───────────────────────────────────────

/**
 * Classification patterns for mapping DataJud assuntos/classe to legal areas.
 * Patterns are ordered from specific → general to prevent false positives.
 */
const JURISPRUDENCE_AREA_PATTERNS: [string, RegExp][] = [
  ['tax',                /tribut[áa]ri|imposto|icms|iss\b|irpj|csll|pis.?cofins|fiscal|tributo|cr[ée]dito tribut/i],
  ['labor',              /trabalh|clt|empregad|trabalhista|rescis[ãa]o.+trabalho|justa causa|fgts|hora extra|direito do trabalho/i],
  ['criminal_procedure', /processo penal|inqu[ée]rito|flagrante|pris[ãa]o preventiva|a[çc][ãa]o penal|execu[çc][ãa]o penal/i],
  ['criminal',           /\bpenal\b|crime|delito|pena privativa|dosimetria|tipicidade|culpabilidade|homic[íi]dio|furto|roubo|tr[áa]fico/i],
  ['environmental',      /ambiental|meio ambiente|licenciamento ambiental|fauna|flora|saneamento|[áa]rea degradada/i],
  ['digital',            /\blgpd\b|dados pessoais|cibern[ée]tic|marco civil|direito digital/i],
  ['administrative',     /administrativ|licita[çc][ãa]o|improbidade|ato administrativo|poder de pol[íi]cia|servidor p[úu]blico|concurso p[úu]blico/i],
  ['civil_procedure',    /processo civil|\bcpc\b|tutela antecipada|cumprimento de senten|execu[çc][ãa]o de t[íi]tulo/i],
  ['consumer',           /consumidor|\bcdc\b|fornecedor|produto defeituoso|v[íi]cio|rela[çc][ãa]o de consumo|plano de sa[úu]de/i],
  ['inheritance',        /sucess[õo]es|heran[çc]a|invent[áa]rio|testamento|legado|herdeiro/i],
  ['family',             /fam[íi]lia|div[óo]rcio|alimentos|guarda|uni[ãa]o est[áa]vel|casamento|partilha|paternidade/i],
  ['constitutional',     /constitucional|direito fundamental|controle de constitucionalidade|\badi\b|\badpf\b|mandado de injun/i],
  ['business',           /empresarial|societ[áa]rio|fal[êe]ncia|recupera[çc][ãa]o judicial|marca|patente|propriedade intelectual/i],
  ['social_security',    /previdenci[áa]ri|inss|aposentadoria|aux[íi]lio.?doen[çc]a|incapacidade|benef[íi]cio previdenci/i],
  ['electoral',          /eleitoral|elei[çc][ãõo]es|candidat|propaganda eleitoral|partido/i],
  ['international',      /internacional|tratado|extradi[çc][ãa]o|homologa[çc][ãa]o.+senten[çc]a.+estrangeira/i],
  ['civil',              /responsabilidade civil|obriga[çc][ãõo]es|dano moral|indeniza[çc]|direito civil|contrato/i],
]

/**
 * Classify a DataJud result into a legal area based on its `assuntos` and `classe` fields.
 * Returns the area key (e.g. 'civil', 'labor') or undefined if no match is found.
 */
export function classifyJurisprudenceArea(
  assuntos: string[],
  classe: string,
  ementa?: string,
): string | undefined {
  // Combine all textual fields into a single searchable string
  const text = assuntos.join(' ') + ' ' + classe + ' ' + (ementa ?? '')
  for (const [area, re] of JURISPRUDENCE_AREA_PATTERNS) {
    if (re.test(text)) return area
  }
  return undefined
}

/**
 * Classify a DataJud result into a legal area. Convenience wrapper accepting a DataJudResult object.
 */
export function classifyResult(result: DataJudResult): string | undefined {
  return classifyJurisprudenceArea(result.assuntos, result.classe, result.ementa)
}

// ── Timeline & grouping utilities ───────────────────────────────────────────

/** Sort results chronologically by `dataAjuizamento` (ascending = oldest first). */
export function sortByDate(results: DataJudResult[], ascending = true): DataJudResult[] {
  return [...results].sort((a, b) => {
    const cmp = a.dataAjuizamento.localeCompare(b.dataAjuizamento)
    return ascending ? cmp : -cmp
  })
}

/** Group of results sharing the same legal area. */
export interface AreaGroup {
  area: string | undefined
  label: string
  results: DataJudResult[]
}

/**
 * Group results by classified legal area.
 * Results that don't classify into any area are grouped under `undefined` with label "Outros".
 */
export function groupByArea(results: DataJudResult[]): AreaGroup[] {
  const map = new Map<string | undefined, DataJudResult[]>()
  for (const r of results) {
    const area = classifyResult(r)
    if (!map.has(area)) map.set(area, [])
    map.get(area)!.push(r)
  }
  // Import AREA_LABELS lazily to avoid circular deps — but it's from constants.ts which has no deps
  const groups: AreaGroup[] = []
  for (const [area, items] of map.entries()) {
    groups.push({ area, label: area ?? 'Outros', results: items })
  }
  // Sort: named areas first (alphabetically by label), then "Outros" last
  groups.sort((a, b) => {
    if (a.area == null && b.area != null) return 1
    if (a.area != null && b.area == null) return -1
    return a.label.localeCompare(b.label)
  })
  return groups
}

/** Fields useful for comparing two processes side-by-side. */
export interface ProcessComparison {
  left: DataJudResult
  right: DataJudResult
  /** True if both processes share at least one assunto. */
  sharedAssuntos: string[]
  /** True if both belong to the same classified area. */
  sameArea: boolean
  /** Difference in days between dataAjuizamento dates (right − left). */
  daysDiff: number | null
}

/**
 * Build a comparison object between two DataJud results.
 * Used by the comparison modal to highlight similarities / differences.
 */
export function compareProcesses(left: DataJudResult, right: DataJudResult): ProcessComparison {
  const leftAssuntos = new Set(left.assuntos.map(a => a.toLowerCase().trim()))
  const sharedAssuntos = right.assuntos.filter(a => leftAssuntos.has(a.toLowerCase().trim()))
  const leftArea = classifyResult(left)
  const sameArea = leftArea != null && leftArea === classifyResult(right)

  let daysDiff: number | null = null
  if (left.dataAjuizamento && right.dataAjuizamento) {
    const lDate = new Date(left.dataAjuizamento)
    const rDate = new Date(right.dataAjuizamento)
    if (!isNaN(lDate.getTime()) && !isNaN(rDate.getTime())) {
      daysDiff = Math.round((rDate.getTime() - lDate.getTime()) / (1000 * 60 * 60 * 24))
    }
  }

  return { left, right, sharedAssuntos, sameArea, daysDiff }
}

// ── Jurisprudence analytics ──────────────────────────────────────────────────

/** Analytics data for jurisprudence results. */
export interface JurisprudenceAnalytics {
  /** Total number of results analyzed. */
  totalResults: number
  /** Distribution by classified legal area. */
  byArea: Array<{ area: string; label: string; count: number }>
  /** Distribution by stance. */
  byStance: { favoravel: number; desfavoravel: number; neutro: number; semClassificacao: number }
  /** Distribution by year (YYYY → count). Sorted ascending. */
  byYear: Array<{ year: string; count: number }>
  /** Distribution by tribunal. */
  byTribunal: Array<{ tribunal: string; count: number }>
  /** Average relevance score (only among scored results). */
  avgRelevanceScore: number | null
}

/**
 * Build analytics data from an array of DataJudResult.
 * Used by the notebook overview tab to show jurisprudence stats.
 */
export function buildJurisprudenceAnalytics(results: DataJudResult[]): JurisprudenceAnalytics {
  const areaMap = new Map<string, { label: string; count: number }>()
  const yearMap = new Map<string, number>()
  const tribunalMap = new Map<string, number>()
  const byStance = { favoravel: 0, desfavoravel: 0, neutro: 0, semClassificacao: 0 }
  let scoreSum = 0
  let scoreCount = 0

  for (const r of results) {
    // Area
    const area = classifyResult(r)
    if (area) {
      const existing = areaMap.get(area)
      if (existing) existing.count++
      else areaMap.set(area, { label: area, count: 1 })
    } else {
      const existing = areaMap.get('outros')
      if (existing) existing.count++
      else areaMap.set('outros', { label: 'outros', count: 1 })
    }

    // Stance
    if (r.stance === 'favoravel') byStance.favoravel++
    else if (r.stance === 'desfavoravel') byStance.desfavoravel++
    else if (r.stance === 'neutro') byStance.neutro++
    else byStance.semClassificacao++

    // Year from dataAjuizamento (YYYY-MM-DD)
    const year = r.dataAjuizamento?.slice(0, 4)
    if (year && /^\d{4}$/.test(year)) {
      yearMap.set(year, (yearMap.get(year) || 0) + 1)
    }

    // Tribunal
    const tribunal = r.tribunalName || r.tribunal
    if (tribunal) {
      tribunalMap.set(tribunal, (tribunalMap.get(tribunal) || 0) + 1)
    }

    // Relevance score
    if (r.relevanceScore != null) {
      scoreSum += r.relevanceScore
      scoreCount++
    }
  }

  const byArea = Array.from(areaMap.entries())
    .map(([area, { label, count }]) => ({ area, label, count }))
    .sort((a, b) => b.count - a.count)

  const byYear = Array.from(yearMap.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year.localeCompare(b.year))

  const byTribunal = Array.from(tribunalMap.entries())
    .map(([tribunal, count]) => ({ tribunal, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalResults: results.length,
    byArea,
    byStance,
    byYear,
    byTribunal,
    avgRelevanceScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
  }
}

function classifyStatus(status: number): DataJudErrorType {
  if (status === 429) return 'rate_limit'
  if (status === 401 || status === 403) return 'auth'
  if (status >= 400) return 'http'
  return 'unknown'
}

function toErrorDetail(reason: unknown, tribunal: TribunalInfo): DataJudErrorDetail {
  if (reason instanceof DataJudRequestError) {
    return {
      tribunalAlias: tribunal.alias,
      tribunalName: tribunal.name,
      type: reason.type,
      status: reason.status,
      retryable: reason.retryable,
      message: reason.message,
    }
  }

  if (reason instanceof DOMException && reason.name === 'AbortError') {
    return {
      tribunalAlias: tribunal.alias,
      tribunalName: tribunal.name,
      type: 'aborted',
      retryable: false,
      message: 'Operação cancelada pelo usuário.',
    }
  }

  if (reason instanceof TypeError) {
    return {
      tribunalAlias: tribunal.alias,
      tribunalName: tribunal.name,
      type: 'network',
      retryable: true,
      message: reason.message || 'Falha de rede',
    }
  }

  return {
    tribunalAlias: tribunal.alias,
    tribunalName: tribunal.name,
    type: 'unknown',
    retryable: false,
    message: reason instanceof Error ? reason.message : String(reason),
  }
}
