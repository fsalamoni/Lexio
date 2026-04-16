/**
 * DataJud API Client — Pesquisa de jurisprudência nos tribunais brasileiros
 *
 * A API Pública do DataJud (CNJ) utiliza Elasticsearch e oferece acesso público
 * com uma APIKey compartilhada. Esta camada abstrai a comunicação com múltiplos
 * tribunais em paralelo e retorna resultados formatados.
 *
 * @see https://datajud-wiki.cnj.jus.br/api-publica/
 */

import { fetchUrlContent, searchWebResults } from './web-search-service'
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
/**
 * Tribunal aliases whose Elasticsearch indices don't exist on the DataJud public API.
 * These are skipped for DataJud ES queries, but may still be searched via website fallback.
 */
const DATAJUD_API_UNAVAILABLE_ALIASES = new Set(['stf'])

/**
 * STF jurisprudence portal URL template.
 * STF decisions are NOT indexed in DataJud, so we scrape the STF website via Jina Reader.
 */
const STF_JURISPRUDENCE_URL = 'https://jurisprudencia.stf.jus.br/pages/search'

export function _resolveLocalProxyEndpoint(baseUrl?: string): string {
  const resolvedBase = baseUrl
    ?? (typeof import.meta !== 'undefined' ? import.meta.env.BASE_URL : '/')
  const normalizedBase = resolvedBase && resolvedBase !== '/'
    ? resolvedBase.replace(/\/+$/, '')
    : ''
  return `${normalizedBase}/api/datajud`
}

const LOCAL_PROXY_ENDPOINT = _resolveLocalProxyEndpoint()

/** Concurrency limit for parallel tribunal queries */
const BATCH_SIZE = 4

/** Timeout per tribunal request (ms) */
const REQUEST_TIMEOUT = 30_000
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 250
const MAX_TEXT_ENRICHMENT_RESULTS = 10
const MAX_ENRICHMENT_FETCHES_PER_RESULT = 3
const MAX_EMENTA_CHARS = 6_000
const MAX_INTEIRO_TEOR_CHARS = 16_000

/** Max results per tribunal */
const RESULTS_PER_TRIBUNAL = 5

/**
 * DataJud request routing (multi-strategy with fallback):
 *
 * 1. Any host → POST directly to Cloud Function public URL
 * 2. Firebase Hosting/local dev → POST /api/datajud (rewrite/proxy fallback)
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

/** TTL for the cached endpoint (5 minutes). After this, the endpoint is re-probed. */
const ENDPOINT_CACHE_TTL_MS = 5 * 60 * 1000

/** @internal Reset the cached endpoint (for testing) */
export function _resetEndpointCache(): void {
  _resolvedEndpoint = null
  _resolvedAt = 0
}

/**
 * Build an ordered list of endpoint candidates based on the hosting environment.
 * Avoids candidates known to fail (e.g. relative paths on static hosting).
 */
export function _getEndpointCandidatesForHost(host: string, localProxyEndpoint = LOCAL_PROXY_ENDPOINT): string[] {
  const isFirebase = host === 'lexio.web.app' || host.endsWith('.firebaseapp.com')
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '0.0.0.0'
  const isStaticHosting = host.endsWith('.github.io') || host.endsWith('.netlify.app') || host.endsWith('.vercel.app')

  if (isLocal) {
    // Local dev: Vite proxy forwards /api/* to backend; Cloud Function is a safe fallback.
    return [localProxyEndpoint, CLOUD_FUNCTION_URL, DIRECT_ENDPOINT]
  }

  if (isFirebase) {
    // In production, prefer the public Cloud Function URL first because the
    // Hosting rewrite can transiently 404 during propagation and causes noisy
    // console errors in the browser even when the function is healthy.
    return [CLOUD_FUNCTION_URL, localProxyEndpoint]
  }

  if (isStaticHosting) {
    // Static hosting (GitHub Pages, Netlify, Vercel): no server-side proxy.
    // Avoid direct browser calls to DataJud because CNJ endpoints do not provide stable CORS headers.
    return [CLOUD_FUNCTION_URL]
  }

  // Unknown host: prefer managed proxies only to avoid browser-side CORS failures.
  return [CLOUD_FUNCTION_URL, localProxyEndpoint]
}

function getEndpointCandidates(): string[] {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  return _getEndpointCandidatesForHost(host, LOCAL_PROXY_ENDPOINT)
}

/** Small delay between batches to avoid overwhelming the proxy */
const INTER_BATCH_DELAY = 300

const DATAJUD_SEARCH_FIELDS = [
  // Only fields that actually exist in the DataJud public Elasticsearch index.
  // Fields like ementa, inteiro_teor, dadosBasicos.*, acordao.*, documento.*
  // do NOT exist — text must be obtained via web enrichment (JusBrasil, etc.).
  'assuntos.nome^8',
  'classe.nome^6',
  'orgaoJulgador.nome^2',
] as const

// ── Legal Area Filtering ───────────────────────────────────────────────────────

/**
 * Keyword map for each legal area (área do direito).
 * `negative` terms are used to EXCLUDE results clearly from a different area
 * in both JusBrasil queries (via `-term` URL syntax), DataJud ES queries
 * (via `must_not`), and post-filter scoring.
 * `positive` terms identify results that belong to the area.
 * All terms are normalized (no accents, lowercase) for matching.
 */
const LEGAL_AREA_KEYWORDS: Record<string, { positive: string[]; negative: string[] }> = {
  civil: {
    positive: ['civil', 'contrato', 'indenizacao', 'obrigacao', 'locacao', 'dano moral', 'responsabilidade civil', 'posse', 'propriedade', 'usucapiao', 'condominio', 'servidao'],
    negative: ['crime', 'penal', 'homicidio', 'furto', 'roubo', 'trafico', 'prisao', 'pena privativa', 'reclusao', 'detencao', 'latrocinio', 'estelionato', 'trabalhista', 'empregado', 'empregador', 'clt', 'fgts', 'reclamacao trabalhista', 'tributario', 'imposto', 'icms', 'issqn'],
  },
  civil_procedure: {
    positive: ['processo civil', 'cpc', 'procedimento comum', 'execucao civil', 'tutela provisoria', 'recurso especial', 'agravo de instrumento', 'apelacao civel'],
    negative: ['crime', 'penal', 'homicidio', 'furto', 'roubo', 'trafico', 'prisao', 'pena privativa', 'reclusao', 'trabalhista', 'clt', 'fgts', 'reclamacao trabalhista'],
  },
  criminal: {
    positive: ['penal', 'crime', 'pena', 'prisao', 'homicidio', 'furto', 'roubo', 'trafico', 'reclusao', 'detencao', 'latrocinio', 'estelionato', 'reu', 'condenacao criminal', 'absolvicao', 'tipicidade', 'codigo penal', 'execucao penal', 'inquerito'],
    negative: ['contrato civil', 'consumidor', 'locacao', 'tributario', 'trabalhista', 'empregado', 'clt', 'fgts', 'previdenciario', 'aposentadoria', 'indenizacao por dano moral', 'condominio'],
  },
  criminal_procedure: {
    positive: ['processo penal', 'cpp', 'inquerito policial', 'denuncia criminal', 'habeas corpus', 'prisao preventiva', 'fianca', 'juri', 'execucao penal', 'acao penal', 'flagrante'],
    negative: ['contrato civil', 'consumidor', 'locacao', 'tributario', 'trabalhista', 'empregado', 'clt', 'fgts', 'previdenciario'],
  },
  labor: {
    positive: ['trabalhista', 'empregado', 'empregador', 'clt', 'fgts', 'rescisao trabalhista', 'reclamacao trabalhista', 'horas extras', 'aviso previo', 'adicional noturno', 'insalubridade', 'periculosidade', 'contrato de trabalho', 'carteira de trabalho', 'justa causa', 'dissidio'],
    negative: ['crime', 'penal', 'homicidio', 'furto', 'roubo', 'trafico', 'prisao', 'tributario', 'icms', 'imposto', 'consumidor', 'locacao', 'condominio'],
  },
  tax: {
    positive: ['tributario', 'imposto', 'tributo', 'icms', 'iss', 'issqn', 'ipi', 'irpf', 'irpj', 'cofins', 'pis', 'csll', 'contribuicao', 'execucao fiscal', 'divida ativa', 'fisco', 'lancamento tributario'],
    negative: ['crime', 'penal', 'homicidio', 'furto', 'roubo', 'trabalhista', 'clt', 'fgts', 'consumidor', 'locacao', 'condominio', 'familia', 'divorcio'],
  },
  consumer: {
    positive: ['consumidor', 'cdc', 'fornecedor', 'produto defeituoso', 'servico defeituoso', 'propaganda enganosa', 'relacao de consumo', 'vicio', 'recall'],
    negative: ['crime', 'penal', 'homicidio', 'furto', 'roubo', 'trafico', 'prisao', 'trabalhista', 'clt', 'fgts', 'tributario', 'icms', 'execucao fiscal'],
  },
  administrative: {
    positive: ['administrativo', 'servidor publico', 'servidor', 'licitacao', 'concurso publico', 'improbidade', 'poder de policia', 'desapropriacao', 'concessao', 'permissao', 'ato administrativo', 'contratacao temporaria', 'contratacao', 'cargo publico', 'nomeacao', 'exoneracao', 'processo administrativo', 'pregao', 'tomada de precos', 'regime juridico'],
    negative: ['crime', 'penal', 'homicidio', 'furto', 'roubo', 'trafico', 'trabalhista', 'clt', 'fgts', 'consumidor', 'locacao', 'familia', 'divorcio'],
  },
  constitutional: {
    positive: ['constitucional', 'constituicao', 'direito fundamental', 'adi', 'adpf', 'mandado de seguranca', 'controle de constitucionalidade', 'repercussao geral', 'recurso extraordinario', 'stf', 'supremo tribunal federal'],
    negative: ['trabalhista', 'clt', 'fgts', 'consumidor', 'locacao', 'tributario', 'icms', 'execucao fiscal'],
  },
  family: {
    positive: ['familia', 'divorcio', 'guarda', 'alimentos', 'pensao alimenticia', 'uniao estavel', 'casamento', 'paternidade', 'adocao', 'alienacao parental', 'regulamentacao de visitas'],
    negative: ['crime', 'penal', 'homicidio', 'furto', 'roubo', 'trafico', 'trabalhista', 'clt', 'fgts', 'tributario', 'icms', 'execucao fiscal', 'consumidor'],
  },
  inheritance: {
    positive: ['sucessoes', 'heranca', 'inventario', 'testamento', 'meacao', 'partilha', 'espolio', 'herdeiro', 'legatario', 'colacao'],
    negative: ['crime', 'penal', 'homicidio', 'trabalhista', 'clt', 'fgts', 'tributario', 'icms', 'consumidor', 'locacao'],
  },
  business: {
    positive: ['empresarial', 'societario', 'falencia', 'recuperacao judicial', 'empresa', 'sociedade', 'marca', 'patente', 'propriedade industrial', 'titulo de credito', 'contrato social', 'dissolucao'],
    negative: ['crime', 'penal', 'homicidio', 'trabalhista', 'clt', 'fgts', 'familia', 'divorcio', 'alimentos'],
  },
  social_security: {
    positive: ['previdenciario', 'aposentadoria', 'inss', 'beneficio previdenciario', 'auxilio doenca', 'pensao por morte', 'contribuicao previdenciaria', 'tempo de servico', 'incapacidade'],
    negative: ['crime', 'penal', 'homicidio', 'furto', 'roubo', 'trabalhista', 'clt', 'consumidor', 'locacao', 'tributario', 'icms'],
  },
  environmental: {
    positive: ['ambiental', 'meio ambiente', 'poluicao', 'desmatamento', 'licenciamento ambiental', 'area de preservacao', 'crime ambiental', 'fauna', 'flora', 'ibama'],
    negative: ['trabalhista', 'clt', 'fgts', 'consumidor', 'locacao', 'tributario', 'icms', 'familia', 'divorcio'],
  },
  electoral: {
    positive: ['eleitoral', 'eleicao', 'candidato', 'propaganda eleitoral', 'registro de candidatura', 'prestacao de contas', 'inelegibilidade', 'diplomacao'],
    negative: ['crime', 'penal', 'homicidio', 'trabalhista', 'clt', 'fgts', 'consumidor', 'tributario', 'icms', 'familia'],
  },
  international: {
    positive: ['internacional', 'tratado', 'extradicao', 'homologacao de sentenca estrangeira', 'carta rogatoria', 'cooperacao internacional'],
    negative: ['trabalhista', 'clt', 'fgts', 'consumidor', 'locacao', 'tributario', 'icms', 'familia', 'divorcio'],
  },
  digital: {
    positive: ['digital', 'internet', 'dados pessoais', 'lgpd', 'marco civil', 'direito ao esquecimento', 'cibernetico', 'plataforma digital'],
    negative: ['trabalhista', 'clt', 'fgts', 'tributario', 'icms', 'execucao fiscal', 'familia', 'divorcio'],
  },
}

