import { describe, expect, it } from 'vitest'
import {
  buildAcervoBuscadorUser,
  buildAcervoCompiladorSystem,
  buildAcervoRevisorUser,
  extractSearchKeywords,
  selectAcervoDocsForBuscador,
} from './acervo'

describe('document acervo helpers', () => {
  it('prefilters acervo documents by keyword relevance when enabled', () => {
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

  it('extracts search keywords from fenced triage JSON and request text', () => {
    const keywords = extractSearchKeywords(
      '```json\n{"tema":"Nepotismo administrativo","subtemas":["Cargo político"],"palavras_chave":["Súmula Vinculante 13"]}\n```',
      'Parecer sobre nomeacao municipal envolvendo parentesco',
    )

    expect(keywords).toContain('nepotismo')
    expect(keywords).toContain('administrativo')
    expect(keywords).toContain('cargo')
    expect(keywords).toContain('súmula vinculante 13')
    expect(keywords).toContain('nomeacao')
  })

  it('builds acervo agent prompts with structured document context', () => {
    const buscadorPrompt = buildAcervoBuscadorUser(
      '{"tema":"Nepotismo"}',
      'Pedido do usuário',
      'parecer',
      [{
        id: 'doc-1',
        filename: 'nepotismo.docx',
        summary: 'Parecer sobre nepotismo',
        created_at: '2026-01-01T00:00:00.000Z',
        natureza: 'consultivo',
        area_direito: ['Direito Administrativo'],
        assuntos: ['Nepotismo'],
        tipo_documento: 'Parecer',
        contexto: ['Município'],
      }],
    )
    const compiladorSystem = buildAcervoCompiladorSystem('parecer', 'Nepotismo', {
      position: 'Procurador',
      institution: 'Município de Teste',
    })
    const revisorPrompt = buildAcervoRevisorUser('Pedido', '{"tema":"Nepotismo"}', 'parecer', 'Base compilada')

    expect(buscadorPrompt).toContain('<acervo_disponivel>')
    expect(buscadorPrompt).toContain('Natureza: consultivo')
    expect(compiladorSystem).toContain('<perfil_profissional>')
    expect(compiladorSystem).toContain('Criar um Parecer Jurídico BASE')
    expect(revisorPrompt).toContain('<documento_base_compilado>')
  })
})
