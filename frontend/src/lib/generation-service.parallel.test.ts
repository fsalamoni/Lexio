import { describe, expect, it, vi } from 'vitest'
import {
  buildPesquisadorUserPrompt,
  resolveParallelPreloadWithSequentialFallback,
  selectAcervoDocsForBuscador,
} from './generation-service'

describe('generation-service parallel helpers', () => {
  it('retries sequentially when parallel preload fails', async () => {
    const sequentialLoad = vi.fn().mockResolvedValue(['doc-1'])
    const onFailure = vi.fn()
    const preload = Promise.resolve({ ok: false as const, error: new Error('network') })

    const result = await resolveParallelPreloadWithSequentialFallback(preload, sequentialLoad, onFailure)

    expect(result).toEqual(['doc-1'])
    expect(sequentialLoad).toHaveBeenCalledTimes(1)
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it('keeps the preloaded value when parallel preload succeeds', async () => {
    const sequentialLoad = vi.fn().mockResolvedValue(['doc-sequential'])
    const preload = Promise.resolve({ ok: true as const, value: ['doc-preloaded'] })

    const result = await resolveParallelPreloadWithSequentialFallback(preload, sequentialLoad)

    expect(result).toEqual(['doc-preloaded'])
    expect(sequentialLoad).not.toHaveBeenCalled()
  })

  it('applies keyword prefilter only when the flag is enabled', () => {
    const docs = [
      {
        id: 'doc-1',
        filename: 'nepotismo-parecer.docx',
        created_at: '2026-01-01T00:00:00.000Z',
        ementa: 'Parecer sobre nepotismo em contratacao temporaria',
        ementa_keywords: ['nepotismo'],
      },
      {
        id: 'doc-2',
        filename: 'licitacao-nota.docx',
        created_at: '2026-01-02T00:00:00.000Z',
        ementa: 'Nota sobre licitacao e contratos administrativos',
        ementa_keywords: ['licitacao'],
      },
    ]

    expect(selectAcervoDocsForBuscador(docs, ['nepotismo'], true).map(doc => doc.id)).toEqual(['doc-1'])
    expect(selectAcervoDocsForBuscador(docs, ['nepotismo'], false).map(doc => doc.id)).toEqual(['doc-1', 'doc-2'])
  })

  it('builds the pesquisador prompt with or without compiled acervo base', () => {
    const promptWithoutAcervoBase = buildPesquisadorUserPrompt(
      'Pedido do usuário',
      '{"tema":"Nepotismo"}',
      '<banco_de_teses>Base</banco_de_teses>',
    )
    const promptWithAcervoBase = buildPesquisadorUserPrompt(
      'Pedido do usuário',
      '{"tema":"Nepotismo"}',
      '<banco_de_teses>Base</banco_de_teses>',
      'Documento base compilado',
    )

    expect(promptWithoutAcervoBase).toContain('<base_conhecimento>')
    expect(promptWithoutAcervoBase).not.toContain('<documento_base_acervo>')
    expect(promptWithAcervoBase).toContain('<documento_base_acervo>')
    expect(promptWithAcervoBase).toContain('[COMPLEMENTAR]')
  })
})