/**
 * Check if a DataJud result belongs to the given legal area.
 * Returns `true` if the result matches positive keywords, `false` if it matches
 * negative keywords more strongly, or `undefined` if indeterminate.
 */
function classifyResultByArea(result: DataJudResult, legalArea: string): boolean | undefined {
  const areaConfig = LEGAL_AREA_KEYWORDS[legalArea]
  if (!areaConfig) return undefined

  // Build a single normalized text blob from all searchable fields
  const blob = normalizeForSearch([
    result.classe,
    result.assuntos.join(' '),
    result.orgaoJulgador,
    result.ementa?.slice(0, 2000) ?? '',
  ].join(' '))

  if (!blob) return undefined

  let positiveHits = 0
  let negativeHits = 0

  for (const term of areaConfig.positive) {
    if (blob.includes(normalizeForSearch(term))) positiveHits++
  }
  for (const term of areaConfig.negative) {
    if (blob.includes(normalizeForSearch(term))) negativeHits++
  }

  // Strong negative signal: more negatives than positives, and at least 2 negatives
  if (negativeHits >= 2 && negativeHits > positiveHits) return false
  // Strong positive signal
  if (positiveHits >= 1 && positiveHits > negativeHits) return true
  // Single negative with zero positives — likely wrong area
  if (negativeHits >= 1 && positiveHits === 0) return false
  return undefined
}

/**
 * Infer the most likely legal area from the query text alone.
 * Uses LEGAL_AREA_KEYWORDS positive arrays — returns the area with the highest
 * match count if it has ≥ 2 hits and leads by at least 1 over the runner-up.
 * Returns undefined when ambiguous or no strong signal.
 */
function inferLegalAreaFromQuery(query: string): string | undefined {
  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) return undefined

  let bestArea: string | undefined
  let bestScore = 0
  let secondScore = 0

  for (const [area, config] of Object.entries(LEGAL_AREA_KEYWORDS)) {
    let hits = 0
    for (const term of config.positive) {
      if (normalizedQuery.includes(normalizeForSearch(term))) hits++
    }
    if (hits > bestScore) {
      secondScore = bestScore
      bestScore = hits
      bestArea = area
    } else if (hits > secondScore) {
      secondScore = hits
    }
  }

  // Require at least 2 positive keyword matches AND a clear lead over the runner-up.
  if (bestArea && bestScore >= 2 && bestScore > secondScore) return bestArea

  // Exception: allow 1 hit when NO other area matches, but only if the keyword is a
  // whole-word match (not a substring). This avoids "juri" matching "jurisprudencia",
  // "adi" matching "administracao", "pis" matching "piso", etc.
  if (bestArea && bestScore === 1 && secondScore === 0) {
    const config = LEGAL_AREA_KEYWORDS[bestArea]
    const hasWordBoundaryMatch = config.positive.some(term => {
      const normalized = normalizeForSearch(term)
      // Compound terms (with spaces) use substring match — they're already specific enough
      if (normalized.includes(' ')) return normalizedQuery.includes(normalized)
      // Single-word terms require word-boundary match to avoid false positives
      return new RegExp(`\\b${normalized}\\b`).test(normalizedQuery)
    })
    if (hasWordBoundaryMatch) return bestArea
  }

  return undefined
}

/** Regex matching clearly criminal case classes (used for scoring penalty). */
const CRIMINAL_CLASS_RE = /criminal|penal|inquerito policial|habeas corpus|execucao penal|carta de ordem|acao penal|revisao criminal|recurso em sentido estrito/

/** Check if a query contains any criminal-positive keywords. */
function queryHasCriminalTerms(query: string): boolean {
  const normalized = normalizeForSearch(query)
  const criminalConfig = LEGAL_AREA_KEYWORDS['criminal']
  if (!criminalConfig) return false
  return criminalConfig.positive.some(term => normalized.includes(normalizeForSearch(term)))
}

/**
 * Build JusBrasil negative query terms for a legal area.
 * Returns string like "-crime -penal -homicídio" to append to URL query.
 * Only uses a subset (max 5) of the most distinctive negative terms to avoid
 * over-filtering that could eliminate valid cross-area references.
 */
function buildJusBrasilNegativeTerms(legalArea: string): string {
  const areaConfig = LEGAL_AREA_KEYWORDS[legalArea]
  if (!areaConfig) return ''
  // Pick top 5 most distinctive single-word negatives (multi-word terms don't work
  // reliably as JusBrasil excludes the first word only)
  const singleWordNegatives = areaConfig.negative
    .filter(t => !t.includes(' '))
    .slice(0, 5)
  return singleWordNegatives.map(t => `-${t}`).join(' ')
}

/**
 * Build ES `must_not` clauses for negative-area terms in DataJud queries.
 * Returns an array of `multi_match` clauses for the `must_not` position.
 */
function buildLegalAreaMustNot(legalArea: string): Array<Record<string, unknown>> {
  const areaConfig = LEGAL_AREA_KEYWORDS[legalArea]
  if (!areaConfig || areaConfig.negative.length === 0) return []
  // Only filter on structured metadata fields (assuntos.nome, classe.nome),
  // NOT on ementa/inteiro_teor (which DataJud doesn't index anyway).
  // Single-word terms are more reliable for must_not filtering.
  const negativeTerms = areaConfig.negative
    .filter(t => !t.includes(' '))
    .slice(0, 8)
    .join(' ')
  if (!negativeTerms) return []
  return [
    {
      multi_match: {
        query: negativeTerms,
        fields: ['assuntos.nome', 'classe.nome'],
        type: 'best_fields',
        operator: 'or',
      },
    },
  ]
}

const PORTUGUESE_STOPWORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'como', 'contra', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'entre',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'por', 'que',
  'sem', 'sob', 'sobre', 'um', 'uma', 'uns', 'umas', 'art', 'arts', 'lei', 'leis', 'tema', 'temas',
])

function summarizeErrorResponseBody(body: string): string | undefined {
  const trimmed = body.trim()
  if (!trimmed) return undefined

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: {
        type?: string
        reason?: string
        root_cause?: Array<{ type?: string; reason?: string }>
      }
      status?: number
    }
    const type = parsed.error?.type ?? parsed.error?.root_cause?.[0]?.type
    const reason = parsed.error?.reason ?? parsed.error?.root_cause?.[0]?.reason
    if (type || reason) return [type, reason].filter(Boolean).join(': ')
  } catch {
    // Ignore invalid JSON and fall back to plain text.
  }

  return trimmed.replace(/\s+/g, ' ').slice(0, 200)
}

function isMissingTribunalIndexErrorMessage(message: string): boolean {
  return /index_not_found_exception/i.test(message)
    || /no such index \[api_publica_/i.test(message)
}

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
        const hits = data.hits?.hits ?? []
        if (isDataJudDebug()) {
          console.debug(`[DataJud] ${tribunalAlias}: ${hits.length} hit(s) via ${isDirect ? 'direct' : 'proxy'}`)
        }
        return hits
      }

      // Non-OK response — check if retriable
      const responseText = await resp.text()
      const responseSummary = summarizeErrorResponseBody(responseText)
      lastError = new Error(`DataJud ${isDirect ? 'direct' : 'proxy'} HTTP ${resp.status}${responseSummary ? ` (${responseSummary})` : ''}`)
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

