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

  it('extracts results from the current Jina plain-text DuckDuckGo layout', async () => {
    const text = [
      'Lei de Contratação Temporária',
      'www.planalto.gov.br/ccivil_03/LEIS/L8745cons.htm',
      'Art. 1º Para atender a necessidade temporária de excepcional interesse público...',
      'Contrato temporário - delimitação dos direitos trabalhistas',
      'www.tjdft.jus.br/consultas/jurisprudencia/jurisprudencia-em-temas/direito-constitucional/contrato-temporario-e-a-delimitacao-dos-direitos-trabalhistas',
      'A Constituição Federal, em seu art. 37, inciso IX, permite a contratação...',
    ].join('\n')

    // Keep all fallback strategies local to the test to avoid real network calls.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(text, { status: 200 })
    ))

    const { results, diagnostics } = await searchWebResultsWithDiagnostics('contratação temporária')

    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].url).toBe('https://www.planalto.gov.br/ccivil_03/LEIS/L8745cons.htm')
    expect(results[0].title).toContain('Lei de Contratação Temporária')
    expect(diagnostics.strategies[0].errorType).toBe('none')
  })

  it('falls back through additional Jina-backed strategies when the primary search fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      // Jina Reader — network error (CORS/down)
      if (url.includes('r.jina.ai/') && url.includes('duckduckgo.com/html/')) {
        throw new TypeError('network down')
      }
      if (url.includes('r.jina.ai/') && url.includes('lite.duckduckgo.com/lite/')) {
        return new Response([
          'Tema de socioafetividade no STJ',
          'www.stj.jus.br/tema/socioafetividade',
          'Julgado relevante sobre paternidade socioafetiva.',
        ].join('\n'), { status: 200 })
      }
      return new Response('', { status: 500 })
    })

    const { results, diagnostics } = await searchWebResultsWithDiagnostics('socioafetividade')

    expect(results.length).toBe(1)
    expect(results[0].url).toContain('stj.jus.br')
    expect(diagnostics.hadTechnicalError).toBe(true)
    expect(diagnostics.strategies.some(s => s.errorType === 'network')).toBe(true)
    expect(diagnostics.strategies.some(s => s.strategy === 'ddg_lite' && s.errorType === 'none')).toBe(true)
    fetchMock.mockRestore()
  })
})
