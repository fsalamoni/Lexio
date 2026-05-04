/**
 * Testes unitários para o cliente de busca híbrida (search-client.ts).
 *
 * Cobre:
 *  - hybridSearch com resposta bem-sucedida
 *  - hybridSearch com erro HTTP
 *  - hybridSearch com AbortError
 *  - helper search() delegando para hybridSearch
 *  - searchHealth bem-sucedido e com erro
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { hybridSearch, search, searchHealth } from './search-client'
import type { HybridSearchResponse } from './search-client'

// ── Mock de fetch global ────────────────────────────────────────────────────────

const fetchMock = vi.fn()
globalThis.fetch = fetchMock as unknown as typeof fetch

afterEach(() => {
  fetchMock.mockReset()
})

// ── Fixtures ────────────────────────────────────────────────────────────────────

function mockResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () =>
      typeof body === 'string' ? body : JSON.stringify(body),
  } as Response
}

function sampleResults(): HybridSearchResponse {
  return {
    results: [
      {
        source: 'DataJud',
        content: 'EMENTA — Responsabilidade civil. Dano ambiental.',
        score: 0.94,
        origin: 'datajud',
        process_number: 'REsp 1.950.500/SP',
      },
      {
        source: 'Qdrant',
        content: 'SÚMULA 618/STJ — Inversão do ônus da prova.',
        score: 0.82,
        origin: 'qdrant',
        origins: ['qdrant'],
      },
    ],
    stats: {
      query: 'dano ambiental',
      semantic_count: 10,
      semantic_time_ms: 342,
      lexical_count: 8,
      lexical_time_ms: 567,
      fused_count: 2,
      total_time_ms: 1234,
      semantic_weight: 0.5,
      lexical_weight: 0.5,
    },
  }
}

// ── Testes ──────────────────────────────────────────────────────────────────────

describe('hybridSearch', () => {
  it('deve chamar o endpoint de busca híbrida e retornar resultados', async () => {
    const payload = sampleResults()
    fetchMock.mockResolvedValueOnce(mockResponse(payload))

    const result = await hybridSearch('dano ambiental', {
      topK: 10,
      semanticWeight: 0.5,
      lexicalWeight: 0.5,
    })

    // Verifica a chamada fetch
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/search/hybrid')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')

    // Verifica o corpo da requisição
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.query).toBe('dano ambiental')
    expect(sentBody.top_k).toBe(10)
    expect(sentBody.semantic_weight).toBe(0.5)
    expect(sentBody.lexical_weight).toBe(0.5)

    // Verifica o retorno
    expect(result.results).toHaveLength(2)
    expect(result.stats.fused_count).toBe(2)
    expect(result.stats.total_time_ms).toBe(1234)
  })

  it('deve incluir Authorization header quando apiKey fornecida', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(sampleResults()))

    await hybridSearch('consulta', { apiKey: 'firebase-token-123' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Authorization']).toBe('Bearer firebase-token-123')
  })

  it('não deve incluir Authorization header quando apiKey ausente', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(sampleResults()))

    await hybridSearch('consulta', {})

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Authorization']).toBeUndefined()
  })

  it('deve propagar AbortSignal corretamente', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(sampleResults()))
    const controller = new AbortController()

    await hybridSearch('consulta', { signal: controller.signal })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.signal).toBe(controller.signal)
  })

  it('deve lançar erro em resposta HTTP não-ok', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse('Internal Server Error', 500))

    await expect(hybridSearch('consulta')).rejects.toThrow('Hybrid search failed (500)')
  })

  it('deve usar valores default para topK e pesos quando não fornecidos', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(sampleResults()))

    await hybridSearch('consulta')

    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.top_k).toBe(10)
    expect(sentBody.semantic_weight).toBe(0.5)
    expect(sentBody.lexical_weight).toBe(0.5)
    expect(sentBody.collection).toBeUndefined()
  })

  it('deve incluir collection opcional no corpo', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(sampleResults()))

    await hybridSearch('consulta', { collection: 'jurisprudencia_stj' })

    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody.collection).toBe('jurisprudencia_stj')
  })
})

describe('search (helper)', () => {
  it('deve delegar para hybridSearch e retornar apenas results', async () => {
    const payload = sampleResults()
    fetchMock.mockResolvedValueOnce(mockResponse(payload))

    const results = await search('dano ambiental', { topK: 5 })

    expect(results).toHaveLength(2)
    expect(results[0].source).toBe('DataJud')
    expect(results[0].score).toBe(0.94)
  })
})

describe('searchHealth', () => {
  it('deve retornar status do serviço', async () => {
    const health = { status: 'healthy', service: 'lexio-search', version: '1.0.0' }
    fetchMock.mockResolvedValueOnce(mockResponse(health))

    const result = await searchHealth()

    expect(result.status).toBe('healthy')
    expect(result.service).toBe('lexio-search')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/search/health')
  })

  it('deve lançar erro se health check falhar', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse('Not Found', 404, 'Not Found'))

    await expect(searchHealth()).rejects.toThrow('Search health check failed')
  })
})