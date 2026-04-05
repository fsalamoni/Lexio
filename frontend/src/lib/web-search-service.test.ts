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

  it('falls back to instant API and reports technical failure diagnostics', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('r.jina.ai/https://duckduckgo.com/html')) {
        throw new TypeError('network down')
      }
      if (url.includes('r.jina.ai/https://lite.duckduckgo.com/lite')) {
        throw new TypeError('network down')
      }
      if (url.includes('api.duckduckgo.com')) {
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