function isEndpointIssueForCandidate(endpoint: string, err: unknown): boolean {
  if (err instanceof TypeError) return true
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('timeout')) return true
  if (/HTTP 405/.test(message)) return true
  if (/HTTP 404/.test(message)) {
    if (isMissingTribunalIndexErrorMessage(message)) return false
    return endpoint !== DIRECT_ENDPOINT
  }
  return false
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
  tribunal: TribunalInfo,
  esBody: object,
  signal?: AbortSignal,
  attempts: DataJudEndpointAttempt[] = [],
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
      const hits = await fetchFromEndpoint(_resolvedEndpoint, tribunal.alias, esBody, signal)
      recordEndpointAttempt(attempts, tribunal, _resolvedEndpoint, 'success', true)
      return hits
    } catch (err) {
      recordEndpointAttempt(attempts, tribunal, _resolvedEndpoint, 'error', true, err)
      // User cancelled — propagate immediately
      if (err instanceof DOMException && err.name === 'AbortError' && signal?.aborted) throw err

      // Only reset cache for endpoint-level failures (404, 405, connection issues).
      // Tribunal-level errors (400, 401, 403, data issues) should propagate as-is
      // since switching endpoints won't help.
      const isEndpointIssue = isEndpointIssueForCandidate(_resolvedEndpoint, err)

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
      const result = await fetchFromEndpoint(candidate, tribunal.alias, esBody, signal)
      recordEndpointAttempt(attempts, tribunal, candidate, 'success', false)
      _resolvedEndpoint = candidate // Cache the working endpoint
      _resolvedAt = Date.now()
      return result
    } catch (err) {
      lastError = err
      recordEndpointAttempt(attempts, tribunal, candidate, 'error', false, err)
      // User cancelled — propagate immediately
      if (err instanceof DOMException && err.name === 'AbortError' && signal?.aborted) throw err
      if (!isEndpointIssueForCandidate(candidate, err)) {
        throw err
      }
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
 * Smart default subset with broad coverage and good public availability.
 * Covers all superiores, all TRFs, and top state courts by case volume.
 */
export const DEFAULT_TRIBUNALS: TribunalInfo[] = [
  ...TRIBUNAIS_SUPERIORES,
  ...JUSTICA_FEDERAL,
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
  { value: 'SUP', label: 'Tribunais Superiores' },
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
  /** Source from which ementa / inteiro teor were resolved. */
  textSource?: 'datajud' | 'web'
  textSourceUrl?: string
  /** Whether the persisted inteiro teor was truncated for storage/display safety. */
  inteiroTeorTruncated?: boolean
  /** Overall completeness of the decision text available for the result. */
  textCompleteness?: 'complete' | 'partial' | 'missing'
}

export interface DataJudTextStats {
  withEmenta: number
  withInteiroTeor: number
  withBoth: number
  missingBoth: number
  enrichedFromWeb: number
}

export interface DataJudEndpointAttempt {
  tribunalAlias: string
  tribunalName: string
  endpoint: string
  endpointLabel: string
  fromCache: boolean
  outcome: 'success' | 'error'
  status?: number
  message?: string
}

export interface DataJudRuntimeDiagnostics {
  endpointAttempts: DataJudEndpointAttempt[]
  cacheTtlMs: number
}

interface TextFieldCandidate {
  path: string[]
  value: string
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
  /** Filter: legal area key (e.g. 'civil', 'criminal', 'labor') — excludes results from other areas */
  legalArea?: string
  /** Progress callback */
  onProgress?: (progress: DataJudSearchProgress) => void
  /** Abort signal */
  signal?: AbortSignal
  /** Try to enrich missing ementa / inteiro teor using public jurisprudence pages. */
  enrichMissingText?: boolean
  /** Max number of results to enrich externally. */
  maxTextEnrichment?: number
}

export interface DataJudSearchResult {
  results: DataJudResult[]
  tribunalsQueried: number
  tribunalsWithResults: number
  errors: string[]
  errorDetails: DataJudErrorDetail[]
  durationMs: number
  textStats: DataJudTextStats
  runtimeDiagnostics: DataJudRuntimeDiagnostics
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
  lastEndpointLabel?: string
}

class DataJudRequestError extends Error {
  readonly type: DataJudErrorType
  readonly status?: number
  readonly retryable: boolean
  readonly attempts?: DataJudEndpointAttempt[]

  constructor(message: string, type: DataJudErrorType, status?: number, retryable = false, attempts?: DataJudEndpointAttempt[]) {
    super(message)
    this.name = 'DataJudRequestError'
    this.type = type
    this.status = status
    this.retryable = retryable
    this.attempts = attempts
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
  const enrichMissingText = options.enrichMissingText ?? false
  const maxTextEnrichment = options.maxTextEnrichment ?? MAX_TEXT_ENRICHMENT_RESULTS

  // Auto-detect legal area from query when user didn't select one manually
  const effectiveLegalArea = options.legalArea || inferLegalAreaFromQuery(query)

  if (isDataJudDebug() && effectiveLegalArea && !options.legalArea) {
    console.debug(`[DataJud] Auto-detected legal area: ${effectiveLegalArea}`)
  }

  const allResults: DataJudResult[] = []
  const errors: string[] = []
  const errorDetails: DataJudErrorDetail[] = []
  const endpointAttempts: DataJudEndpointAttempt[] = []
  let tribunalsQueried = 0
  let tribunalsWithResults = 0

  // ── Start JusBrasil topic search in parallel (primary relevance source) ──
  const allowedTribunalAliases = new Set(tribunals.map(t => t.alias))
  const jusBrasilPromise = enrichMissingText
    ? searchJusBrasilByTopic(query, allowedTribunalAliases, signal, effectiveLegalArea).catch(() => [] as DataJudResult[])
    : Promise.resolve([] as DataJudResult[])

  // ── Start STF website search in parallel if STF is among requested tribunals ──
  const stfRequested = tribunals.some(t => DATAJUD_API_UNAVAILABLE_ALIASES.has(t.alias) && t.alias === 'stf')
  const stfWebsitePromise = stfRequested
    ? searchSTFViaWebsite(query, maxPerTribunal, signal).catch(() => [] as DataJudResult[])
    : Promise.resolve([] as DataJudResult[])

  const esBody = buildDataJudSearchBody(query, {
    maxPerTribunal,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    graus: options.graus,
    legalArea: effectiveLegalArea,
  })

  const fetchTribunalData = async (tribunal: TribunalInfo) => {
    if (signal?.aborted) throw new DataJudRequestError('Operação cancelada pelo usuário.', 'aborted')

    const tribunalAttempts: DataJudEndpointAttempt[] = []

    if (DATAJUD_API_UNAVAILABLE_ALIASES.has(tribunal.alias)) {
      throw new DataJudRequestError(
        `DataJud público indisponível para ${tribunal.alias.toUpperCase()} (índice ausente no CNJ).`,
        'http',
        404,
        false,
        tribunalAttempts,
      )
    }

    try {
      const hits = await fetchDataJudHits(tribunal, esBody, signal, tribunalAttempts)
      return { tribunal, hits, attempts: tribunalAttempts }
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
          tribunalAttempts,
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
            tribunalAttempts,
          )
        }
      }
      throw new DataJudRequestError(
        `${tribunal.alias}: ${err instanceof Error ? err.message : 'falha na requisição'}`,
        'network',
        undefined,
        true,
        tribunalAttempts,
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
        if (result.reason instanceof DataJudRequestError && result.reason.attempts) {
          endpointAttempts.push(...result.reason.attempts)
        }
        continue
      }

      const { tribunal, hits } = result.value
      endpointAttempts.push(...result.value.attempts)
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

  // ── Fallback retry with relaxed query when initial round returns 0 results ──
  if (allResults.length === 0 && tribunalsQueried > 0 && !signal?.aborted) {
    const significantTerms = extractSignificantQueryTerms(query)
    if (significantTerms.length > 0) {
      const fallbackBody = buildFallbackSearchBody(significantTerms, {
        maxPerTribunal,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        graus: options.graus,
        legalArea: effectiveLegalArea,
      })

      onProgress?.({
        phase: 'querying',
        tribunalsQueried,
        tribunalsTotal: tribunals.length,
        resultsFound: 0,
        currentTribunal: '(busca ampliada)',
        errors: errors.length,
      })

      for (let i = 0; i < tribunals.length; i += BATCH_SIZE) {
        if (signal?.aborted) break
        if (allResults.length >= maxTotal) break
        const batch = tribunals.slice(i, i + BATCH_SIZE)

        const batchResults = await Promise.allSettled(
          batch.map(async (tribunal) => {
            if (DATAJUD_API_UNAVAILABLE_ALIASES.has(tribunal.alias)) return { tribunal, hits: [] as Array<{ _source?: Record<string, unknown> }>, attempts: [] as DataJudEndpointAttempt[] }
            const attempts: DataJudEndpointAttempt[] = []
            const hits = await fetchDataJudHits(tribunal, fallbackBody, signal, attempts)
            return { tribunal, hits, attempts }
          }),
        )

        for (const result of batchResults) {
          if (result.status === 'rejected') continue
          const { tribunal, hits } = result.value
          endpointAttempts.push(...result.value.attempts)
          if (hits.length > 0) tribunalsWithResults++
          for (const hit of hits) {
            if (allResults.length >= maxTotal) break
            const src = hit._source ?? {}
            allResults.push(parseDataJudHit(src, tribunal))
          }
        }

        if (i + BATCH_SIZE < tribunals.length && !signal?.aborted) {
          await new Promise(resolve => setTimeout(resolve, INTER_BATCH_DELAY))
        }
      }

      if (isDataJudDebug()) {
        console.debug('[DataJud] Fallback retry produced', allResults.length, 'results')
      }
    }
  }

  onProgress?.({
    phase: 'processing',
    tribunalsQueried,
    tribunalsTotal: tribunals.length,
    resultsFound: allResults.length,
    currentTribunal: '',
    errors: errors.length,
  })

  if (isDataJudDebug()) {
    console.debug(`[DataJud] Raw results: ${allResults.length} from ${tribunalsWithResults} tribunal(is), ${errors.length} error(s)`)
  }

  let refinedResults = rankAndFilterDataJudResults(query, allResults, maxTotal, effectiveLegalArea)

  if (isDataJudDebug()) {
    console.debug(`[DataJud] After ranking: ${refinedResults.length} results (max ${maxTotal})`)
  }

  if (enrichMissingText && refinedResults.length > 0) {
    refinedResults = await enrichResultsWithDecisionText(
      query,
      refinedResults,
      Math.min(maxTextEnrichment, refinedResults.length),
      signal,
    )
    refinedResults = rankAndFilterDataJudResults(query, refinedResults, maxTotal, effectiveLegalArea)
  }

  // ── Merge JusBrasil topic search results (primary relevance source) ──────
  const jusBrasilResults = await jusBrasilPromise
  if (jusBrasilResults.length > 0) {
    if (isDataJudDebug()) {
      console.debug(`[DataJud] JusBrasil topic search returned ${jusBrasilResults.length} results`)
    }
    // Score JusBrasil results and merge with DataJud results
    const scoredJB = jusBrasilResults.map(r => ({
      ...r,
      relevanceScore: scoreDataJudResult(query, r, effectiveLegalArea),
    }))
    // Combine: JusBrasil results first (they have ementa + are topically relevant)
    const combined = [...scoredJB, ...refinedResults]
    refinedResults = rankAndFilterDataJudResults(query, combined, maxTotal, effectiveLegalArea)
  }

  // ── Merge STF website search results (fallback for DataJud-unavailable STF) ──
  const stfWebsiteResults = await stfWebsitePromise
  if (stfWebsiteResults.length > 0) {
    if (isDataJudDebug()) {
      console.debug(`[DataJud] STF website search returned ${stfWebsiteResults.length} results`)
    }
    tribunalsWithResults++
    const scoredSTF = stfWebsiteResults.map(r => ({
      ...r,
      relevanceScore: scoreDataJudResult(query, r, effectiveLegalArea),
    }))
    const combined = [...scoredSTF, ...refinedResults]
    refinedResults = rankAndFilterDataJudResults(query, combined, maxTotal, effectiveLegalArea)

    // Remove the DataJud "index unavailable" error for STF since website search succeeded
    const stfErrorIdx = errorDetails.findIndex(e => e.tribunalAlias === 'stf')
    if (stfErrorIdx >= 0) {
      errorDetails.splice(stfErrorIdx, 1)
      const stfErrMsgIdx = errors.findIndex(e => e.startsWith('stf:'))
      if (stfErrMsgIdx >= 0) errors.splice(stfErrMsgIdx, 1)
    }
  }

  const finalizedResults = refinedResults.map(result => ({
    ...result,
    textCompleteness: inferTextCompleteness(result),
  }))

  return {
    results: finalizedResults.slice(0, maxTotal),
    tribunalsQueried,
    tribunalsWithResults,
    errors,
    errorDetails,
    durationMs: Math.round(performance.now() - start),
    textStats: buildTextStats(finalizedResults),
    runtimeDiagnostics: {
      endpointAttempts,
      cacheTtlMs: ENDPOINT_CACHE_TTL_MS,
    },
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
      const hits = await fetchDataJudHits(tribunal, esBody, signal)
      const hit = hits[0]
      if (hit?._source) return parseDataJudHit(hit._source, tribunal)
    } catch {
      continue
    }
  }
  return null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface BuildDataJudSearchBodyOptions {
  maxPerTribunal: number
  dateFrom?: string
  dateTo?: string
  graus?: string[]
  legalArea?: string
}

export function buildDataJudSearchBody(query: string, options: BuildDataJudSearchBodyOptions): Record<string, unknown> {
  const significantTerms = extractSignificantQueryTerms(query)
  const compactQuery = significantTerms.join(' ')
  const filters: Array<Record<string, unknown>> = []

  if (options.dateFrom || options.dateTo) {
    const range: Record<string, string> = {}
    if (options.dateFrom) range.gte = options.dateFrom
    if (options.dateTo) range.lte = options.dateTo
    filters.push({ range: { dataAjuizamento: range } })
  }

  if (options.graus && options.graus.length > 0) {
    // grau is a text field in DataJud — use bool/should+match (not terms) so the
    // standard analyzer lowercases values automatically (G2 → g2, SUP → sup, etc.)
    filters.push({
      bool: {
        should: options.graus.map(g => ({ match: { grau: g } })),
        minimum_should_match: 1,
      },
    })
  }

  const should: Record<string, unknown>[] = [
    {
      multi_match: {
        query,
        fields: [...DATAJUD_SEARCH_FIELDS],
        type: 'best_fields',
        operator: significantTerms.length <= 3 ? 'and' : 'or',
        minimum_should_match: '60%',
        boost: 7,
      },
    },
    {
      multi_match: {
        query,
        fields: [...DATAJUD_SEARCH_FIELDS],
        type: 'phrase',
        slop: 2,
        boost: 11,
      },
    },
    {
      multi_match: {
        query,
        fields: ['assuntos.nome^10', 'classe.nome^7'],
        type: 'phrase_prefix',
        max_expansions: 20,
        boost: 5,
      },
    },
  ]

  if (compactQuery) {
    should.push({
      multi_match: {
        query: compactQuery,
        fields: [...DATAJUD_SEARCH_FIELDS],
        type: 'cross_fields',
        operator: significantTerms.length <= 4 ? 'and' : 'or',
        minimum_should_match: significantTerms.length > 4 ? '60%' : '100%',
        boost: 6,
      },
    })

    // Broad safety-net: ensures at least some results when stricter clauses all fail
    should.push({
      multi_match: {
        query: compactQuery,
        fields: ['assuntos.nome^4', 'classe.nome^3'],
        type: 'most_fields',
        operator: 'or',
        boost: 2,
      },
    })
  }

  const boolQuery: Record<string, unknown> = {
    should,
    minimum_should_match: 1,
  }

  if (filters.length > 0) {
    boolQuery.filter = filters
  }

  // Exclude results from clearly unrelated legal areas
  if (options.legalArea) {
    const mustNotClauses = buildLegalAreaMustNot(options.legalArea)
    if (mustNotClauses.length > 0) {
      boolQuery.must_not = mustNotClauses
    }
  }

  const esResult = {
    size: options.maxPerTribunal,
    query: { bool: boolQuery },
    sort: [
      { _score: { order: 'desc' } },
      { dataAjuizamento: { order: 'desc' } },
    ],
    track_scores: true,
  }

  if (isDataJudDebug()) {
    console.debug('[DataJud] ES query body:', JSON.stringify(esResult, null, 2))
    console.debug('[DataJud] significant terms:', significantTerms, '| clauses:', should.length, '| legalArea:', options.legalArea ?? 'none')
  }

  return esResult
}

/** Maximum-lenient fallback query used when the primary query returns 0 hits. */
function buildFallbackSearchBody(
  significantTerms: string[],
  options: BuildDataJudSearchBodyOptions,
): Record<string, unknown> {
  const compactQuery = significantTerms.join(' ')
  const filters: Array<Record<string, unknown>> = []

  if (options.dateFrom || options.dateTo) {
    const range: Record<string, string> = {}
    if (options.dateFrom) range.gte = options.dateFrom
    if (options.dateTo) range.lte = options.dateTo
    filters.push({ range: { dataAjuizamento: range } })
  }
  if (options.graus && options.graus.length > 0) {
    filters.push({
      bool: {
        should: options.graus.map(g => ({ match: { grau: g } })),
        minimum_should_match: 1,
      },
    })
  }

  const boolQuery: Record<string, unknown> = {
    should: [
      {
        multi_match: {
          query: compactQuery,
          fields: ['assuntos.nome^6', 'classe.nome^4'],
          type: 'most_fields',
          operator: 'or',
        },
      },
      {
        multi_match: {
          query: compactQuery,
          fields: ['assuntos.nome^4', 'classe.nome^3'],
          type: 'cross_fields',
          operator: 'or',
          minimum_should_match: '40%',
        },
      },
    ],
    minimum_should_match: 1,
  }

  if (filters.length > 0) {
    boolQuery.filter = filters
  }

  if (options.legalArea) {
    const mustNotClauses = buildLegalAreaMustNot(options.legalArea)
    if (mustNotClauses.length > 0) {
      boolQuery.must_not = mustNotClauses
    }
  }

  return {
    size: options.maxPerTribunal,
    query: { bool: boolQuery },
    sort: [
      { _score: { order: 'desc' } },
      { dataAjuizamento: { order: 'desc' } },
    ],
    track_scores: true,
  }
}

/** Check localStorage debug flag — gated to avoid runtime issues in non-browser contexts. */
function isDataJudDebug(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('DATAJUD_DEBUG') === 'true'
  } catch {
    return false
  }
}

