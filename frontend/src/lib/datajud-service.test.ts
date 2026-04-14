import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _getEndpointCandidatesForHost,
  _resolveLocalProxyEndpoint,
  buildDataJudSearchBody,
  searchDataJud,
  formatDataJudResults,
  classifyJurisprudenceArea,
  classifyResult,
  scoreDataJudResult,
  sortByDate,
  groupByArea,
  compareProcesses,
  buildJurisprudenceAnalytics,
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

  it('prefers the hosting rewrite on production Firebase Hosting', () => {
    expect(_getEndpointCandidatesForHost('lexio.web.app')).toEqual([
      '/api/datajud',
      'https://southamerica-east1-hocapp-44760.cloudfunctions.net/datajudProxy',
    ])
  })

  it('resolves the local proxy endpoint from the app base path', () => {
    expect(_resolveLocalProxyEndpoint('/')).toBe('/api/datajud')
    expect(_resolveLocalProxyEndpoint('/Lexio/')).toBe('/Lexio/api/datajud')
  })

  it('falls back from a 404 Cloud Function URL to the next managed endpoint', async () => {
    const tribunals: TribunalInfo[] = [
      { alias: 'stj', name: 'Superior Tribunal de Justiça', category: 'superiores' },
    ]
    let callCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      callCount += 1
      const url = String(input)
      if (callCount === 1) {
        expect(url).toBe('https://southamerica-east1-hocapp-44760.cloudfunctions.net/datajudProxy')
        return new Response('missing', { status: 404 })
      }

      expect(url).toBe('/api/datajud')
      return new Response(
        JSON.stringify({ hits: { hits: [{ _source: makeHit({ ementa: 'EMENTA RELEVANTE' }) }] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    const result = await searchDataJud('responsabilidade civil', {
      tribunals,
      maxPerTribunal: 1,
      maxTotal: 1,
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].ementa).toBe('EMENTA RELEVANTE')
  })

  it('builds a stricter DataJud query body ordered by score before date', () => {
    const body = buildDataJudSearchBody('responsabilidade civil plano de saúde', {
      maxPerTribunal: 5,
      dateFrom: '2023-01-01',
      graus: ['G2'],
    }) as {
      sort: Array<Record<string, unknown>>
      query: { bool: { should: Array<Record<string, unknown>>; filter: Array<Record<string, unknown>> } }
    }

    expect(body.sort[0]).toEqual({ _score: { order: 'desc' } })
    expect(body.sort[1]).toEqual({ dataAjuizamento: { order: 'desc' } })
    expect(body.query.bool.should.length).toBeGreaterThanOrEqual(3)
    expect(body.query.bool.filter).toEqual(expect.arrayContaining([
      { range: { dataAjuizamento: { gte: '2023-01-01' } } },
      { terms: { grau: ['G2'] } },
    ]))
  })

  it('parses nested ementa and inteiro teor variants and normalizes dates/text', async () => {
    const tribunals: TribunalInfo[] = [
      { alias: 'stj', name: 'Superior Tribunal de JustiÃ§a', category: 'superiores' },
    ]

    const fakeHit = makeHit({
      orgaoJulgador: { nome: 'GABINETE DO MINISTRO REYNALDO SOARES DA FONSECA' },
      dataAjuizamento: '20260331000000',
      assuntos: [[{ nome: 'PrisÃ£o Preventiva' }], { nome: 'TrÃ¡fico de Drogas' }],
      dadosBasicos: {
        ementa: 'HABEAS CORPUS. PRISÃO PREVENTIVA. FUNDAMENTAÇÃO IDÔNEA.',
      },
      acordao: {
        texto: 'ACÓRDÃO. Vistos, relatados e discutidos estes autos, acordam os Ministros...',
      },
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ hits: { hits: [{ _source: fakeHit }] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await searchDataJud('habeas corpus', {
      tribunals,
      maxPerTribunal: 1,
      maxTotal: 1,
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].tribunalName).toBe('Superior Tribunal de Justiça')
    expect(result.results[0].assuntos).toEqual(['Prisão Preventiva', 'Tráfico de Drogas'])
    expect(result.results[0].dataAjuizamento).toBe('2026-03-31')
    expect(result.results[0].ementa).toContain('PRISÃO PREVENTIVA')
    expect(result.results[0].inteiroTeor).toContain('ACÓRDÃO')
  })

  it('enriches missing ementa and inteiro teor from a public jurisprudence page when DataJud lacks text', async () => {
    const tribunals: TribunalInfo[] = [
      { alias: 'stj', name: 'Superior Tribunal de Justiça', category: 'superiores' },
    ]

    const fakeHit = makeHit({
      numeroProcesso: '012134620263000000',
      classe: { nome: 'Habeas Corpus', codigo: 1722 },
      assuntos: [{ nome: 'Tráfico de Drogas e Condutas Afins' }],
      orgaoJulgador: { nome: 'GABINETE DO MINISTRO MESSOD AZULAY NETO' },
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({ hits: { hits: [{ _source: fakeHit }] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (url.includes('duckduckgo.com')) {
        return new Response([
          'HC 012134620263000000 - Superior Tribunal de Justiça',
          'https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/2026/HC-012134620263000000.aspx',
          'Julgado do STJ com ementa e acórdão integrais.',
        ].join('\n'), { status: 200 })
      }

      if (url.includes('https://r.jina.ai/https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/2026/HC-012134620263000000.aspx')) {
        return new Response([
          'Processo 012134620263000000',
          'EMENTA: HABEAS CORPUS. TRÁFICO DE DROGAS. PRISÃO PREVENTIVA. FUNDAMENTAÇÃO CONCRETA.',
          'ACÓRDÃO',
          'Vistos, relatados e discutidos estes autos, acordam os Ministros da Sexta Turma, por unanimidade, em denegar a ordem.',
          'Documento assinado eletronicamente',
        ].join('\n'), { status: 200 })
      }

      return new Response('', { status: 404 })
    })

    const result = await searchDataJud('habeas corpus tráfico de drogas prisão preventiva', {
      tribunals,
      maxPerTribunal: 1,
      maxTotal: 1,
      enrichMissingText: true,
      maxTextEnrichment: 1,
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0].ementa).toContain('PRISÃO PREVENTIVA')
    expect(result.results[0].inteiroTeor).toContain('denegar a ordem')
    expect(result.results[0].textSource).toBe('web')
    expect(result.results[0].textSourceUrl).toContain('stj.jus.br')
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

    it('truncates inteiro_teor longer than 3500 chars', () => {
      const longText = 'A'.repeat(5000)
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
        { alias: 'tjsp', name: 'TJSP', category: 'estadual' },
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
        { alias: 'trf1', name: 'TRF 1ª Região', category: 'federal' },
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

// ── classifyJurisprudenceArea ───────────────────────────────────────────────

describe('classifyJurisprudenceArea', () => {
  it('classifies labor area from assuntos', () => {
    expect(classifyJurisprudenceArea(['Rescisão do Contrato de Trabalho'], 'Reclamação Trabalhista')).toBe('labor')
  })

  it('classifies criminal from assuntos', () => {
    expect(classifyJurisprudenceArea(['Homicídio Qualificado'], 'Recurso em Sentido Estrito')).toBe('criminal')
  })

  it('classifies consumer area', () => {
    expect(classifyJurisprudenceArea(['Relação de Consumo', 'Produto Defeituoso'], 'Ação Indenizatória')).toBe('consumer')
  })

  it('classifies tax area', () => {
    expect(classifyJurisprudenceArea(['ICMS', 'Substituição Tributária'], 'Mandado de Segurança')).toBe('tax')
  })

  it('classifies civil area from dano moral', () => {
    expect(classifyJurisprudenceArea(['Dano Moral'], 'Apelação Cível')).toBe('civil')
  })

  it('classifies family area', () => {
    expect(classifyJurisprudenceArea(['Divórcio'], 'Ação de Família')).toBe('family')
  })

  it('classifies administrative area', () => {
    expect(classifyJurisprudenceArea(['Improbidade Administrativa'], 'Ação Civil Pública')).toBe('administrative')
  })

  it('classifies environmental area', () => {
    expect(classifyJurisprudenceArea(['Meio Ambiente'], 'Ação Civil Pública')).toBe('environmental')
  })

  it('classifies social_security area', () => {
    expect(classifyJurisprudenceArea(['Aposentadoria por Invalidez'], 'Procedimento Comum')).toBe('social_security')
  })

  it('classifies constitutional area', () => {
    expect(classifyJurisprudenceArea(['Controle de Constitucionalidade'], 'ADI')).toBe('constitutional')
  })

  it('classifies business area', () => {
    expect(classifyJurisprudenceArea(['Recuperação Judicial'], 'Falência')).toBe('business')
  })

  it('returns undefined for unclassifiable results', () => {
    expect(classifyJurisprudenceArea(['Outros'], 'Procedimento Comum')).toBeUndefined()
  })

  it('uses ementa for classification when assuntos are generic', () => {
    expect(classifyJurisprudenceArea(
      ['Outros'], 'Apelação',
      'Trata-se de ação de indenização por dano moral decorrente de relação de consumo',
    )).toBe('consumer')
  })

  it('prioritizes specific areas over general ones', () => {
    // "processo penal" should match criminal_procedure, not criminal
    expect(classifyJurisprudenceArea(['Processo Penal'], 'Recurso')).toBe('criminal_procedure')
  })
})

describe('scoreDataJudResult', () => {
  it('gives higher score to results with aligned ementa and inteiro teor', () => {
    const relevant: DataJudResult = {
      tribunal: 'STJ', tribunalName: 'Superior Tribunal de Justiça',
      numeroProcesso: '1',
      classe: 'Recurso Especial', classeCode: 1,
      assuntos: ['Plano de Saúde', 'Responsabilidade Civil'],
      orgaoJulgador: '3ª Turma', dataAjuizamento: '2025-01-01',
      grau: 'SUP', formato: 'Eletrônico', movimentos: [],
      ementa: 'PLANO DE SAÚDE. RESPONSABILIDADE CIVIL. NEGATIVA DE COBERTURA. DANO MORAL.',
      inteiroTeor: 'O acórdão reconhece a abusividade da negativa de cobertura e confirma a indenização.',
    }
    const weak: DataJudResult = {
      tribunal: 'TJRS', tribunalName: 'TJRS — Rio Grande do Sul',
      numeroProcesso: '2',
      classe: 'Procedimento Comum Cível', classeCode: 1,
      assuntos: ['Auxílio-Acidente'],
      orgaoJulgador: '21ª Vara', dataAjuizamento: '2025-01-01',
      grau: 'G1', formato: 'Eletrônico', movimentos: [],
    }

    expect(scoreDataJudResult('responsabilidade civil plano de saúde negativa de cobertura', relevant))
      .toBeGreaterThan(scoreDataJudResult('responsabilidade civil plano de saúde negativa de cobertura', weak))
  })
})

// ── classifyResult ──────────────────────────────────────────────────────────

describe('classifyResult', () => {
  it('classifies a full DataJudResult object', () => {
    const result: DataJudResult = {
      tribunal: 'tjsp', tribunalName: 'TJSP',
      numeroProcesso: '0001234-56.2023.8.26.0100',
      classe: 'Reclamação Trabalhista', classeCode: 1001,
      assuntos: ['Rescisão do Contrato de Trabalho'],
      orgaoJulgador: '1ª Vara', dataAjuizamento: '2023-01-01',
      grau: 'G1', formato: 'Eletrônico', movimentos: [],
    }
    expect(classifyResult(result)).toBe('labor')
  })

  it('returns undefined when no area matches', () => {
    const result: DataJudResult = {
      tribunal: 'tjsp', tribunalName: 'TJSP',
      numeroProcesso: '0001234-56.2023.8.26.0100',
      classe: 'Procedimento Comum', classeCode: 1,
      assuntos: ['Outros'],
      orgaoJulgador: '1ª Vara', dataAjuizamento: '2023-01-01',
      grau: 'G1', formato: 'Eletrônico', movimentos: [],
    }
    expect(classifyResult(result)).toBeUndefined()
  })
})

// ── sortByDate ────────────────────────────────────────────────────────────

describe('sortByDate', () => {
  function makeResult(date: string, classe = 'Apelação'): DataJudResult {
    return {
      tribunal: 'tjsp', tribunalName: 'TJSP',
      numeroProcesso: '0001234-56.2023.8.26.0100',
      classe, classeCode: 1,
      assuntos: [],
      orgaoJulgador: '1ª Vara', dataAjuizamento: date,
      grau: 'G1', formato: 'Eletrônico', movimentos: [],
    }
  }

  it('sorts ascending by default (oldest first)', () => {
    const results = [makeResult('2024-06-01'), makeResult('2022-01-15'), makeResult('2023-03-20')]
    const sorted = sortByDate(results)
    expect(sorted.map(r => r.dataAjuizamento)).toEqual(['2022-01-15', '2023-03-20', '2024-06-01'])
  })

  it('sorts descending when ascending=false (newest first)', () => {
    const results = [makeResult('2024-06-01'), makeResult('2022-01-15'), makeResult('2023-03-20')]
    const sorted = sortByDate(results, false)
    expect(sorted.map(r => r.dataAjuizamento)).toEqual(['2024-06-01', '2023-03-20', '2022-01-15'])
  })

  it('does not mutate original array', () => {
    const results = [makeResult('2024-06-01'), makeResult('2022-01-15')]
    const sorted = sortByDate(results)
    expect(sorted).not.toBe(results)
    expect(results[0].dataAjuizamento).toBe('2024-06-01') // unchanged
  })

  it('handles empty array', () => {
    expect(sortByDate([])).toEqual([])
  })
})

// ── groupByArea ─────────────────────────────────────────────────────────────

describe('groupByArea', () => {
  function makeResult(assuntos: string[], classe: string): DataJudResult {
    return {
      tribunal: 'tjsp', tribunalName: 'TJSP',
      numeroProcesso: '0001234-56.2023.8.26.0100',
      classe, classeCode: 1,
      assuntos,
      orgaoJulgador: '1ª Vara', dataAjuizamento: '2023-01-01',
      grau: 'G1', formato: 'Eletrônico', movimentos: [],
    }
  }

  it('groups results by classified area', () => {
    const results = [
      makeResult(['Rescisão do Contrato de Trabalho'], 'Reclamação Trabalhista'),
      makeResult(['ICMS'], 'Mandado de Segurança'),
      makeResult(['Hora Extra'], 'Reclamação Trabalhista'),
    ]
    const groups = groupByArea(results)
    expect(groups.length).toBe(2)
    const laborGroup = groups.find(g => g.area === 'labor')
    expect(laborGroup).toBeDefined()
    expect(laborGroup!.results.length).toBe(2)
    const taxGroup = groups.find(g => g.area === 'tax')
    expect(taxGroup).toBeDefined()
    expect(taxGroup!.results.length).toBe(1)
  })

  it('places unclassified results under "Outros"', () => {
    const results = [makeResult(['Outros'], 'Procedimento Comum')]
    const groups = groupByArea(results)
    expect(groups.length).toBe(1)
    expect(groups[0].area).toBeUndefined()
    expect(groups[0].label).toBe('Outros')
  })

  it('sorts named areas before "Outros"', () => {
    const results = [
      makeResult(['Outros'], 'Procedimento'),
      makeResult(['ICMS'], 'Mandado de Segurança'),
    ]
    const groups = groupByArea(results)
    expect(groups[0].area).toBeDefined() // tax first
    expect(groups[1].area).toBeUndefined() // Outros last
  })

  it('handles empty input', () => {
    expect(groupByArea([])).toEqual([])
  })
})

// ── compareProcesses ────────────────────────────────────────────────────────

describe('compareProcesses', () => {
  function makeResult(overrides: Partial<DataJudResult> = {}): DataJudResult {
    return {
      tribunal: 'tjsp', tribunalName: 'TJSP',
      numeroProcesso: '0001234-56.2023.8.26.0100',
      classe: 'Apelação Cível', classeCode: 1001,
      assuntos: ['Responsabilidade Civil'],
      orgaoJulgador: '1ª Vara', dataAjuizamento: '2023-01-01',
      grau: 'G1', formato: 'Eletrônico', movimentos: [],
      ...overrides,
    }
  }

  it('identifies shared assuntos (case-insensitive)', () => {
    const left = makeResult({ assuntos: ['Dano Moral', 'Responsabilidade Civil'] })
    const right = makeResult({ assuntos: ['responsabilidade civil', 'Contrato'] })
    const c = compareProcesses(left, right)
    expect(c.sharedAssuntos).toEqual(['responsabilidade civil'])
  })

  it('computes daysDiff between dates', () => {
    const left = makeResult({ dataAjuizamento: '2023-01-01' })
    const right = makeResult({ dataAjuizamento: '2023-01-11' })
    const c = compareProcesses(left, right)
    expect(c.daysDiff).toBe(10)
  })

  it('returns negative daysDiff when right is older', () => {
    const left = makeResult({ dataAjuizamento: '2023-06-01' })
    const right = makeResult({ dataAjuizamento: '2023-01-01' })
    const c = compareProcesses(left, right)
    expect(c.daysDiff!).toBeLessThan(0)
  })

  it('detects same area', () => {
    const left = makeResult({ assuntos: ['Rescisão do Contrato de Trabalho'], classe: 'Reclamação Trabalhista' })
    const right = makeResult({ assuntos: ['Hora Extra'], classe: 'Reclamação Trabalhista' })
    const c = compareProcesses(left, right)
    expect(c.sameArea).toBe(true)
  })

  it('returns sameArea=false for different areas', () => {
    const left = makeResult({ assuntos: ['Rescisão do Contrato de Trabalho'], classe: 'Reclamação Trabalhista' })
    const right = makeResult({ assuntos: ['ICMS'], classe: 'Mandado de Segurança' })
    const c = compareProcesses(left, right)
    expect(c.sameArea).toBe(false)
  })

  it('returns sameArea=false when both unclassified', () => {
    const left = makeResult({ assuntos: ['Outros'], classe: 'Procedimento' })
    const right = makeResult({ assuntos: ['Outros'], classe: 'Procedimento' })
    const c = compareProcesses(left, right)
    expect(c.sameArea).toBe(false)
  })

  it('handles missing dates (daysDiff=null)', () => {
    const left = makeResult({ dataAjuizamento: '' })
    const right = makeResult({ dataAjuizamento: '2023-01-01' })
    const c = compareProcesses(left, right)
    expect(c.daysDiff).toBeNull()
  })
})


// ── buildJurisprudenceAnalytics ─────────────────────────────────────────────

describe('buildJurisprudenceAnalytics', () => {
  function makeResult(overrides: Partial<DataJudResult> = {}): DataJudResult {
    return {
      tribunal: 'tjsp', tribunalName: 'TJSP',
      numeroProcesso: '0001234-56.2023.8.26.0100',
      classe: 'Apelação Cível', classeCode: 1001,
      assuntos: ['Responsabilidade Civil'],
      orgaoJulgador: '1ª Vara', dataAjuizamento: '2023-06-15',
      grau: 'G1', formato: 'Eletrônico', movimentos: [],
      ...overrides,
    }
  }

  it('returns correct totalResults', () => {
    const results = [makeResult(), makeResult(), makeResult()]
    const analytics = buildJurisprudenceAnalytics(results)
    expect(analytics.totalResults).toBe(3)
  })

  it('counts stance distribution correctly', () => {
    const results = [
      makeResult({ stance: 'favoravel' }),
      makeResult({ stance: 'favoravel' }),
      makeResult({ stance: 'desfavoravel' }),
      makeResult({ stance: 'neutro' }),
      makeResult(),
    ]
    const a = buildJurisprudenceAnalytics(results)
    expect(a.byStance.favoravel).toBe(2)
    expect(a.byStance.desfavoravel).toBe(1)
    expect(a.byStance.neutro).toBe(1)
    expect(a.byStance.semClassificacao).toBe(1)
  })

  it('groups by legal area', () => {
    const results = [
      makeResult({ assuntos: ['ICMS'], classe: 'Mandado de Segurança' }),
      makeResult({ assuntos: ['Rescisão do Contrato de Trabalho'], classe: 'Reclamação Trabalhista' }),
      makeResult({ assuntos: ['ICMS'], classe: 'Mandado de Segurança' }),
    ]
    const a = buildJurisprudenceAnalytics(results)
    const taxArea = a.byArea.find(x => x.area === 'tax')
    const laborArea = a.byArea.find(x => x.area === 'labor')
    expect(taxArea?.count).toBe(2)
    expect(laborArea?.count).toBe(1)
  })

  it('groups by year from dataAjuizamento', () => {
    const results = [
      makeResult({ dataAjuizamento: '2020-01-10' }),
      makeResult({ dataAjuizamento: '2020-06-15' }),
      makeResult({ dataAjuizamento: '2023-03-01' }),
    ]
    const a = buildJurisprudenceAnalytics(results)
    expect(a.byYear).toEqual([
      { year: '2020', count: 2 },
      { year: '2023', count: 1 },
    ])
  })

  it('groups by tribunal', () => {
    const results = [
      makeResult({ tribunalName: 'TJSP' }),
      makeResult({ tribunalName: 'TJSP' }),
      makeResult({ tribunalName: 'TRT-2' }),
    ]
    const a = buildJurisprudenceAnalytics(results)
    expect(a.byTribunal[0]).toEqual({ tribunal: 'TJSP', count: 2 })
    expect(a.byTribunal[1]).toEqual({ tribunal: 'TRT-2', count: 1 })
  })

  it('computes average relevance score', () => {
    const results = [
      makeResult({ relevanceScore: 80 }),
      makeResult({ relevanceScore: 60 }),
      makeResult(), // no score
    ]
    const a = buildJurisprudenceAnalytics(results)
    expect(a.avgRelevanceScore).toBe(70)
  })

  it('returns null avgRelevanceScore when no scores', () => {
    const a = buildJurisprudenceAnalytics([makeResult()])
    expect(a.avgRelevanceScore).toBeNull()
  })

  it('handles empty array', () => {
    const a = buildJurisprudenceAnalytics([])
    expect(a.totalResults).toBe(0)
    expect(a.byArea).toEqual([])
    expect(a.byStance).toEqual({ favoravel: 0, desfavoravel: 0, neutro: 0, semClassificacao: 0 })
    expect(a.byYear).toEqual([])
    expect(a.byTribunal).toEqual([])
    expect(a.avgRelevanceScore).toBeNull()
  })

  it('puts unclassified results under "outros"', () => {
    const results = [makeResult({ assuntos: ['Outros'], classe: 'Procedimento Comum' })]
    const a = buildJurisprudenceAnalytics(results)
    expect(a.byArea.length).toBe(1)
    expect(a.byArea[0].area).toBe('outros')
    expect(a.byArea[0].count).toBe(1)
  })
})
