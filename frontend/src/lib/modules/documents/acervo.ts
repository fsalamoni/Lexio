import { DOC_TYPE_NAMES, buildProfileBlock, type UserProfileForGeneration } from './prompts'
import { extractJsonPayload } from './json'

export const MAX_ACERVO_SELECTED_DOCS = 3
const MAX_PREFILTERED_DOCS = 30

export interface AcervoSearchDoc {
  id: string
  filename: string
  created_at: string
  ementa?: string
  ementa_keywords?: string[]
  natureza?: string
  area_direito?: string[]
  assuntos?: string[]
  tipo_documento?: string
  contexto?: string[]
}

export interface AcervoBuscadorPromptDoc {
  id: string
  filename: string
  summary: string
  created_at: string
  natureza?: string
  area_direito?: string[]
  assuntos?: string[]
  tipo_documento?: string
  contexto?: string[]
}

export interface AcervoReferenceDoc {
  filename: string
  text_content: string
  created_at: string
}

export function selectAcervoDocsForBuscador(
  docs: AcervoSearchDoc[],
  searchKeywords: string[],
  keywordPrefilterEnabled: boolean,
): AcervoSearchDoc[] {
  if (!keywordPrefilterEnabled) {
    return docs.slice(0, MAX_PREFILTERED_DOCS)
  }

  return preFilterAcervoDocs(docs, searchKeywords)
}

export function buildAcervoBuscadorSystem(): string {
  return [
    'Você é um ESPECIALISTA EM RECUPERAÇÃO DE DOCUMENTOS JURÍDICOS.',
    'Sua função é analisar ementas e tags de classificação de documentos do acervo e selecionar os mais relevantes.',
    '',
    '<regras>',
    '1. Analise o NOME DO ARQUIVO — contém o tema principal (ex: "NEPOTISMO", "IMPROBIDADE").',
    '2. Analise a EMENTA — contém tipo, assunto, síntese, áreas jurídicas e tópicos.',
    '3. Analise as TAGS DE CLASSIFICAÇÃO quando disponíveis:',
    '   - NATUREZA: consultivo, executório, transacional, negocial, doutrinário, decisório',
    '   - ÁREA DO DIREITO: disciplinas jurídicas do conteúdo',
    '   - ASSUNTOS: matérias da fundamentação',
    '   - TIPO: classificação do tipo documental (parecer, petição, sentença, etc.)',
    '   - CONTEXTO: circunstâncias fáticas do caso',
    '4. Selecione APENAS documentos cujas tags/ementa se enquadram no contexto da solicitação.',
    '5. Priorize: (a) MESMA NATUREZA e ÁREA, (b) MESMO ASSUNTO e TIPO, (c) mais ESPECÍFICOS, (d) mais RECENTES.',
    '6. Máximo de 3 documentos. Se houver mais candidatos relevantes, filtre pelos mais específicos e recentes.',
    '7. Score >= 0.7 para documentos sobre a mesma área E mesma situação.',
    '8. Se nenhum for relevante, retorne lista vazia.',
    '</regras>',
    '',
    '<formato_resposta>',
    'Responda APENAS com JSON puro (sem markdown, sem ```), no formato:',
    '{"selected": [{"id": "doc_id_exato", "score": 0.95, "reason": "Motivo"}]}',
    'Onde score é de 0.0 a 1.0 (1.0 = tema idêntico).',
    'O campo "id" deve conter o ID EXATO do documento.',
    'Se nenhum for relevante: {"selected": []}',
    '</formato_resposta>',
  ].join('\n')
}

export function buildAcervoBuscadorUser(
  triagem: string,
  request: string,
  docType: string,
  acervoDocs: AcervoBuscadorPromptDoc[],
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const docsListStr = acervoDocs.map((doc, index) => {
    const parts = [
      `[${index + 1}] ID: ${doc.id}`,
      `    Arquivo: ${doc.filename}`,
      `    Data: ${doc.created_at}`,
      `    Ementa: ${doc.summary}`,
    ]
    if (doc.natureza) parts.push(`    Natureza: ${doc.natureza}`)
    if (doc.area_direito?.length) parts.push(`    Áreas: ${doc.area_direito.join(', ')}`)
    if (doc.assuntos?.length) parts.push(`    Assuntos: ${doc.assuntos.join(', ')}`)
    if (doc.tipo_documento) parts.push(`    Tipo: ${doc.tipo_documento}`)
    if (doc.contexto?.length) parts.push(`    Contexto: ${doc.contexto.join('; ')}`)
    return parts.join('\n')
  }).join('\n\n')

  return [
    `<tipo_documento>${typeName}</tipo_documento>`,
    `<solicitacao>${request}</solicitacao>`,
    `<triagem>${triagem}</triagem>`,
    '',
    '<acervo_disponivel>',
    `Total de documentos: ${acervoDocs.length}`,
    '',
    docsListStr,
    '</acervo_disponivel>',
    '',
    'Selecione SOMENTE documentos cuja ementa se enquadra no contexto desta solicitação.',
    'Máximo de 3 documentos. Se houver muitos candidatos, escolha os mais específicos e mais recentes.',
  ].join('\n')
}