function rankAndFilterDataJudResults(query: string, results: DataJudResult[], maxTotal: number, legalArea?: string): DataJudResult[] {
  const scored = results
    .map(result => ({
      ...result,
      relevanceScore: scoreDataJudResult(query, result, legalArea),
    }))
    .sort((left, right) => {
      const scoreDiff = (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0)
      if (scoreDiff !== 0) return scoreDiff
      return right.dataAjuizamento.localeCompare(left.dataAjuizamento)
    })

  if (scored.length === 0) return []

  // When a legal area is set, remove results clearly from wrong area (keep top 3 always)
  let areaFiltered = scored
  if (legalArea) {
    areaFiltered = scored.filter((result, index) => {
      if (index < 3) return true
      const classification = classifyResultByArea(result, legalArea)
      return classification !== false
    })
    if (areaFiltered.length === 0) areaFiltered = scored.slice(0, 3)
  }

  const topScore = areaFiltered[0]?.relevanceScore ?? 0
  const minimumAcceptedScore = topScore >= 75 ? 28 : topScore >= 55 ? 22 : 16
  let filtered = areaFiltered.filter((result, index) => index < 3 || (result.relevanceScore ?? 0) >= minimumAcceptedScore)

  if (filtered.length < Math.min(5, areaFiltered.length)) {
    filtered = areaFiltered.slice(0, Math.min(areaFiltered.length, Math.max(5, maxTotal)))
  }

  return filtered.slice(0, maxTotal)
}

