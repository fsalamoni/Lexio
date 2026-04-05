import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchWebResultsWithDiagnostics } from './web-search-service'

describe('web-search-service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts structured results from Jina markdown output', async () => {
    const text = [
      '[STF decide sobre tema](https://www.stf.jus.br/noticias/tema)',
      '[STJ julga recurso relevante](https://www.stj.jus.br/processos/recurso)',
      '[TRF1 publica acórdão](https://www.trf1.jus.br/acordaos/123)',
    ].join('\n')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(text, { status: 200 }),
    )

    const { results, diagnostics } = await searchWebResultsWithDiagnostics('socioafetividade')

    expect(results.length).toBeGreaterThanOrEqual(3)
    expect(results[0].url).toContain('https://')
    expect(diagnostics.strategies[0].strategy).toBe('ddg_jina')
    expect(diagnostics.strategies[0].errorType).toBe('none')
  })

  it('falls back through AllOrigins proxy and instant API when Jina is down', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      // Jina Reader — network error (CORS/down)
      if (url.includes('r.jina.ai/')) {
        throw new TypeError('network down')
      }
      // AllOrigins proxy for DuckDuckGo HTML search — also fails
      if (url.includes('allorigins.win') && url.includes('html.duckduckgo.com')) {
        throw new TypeError('proxy down')
      }
      // DDG Instant direct — CORS error
      if (url.includes('api.duckduckgo.com') && !url.includes('allorigins')) {
        throw new TypeError('CORS blocked')
      }
      // DDG Instant via AllOrigins proxy — works
      if (url.includes('allorigins.win') && url.includes('api.duckduckgo.com')) {
        return new Response(JSON.stringify({
          RelatedTopics: [
            { Text: 'Tema de socioafetividade no STJ', FirstURL: 'https://www.stj.jus.br/tema/socioafetividade' },
          ],
        }), { status: 200 })
      }
      return new Response('', { status: 500 })
    })

    const { results, diagnostics } = await searchWebResultsWithDiagnostics('socioafetividade')

    expect(results.length).toBe(1)
    expect(results[0].url).toContain('stj.jus.br')
    expect(diagnostics.hadTechnicalError).toBe(true)
    expect(diagnostics.strategies.some(s => s.errorType === 'network')).toBe(true)
    fetchMock.mockRestore()
  })
})
