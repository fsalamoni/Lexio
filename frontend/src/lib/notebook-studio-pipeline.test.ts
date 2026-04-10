import { describe, it, expect } from 'vitest'
import { detectLegalArea, generateStructuredVisualArtifactMedia } from './notebook-studio-pipeline'

describe('detectLegalArea', () => {
  it('detects tributário from topic with tax keywords', () => {
    expect(detectLegalArea('ICMS sobre importação de mercadorias')).toBe('tax')
    expect(detectLegalArea('Análise tributária do PIS/COFINS')).toBe('tax')
    expect(detectLegalArea('Imposto de renda pessoa jurídica')).toBe('tax')
  })

  it('detects trabalhista from labor keywords', () => {
    expect(detectLegalArea('Rescisão de contrato de trabalho')).toBe('labor')
    expect(detectLegalArea('Horas extras e adicional noturno CLT')).toBe('labor')
    expect(detectLegalArea('Justa causa por desídia do empregado')).toBe('labor')
  })

  it('detects penal from criminal keywords', () => {
    expect(detectLegalArea('Dosimetria da pena no crime de roubo')).toBe('criminal')
    expect(detectLegalArea('Tipicidade penal e excludentes')).toBe('criminal')
  })

  it('detects civil from civil law keywords', () => {
    expect(detectLegalArea('Responsabilidade civil por dano moral')).toBe('civil')
    expect(detectLegalArea('Obrigações contratuais de direito civil')).toBe('civil')
  })

  it('detects consumidor from consumer keywords', () => {
    expect(detectLegalArea('Relação de consumo e CDC')).toBe('consumer')
    expect(detectLegalArea('Produto defeituoso e responsabilidade do fornecedor')).toBe('consumer')
  })

  it('detects constitucional from constitutional keywords', () => {
    expect(detectLegalArea('Controle de constitucionalidade de lei estadual')).toBe('constitutional')
    expect(detectLegalArea('ADI contra emenda constitucional')).toBe('constitutional')
  })

  it('detects ambiental from environmental keywords', () => {
    expect(detectLegalArea('Dano ambiental e recuperação de área degradada')).toBe('environmental')
    expect(detectLegalArea('Licenciamento ambiental para mineração')).toBe('environmental')
  })

  it('detects previdenciário from social security keywords', () => {
    expect(detectLegalArea('Aposentadoria por invalidez no INSS')).toBe('social_security')
    expect(detectLegalArea('Auxílio-doença e incapacidade laborativa')).toBe('social_security')
  })

  it('detects família from family keywords', () => {
    expect(detectLegalArea('Divórcio litigioso e guarda compartilhada')).toBe('family')
    expect(detectLegalArea('Fixação de alimentos para menor')).toBe('family')
  })

  it('detects digital from digital law keywords', () => {
    expect(detectLegalArea('LGPD e proteção de dados pessoais')).toBe('digital')
    expect(detectLegalArea('Marco civil da internet e remoção de conteúdo')).toBe('digital')
  })

  it('uses description as fallback when topic is generic', () => {
    expect(detectLegalArea('Análise jurídica', 'Questões sobre imposto de renda')).toBe('tax')
    expect(detectLegalArea('Caso do cliente', 'Problema trabalhista com CLT')).toBe('labor')
  })

  it('returns undefined for unrecognized topics', () => {
    expect(detectLegalArea('Receita de bolo de chocolate')).toBeUndefined()
    expect(detectLegalArea('Previsão do tempo')).toBeUndefined()
    expect(detectLegalArea('')).toBeUndefined()
  })

  it('detects administrativo from administrative keywords', () => {
    expect(detectLegalArea('Improbidade administrativa do servidor público')).toBe('administrative')
    expect(detectLegalArea('Licitação e contratos administrativos')).toBe('administrative')
  })

  it('detects empresarial from business keywords', () => {
    expect(detectLegalArea('Recuperação judicial de empresa')).toBe('business')
    expect(detectLegalArea('Desconsideração da personalidade jurídica societário')).toBe('business')
  })

  it('detects processual civil from civil procedure keywords', () => {
    expect(detectLegalArea('Tutela antecipada e CPC')).toBe('civil_procedure')
    expect(detectLegalArea('Cumprimento de sentença e execução')).toBe('civil_procedure')
  })

  it('detects processual penal from criminal procedure keywords', () => {
    expect(detectLegalArea('Prisão preventiva e inquérito policial')).toBe('criminal_procedure')
    expect(detectLegalArea('Denúncia e ação penal pública')).toBe('criminal_procedure')
  })

  it('detects eleitoral from electoral keywords', () => {
    expect(detectLegalArea('Propaganda eleitoral antecipada')).toBe('electoral')
    expect(detectLegalArea('Inelegibilidade do candidato')).toBe('electoral')
  })

  it('detects internacional from international law keywords', () => {
    expect(detectLegalArea('Homologação de sentença estrangeira')).toBe('international')
    expect(detectLegalArea('Tratado internacional e soberania')).toBe('international')
  })

  it('detects sucessões from inheritance keywords', () => {
    expect(detectLegalArea('Inventário e partilha de herança')).toBe('inheritance')
    expect(detectLegalArea('Testamento e legado do herdeiro')).toBe('inheritance')
  })

  it('returns a descriptive error for invalid structured visual artifacts', async () => {
    await expect(generateStructuredVisualArtifactMedia('infografico', 'conteúdo inválido'))
      .rejects.toThrow('O artefato visual "infografico" possui estrutura inválida para gerar imagem final.')
  })
})