export function scoreDataJudResult(query: string, result: DataJudResult, legalArea?: string): number {
  const normalizedQuery = normalizeForSearch(query)
  const terms = extractSignificantQueryTerms(query)
  const texts = [
    { value: result.ementa, weight: 14 },
    { value: result.inteiroTeor, weight: 10 },
    // Cap at 10 assuntos for scoring — catalog entries with 200+ assuntos game term overlap
    { value: result.assuntos.slice(0, 10).join(' '), weight: 8 },
    { value: result.classe, weight: 6 },
    { value: result.orgaoJulgador, weight: 2 },
  ]

  let score = tribunalCategoryWeight(result.tribunalName, result.tribunal)
  const matchedTerms = new Set<string>()

  for (const text of texts) {
    const normalized = normalizeForSearch(text.value || '')
    if (!normalized) continue

    if (normalizedQuery && normalized.includes(normalizedQuery)) {
      score += text.weight * 2.4
    }

    for (const term of terms) {
      if (normalized.includes(term)) {
        matchedTerms.add(term)
        score += text.weight
      }
    }
  }

  const overlapRatio = terms.length > 0 ? matchedTerms.size / terms.length : 0
  score += overlapRatio * 28

  if (result.ementa) score += 6
  if (result.inteiroTeor) score += 4
  // Results without any text are useless for legal research
  if (!result.ementa && !result.inteiroTeor) score -= 10
  else if (!result.ementa || !result.inteiroTeor) score -= 1

  // Anomalous assunto count — catalog/procedural dumps have 30-500+ assuntos;
  // real jurisprudence typically has 1-5
  if (result.assuntos.length > 100) score -= 40
  else if (result.assuntos.length > 30) score -= 25

  // Criminal class appearing in a non-criminal query — strong wrong-area signal
  if (!queryHasCriminalTerms(query)) {
    const normalizedClasse = normalizeForSearch(result.classe)
    if (CRIMINAL_CLASS_RE.test(normalizedClasse)) score -= 20
  }

  if (result.dataAjuizamento) {
    const year = Number(result.dataAjuizamento.slice(0, 4))
    if (!Number.isNaN(year) && year >= new Date().getFullYear() - 5) {
      score += 4
    }
  }

  // Legal area relevance: penalize results from clearly wrong area, bonus for matching
  if (legalArea) {
    const areaClassification = classifyResultByArea(result, legalArea)
    if (areaClassification === false) score -= 30
    else if (areaClassification === true) score += 8
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

function tribunalCategoryWeight(tribunalName: string, tribunalAlias: string): number {
  const normalized = normalizeForSearch(`${tribunalName} ${tribunalAlias}`)
  if (/supremo|superior tribunal|\bstj\b|\bstf\b|\btst\b|\btse\b|\bstm\b/.test(normalized)) return 12
  if (/\btrf\b/.test(normalized)) return 8
  if (/\btj\b|tribunal de justica/.test(normalized)) return 6
  if (/\btrt\b|trabalho/.test(normalized)) return 5
  return 4
}

function extractSignificantQueryTerms(query: string): string[] {
  const normalized = normalizeForSearch(query)
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean)
  const filtered = tokens.filter(token => token.length >= 3 && !PORTUGUESE_STOPWORDS.has(token))
  return Array.from(new Set(filtered))
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function endpointLabel(endpoint: string): string {
  if (endpoint === DIRECT_ENDPOINT) return 'DataJud direto'
  if (endpoint === CLOUD_FUNCTION_URL) return 'Cloud Function pública'
  if (/\/api\/datajud$/i.test(endpoint)) return 'Rewrite /api/datajud'
  return endpoint
}

function extractStatusFromError(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined
  const match = err.message.match(/HTTP (\d{3})/)
  return match ? Number(match[1]) : undefined
}

function shortenErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return undefined
}

function recordEndpointAttempt(
  attempts: DataJudEndpointAttempt[],
  tribunal: TribunalInfo,
  endpoint: string,
  outcome: 'success' | 'error',
  fromCache: boolean,
  err?: unknown,
): void {
  attempts.push({
    tribunalAlias: tribunal.alias,
    tribunalName: tribunal.name,
    endpoint,
    endpointLabel: endpointLabel(endpoint),
    fromCache,
    outcome,
    status: extractStatusFromError(err),
    message: shortenErrorMessage(err),
  })
}

function parseDataJudHit(src: Record<string, unknown>, tribunal: TribunalInfo): DataJudResult {
  const assuntosRaw = src.assuntos as Array<{ nome?: string; codigo?: number }> | undefined
  const movimentosRaw = src.movimentos as Array<{ nome?: string; dataHora?: string }> | undefined
  const classe = src.classe as { nome?: string; codigo?: number } | undefined
  const orgao = src.orgaoJulgador as { nome?: string } | undefined
  const formato = src.formato as { nome?: string } | undefined
  const ementa = extractEmenta(src)
  const inteiroTeor = extractInteiroTeor(src)

  return {
    tribunal: repairMojibake(tribunal.alias.toUpperCase()),
    tribunalName: repairMojibake(tribunal.name),
    numeroProcesso: String(src.numeroProcesso ?? ''),
    classe: repairMojibake(classe?.nome ?? ''),
    classeCode: classe?.codigo ?? 0,
    assuntos: extractAssuntoNames(assuntosRaw ?? []),
    orgaoJulgador: repairMojibake(orgao?.nome ?? ''),
    dataAjuizamento: normalizeDataJudDate(src.dataAjuizamento),
    grau: String(src.grau ?? ''),
    formato: repairMojibake(formato?.nome ?? ''),
    movimentos: (movimentosRaw ?? [])
      .slice(0, 5)
      .map(m => ({ nome: repairMojibake(m.nome ?? ''), dataHora: normalizeDataJudDate(m.dataHora) })),
    ementa,
    inteiroTeor,
    textSource: ementa || inteiroTeor ? 'datajud' : undefined,
    textCompleteness: inferTextCompleteness({ ementa, inteiroTeor }),
  }
}

function extractAssuntoNames(assuntosRaw: unknown[]): string[] {
  const names: string[] = []

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return

    const nome = (value as { nome?: unknown }).nome
    if (typeof nome === 'string' && nome.trim()) {
      names.push(repairMojibake(nome.trim()))
    }
  }

  assuntosRaw.forEach(visit)
  return Array.from(new Set(names))
}

function normalizeDataJudDate(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const compactMatch = raw.match(/^(\d{4})(\d{2})(\d{2})/)
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`

  return raw.slice(0, 10)
}

function repairMojibake(value: string): string {
  if (!value || !/[ÃÂâ€]|�/.test(value)) return value
  try {
    const bytes = Uint8Array.from(value, char => char.charCodeAt(0) & 0xff)
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return decoded || value
  } catch {
    return value
  }
}

function collectTextCandidates(value: unknown, path: string[] = [], depth = 0): TextFieldCandidate[] {
  if (depth > 10 || value == null) return []

  if (typeof value === 'string') {
    const text = value.trim()
    return text.length >= 3 ? [{ path, value: repairMojibake(text) }] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectTextCandidates(entry, [...path, String(index)], depth + 1))
  }

  if (typeof value !== 'object') return []

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    collectTextCandidates(nested, [...path, key], depth + 1),
  )
}

function pickCandidateByPatterns(
  src: Record<string, unknown>,
  preferredPaths: string[][],
  pathMatchers: RegExp[],
  excludedPathMatchers: RegExp[] = [],
): string | undefined {
  for (const path of preferredPaths) {
    let current: unknown = src
    for (const segment of path) {
      if (!current || typeof current !== 'object') {
        current = undefined
        break
      }
      current = (current as Record<string, unknown>)[segment]
    }

    if (typeof current === 'string' && current.trim()) {
      return repairMojibake(current.trim())
    }

    if (current && typeof current === 'object') {
      const nestedCandidates = collectTextCandidates(current, path)
      const bestNestedCandidate = selectBestTextCandidate(nestedCandidates, pathMatchers, [], true)
      if (bestNestedCandidate) return bestNestedCandidate.value
    }
  }

  return selectBestTextCandidate(collectTextCandidates(src), pathMatchers, excludedPathMatchers)?.value
}

function selectBestTextCandidate(
  candidates: TextFieldCandidate[],
  pathMatchers: RegExp[],
  excludedPathMatchers: RegExp[] = [],
  allowAnyCandidate = false,
): TextFieldCandidate | undefined {
  const ranked = candidates
    .filter(candidate => {
      const joinedPath = candidate.path.join('.')
      if (excludedPathMatchers.some(matcher => matcher.test(joinedPath))) return false
      if (allowAnyCandidate) return true
      return pathMatchers.some(matcher => matcher.test(joinedPath))
    })
    .map(candidate => {
      const joinedPath = candidate.path.join('.')
      let score = Math.min(candidate.value.length, 5000)
      if (pathMatchers.some(matcher => matcher.test(joinedPath))) score += 4000
      if (/ementa|inteiro|acord|decis|conteudo|texto/i.test(joinedPath)) score += 1200
      if (/documento\.paginas\.[0-9]+\.(conteudo|texto)/i.test(joinedPath)) score += 900
      if (/metadados\.decisao\./i.test(joinedPath)) score += 900
      score -= candidate.path.length * 10
      return { candidate, score }
    })
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.candidate
}

function extractEmenta(src: Record<string, unknown>): string | undefined {
  const value = pickCandidateByPatterns(
    src,
    [
      ['ementa'],
      ['dadosBasicos', 'ementa'],
      ['julgamento', 'ementa'],
      ['documento', 'ementa'],
      ['metadados', 'ementa'],
      ['metadados', 'decisao', 'ementa'],
      ['acordao', 'ementa'],
      ['acórdão', 'ementa'],
    ],
    [/\bementa\b/i, /\bresumo\b/i, /sumula/i],
    [/movimentos/i, /assuntos/i, /documento\.paginas\./i],
  )
  return value ? trimDecisionText(value, MAX_EMENTA_CHARS) : undefined
}

function extractInteiroTeor(src: Record<string, unknown>): string | undefined {
  const value = pickCandidateByPatterns(
    src,
    [
      ['inteiro_teor'],
      ['inteiroTeor'],
      ['dadosBasicos', 'inteiro_teor'],
      ['dadosBasicos', 'inteiroTeor'],
      ['acordao'],
      ['acordao', 'texto_integral'],
      ['acordao', 'texto'],
      ['acórdão'],
      ['acórdão', 'texto_integral'],
      ['acórdão', 'texto'],
      ['documento', 'conteudo'],
      ['documento', 'texto'],
      ['documento', 'paginas', '0', 'conteudo'],
      ['documento', 'paginas', '1', 'conteudo'],
      ['documento', 'paginas', '0', 'texto'],
      ['documento', 'paginas'],
      ['metadados', 'decisao', 'conteudo_integral'],
      ['metadados', 'decisao', 'texto'],
      ['metadados', 'decisao', 'acordao', 'texto'],
      ['metadados', 'decisao', 'acordao', 'conteudo'],
      ['julgamento', 'acordao_redacao'],
      ['julgamento', 'inteiro_teor'],
    ],
    [/inteiro[_-]?teor/i, /ac[oó]rd[aã]o/i, /decis[aã]o/i, /julgad/i, /conteudo/i, /texto/i],
    [/movimentos/i, /assuntos/i, /classe/i, /orgaoJulgador/i, /sistema/i, /formato/i, /complementosTabelados/i],
  )
  return value ? trimDecisionText(value, MAX_INTEIRO_TEOR_CHARS) : undefined
}

function trimDecisionText(value: string, maxChars: number): string {
  const trimmed = repairMojibake(value).replace(/\n{3,}/g, '\n\n').trim()
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}…` : trimmed
}

