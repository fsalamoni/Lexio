import { describe, expect, it } from 'vitest'

import { inferExpectedDeliverablesFromText } from './chat-deliverable-contract'

describe('inferExpectedDeliverablesFromText', () => {
  it('does not infer a legal document when documents appear only as visual scene content', () => {
    const expected = inferExpectedDeliverablesFromText(
      'Crie uma imagem que represente uma plataforma jurídica com IA organizando documentos, pesquisas e pareceres em um painel moderno e profissional.',
    )

    expect(expected.map(item => item.kind)).toEqual(['image'])
  })

  it('keeps inferring generic document bundles when the user asks for documents to download', () => {
    const expected = inferExpectedDeliverablesFromText('Faça um projeto e me entregue os documentos para baixar.')

    expect(expected.map(item => item.kind)).toContain('legal_document')
  })

  it('does not classify a presentation request as a legal document just because it mentions PDF export', () => {
    const expected = inferExpectedDeliverablesFromText('Crie uma apresentação em PDF sobre o caso.')

    expect(expected.map(item => item.kind)).toEqual(['presentation'])
  })
})