export function buildAcervoCompiladorSystem(
  docType: string,
  tema: string,
  profile?: UserProfileForGeneration | null,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const profileBlock = buildProfileBlock(profile)
  return [
    'Você é um COMPILADOR JURÍDICO ESPECIALISTA, responsável por criar um documento base a partir de documentos anteriores do acervo do usuário.',
    profileBlock,
    '',
    '<objetivo>',
    `Criar um ${typeName} BASE sobre o tema "${tema}" a partir dos documentos de referência fornecidos.`,
    'O usuário reutiliza fundamentações de documentos anteriores — sua tarefa é compilar e unificar.',
    '</objetivo>',
    '',
    '<regras_compilacao>',
    '1. PRESERVAR ipsis litteris todas as citações jurisprudenciais (ementas, acórdãos, súmulas) — NÃO altere nem resuma.',
    '2. PRESERVAR ipsis litteris todas as citações doutrinárias (trechos entre aspas com autor e obra) — NÃO altere.',
    '3. PRESERVAR ipsis litteris todas as transcrições de dispositivos legais (artigos de lei).',
    '4. Quando textos IDÊNTICOS aparecerem em mais de um documento, mantenha APENAS UMA cópia.',
    '5. Quando textos SEMELHANTES (mas não idênticos) existirem, priorize:',
    '   a) O texto mais ESPECÍFICO (com mais detalhes e fundamentação)',
    '   b) O texto mais RECENTE (do documento com data mais recente)',
    '6. ADAPTE cabeçalhos, nomes de partes, localidades e datas ao NOVO CASO descrito na solicitação.',
    '7. MANTENHA a estrutura lógica do tipo de documento (ementa, relatório, fundamentação, conclusão).',
    '8. Marque com [ADAPTAR] trechos que contenham dados do caso anterior e precisam ser ajustados ao novo caso.',
    '9. Marque com [COMPLEMENTAR] seções da nova solicitação que NÃO foram cobertas pelos documentos de referência.',
    '10. NÃO invente conteúdo novo — apenas compile o que já existe nos documentos de referência.',
    '</regras_compilacao>',
    '',
    '<formato>',
    'Texto PURO. Sem markdown. Títulos em MAIÚSCULAS.',
    'Parágrafos separados por duas quebras de linha.',
    '</formato>',
  ].join('\n')
}

export function buildAcervoCompiladorUser(
  request: string,
  triagem: string,
  docType: string,
  selectedDocs: AcervoReferenceDoc[],
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const docsStr = selectedDocs.map((doc, index) =>
    `<documento_referencia_${index + 1}>\nArquivo: ${doc.filename}\nData: ${doc.created_at}\n\n${doc.text_content}\n</documento_referencia_${index + 1}>`,
  ).join('\n\n')

  return [
    `<tipo_documento>${typeName}</tipo_documento>`,
    `<solicitacao>${request}</solicitacao>`,
    `<triagem>${triagem}</triagem>`,
    '',
    '<documentos_de_referencia>',
    docsStr,
    '</documentos_de_referencia>',
    '',
    `Compile os documentos de referência acima em um ${typeName} BASE unificado.`,
    'Siga TODAS as regras de compilação. Preserve citações literalmente.',
    'Remova duplicatas. Priorize textos mais específicos e recentes.',
    'Adapte os dados factuais ao novo caso descrito na solicitação.',
    'Marque com [ADAPTAR] e [COMPLEMENTAR] onde necessário.',
  ].join('\n')
}

export function buildAcervoRevisorSystem(
  docType: string,
  tema: string,
  profile?: UserProfileForGeneration | null,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const profileBlock = buildProfileBlock(profile)
  return [
    `Você é REVISOR JURÍDICO SÊNIOR, especialista em ${typeName}.`,
    profileBlock,
    '',
    '<objetivo>',
    `Revisar o documento base compilado sobre "${tema}" e entregá-lo pronto para as etapas seguintes do pipeline de geração.`,
    '</objetivo>',
    '',
    '<regras_revisao>',
    '1. Verifique se NÃO restaram dados do caso anterior (nomes, localidades, datas erradas) — corrija para os dados do NOVO caso.',
    '2. Substitua todas as marcações [ADAPTAR] por dados reais do novo caso (extraídos da solicitação e triagem).',
    '3. MANTENHA as marcações [COMPLEMENTAR] — elas serão preenchidas pelos agentes seguintes.',
    '4. Verifique a COERÊNCIA do fluxo lógico: introdução → fundamentação → conclusão.',
    '5. Verifique se as TRANSIÇÕES entre parágrafos fazem sentido após a compilação.',
    '6. NÃO altere citações jurisprudenciais, doutrinárias ou transcrições de lei — elas devem permanecer LITERAIS.',
    '7. NÃO invente conteúdo novo — apenas revise e ajuste o que já existe.',
    '8. NÃO remova conteúdo válido — apenas reorganize se necessário para melhor fluxo.',
    '9. Se o texto está bom, retorne-o como está, sem alterações desnecessárias.',
    '</regras_revisao>',
    '',
    '<formato>',
    'Texto PURO. Sem markdown. Títulos em MAIÚSCULAS.',
    'Parágrafos separados por duas quebras de linha.',
    '</formato>',
  ].join('\n')
}

