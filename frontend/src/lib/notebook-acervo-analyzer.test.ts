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

  it('falls back to buscador results when analista and curador hit transient errors', async () => {
    const docs = [
      {
        id: 'doc-1',
        filename: 'parecer-1.docx',
        text_content: 'A'.repeat(12_000),
        created_at: '2026-01-01T00:00:00.000Z',
        ementa: 'Parecer sobre contratação temporária',
        content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size_bytes: 100,
      },
      {
        id: 'doc-2',
        filename: 'parecer-2.docx',
        text_content: 'B'.repeat(12_000),
        created_at: '2026-01-02T00:00:00.000Z',
        ementa: 'Nota técnica sobre excepcional interesse público',
        content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size_bytes: 200,
      },
    ]
    mockGetAllAcervoDocumentsForSearch.mockResolvedValue(docs)

    mockCallLLM
      .mockResolvedValueOnce({
        content: JSON.stringify({
          tema: 'Contratação temporária',
          palavras_chave: ['contratação temporária', 'excepcional interesse público'],
        }),
        model: 'triagem-model',
        tokens_in: 10,
        tokens_out: 20,
        cost_usd: 0.001,
        duration_ms: 100,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          selected: [
            { id: 'doc-1', score: 0.91, reason: 'Mais aderente ao tema do caderno.' },
            { id: 'doc-2', score: 0.63, reason: 'Complementa a fundamentação.' },
          ],
        }),
        model: 'buscador-model',
        tokens_in: 11,
        tokens_out: 21,
        cost_usd: 0.002,
        duration_ms: 110,
      })
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
    expect(progress).toContain('Analista indisponível no momento; seguindo com curadoria rápida.')
    expect(progress).toContain('Curador indisponível no momento; usando ranking do Buscador.')
  })
})
