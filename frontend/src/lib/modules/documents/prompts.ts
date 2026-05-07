export interface UserProfileForGeneration {
  institution?: string
  position?: string
  jurisdiction?: string
  primary_areas?: string[]
  specializations?: string[]
  formality_level?: string
  connective_style?: string
  citation_style?: string
  preferred_expressions?: string[]
  avoided_expressions?: string[]
  paragraph_length?: string
  detail_level?: string
  argument_depth?: string
  include_opposing_view?: boolean
}

export const DOC_TYPE_NAMES: Record<string, string> = {
  parecer: 'Parecer Jurídico',
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  recurso: 'Recurso',
  acao_civil_publica: 'Ação Civil Pública',
  sentenca: 'Sentença',
  mandado_seguranca: 'Mandado de Segurança',
  habeas_corpus: 'Habeas Corpus',
  agravo: 'Agravo de Instrumento',
  embargos_declaracao: 'Embargos de Declaração',
}

export const AREA_NAMES: Record<string, string> = {
  administrative: 'Direito Administrativo',
  constitutional: 'Direito Constitucional',
  civil: 'Direito Civil',
  tax: 'Direito Tributário',
  labor: 'Direito do Trabalho',
  criminal: 'Direito Penal',
  criminal_procedure: 'Processo Penal',
  civil_procedure: 'Processo Civil',
  consumer: 'Direito do Consumidor',
  environmental: 'Direito Ambiental',
  business: 'Direito Empresarial',
  family: 'Direito de Família',
  inheritance: 'Direito das Sucessões',
  social_security: 'Direito Previdenciário',
  electoral: 'Direito Eleitoral',
  international: 'Direito Internacional',
  digital: 'Direito Digital',
}

export function buildProfileBlock(profile?: UserProfileForGeneration | null): string {
  if (!profile) return ''
  const parts: string[] = []

  if (profile.institution || profile.position) {
    const role = [profile.position, profile.institution].filter(Boolean).join(' — ')
    parts.push(`<perfil_profissional>O usuário é ${role}.`)
    if (profile.jurisdiction) parts.push(`Jurisdição: ${profile.jurisdiction}.`)
    if (profile.specializations?.length) {
      parts.push(`Especializações: ${profile.specializations.join(', ')}.`)
    }
    parts.push('Adapte a linguagem e as referências legais ao contexto profissional do usuário.</perfil_profissional>')
  }

  const styleParts: string[] = []
  if (profile.formality_level === 'formal') {
    styleParts.push('linguagem jurídica clássica e formal')
  } else if (profile.formality_level === 'semiformal') {
    styleParts.push('linguagem clara e objetiva')
  }
  if (profile.connective_style === 'classico') {
    styleParts.push('conectivos clássicos (destarte, outrossim, mormente)')
  } else if (profile.connective_style === 'moderno') {
    styleParts.push('conectivos modernos (portanto, além disso, nesse sentido)')
  }
  if (profile.paragraph_length === 'curto') {
    styleParts.push('parágrafos curtos (3-5 linhas)')
  } else if (profile.paragraph_length === 'longo') {
    styleParts.push('parágrafos longos e densos (10+ linhas)')
  }
  if (profile.citation_style === 'footnote') {
    styleParts.push('citações em notas de rodapé quando possível')
  } else if (profile.citation_style === 'abnt') {
    styleParts.push('citações no formato ABNT')
  }
  if (styleParts.length > 0) {
    parts.push(`<estilo_redacao>Preferências de redação: ${styleParts.join('; ')}.</estilo_redacao>`)
  }

  if (profile.preferred_expressions?.length) {
    parts.push(`<expressoes_preferidas>Use quando adequado: ${profile.preferred_expressions.join(', ')}.</expressoes_preferidas>`)
  }
  if (profile.avoided_expressions?.length) {
    parts.push(`<expressoes_evitar>NUNCA use: ${profile.avoided_expressions.join(', ')}.</expressoes_evitar>`)
  }

  if (profile.argument_depth === 'profundo' || profile.detail_level === 'exaustivo') {
    parts.push(
      '<profundidade>',
      'O usuário solicita análise EXAUSTIVA e PROFUNDA.',
      'Para CADA argumento: transcreva o artigo de lei citado entre aspas,',
      'cite súmulas com número e enunciado completo,',
      'mencione autores doutrinários com nome, obra e posição,',
      'e aplique ao caso concreto com subsunção detalhada.',
      'Mínimo de 5 referências legislativas, 3 jurisprudenciais e 2 doutrinárias por tese.',
      '</profundidade>',
    )
  } else if (profile.argument_depth === 'moderado' || profile.detail_level === 'detalhado') {
    parts.push(
      '<profundidade>',
      'Análise DETALHADA com fundamentação sólida.',
      'Transcreva artigos de lei relevantes, cite jurisprudência consolidada',
      'e mencione posições doutrinárias quando pertinente.',
      '</profundidade>',
    )
  }

  if (profile.include_opposing_view) {
    parts.push('<visao_contraria>Inclua análise da visão contrária e contra-argumentação em cada tese.</visao_contraria>')
  }

  return parts.length > 0 ? '\n' + parts.join('\n') : ''
}

export function buildPesquisadorUserPrompt(
  request: string,
  triagem: string,
  knowledgeBase: string,
  acervoBase?: string,
): string {
  const parts = [
    `<triagem>${triagem}</triagem>`,
    `<solicitacao>${request}</solicitacao>`,
  ]

  if (acervoBase) {
    parts.push(
      '<documento_base_acervo>',
      'O texto abaixo é um documento base compilado a partir de documentos anteriores do acervo do usuário.',
      'Ele contém fundamentação jurídica já consolidada pelo usuário em trabalhos anteriores.',
      'Use-o como REFERÊNCIA PRINCIPAL. Foque sua pesquisa nas seções marcadas com [COMPLEMENTAR]',
      'e em enriquecer a fundamentação existente. NÃO descarte o conteúdo do acervo — ele é a base.',
      acervoBase,
      '</documento_base_acervo>',
    )
  }

  if (knowledgeBase) {
    parts.push(
      '<base_conhecimento>',
      'Use as teses e documentos de referência abaixo como material COMPLEMENTAR à sua pesquisa.',
      'Incorpore as teses relevantes, mas SEMPRE verifique e enriqueça com suas próprias referências.',
      knowledgeBase,
      '</base_conhecimento>',
    )
  }

  parts.push(
    acervoBase
      ? 'Realize pesquisa jurídica COMPLEMENTAR ao documento base do acervo. Foque nas lacunas marcadas com [COMPLEMENTAR]. TRANSCREVA artigos de lei entre aspas. Inclua legislação, jurisprudência e doutrina que COMPLEMENTEM a fundamentação já existente.'
      : 'Realize pesquisa jurídica EXAUSTIVA sobre o tema. TRANSCREVA artigos de lei entre aspas. Inclua legislação com texto dos dispositivos, jurisprudência com enunciados de súmulas, doutrina com autor e obra, e princípios constitucionais.',
  )

  return parts.join('\n')
}