export function buildAcervoRevisorUser(
  request: string,
  triagem: string,
  docType: string,
  compiledBase: string,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    `<tipo_documento>${typeName}</tipo_documento>`,
    `<solicitacao>${request}</solicitacao>`,
    `<triagem>${triagem}</triagem>`,
    '',
    '<documento_base_compilado>',
    compiledBase,
    '</documento_base_compilado>',
    '',
    `Revise este ${typeName} base compilado.`,
    'Corrija dados do caso anterior que não foram adaptados.',
    'Verifique coerência e fluxo lógico.',
    'Mantenha todas as marcações [COMPLEMENTAR] para os agentes seguintes.',
    'Preserve todas as citações literalmente.',
  ].join('\n')
}

export function extractSearchKeywords(triageContent: string, request: string): string[] {
  const keywords: string[] = []

  try {
    const triage = JSON.parse(extractJsonPayload(triageContent)) as Record<string, unknown>
    if (typeof triage.tema === 'string') {
      keywords.push(...triage.tema.toLowerCase().split(/\s+/).filter(word => word.length > 3))
    }
    if (Array.isArray(triage.subtemas)) {
      for (const sub of triage.subtemas.filter((value): value is string => typeof value === 'string')) {
        keywords.push(...sub.toLowerCase().split(/\s+/).filter(word => word.length > 3))
      }
    }
    if (Array.isArray(triage.palavras_chave)) {
      for (const keyword of triage.palavras_chave.filter((value): value is string => typeof value === 'string')) {
        keywords.push(keyword.toLowerCase().trim())
      }
    }
  } catch {
    const plainText = triageContent
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[{}[\]",:]/g, ' ')
    keywords.push(...plainText.toLowerCase().split(/\s+/).filter(word => word.length > 4 && !/^[a-z_]+:$/.test(word)))
  }

  const requestWords = request.toLowerCase()
    .replace(/[.,;:!?()"]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 4)
    .filter(word => !['sobre', 'entre', 'sendo', 'quando', 'como', 'para', 'com', 'qual', 'quais', 'possível', 'prática', 'envolvendo', 'municipal'].includes(word))
  keywords.push(...requestWords)

  return [...new Set(keywords)]
}

function preFilterAcervoDocs(
  docs: AcervoSearchDoc[],
  searchKeywords: string[],
): AcervoSearchDoc[] {
  if (searchKeywords.length === 0) return docs.slice(0, MAX_PREFILTERED_DOCS)

  const normalizedSearch = searchKeywords.map(keyword => keyword.toLowerCase().trim())

  const scored = docs.map(doc => {
    let score = 0
    const filenameLower = doc.filename.toLowerCase()
    const ementaLower = (doc.ementa || '').toLowerCase()
    const areasLower = (doc.area_direito || []).map(area => area.toLowerCase())
    const assuntosLower = (doc.assuntos || []).map(assunto => assunto.toLowerCase())
    const tipoLower = (doc.tipo_documento || '').toLowerCase()
    const contextoLower = (doc.contexto || []).map(contexto => contexto.toLowerCase())

    for (const keyword of normalizedSearch) {
      if (filenameLower.includes(keyword)) score += 3
      if (doc.ementa_keywords?.some(ementaKeyword => ementaKeyword.includes(keyword) || keyword.includes(ementaKeyword))) score += 2
      if (ementaLower.includes(keyword)) score += 1
      if (areasLower.some(area => area.includes(keyword) || keyword.includes(area))) score += 2
      if (assuntosLower.some(assunto => assunto.includes(keyword) || keyword.includes(assunto))) score += 2
      if (tipoLower && (tipoLower.includes(keyword) || keyword.includes(tipoLower))) score += 2
      if (contextoLower.some(contexto => contexto.includes(keyword) || keyword.includes(contexto))) score += 1
    }

    return { ...doc, score }
  })

  return scored
    .filter(doc => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PREFILTERED_DOCS)
}
