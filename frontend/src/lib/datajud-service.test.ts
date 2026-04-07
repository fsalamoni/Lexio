import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  searchDataJud,
  formatDataJudResults,
  _resetEndpointCache,
  type TribunalInfo,
  type DataJudResult,
} from './datajud-service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHit(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    numeroProcesso: '0001234-56.2023.8.26.0100',
    classe: { nome: 'Apelação Cível', codigo: 1001 },
    assuntos: [{ nome: 'Responsabilidade Civil', codigo: 200 }],
    orgaoJulgador: { nome: '1ª Câmara de Direito Privado' },
    dataAjuizamento: '2023-05-15',
    grau: 'G2',
    formato: { nome: 'Eletrônico' },
    movimentos: [
      { nome: 'Julgamento', dataHora: '2024-01-10T09:00:00' },
    ],
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('datajud-service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    _resetEndpointCache()
  })

  it('classifies 403 responses as auth errors in errorDetails', async () => {
    const tribunals: TribunalInfo[] = [
      { alias: 'stf', name: 'Supremo Tribunal Federal', category: 'superiores' },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 }),
    )

    const result = await searchDataJud('socioafetividade', {
      tribunals,
      maxPerTribunal: 1,
      maxTotal: 1,
    })

    expect(result.results).toHaveLength(0)
    expect(result.errorDetails).toHaveLength(1)
    expect(result.errorDetails[0].type).toBe('auth')
    expect(result.errors[0]).toContain('HTTP 403')
  })

  describe('formatDataJudResults', () => {
    it('returns empty message when results array is empty', () => {
      expect(formatDataJudResults([])).toBe('Nenhum resultado encontrado.')
    })

    it('includes basic metadata fields', () => {
      const result: DataJudResult = {
        tribunal: 'TJSP',
        tribunalName: 'Tribunal de Justiça de São Paulo',
        numeroProcesso: '0001234-56.2023.8.26.0100',
        classe: 'Apelação Cível',
        classeCode: 1001,
        assuntos: ['Responsabilidade Civil'],
        orgaoJulgador: '1ª Câmara',
        dataAjuizamento: '2023-05-15',
        grau: 'G2',
        formato: 'Eletrônico',
        movimentos: [{ nome: 'Julgamento', dataHora: '2024-01-10' }],
      }
      const formatted = formatDataJudResults([result])
      expect(formatted).toContain('0001234-56.2023.8.26.0100')
      expect(formatted).toContain('TJSP')
      expect(formatted).toContain('Apelação Cível')
      expect(formatted).toContain('Responsabilidade Civil')
      expect(formatted).toContain('Julgamento')
    })

    it('includes ementa when present', () => {
      const result: DataJudResult = {
        tribunal: 'STJ',
        tribunalName: 'Superior Tribunal de Justiça',
        numeroProcesso: '0001111-22.2022.6.00.0000',
        classe: 'Recurso Especial',
        classeCode: 672,
        assuntos: ['Dano Moral'],
        orgaoJulgador: '3ª Turma',
        dataAjuizamento: '2022-03-10',
        grau: 'SUP',
        formato: 'Eletrônico',
        movimentos: [],
        ementa: 'CIVIL. DANO MORAL. NEGATIVAÇÃO INDEVIDA. DANO IN RE IPSA. CONFIGURAÇÃO.',
      }
      const formatted = formatDataJudResults([result])
      expect(formatted).toContain('Ementa:')
      expect(formatted).toContain('DANO MORAL')
      expect(formatted).toContain('NEGATIVAÇÃO INDEVIDA')
    })

    it('includes inteiro_teor snippet when present', () => {
      const result: DataJudResult = {
        tribunal: 'STF',
        tribunalName: 'Supremo Tribunal Federal',
        numeroProcesso: '0002222-33.2021.1.00.0000',
        classe: 'Recurso Extraordinário',
        classeCode: 900,
        assuntos: ['Direito Constitucional'],
        orgaoJulgador: 'Pleno',
        dataAjuizamento: '2021-06-01',
        grau: 'SUP',
        formato: 'Eletrônico',
        movimentos: [],
        inteiroTeor: 'ACÓRDÃO. Vistos, relatados e discutidos estes autos, acordam os Ministros do Supremo Tribunal Federal em julgar...',
      }
      const formatted = formatDataJudResults([result])
      expect(formatted).toContain('Inteiro Teor:')
      expect(formatted).toContain('ACÓRDÃO')
    })

    it('truncates inteiro_teor longer than 2000 chars', () => {
      const longText = 'A'.repeat(3000)
      const result: DataJudResult = {
        tribunal: 'TRT1',
        tribunalName: 'TRT 1ª Região',
        numeroProcesso: '0003333-44.2020.5.01.0000',
        classe: 'Recurso Ordinário',
        classeCode: 800,
        assuntos: ['Direito do Trabalho'],
        orgaoJulgador: '1ª Turma',
        dataAjuizamento: '2020-01-01',
        grau: 'G2',
        formato: 'Eletrônico',
        movimentos: [],
        inteiroTeor: longText,
      }
      const formatted = formatDataJudResults([result])
      expect(formatted).toContain('[texto truncado]')
    })

    it('omits ementa/inteiro_teor lines when both are absent', () => {
      const result: DataJudResult = {
        tribunal: 'TRF1',
        tribunalName: 'TRF 1ª Região',
        numeroProcesso: '0004444-55.2019.4.01.0000',
        classe: 'Apelação',
        classeCode: 500,
        assuntos: ['Direito Tributário'],
        orgaoJulgador: '7ª Turma',
        dataAjuizamento: '2019-07-01',
        grau: 'G2',
        formato: 'Eletrônico',
        movimentos: [],
      }
      const formatted = formatDataJudResults([result])
      expect(formatted).not.toContain('Ementa:')
      expect(formatted).not.toContain('Inteiro Teor:')
    })
  })

  describe('parseDataJudHit (via searchDataJud)', () => {
    it('parses ementa string field from API response', async () => {
      const tribunals: TribunalInfo[] = [
        { alias: 'stj', name: 'Superior Tribunal de Justiça', category: 'superiores' },
      ]

      const fakeHit = makeHit({
        ementa: 'DIREITO CIVIL. RESPONSABILIDADE. NEXO CAUSAL. CARACTERIZAÇÃO.',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ hits: { hits: [{ _source: fakeHit }] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const result = await searchDataJud('responsabilidade civil', {
        tribunals,
        maxPerTribunal: 1,
        maxTotal: 1,
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].ementa).toBe('DIREITO CIVIL. RESPONSABILIDADE. NEXO CAUSAL. CARACTERIZAÇÃO.')
    })

    it('parses inteiro_teor string field from API response', async () => {
      const tribunals: TribunalInfo[] = [
        { alias: 'stf', name: 'Supremo Tribunal Federal', category: 'superiores' },
      ]

      const fakeHit = makeHit({
        inteiro_teor: 'ACÓRDÃO. Vistos, os Ministros acordam em julgar procedente o recurso.',
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ hits: { hits: [{ _source: fakeHit }] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const result = await searchDataJud('constitucional', {
        tribunals,
        maxPerTribunal: 1,
        maxTotal: 1,
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].inteiroTeor).toBe('ACÓRDÃO. Vistos, os Ministros acordam em julgar procedente o recurso.')
    })

    it('parses inteiro_teor from nested object with conteudo field', async () => {
      const tribunals: TribunalInfo[] = [
        { alias: 'tjsp', name: 'TJSP', category: 'estaduais' },
      ]

      const fakeHit = makeHit({
        inteiro_teor: { conteudo: 'Texto integral da decisão judicial aqui.' },
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ hits: { hits: [{ _source: fakeHit }] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const result = await searchDataJud('civil', {
        tribunals,
        maxPerTribunal: 1,
        maxTotal: 1,
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].inteiroTeor).toBe('Texto integral da decisão judicial aqui.')
    })

    it('leaves ementa and inteiroTeor undefined when absent from API response', async () => {
      const tribunals: TribunalInfo[] = [
        { alias: 'trf1', name: 'TRF 1ª Região', category: 'federais' },
      ]

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ hits: { hits: [{ _source: makeHit() }] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const result = await searchDataJud('tributário', {
        tribunals,
        maxPerTribunal: 1,
        maxTotal: 1,
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].ementa).toBeUndefined()
      expect(result.results[0].inteiroTeor).toBeUndefined()
    })
  })
})

