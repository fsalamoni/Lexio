/**
 * Lexio Frontend — Cliente para o endpoint de busca híbrida.
 *
 * POST /api/v1/search/hybrid
 *
 * Combina busca semântica (Qdrant) com busca lexical (DataJud) via RRF.
 */

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface HybridSearchRequest {
  query: string
  top_k?: number
  semantic_weight?: number
  lexical_weight?: number
  collection?: string
}

export interface HybridResultItem {
  source: string
  content: string
  score: number
  origin: string
  origins?: string[]
  process_number?: string
}

export interface HybridSearchStats {
  query: string
  semantic_count: number
  semantic_time_ms: number
  lexical_count: number
  lexical_time_ms: number
  fused_count: number
  total_time_ms: number
  semantic_weight: number
  lexical_weight: number
}

export interface HybridSearchResponse {
  results: HybridResultItem[]
  stats: HybridSearchStats
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveApiBase(): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8000'
  }
  return ''
}

// ── Cliente ────────────────────────────────────────────────────────────────────

/**
 * Executa uma busca híbrida combinando fontes semânticas e lexicais.
 *
 * @param query - Consulta em linguagem natural
 * @param options - Parâmetros opcionais de configuração da busca
 * @returns Resultados fusionados com estatísticas de execução
 */
export async function hybridSearch(
  query: string,
  options: {
    topK?: number
    semanticWeight?: number
    lexicalWeight?: number
    collection?: string
    signal?: AbortSignal
    apiKey?: string
  } = {},
): Promise<HybridSearchResponse> {
  const base = resolveApiBase()
  const body: HybridSearchRequest = {
    query,
    top_k: options.topK ?? 10,
    semantic_weight: options.semanticWeight ?? 0.5,
    lexical_weight: options.lexicalWeight ?? 0.5,
    collection: options.collection,
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Inclui token de autenticação se disponível
  if (options.apiKey) {
    headers['Authorization'] = `Bearer ${options.apiKey}`
  }

  const url = `${base}/api/v1/search/hybrid`
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `Hybrid search failed (${response.status}): ${errorBody || response.statusText}`,
    )
  }

  const data: HybridSearchResponse = await response.json()
  return data
}

/**
 * Versão simplificada para uso direto em componentes React/Svelte.
 *
 * Retorna apenas a lista de resultados, ignorando as estatísticas.
 */
export async function search(
  query: string,
  opts?: {
    topK?: number
    semanticWeight?: number
    lexicalWeight?: number
    signal?: AbortSignal
  },
): Promise<HybridResultItem[]> {
  const response = await hybridSearch(query, opts)
  return response.results
}

/**
 * Health check do serviço de busca.
 */
export async function searchHealth(): Promise<{ status: string; service: string; version: string }> {
  const base = resolveApiBase()
  const url = `${base}/api/v1/search/health`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Search health check failed: ${response.statusText}`)
  }

  return response.json()
}