async function enrichResultsWithDecisionText(
  query: string,
  results: DataJudResult[],
  maxItems: number,
  signal?: AbortSignal,
): Promise<DataJudResult[]> {
  const candidates = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.textSource !== 'web' && (!result.ementa || !result.inteiroTeor))
    .slice(0, maxItems)

  if (candidates.length === 0) return results

  const updates = await Promise.all(candidates.map(async ({ result, index }) => ({
    index,
    result: await enrichResultDecisionText(query, result, signal),
  })))

  const enriched = [...results]
  for (const update of updates) {
    enriched[update.index] = update.result
  }
  return enriched
}

async function enrichResultDecisionText(
  query: string,
  result: DataJudResult,
  signal?: AbortSignal,
): Promise<DataJudResult> {
  if (signal?.aborted) return result

  // ── Strategy 1: Direct JusBrasil fetch (most reliable) ──────────────────
  const jusBrasilResult = await enrichViaJusBrasil(result, signal)
  if (jusBrasilResult) return jusBrasilResult

  // ── Strategy 2: DuckDuckGo web search fallback ─────────────────────────
  const searchQueries = buildJurisprudenceEnrichmentQueries(query, result)

  for (const searchQuery of searchQueries) {
    let searchResults: Array<{ title: string; url: string; snippet: string }> = []
    try {
      searchResults = await searchWebResults(searchQuery, signal)
    } catch {
      continue
    }

    const candidates = rankEnrichmentCandidates(searchResults, result).slice(0, MAX_ENRICHMENT_FETCHES_PER_RESULT)

    for (const candidate of candidates) {
      if (signal?.aborted) return result

      let content = ''
      try {
        content = await fetchUrlContent(candidate.url)
      } catch {
        continue
      }

      if (!content) continue

      const extracted = extractDecisionTextFromWebContent(content, result)
      if (extracted.ementa || extracted.inteiroTeor) {
        const nextResult: DataJudResult = {
          ...result,
          ementa: extracted.ementa ?? result.ementa,
          inteiroTeor: extracted.inteiroTeor ?? result.inteiroTeor,
          textSource: 'web',
          textSourceUrl: candidate.url,
        }
        nextResult.textCompleteness = inferTextCompleteness(nextResult)
        return nextResult
      }
    }
  }

  return result
}

/**
 * Enrichment Strategy 1: Directly fetch JusBrasil jurisprudence search page.
 * JusBrasil indexes most Brazilian court decisions and returns structured ementas.
 */
async function enrichViaJusBrasil(
  result: DataJudResult,
  signal?: AbortSignal,
): Promise<DataJudResult | null> {
  if (signal?.aborted) return null

  const numeroFormatado = result.numeroProcesso.includes('-')
    ? result.numeroProcesso
    : formatProcessoNumber(result.numeroProcesso)
  const jusBrasilUrl = `https://www.jusbrasil.com.br/jurisprudencia/busca?q=${encodeURIComponent(numeroFormatado)}`

  let content = ''
  try {
    content = await fetchUrlContent(jusBrasilUrl)
  } catch {
    return null
  }

  if (!content || content.length < 200) return null

  const extracted = extractFromJusBrasilContent(content, result)
  if (!extracted.ementa && !extracted.inteiroTeor) return null

  const enriched: DataJudResult = {
    ...result,
    ementa: extracted.ementa ?? result.ementa,
    inteiroTeor: extracted.inteiroTeor ?? result.inteiroTeor,
    textSource: 'web',
    textSourceUrl: jusBrasilUrl,
  }
  enriched.textCompleteness = inferTextCompleteness(enriched)

  if (isDataJudDebug()) {
    console.debug(`[DataJud] JusBrasil enrichment succeeded for ${result.numeroProcesso}`, {
      ementaLen: extracted.ementa?.length ?? 0,
      inteiroTeorLen: extracted.inteiroTeor?.length ?? 0,
    })
  }

  return enriched
}

/**
 * Format a raw (digits-only) processo number into CNJ standard format:
 * NNNNNNN-DD.AAAA.J.TR.OOOO
 */
function formatProcessoNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 20) return raw
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`
}

// ── JusBrasil Topic Search (primary relevance source) ──────────────────────

/**
 * Search JusBrasil by topic query. Returns results with ementa text.
 * JusBrasil has full-text search over ementas and inteiro teor, unlike DataJud
 * which only indexes metadata (assuntos.nome, classe.nome).
 */
async function searchJusBrasilByTopic(
  query: string,
  allowedTribunalAliases: Set<string>,
  signal?: AbortSignal,
  legalArea?: string,
): Promise<DataJudResult[]> {
  if (signal?.aborted) return []

  const negativeTerms = legalArea ? buildJusBrasilNegativeTerms(legalArea) : ''
  const fullQuery = negativeTerms ? `${query} ${negativeTerms}` : query
  const url = `https://www.jusbrasil.com.br/jurisprudencia/busca?q=${encodeURIComponent(fullQuery)}`

  let content = ''
  try {
    content = await fetchUrlContent(url)
  } catch {
    return []
  }

  if (!content || content.length < 500) return []

  const allParsed = parseJusBrasilTopicResults(content)

  // Filter to only tribunals the user selected
  const results = allParsed.filter(r => {
    const alias = r.tribunal.toLowerCase()
    if (allowedTribunalAliases.has(alias)) return true
    // Also match tribunal category: if user selected any tj*, allow all tjs from JusBrasil
    const isTJ = alias.startsWith('tj')
    const isTRF = alias.startsWith('trf')
    const isTRT = alias.startsWith('trt')
    const isTRE = alias.startsWith('tre')
    if (isTJ) return [...allowedTribunalAliases].some(a => a.startsWith('tj'))
    if (isTRF) return [...allowedTribunalAliases].some(a => a.startsWith('trf'))
    if (isTRT) return [...allowedTribunalAliases].some(a => a.startsWith('trt'))
    if (isTRE) return [...allowedTribunalAliases].some(a => a.startsWith('tre'))
    return false
  })

  if (isDataJudDebug()) {
    console.debug(`[DataJud] JusBrasil topic search: ${allParsed.length} parsed, ${results.length} after tribunal filter (allowed: ${[...allowedTribunalAliases].join(', ')})`)
  }

  return results
}

/** Regex for JusBrasil tribunal header lines (e.g., "STF - RECURSO EXTRAORDINÁRIO: RE XXXXX MG") */
const JUSBRASIL_TRIBUNAL_RE = /\b(STF|STJ|TST|TSE|STM|TJ-?[A-Z]{2,4}|TRF-?\d|TRT-?\d{1,2}|TRE-?[A-Z]{2,3})\s+-\s+(.+)/i

function parseJusBrasilTopicResults(content: string): DataJudResult[] {
  const results: DataJudResult[] = []
  // JusBrasil separates results with "Mostrar mais"
  const chunks = content.split(/\nMostrar mais\s*\n?/)

  for (const chunk of chunks) {
    if (results.length >= 10) break

    const headerMatch = chunk.match(JUSBRASIL_TRIBUNAL_RE)
    if (!headerMatch) continue

    const tribunalJB = headerMatch[1].trim()
    const restOfHeader = headerMatch[2].trim()

    // Split rest into class and identifier
    let classe: string
    let identifier: string
    const colonIdx = restOfHeader.indexOf(':')
    if (colonIdx > 0 && colonIdx < 80) {
      classe = restOfHeader.slice(0, colonIdx).trim()
      identifier = restOfHeader.slice(colonIdx + 1).trim()
    } else {
      // No colon — split at XXXXX or long digit sequence
      const splitMatch = restOfHeader.match(/^(.+?)\s+(XXXXX|\d{7,})/)
      if (splitMatch) {
        classe = splitMatch[1].trim()
        identifier = restOfHeader.slice(splitMatch[1].length).trim()
      } else {
        classe = restOfHeader
        identifier = ''
      }
    }

    // Extract ementa text
    const ementaMatch = chunk.match(/Ementa:\s*(?:EMENTA\s*[:\-–—]?\s*)?(.{50,})/si)
    if (!ementaMatch) continue

    const ementaText = ementaMatch[1].replace(/\n{3,}/g, '\n\n').trim()
    if (ementaText.length < 50) continue

    // Map tribunal alias (TJ-MG → tjmg, STF → stf)
    const alias = tribunalJB.toLowerCase().replace(/-/g, '')
    const tribunalInfo = ALL_TRIBUNALS.find(t => t.alias === alias)
    const tribunalDisplay = tribunalInfo?.name || tribunalJB

    // Build citation reference to append to ementa
    // Format: (Classe Identificador, Tribunal.)
    const citationParts: string[] = []
    if (classe) citationParts.push(identifier ? `${classe} ${identifier}` : classe)
    citationParts.push(tribunalDisplay)
    const citation = `(${citationParts.join(', ')}.)`

    // Append citation to ementa if not already present
    const ementaWithCitation = ementaText.endsWith(')')
      ? ementaText  // likely already has citation
      : `${ementaText} ${citation}`

    results.push({
      tribunal: (tribunalInfo?.alias || alias).toUpperCase(),
      tribunalName: tribunalDisplay,
      numeroProcesso: identifier || `JB-${results.length + 1}`,
      classe,
      classeCode: 0,
      assuntos: [],
      orgaoJulgador: '',
      dataAjuizamento: '',
      grau: /^(stf|stj|tst|tse|stm)$/.test(alias) ? 'SUP' : 'G2',
      formato: '',
      movimentos: [],
      ementa: trimDecisionText(ementaWithCitation, MAX_EMENTA_CHARS),
      textSource: 'web',
      textSourceUrl: 'https://www.jusbrasil.com.br',
      textCompleteness: 'partial',
    })
  }

  return results
}

