/**
 * DataJud API Client — Pesquisa de jurisprudência nos tribunais brasileiros
 *
 * A API Pública do DataJud (CNJ) utiliza Elasticsearch e oferece acesso público
 * com uma APIKey compartilhada. Esta camada abstrai a comunicação com múltiplos
 * tribunais em paralelo e retorna resultados formatados.
 *
 * @see https://datajud-wiki.cnj.jus.br/api-publica/
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/** Public API key provided by CNJ for DataJud API access */
const DATAJUD_API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='

/** Base URL for all DataJud endpoints */
const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br'

/** Concurrency limit for parallel tribunal queries */
const BATCH_SIZE = 4

/** Timeout per tribunal request (ms) */
const REQUEST_TIMEOUT = 15_000
const MAX_RETRIES = 2

/** Max results per tribunal */
const RESULTS_PER_TRIBUNAL = 5

/**
 * CORS proxy providers for browser-side requests.
 * DataJud API doesn't set Access-Control-Allow-Origin headers,
 * so all requests from the browser must be routed through a CORS proxy.
 */
const CORS_PROXIES: Array<(url: string) => string> = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
]

/** Small delay between batches to avoid overwhelming the proxy */
const INTER_BATCH_DELAY = 250

function buildProxiedUrl(targetUrl: string, proxyIndex: number): string {
  if (proxyIndex < CORS_PROXIES.length) {
    return CORS_PROXIES[proxyIndex](targetUrl)
  }
  // Last resort: try direct (will fail due to CORS in most browsers)
  return targetUrl
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

  // Build Elasticsearch query body
  const esBody = {
    size: maxPerTribunal,
    query: {
      bool: {
        should: [
          { match: { 'assuntos.nome': { query, boost: 3 } } },
          { match: { 'classe.nome': { query, boost: 2 } } },
          { match: { 'orgaoJulgador.nome': { query, boost: 1 } } },
        ],
        minimum_should_match: 1,
      },
    },
    sort: [{ dataAjuizamento: { order: 'desc' } }],
  }

  // Track which proxy is working — start with primary, rotate on network failure
  let activeProxyIndex = 0

  const fetchTribunalWithRetry = async (tribunal: TribunalInfo) => {
    let lastError: unknown = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        throw new DataJudRequestError('Operação cancelada pelo usuário.', 'aborted')
      }

      // Try current proxy, then rotate to next on network failure
      const proxyIdx = attempt === 0 ? activeProxyIndex : Math.min(attempt, CORS_PROXIES.length - 1)
      try {
        const targetUrl = `${DATAJUD_BASE_URL}/api_publica_${tribunal.alias}/_search`
        const url = buildProxiedUrl(targetUrl, proxyIdx)
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `APIKey ${DATAJUD_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(esBody),
          signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT),
        })

        if (resp.ok) {
          const data = await resp.json() as {
            hits?: { hits?: Array<{ _source?: Record<string, unknown> }> }
          }
          return { tribunal, hits: data.hits?.hits ?? [] }
        }

        const isRetriable = resp.status === 429 || resp.status >= 500
        if (!isRetriable || attempt >= MAX_RETRIES) {
          throw new DataJudRequestError(
            `${tribunal.alias}: HTTP ${resp.status}`,
            classifyStatus(resp.status),
            resp.status,
            isRetriable,
          )
        }

        if (resp.status === 429) {
          const retryAfter = Number(resp.headers.get('Retry-After') ?? '')
          if (Number.isFinite(retryAfter) && retryAfter > 0) {
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
            continue
          }
        }
      } catch (err) {
        lastError = err
        if (attempt >= MAX_RETRIES) break
      }

      const base = 500 * Math.pow(2, attempt)
      const jitter = Math.round(base * Math.random() * 0.35)
      await new Promise(resolve => setTimeout(resolve, base + jitter))
    }
    if (lastError instanceof DataJudRequestError) throw lastError
    if (lastError instanceof DOMException && lastError.name === 'AbortError') {
      const message = lastError.message?.toLowerCase?.() ?? ''
      const timeoutAbort = message.includes('time') || message.includes('timeout')
      throw new DataJudRequestError(
        timeoutAbort ? `${tribunal.alias}: timeout na consulta` : 'Operação cancelada pelo usuário.',
        timeoutAbort ? 'timeout' : 'aborted',
        undefined,
        timeoutAbort,
      )
    }
    if (lastError instanceof TypeError) {
      // Network/CORS failure — rotate to next proxy for future requests
      if (activeProxyIndex < CORS_PROXIES.length - 1) activeProxyIndex++
      throw new DataJudRequestError(`${tribunal.alias}: falha de rede`, 'network', undefined, true)
    }
    throw new DataJudRequestError(`${tribunal.alias}: falha transitória`, 'unknown', undefined, true)
  }

  // Process tribunals in batches
  for (let i = 0; i < tribunals.length; i += BATCH_SIZE) {
    if (signal?.aborted) break
    if (allResults.length >= maxTotal) break

    const batch = tribunals.slice(i, i + BATCH_SIZE)

    const batchResults = await Promise.allSettled(
      batch.map((tribunal) => fetchTribunalWithRetry(tribunal)),
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
      const targetUrl = `${DATAJUD_BASE_URL}/api_publica_${tribunal.alias}/_search`
      const url = buildProxiedUrl(targetUrl, 0)
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `APIKey ${DATAJUD_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(esBody),
        signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT),
      })
      if (!resp.ok) continue
      const data = await resp.json() as {
        hits?: { hits?: Array<{ _source?: Record<string, unknown> }> }
      }
      const hit = data.hits?.hits?.[0]
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
  }
}

/**
 * Format DataJud results as human-readable text for LLM consumption.
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
    if (r.movimentos.length > 0) {
      lines.push(`   Últimas movimentações:`)
      for (const m of r.movimentos.slice(0, 3)) {
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
