import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeNotebookAcervo } from './notebook-acervo-analyzer'
import { TransientLLMError } from './llm-client'

const mockCallLLM = vi.fn()
const mockGetAllAcervoDocumentsForSearch = vi.fn()
const mockUpdateAcervoEmenta = vi.fn()
const mockGetOpenRouterKey = vi.fn()
const mockGenerateAcervoEmenta = vi.fn()
const mockLoadNotebookAcervoModels = vi.fn()
const mockCreateUsageExecutionRecord = vi.fn()

vi.mock('./llm-client', async () => {
  const actual = await vi.importActual<typeof import('./llm-client')>('./llm-client')
  return {
    ...actual,
    callLLM: (...args: unknown[]) => mockCallLLM(...args),
  }
})

vi.mock('./firestore-service', () => ({
  getAllAcervoDocumentsForSearch: (...args: unknown[]) => mockGetAllAcervoDocumentsForSearch(...args),
  updateAcervoEmenta: (...args: unknown[]) => mockUpdateAcervoEmenta(...args),
}))

vi.mock('./generation-service', () => ({
  getOpenRouterKey: (...args: unknown[]) => mockGetOpenRouterKey(...args),
  generateAcervoEmenta: (...args: unknown[]) => mockGenerateAcervoEmenta(...args),
}))

vi.mock('./model-config', () => ({
  loadNotebookAcervoModels: (...args: unknown[]) => mockLoadNotebookAcervoModels(...args),
}))

vi.mock('./cost-analytics', () => ({
  createUsageExecutionRecord: (...args: unknown[]) => mockCreateUsageExecutionRecord(...args),
}))

function llmResult(content: string, model: string) {
  return {
    content,
    model,
    tokens_in: 10,
    tokens_out: 20,
    cost_usd: 0.001,
    duration_ms: 100,
  }
}

function makeDoc(id: string, filename: string, ementa: string, repeatedChar: string, createdAt: string) {
  return {
    id,
    filename,
    text_content: repeatedChar.repeat(12_000),
    created_at: createdAt,
    ementa,
    content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size_bytes: 100,
  }
}

