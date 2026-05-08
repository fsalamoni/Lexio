import { describe, expect, it } from 'vitest'
import { buildPesquisadorUserPrompt, buildProfileBlock } from './prompts'

describe('document generation prompt helpers', () => {
  it('builds a profile block from legal drafting preferences', () => {
    const block = buildProfileBlock({
      position: 'Procurador',
      institution: 'Município de Teste',
      jurisdiction: 'TJSP',
      specializations: ['Direito Administrativo'],
      formality_level: 'formal',
      connective_style: 'classico',
      paragraph_length: 'curto',
      citation_style: 'abnt',
      argument_depth: 'moderado',
      include_opposing_view: true,
    })

    expect(block).toContain('<perfil_profissional>')
    expect(block).toContain('Procurador')
    expect(block).toContain('<estilo_redacao>')
    expect(block).toContain('<profundidade>')
    expect(block).toContain('<visao_contraria>')
  })

  it('builds the pesquisador user prompt with optional acervo base', () => {
    const promptWithoutAcervo = buildPesquisadorUserPrompt(
      'Pedido do usuário',
      '{"tema":"Nepotismo"}',
      '<banco_de_teses>Base</banco_de_teses>',
    )
    const promptWithAcervo = buildPesquisadorUserPrompt(
      'Pedido do usuário',
      '{"tema":"Nepotismo"}',
      '<banco_de_teses>Base</banco_de_teses>',
      'Documento base compilado com [COMPLEMENTAR]',
    )

    expect(promptWithoutAcervo).toContain('<base_conhecimento>')
    expect(promptWithoutAcervo).not.toContain('<documento_base_acervo>')
    expect(promptWithAcervo).toContain('<documento_base_acervo>')
    expect(promptWithAcervo).toContain('[COMPLEMENTAR]')
  })
})