// ── STF Website Search (fallback for DataJud-unavailable STF) ─────────────

/**
 * Search STF jurisprudence portal via Jina Reader.
 * DataJud does not index STF decisions, so we scrape the STF website as a fallback.
 * Returns DataJudResult[] with tribunal='STF'.
 */
async function searchSTFViaWebsite(
  query: string,
  maxResults = 5,
  signal?: AbortSignal,
): Promise<DataJudResult[]> {
  if (signal?.aborted) return []

  const stfUrl = `${STF_JURISPRUDENCE_URL}?base=acordaos&pesquisa_inteiro_teor=false&sinonimo=true&plural=true&radicais=false&buscaExata=true&page=1&pageSize=${maxResults}&queryString=${encodeURIComponent(query)}&sort=_score&sortBy=desc`

  let content = ''
  try {
    content = await fetchUrlContent(stfUrl)
  } catch {
    if (isDataJudDebug()) {
      console.debug('[DataJud] STF website search failed (fetch error)')
    }
    return []
  }

  if (!content || content.length < 200) {
    if (isDataJudDebug()) {
      console.debug('[DataJud] STF website search returned empty/short content')
    }
    return []
  }

  const results = parseSTFWebsiteResults(content, maxResults)

  if (isDataJudDebug()) {
    console.debug(`[DataJud] STF website search: ${results.length} result(s) parsed`)
  }

  return results
}

/**
 * Parse STF jurisprudence portal results scraped via Jina Reader.
 *
 * The STF portal returns results in a structured format. When rendered through
 * Jina Reader, typical patterns include:
 *   - Process identifiers (RE, ADI, HC, MS, etc.) with numbers
 *   - Relator (reporting justice) names
 *   - Ementa text blocks
 *   - Julgamento (judgment) dates
 */
function parseSTFWebsiteResults(content: string, maxResults: number): DataJudResult[] {
  const results: DataJudResult[] = []

  // Strategy 1: Split by common STF result delimiters
  // The STF portal typically presents results with process class + number headers
  const resultBlocks = splitSTFResultBlocks(content)

  for (const block of resultBlocks) {
    if (results.length >= maxResults) break

    const parsed = parseSTFResultBlock(block)
    if (parsed) {
      results.push(parsed)
    }
  }

  // Strategy 2: If structured parsing fails, try extracting ementa-like text blocks
  if (results.length === 0) {
    const fallbackResults = extractSTFFallbackResults(content, maxResults)
    results.push(...fallbackResults)
  }

  return results
}

/**
 * Split STF portal content into individual result blocks.
 * Looks for patterns like "RE 123456", "ADI 1234", "HC 12345", etc.
 */
function splitSTFResultBlocks(content: string): string[] {
  // STF process classes that appear as headers
  const stfClassPattern = /(?:^|\n)(?=\s*(?:RE|ADI|ADC|ADPF|HC|MS|MI|RHC|AgR|ED|ARE|AI|ACO|Rcl|AP|Inq|Pet|SS|SL|STA|IF|AO|AS|AC|AR|EXT|PPE|HDE)\s+\d)/gm
  const positions: number[] = []
  let match: RegExpExecArray | null

  while ((match = stfClassPattern.exec(content)) !== null) {
    positions.push(match.index)
  }

  if (positions.length === 0) return [content]

  const blocks: string[] = []
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i]
    const end = positions[i + 1] ?? content.length
    const block = content.slice(start, end).trim()
    if (block.length >= 100) {
      blocks.push(block)
    }
  }

  return blocks
}

/** Regex for STF process class + number header. */
const STF_PROCESS_HEADER_RE = /^\s*(RE|ADI|ADC|ADPF|HC|MS|MI|RHC|AgR|ED|ARE|AI|ACO|Rcl|AP|Inq|Pet|SS|SL|STA|IF|AO|AS|AC|AR|EXT|PPE|HDE)\s+(\d[\d./-]*\d?)/m