describe('analyzeNotebookAcervo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetOpenRouterKey.mockResolvedValue('sk-test')
    mockLoadNotebookAcervoModels.mockResolvedValue({
      nb_acervo_triagem: 'triagem-model',
      nb_acervo_buscador: 'buscador-model',
      nb_acervo_analista: 'analista-model',
      nb_acervo_curador: 'curador-model',
    })
    mockCreateUsageExecutionRecord.mockImplementation((input: unknown) => input)
    mockUpdateAcervoEmenta.mockResolvedValue(undefined)
    mockGenerateAcervoEmenta.mockResolvedValue(undefined)
  })

  it('falls back safely when analista and curador hit transient errors', async () => {
    const docs = [
      makeDoc('doc-1', 'parecer-1.docx', 'Parecer sobre contratação temporária', 'A', '2026-01-01T00:00:00.000Z'),
      makeDoc('doc-2', 'parecer-2.docx', 'Nota técnica sobre excepcional interesse público', 'B', '2026-01-02T00:00:00.000Z'),
    ]
    mockGetAllAcervoDocumentsForSearch.mockResolvedValue(docs)

    mockCallLLM
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        tema: 'Contratação temporária',
        palavras_chave: ['contratação temporária', 'excepcional interesse público'],
      }), 'triagem-model'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        selected: [
          { id: 'doc-1', score: 0.91, reason: 'Mais aderente ao tema do caderno.' },
          { id: 'doc-2', score: 0.63, reason: 'Complementa a fundamentação.' },
        ],
      }), 'buscador-model'))
      .mockRejectedValueOnce(new TransientLLMError('Requisição ao OpenRouter excedeu o tempo limite (120s)'))
      .mockRejectedValueOnce(new TransientLLMError('OpenRouter returned empty response'))

    const progress: string[] = []
    const result = await analyzeNotebookAcervo(
      'user-1',
      'notebook-1',
      'Contratação temporária',
      'Analisar requisitos e limites.',
      [],
      new Set<string>(),
      (p) => { progress.push(p.message) },
    )

    expect(result.documents).toHaveLength(2)
    expect(result.documents.map(doc => doc.id)).toEqual(['doc-1', 'doc-2'])
    expect(result.documents[0].summary).toBe('Mais aderente ao tema do caderno.')
    expect(result.documents[1].summary).toBe('Complementa a fundamentação.')
    expect(result.executions).toHaveLength(2)
    expect(progress).toContain('Analista parcialmente indisponível; concluído com fallback seguro.')
    expect(progress).toContain('Curador indisponível no momento; usando ranking do Buscador.')
  })

  it('analyses selected documents in smaller batches', async () => {
    const docs = [
      makeDoc('doc-1', 'parecer-1.docx', 'Parecer sobre contratação temporária', 'A', '2026-01-01T00:00:00.000Z'),
      makeDoc('doc-2', 'parecer-2.docx', 'Nota técnica sobre excepcional interesse público', 'B', '2026-01-02T00:00:00.000Z'),
      makeDoc('doc-3', 'parecer-3.docx', 'Manifestação sobre concurso temporário', 'C', '2026-01-03T00:00:00.000Z'),
    ]
    mockGetAllAcervoDocumentsForSearch.mockResolvedValue(docs)

    mockCallLLM
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        tema: 'Contratação temporária',
        subtemas: ['Excepcional interesse público'],
        palavras_chave: ['contratação temporária'],
      }), 'triagem-model'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        selected: [
          { id: 'doc-1', score: 0.82, reason: 'Fundamentação central.' },
          { id: 'doc-2', score: 0.95, reason: 'Caso mais aderente.' },
          { id: 'doc-3', score: 0.52, reason: 'Complementa a pesquisa.' },
        ],
      }), 'buscador-model'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        analyses: [
          { id: 'doc-1', relevance: 'media', score: 0.72, summary: 'Resumo analítico 1', key_points: ['P1'] },
          { id: 'doc-2', relevance: 'alta', score: 0.88, summary: 'Resumo analítico 2', key_points: ['P2'] },
        ],
      }), 'analista-model'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        analyses: [
          { id: 'doc-3', relevance: 'media', score: 0.65, summary: 'Resumo analítico 3', key_points: ['P3'] },
        ],
      }), 'analista-model'))
      .mockRejectedValueOnce(new TransientLLMError('Requisição ao OpenRouter excedeu o tempo limite (120s)'))

    const result = await analyzeNotebookAcervo(
      'user-1',
      'notebook-1',
      'Contratação temporária',
      'Analisar requisitos e limites.',
      [],
      new Set<string>(),
    )

    expect(mockCallLLM).toHaveBeenCalledTimes(5)
    expect(String(mockCallLLM.mock.calls[2]?.[2])).toContain('ID: doc-1')
    expect(String(mockCallLLM.mock.calls[2]?.[2])).toContain('ID: doc-2')
    expect(String(mockCallLLM.mock.calls[2]?.[2])).not.toContain('ID: doc-3')
    expect(String(mockCallLLM.mock.calls[3]?.[2])).toContain('ID: doc-3')
    expect(result.documents.map(doc => doc.id)).toEqual(['doc-2', 'doc-1', 'doc-3'])
    expect(result.documents.map(doc => doc.summary)).toEqual([
      'Resumo analítico 2',
      'Resumo analítico 1',
      'Resumo analítico 3',
    ])
  })

  it('keeps analyst recommendations when curador returns malformed content', async () => {
    const docs = [
      makeDoc('doc-1', 'parecer-1.docx', 'Parecer sobre contratação temporária', 'A', '2026-01-01T00:00:00.000Z'),
    ]
    mockGetAllAcervoDocumentsForSearch.mockResolvedValue(docs)

    mockCallLLM
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        tema: 'Contratação temporária',
        palavras_chave: ['contratação temporária'],
      }), 'triagem-model'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        selected: [{ id: 'doc-1', score: 0.7, reason: 'Motivo do buscador.' }],
      }), 'buscador-model'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        analyses: [
          { id: 'doc-1', relevance: 'alta', score: 0.93, summary: 'Resumo final do analista', key_points: ['P1'] },
        ],
      }), 'analista-model'))
      .mockResolvedValueOnce(llmResult('conteúdo inválido', 'curador-model'))

    const result = await analyzeNotebookAcervo(
      'user-1',
      'notebook-1',
      'Contratação temporária',
      'Analisar requisitos e limites.',
      [],
      new Set<string>(),
    )

    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].summary).toBe('Resumo final do analista')
    expect(result.documents[0].score).toBeCloseTo(0.861, 3)
  })

  it('excludes acervo documents already linked to the notebook', async () => {
    const docs = [
      makeDoc('doc-1', 'parecer-1.docx', 'Parecer sobre contratação temporária já anexado', 'A', '2026-01-01T00:00:00.000Z'),
      makeDoc('doc-2', 'parecer-2.docx', 'Parecer sobre contratação temporária elegível', 'B', '2026-01-02T00:00:00.000Z'),
    ]
    mockGetAllAcervoDocumentsForSearch.mockResolvedValue(docs)

    mockCallLLM
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        tema: 'Contratação temporária',
        palavras_chave: ['contratação temporária'],
      }), 'triagem-model'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        selected: [{ id: 'doc-2', score: 0.81, reason: 'Documento ainda não anexado ao caderno.' }],
      }), 'buscador-model'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        analyses: [
          { id: 'doc-2', relevance: 'alta', score: 0.9, summary: 'Resumo do documento elegível', key_points: ['P1'] },
        ],
      }), 'analista-model'))
      .mockResolvedValueOnce(llmResult(JSON.stringify({
        recommended: [{ id: 'doc-2', score: 0.88, summary: 'Curadoria final do documento elegível' }],
      }), 'curador-model'))

    const result = await analyzeNotebookAcervo(
      'user-1',
      'notebook-1',
      'Contratação temporária',
      'Analisar requisitos e limites.',
      ['parecer-1.docx'],
      new Set<string>(['doc-1']),
    )

    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].id).toBe('doc-2')
    expect(String(mockCallLLM.mock.calls[1]?.[2])).not.toContain('ID: doc-1')
    expect(String(mockCallLLM.mock.calls[1]?.[2])).toContain('ID: doc-2')
  })
})
