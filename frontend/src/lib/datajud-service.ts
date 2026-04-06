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
 * DataJud request routing:
 *
 * 1. Firebase Hosting (lexio.web.app) → POST /api/datajud (Cloud Function rewrite)
 * 2. GitHub Pages / other hosts → POST directly to Cloud Function public URL
 *
 * Both paths hit the same datajudProxy Cloud Function which adds the
 * Authorization header and forwards to DataJud CNJ API.
 */

/** Cloud Function public URL (used when not on Firebase Hosting) */
const CLOUD_FUNCTION_URL = 'https://southamerica-east1-hocapp-44760.cloudfunctions.net/datajudProxy'

/** Get the DataJud proxy URL — relative path on Firebase Hosting, absolute URL elsewhere */
function getDataJudProxyUrl(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  // Firebase Hosting: use Cloud Function rewrite (relative path)
  if (host.includes('lexio.web.app') || host.includes('firebaseapp.com') || host === 'localhost') {
    return '/api/datajud'
  }
  const basePath = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BASE_PATH) || '/'
  if (basePath === '/') {
    return '/api/datajud'
  }
  // GitHub Pages or any other host: call the Cloud Function directly
  return CLOUD_FUNCTION_URL
}

function getDataJudProxyCandidates(): string[] {
  const basePath = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BASE_PATH) || '/'
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  const candidates = new Set<string>()
  candidates.add(getDataJudProxyUrl())
  candidates.add('/api/datajud')
  if (normalizedBase && normalizedBase !== '') {
    candidates.add(`${normalizedBase}/api/datajud`)
  }
  candidates.add(CLOUD_FUNCTION_URL)
  return Array.from(candidates)
}

/** Small delay between batches to avoid overwhelming the proxy */
const INTER_BATCH_DELAY = 300

/**
 * Execute a DataJud request via Firebase Cloud Function proxy.
 * Works on both Firebase Hosting (relative /api/datajud) and
 * GitHub Pages (absolute Cloud Function URL).
 */
async function fetchDataJudHits(
  tribunalAlias: string,
  esBody: object,
  signal?: AbortSignal,
): Promise<Array<{ _source?: Record<string, unknown> }>> {
  const proxyCandidates = getDataJudProxyCandidates()
  let lastError: unknown = null

  for (const proxyUrl of proxyCandidates) {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const timeoutController = new AbortController()
      const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT)
      const signalController = new AbortController()

      const onExternalAbort = () => signalController.abort()
      if (signal) signal.addEventListener('abort', onExternalAbort, { once: true })
      const onTimeoutAbort = () => signalController.abort()
      timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true })

      try {
        const resp = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tribunal: tribunalAlias, body: esBody }),
          signal: signalController.signal,
        })
        if (!resp.ok) {
          const retriableStatus = resp.status === 429 || resp.status >= 500
          if (!retriableStatus || attempt >= MAX_RETRIES) {
            throw new Error(`DataJud proxy HTTP ${resp.status}`)
          }
          await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
          continue
        }
        const data = await resp.json() as { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } }
        return data.hits?.hits ?? []
      } catch (err) {
        lastError = err
        if (err instanceof DOMException && err.name === 'AbortError') {
          const isUserAbort = signal?.aborted
          if (isUserAbort) throw err
          if (attempt >= MAX_RETRIES) break
          await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
          continue
        }
        if (attempt >= MAX_RETRIES) break
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
      } finally {
        clearTimeout(timeoutId)
        if (signal) signal.removeEventListener('abort', onExternalAbort)
        timeoutController.signal.removeEventListener('abort', onTimeoutAbort)
      }
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('Falha ao consultar DataJud'))
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