/** Regex for relator (reporting justice). */
const STF_RELATOR_RE = /(?:Relator|Min\.|Ministro)\s*[:(]?\s*(?:Min\.\s*)?([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s.]+)/i

/** Regex for judgment date. */
const STF_DATE_RE = /(?:Julgamento|Data|DJ[eE]?|Publicação|DJE|Sessão)\s*[:\-]?\s*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/i

/**
 * Parse a single STF result block into a DataJudResult.
 */
function parseSTFResultBlock(block: string): DataJudResult | null {
  const headerMatch = block.match(STF_PROCESS_HEADER_RE)
  if (!headerMatch) return null

  const classe = headerMatch[1]
  const numero = headerMatch[2]

  // Extract ementa
  const ementaMatch = block.match(/(?:EMENTA|Ementa)\s*[:\-–—]?\s*(.{50,})/si)
  let ementaText: string | undefined
  if (ementaMatch) {
    // Take ementa text up to the next major section or end of block
    let ementaRaw = ementaMatch[1]
    // Truncate at common section boundaries
    const sectionBoundary = ementaRaw.search(/\n\s*(?:Decisão|DECISÃO|Acórdão|ACÓRDÃO|Relatório|RELATÓRIO|Voto|VOTO|Inteiro Teor)\s*[:\-–—]?/i)
    if (sectionBoundary > 50) {
      ementaRaw = ementaRaw.slice(0, sectionBoundary)
    }
    ementaText = trimDecisionText(ementaRaw.trim(), MAX_EMENTA_CHARS)
  }

  // If no ementa found, skip this result (not useful without text)
  if (!ementaText || ementaText.length < 50) return null

  // Extract relator as orgaoJulgador
  const relatorMatch = block.match(STF_RELATOR_RE)
  const relator = relatorMatch ? relatorMatch[1].trim() : ''

  // Extract date
  const dateMatch = block.match(STF_DATE_RE)
  let dataAjuizamento = ''
  if (dateMatch) {
    dataAjuizamento = normalizeSTFDate(dateMatch[1])
  }

  return {
    tribunal: 'STF',
    tribunalName: 'Supremo Tribunal Federal',
    numeroProcesso: `${classe} ${numero}`,
    classe: mapSTFClasseLabel(classe),
    classeCode: 0,
    assuntos: [],
    orgaoJulgador: relator ? `Min. ${relator}` : 'Supremo Tribunal Federal',
    dataAjuizamento,
    grau: 'SUP',
    formato: '',
    movimentos: [],
    ementa: ementaText,
    textSource: 'web',
    textSourceUrl: STF_JURISPRUDENCE_URL,
    textCompleteness: 'partial',
  }
}

/**
 * Fallback extraction when structured parsing fails.
 * Looks for any ementa-like text blocks in the STF content.
 */
function extractSTFFallbackResults(content: string, maxResults: number): DataJudResult[] {
  const results: DataJudResult[] = []

  // Find all ementa blocks
  const ementaPattern = /(?:EMENTA|Ementa)\s*[:\-–—]?\s*(.{100,?}?)(?=\n\s*(?:EMENTA|Ementa|Decisão|DECISÃO|Acórdão|ACÓRDÃO|$))/gsi
  let match: RegExpExecArray | null

  while ((match = ementaPattern.exec(content)) !== null && results.length < maxResults) {
    const ementaText = trimDecisionText(match[1].trim(), MAX_EMENTA_CHARS)
    if (ementaText.length < 80) continue

    results.push({
      tribunal: 'STF',
      tribunalName: 'Supremo Tribunal Federal',
      numeroProcesso: `STF-WEB-${results.length + 1}`,
      classe: '',
      classeCode: 0,
      assuntos: [],
      orgaoJulgador: 'Supremo Tribunal Federal',
      dataAjuizamento: '',
      grau: 'SUP',
      formato: '',
      movimentos: [],
      ementa: ementaText,
      textSource: 'web',
      textSourceUrl: STF_JURISPRUDENCE_URL,
      textCompleteness: 'partial',
    })
  }

  return results
}

/**
 * Normalize an STF date string (DD/MM/YYYY or DD-MM-YYYY) to ISO format (YYYY-MM-DD).
 */
function normalizeSTFDate(raw: string): string {
  const cleaned = raw.replace(/[./\-]/g, '/')
  const parts = cleaned.split('/')
  if (parts.length !== 3) return ''

  let [day, month, year] = parts
  if (year.length === 2) {
    const yearNum = Number(year)
    year = yearNum > 50 ? `19${year}` : `20${year}`
  }

  if (day.length === 1) day = `0${day}`
  if (month.length === 1) month = `0${month}`

  return `${year}-${month}-${day}`
}

/**
 * Map STF process class abbreviations to readable labels.
 */
function mapSTFClasseLabel(classe: string): string {
  const map: Record<string, string> = {
    'RE': 'Recurso Extraordinário',
    'ADI': 'Ação Direta de Inconstitucionalidade',
    'ADC': 'Ação Declaratória de Constitucionalidade',
    'ADPF': 'Arguição de Descumprimento de Preceito Fundamental',
    'HC': 'Habeas Corpus',
    'MS': 'Mandado de Segurança',
    'MI': 'Mandado de Injunção',
    'RHC': 'Recurso em Habeas Corpus',
    'AgR': 'Agravo Regimental',
    'ED': 'Embargos de Declaração',
    'ARE': 'Recurso Extraordinário com Agravo',
    'AI': 'Agravo de Instrumento',
    'ACO': 'Ação Cível Originária',
    'Rcl': 'Reclamação',
    'AP': 'Ação Penal',
    'Inq': 'Inquérito',
    'Pet': 'Petição',
    'SS': 'Suspensão de Segurança',
    'SL': 'Suspensão de Liminar',
    'STA': 'Suspensão de Tutela Antecipada',
    'IF': 'Intervenção Federal',
    'AO': 'Ação Originária',
    'AS': 'Arguição de Suspeição',
    'AC': 'Ação Cautelar',
    'AR': 'Ação Rescisória',
    'EXT': 'Extradição',
    'PPE': 'Prisão Preventiva para Extradição',
    'HDE': 'Habeas Data Eletrônico',
  }
  return map[classe] ?? classe
}

/**
 * Extract ementa and inteiro teor from JusBrasil search results page content.
 * JusBrasil returns structured text like:
 *   "Ementa: EMENTA: [text]" or "Inteiro teor: [text]"
 */
function extractFromJusBrasilContent(
  content: string,
  result: DataJudResult,
): { ementa?: string; inteiroTeor?: string } {
  const processDigits = result.numeroProcesso.replace(/\D/g, '')
  const lastDigits = processDigits.slice(-7)

  // Check content mentions this process
  if (!content.includes(lastDigits)) {
    return {}
  }

  let ementa: string | undefined
  let inteiroTeor: string | undefined

  // JusBrasil format: "Ementa: EMENTA: [text]" or "Ementa: E M E N T A – [text]"
  const ementaPatterns = [
    /Ementa:\s*(?:EMENTA\s*[:\-–—]?\s*)?(.{80,}?)(?:\nMostrar mais|\nContr|\nDecis|\n(?:TJ|STF|STJ|TST|TRF|TRT|TRE)[ -])/si,
    /EMENTA\s*[:\-–—]?\s*(.{80,}?)(?:\nMostrar mais|\nContr|\nDecis|\n(?:TJ|STF|STJ|TST|TRF|TRT|TRE)[ -])/si,
    /E\s*M\s*E\s*N\s*T\s*A\s*[:\-–—]?\s*(.{80,}?)(?:\nMostrar mais|\nContr|\nDecis)/si,
  ]

  for (const pattern of ementaPatterns) {
    const match = pattern.exec(content)
    if (match?.[1]) {
      const cleaned = match[1].replace(/\n{3,}/g, '\n\n').trim()
      if (cleaned.length >= 80) {
        ementa = trimDecisionText(cleaned, MAX_EMENTA_CHARS)
        break
      }
    }
  }

  // JusBrasil format for inteiro teor: "Inteiro teor: [text]"
  const inteiroTeorPatterns = [
    /Inteiro teor:\s*(.{100,}?)(?:\nMostrar mais|\nPara todas|\n(?:TJ|STF|STJ|TST|TRF|TRT|TRE)[ -])/si,
    /INTEIRO TEOR\s*[:\-–—]?\s*(.{100,}?)(?:\nMostrar mais|\nPara todas)/si,
  ]

  for (const pattern of inteiroTeorPatterns) {
    const match = pattern.exec(content)
    if (match?.[1]) {
      const cleaned = match[1].replace(/\n{3,}/g, '\n\n').trim()
      if (cleaned.length >= 100) {
        inteiroTeor = trimDecisionText(cleaned, MAX_INTEIRO_TEOR_CHARS)
        break
      }
    }
  }

  // If we found ementa but not inteiro teor, also try the generic extraction
  if (ementa && !inteiroTeor) {
    const generic = extractDecisionTextFromWebContent(content, result)
    inteiroTeor = generic.inteiroTeor
  }

  return { ementa, inteiroTeor }
}

function buildJurisprudenceEnrichmentQueries(_query: string, result: DataJudResult): string[] {
  const numero = result.numeroProcesso.includes('-')
    ? result.numeroProcesso
    : formatProcessoNumber(result.numeroProcesso)
  return [
    `"${numero}" ementa acórdão`,
    `"${numero}" ${result.tribunal.toUpperCase()} inteiro teor`,
  ]
}

function rankEnrichmentCandidates(
  candidates: Array<{ title: string; url: string; snippet: string }>,
  result: DataJudResult,
): Array<{ title: string; url: string; snippet: string }> {
  const tribunalKey = normalizeForSearch(result.tribunalName)
  const processDigits = result.numeroProcesso.replace(/\D/g, '')

  return [...candidates].sort((left, right) => scoreCandidate(right) - scoreCandidate(left))

  function scoreCandidate(candidate: { title: string; url: string; snippet: string }): number {
    const text = normalizeForSearch(`${candidate.title} ${candidate.url} ${candidate.snippet}`)
    let score = 0
    if (/jurisprud|acord|consulta|processo|tribunal/.test(text)) score += 10
    if (tribunalKey && text.includes(tribunalKey.slice(0, Math.min(tribunalKey.length, 18)))) score += 12
    if (processDigits && candidate.url.replace(/\D/g, '').includes(processDigits.slice(-10))) score += 20
    if (processDigits && text.includes(processDigits.slice(-7))) score += 10
    if (/ementa|inteiro teor|acordao|acordão/.test(text)) score += 8
    return score
  }
}

function extractDecisionTextFromWebContent(content: string, result: DataJudResult): { ementa?: string; inteiroTeor?: string } {
  const text = repairMojibake(content)
  const ementa = extractLabeledSection(
    text,
    ['ementa'],
    ['acórdão', 'acordao', 'inteiro teor', 'relatório', 'relatorio', 'voto', 'dispositivo'],
    MAX_EMENTA_CHARS,
  )

  const inteiroTeor = extractLabeledSection(
    text,
    ['inteiro teor', 'acórdão', 'acordao', 'decisão', 'decisao'],
    ['documento assinado eletronicamente', 'consulta processual', 'voltar', 'jurisprudência em teses'],
    MAX_INTEIRO_TEOR_CHARS,
  ) ?? extractWholeDecisionText(text, result)

  return {
    ementa: ementa ? trimDecisionText(ementa, MAX_EMENTA_CHARS) : undefined,
    inteiroTeor: inteiroTeor ? trimDecisionText(inteiroTeor, MAX_INTEIRO_TEOR_CHARS) : undefined,
  }
}

function extractLabeledSection(
  text: string,
  labels: string[],
  stopLabels: string[],
  maxChars: number,
): string | undefined {
  for (const label of labels) {
    const startPattern = new RegExp(`(?:^|[\\r\\n])\\s*${escapeRegex(label)}\\s*[:\\-–—]?\\s*`, 'i')
    const startMatch = startPattern.exec(text)
    if (!startMatch) continue

    const start = startMatch.index + startMatch[0].length
    const rawSlice = text.slice(start, start + maxChars * 2)
    let end = rawSlice.length

    for (const stop of stopLabels) {
      const pattern = new RegExp(`(?:^|[\\r\\n])\\s*${escapeRegex(stop)}\\s*[:\\-–—]?`, 'i')
      const match = pattern.exec(rawSlice)
      if (match && match.index < end) {
        end = match.index
      }
    }

    const cleaned = rawSlice.slice(0, end).trim()

    if (cleaned.length >= 60) return cleaned.slice(0, maxChars)
  }

  return undefined
}

function extractWholeDecisionText(text: string, result: DataJudResult): string | undefined {
  const normalized = normalizeForSearch(text)
  const processDigits = result.numeroProcesso.replace(/\D/g, '')
  const referencesProcess = processDigits ? normalized.includes(processDigits.slice(-7)) : false
  if (!/acorda|decisao|ementa|relator|processo/.test(normalized)) return undefined
  if (!referencesProcess && !normalized.includes(normalizeForSearch(result.tribunalName).slice(0, 8))) {
    return undefined
  }

  const relevantStart = normalized.search(/acorda|decisao|ementa|relatorio|voto/)
  const sliceStart = relevantStart >= 0 ? relevantStart : 0
  const extracted = text.slice(sliceStart).trim()
  return extracted.length >= 400 ? extracted.slice(0, MAX_INTEIRO_TEOR_CHARS) : undefined
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
      const snippet = r.inteiroTeor.length > 3500
        ? r.inteiroTeor.slice(0, 3500) + '… [texto truncado]'
        : r.inteiroTeor
      lines.push(`   Inteiro Teor: ${snippet}`)
    }
    if (!r.ementa && !r.inteiroTeor) {
      lines.push('   Texto decisório: ausente após DataJud e tentativas de enriquecimento público')
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

function inferTextCompleteness(result: Pick<DataJudResult, 'ementa' | 'inteiroTeor'>): DataJudResult['textCompleteness'] {
  if (result.ementa && result.inteiroTeor) return 'complete'
  if (result.ementa || result.inteiroTeor) return 'partial'
  return 'missing'
}

function buildTextStats(results: DataJudResult[]): DataJudTextStats {
  return results.reduce<DataJudTextStats>((stats, result) => {
    if (result.ementa) stats.withEmenta += 1
    if (result.inteiroTeor) stats.withInteiroTeor += 1
    if (result.ementa && result.inteiroTeor) stats.withBoth += 1
    if (!result.ementa && !result.inteiroTeor) stats.missingBoth += 1
    if (result.textSource === 'web') stats.enrichedFromWeb += 1
    return stats
  }, {
    withEmenta: 0,
    withInteiroTeor: 0,
    withBoth: 0,
    missingBoth: 0,
    enrichedFromWeb: 0,
  })
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
      lastEndpointLabel: reason.attempts?.[reason.attempts.length - 1]?.endpointLabel,
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
