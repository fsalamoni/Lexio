import { beforeEach, describe, expect, it, vi } from 'vitest'

const thesisExtractorMocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  createThesis: vi.fn(),
  listTheses: vi.fn(),
  updateThesis: vi.fn(),
}))

vi.mock('./llm-client', () => ({
  callLLM: (...args: unknown[]) => thesisExtractorMocks.callLLM(...args),
}))

vi.mock('./firestore-service', () => ({
  createThesis: (...args: unknown[]) => thesisExtractorMocks.createThesis(...args),
  listTheses: (...args: unknown[]) => thesisExtractorMocks.listTheses(...args),
  updateThesis: (...args: unknown[]) => thesisExtractorMocks.updateThesis(...args),
}))

import { extractAndStoreTheses } from './thesis-extractor'

describe('extractAndStoreTheses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    thesisExtractorMocks.listTheses.mockResolvedValue({ items: [] })
  })

  it('returns early when the source text is too short', async () => {
    const result = await extractAndStoreTheses('api-key', 'user-1', 'texto curto')

    expect(result).toEqual({ created: 0, merged: 0, theses: [] })
    expect(thesisExtractorMocks.callLLM).not.toHaveBeenCalled()
    expect(thesisExtractorMocks.createThesis).not.toHaveBeenCalled()
  })

  it('creates new theses when no similar titles exist', async () => {
    thesisExtractorMocks.callLLM.mockResolvedValue({
      content: JSON.stringify([
        {
          title: 'Cabimento do mandado de seguranca',
          content: 'A tese principal do mandado de seguranca.',
          summary: 'Resumo da tese 1.',
          category: 'processual',
          tags: ['mandado', 'seguranca'],
          quality_score: 88,
        },
        {
          title: 'Limites da responsabilidade civil do estado',
          content: 'A tese principal sobre responsabilidade civil.',
          summary: 'Resumo da tese 2.',
          category: 'material',
          tags: ['responsabilidade', 'estado'],
          quality_score: 91,
        },
      ]),
    })
    thesisExtractorMocks.createThesis
      .mockResolvedValueOnce({ id: 'tese-1', title: 'Cabimento do mandado de seguranca' })
      .mockResolvedValueOnce({ id: 'tese-2', title: 'Limites da responsabilidade civil do estado' })

    const result = await extractAndStoreTheses(
      'api-key',
      'user-1',
      'A'.repeat(400),
      { legalAreaId: 'constitucional', documentTypeId: 'parecer', sourceType: 'documento' },
    )

    expect(thesisExtractorMocks.listTheses).toHaveBeenCalledWith('user-1', { limit: 200 })
    expect(thesisExtractorMocks.createThesis).toHaveBeenCalledTimes(2)
    expect(thesisExtractorMocks.createThesis).toHaveBeenNthCalledWith(1, 'user-1', expect.objectContaining({
      title: 'Cabimento do mandado de seguranca',
      legal_area_id: 'constitucional',
      document_type_id: 'parecer',
      source_type: 'documento',
    }))
    expect(result).toEqual({
      created: 2,
      merged: 0,
      theses: [
        { id: 'tese-1', title: 'Cabimento do mandado de seguranca' },
        { id: 'tese-2', title: 'Limites da responsabilidade civil do estado' },
      ],
    })
  })

  it('fails gracefully when the extraction response is invalid JSON', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    thesisExtractorMocks.callLLM.mockResolvedValue({
      content: 'resposta sem json valido',
    })

    try {
      const result = await extractAndStoreTheses('api-key', 'user-1', 'C'.repeat(500))

      expect(result).toEqual({ created: 0, merged: 0, theses: [] })
      expect(thesisExtractorMocks.listTheses).not.toHaveBeenCalled()
      expect(thesisExtractorMocks.createThesis).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith('Thesis extraction: failed to parse LLM response')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('merges with an existing similar thesis instead of creating a duplicate', async () => {
    thesisExtractorMocks.callLLM
      .mockResolvedValueOnce({
        content: JSON.stringify([
          {
            title: 'Cabimento do mandado de segurança',
            content: 'Nova versão da tese com fundamentos adicionais.',
            summary: 'Nova versão resumida.',
            category: 'processual',
            tags: ['mandado', 'tutela'],
            quality_score: 93,
          },
        ]),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          title: 'Cabimento do mandado de segurança',
          content: 'Versão consolidada com todos os fundamentos.',
          summary: 'Resumo consolidado.',
        }),
      })

    thesisExtractorMocks.listTheses.mockResolvedValue({
      items: [
        {
          id: 'tese-existente',
          title: 'Cabimento do mandado de seguranca',
          content: 'Versão atual já cadastrada.',
          summary: 'Resumo antigo.',
          tags: ['mandado'],
          quality_score: 70,
          category: 'processual',
        },
      ],
    })

    const result = await extractAndStoreTheses('api-key', 'user-1', 'B'.repeat(500))

    expect(thesisExtractorMocks.createThesis).not.toHaveBeenCalled()
    expect(thesisExtractorMocks.updateThesis).toHaveBeenCalledWith('user-1', 'tese-existente', expect.objectContaining({
      title: 'Cabimento do mandado de segurança',
      content: 'Versão consolidada com todos os fundamentos.',
      summary: 'Resumo consolidado.',
      tags: ['mandado', 'tutela'],
      quality_score: 93,
      category: 'processual',
    }))
    expect(result).toEqual({
      created: 0,
      merged: 1,
      theses: [{ id: 'tese-existente', title: 'Cabimento do mandado de segurança' }],
    })
  })
})