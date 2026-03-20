/**
 * Client-side document generation service — Multi-agent pipeline.
 *
 * When IS_FIREBASE = true (no backend), this service handles the full
 * document generation pipeline directly in the browser via OpenRouter:
 *
 * Pipeline stages (mirrors backend orchestrator):
 * 1.  Triagem            — Extract structured info (Haiku, fast)
 * 2a. Acervo Buscador    — Search user archive for relevant docs (Haiku, conditional)
 * 2b. Acervo Compilador  — Compile archive docs into base document (Sonnet, conditional)
 * 2c. Acervo Revisor     — Review compiled base for coherence (Sonnet, conditional)
 * 3.  Pesquisador        — Legal research synthesis (Sonnet)
 * 4.  Jurista            — Initial thesis development (Sonnet)
 * 5.  Advogado Diabo     — Counter-arguments critique (Sonnet)
 * 6.  Jurista v2         — Refined theses after critique (Sonnet)
 * 7.  Fact-checker        — Verify legal citations (Haiku, strict)
 * 8.  Moderador          — Outline/plan the final document (Sonnet)
 * 9.  Redator            — Write the full document (Sonnet, 12k tokens)
 *
 * The API key is read from Firestore /settings/platform (admin-only).
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { firestore } from './firebase'
import { callLLM } from './llm-client'
import { loadAgentModels, loadContextDetailModels, type AgentModelMap } from './model-config'
import { listTheses, getAcervoContext, getAllAcervoDocumentsForSearch, updateAcervoEmenta, loadAdminDocumentTypes, type ThesisData, type ContextDetailData, type ContextDetailQuestion } from './firestore-service'
import { buildUsageSummary, createUsageExecutionRecord, type UsageExecutionRecord } from './cost-analytics'
import { evaluateQuality } from './quality-evaluator'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerationProgress {
  phase: string
  message: string
  percent: number
}

/** Subset of user profile relevant to document generation. */
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

type ProgressCallback = (p: GenerationProgress) => void

// ── Knowledge base limits ─────────────────────────────────────────────────────
// These cap how much thesis / acervo text is injected into the Pesquisador
// prompt to balance context richness vs. model token budget.

/** Max theses fetched per legal area when areas are specified. */
const MAX_THESES_PER_AREA = 10
/** Max theses fetched when no specific area is selected. */
const MAX_THESES_FALLBACK = 20
/** Max theses actually injected into the prompt after dedup. */
const MAX_THESES_INJECTED = 15
/** Max total characters of acervo reference excerpts. */
const MAX_ACERVO_CONTEXT_CHARS = 6000
/** Max acervo documents the buscador can select. */
const MAX_ACERVO_SELECTED_DOCS = 3
/** Max total characters sent to the compilador agent. */
const MAX_ACERVO_COMPILADOR_CHARS = 120000
/** Max chars of document text used to generate an ementa. */
const MAX_EMENTA_SOURCE_CHARS = 8000
/** Max pre-filtered documents sent to the buscador LLM. */
const MAX_PREFILTERED_DOCS = 30

// ── API key retrieval ─────────────────────────────────────────────────────────

async function getOpenRouterKey(): Promise<string> {
  // Try environment variable first (works without Firestore admin setup)
  const envKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
  if (envKey && envKey.startsWith('sk-')) return envKey

  // Fall back to Firestore /settings/platform
  if (!firestore) throw new Error('Firestore não configurado')
  const ref = doc(firestore, 'settings', 'platform')
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error(
      'Configurações não encontradas. Configure a API key do OpenRouter no Painel Administrativo ou defina VITE_OPENROUTER_API_KEY.',
    )
  }
  const data = snap.data()
  // API keys stored under api_keys nested object by settings-store
  const apiKeys = (data?.api_keys ?? {}) as Record<string, string>
  const key = apiKeys.openrouter_api_key ?? (data?.openrouter_api_key as string | undefined)
  if (!key || !key.startsWith('sk-')) {
    throw new Error(
      'API key do OpenRouter não configurada. Acesse o Painel Administrativo → Chaves de API.',
    )
  }
  return key
}

// ── Document type metadata ────────────────────────────────────────────────────

const DOC_TYPE_NAMES: Record<string, string> = {
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

const AREA_NAMES: Record<string, string> = {
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

// ── Profile-aware prompt helpers ──────────────────────────────────────────────

/**
 * Build a contextual block that injects user profile preferences into prompts,
 * so agents adapt style, depth and citations to the user's professional role.
 */
function buildProfileBlock(profile?: UserProfileForGeneration | null): string {
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

  // Depth directives
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

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildTriageSystem(docType: string): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  return [
    'Você é o TRIADOR JURÍDICO especialista em análise de demandas.',
    '',
    `Sua função é analisar a solicitação para elaboração de ${typeName}`,
    'e extrair as informações essenciais: tema principal, subtemas,',
    'palavras-chave para pesquisa, tipo de ação e fundamento legal.',
    '',
    'Responda APENAS JSON:',
    '{',
    '  "tema": "resumo em 1 frase do tema principal",',
    '  "subtemas": ["subtema1", "subtema2"],',
    '  "palavras_chave": ["palavra1", "palavra2"],',
    '  "area_direito": "área principal do direito",',
    '  "fundamento_legal": ["lei/artigo1", "lei/artigo2"],',
    '  "observacoes": "notas relevantes"',
    '}',
  ].join('\n')
}

function buildTriageUser(
  request: string,
  areas: string[],
  context?: Record<string, unknown> | null,
  contextDetail?: ContextDetailData | null,
): string {
  const areaNames = areas.map(a => AREA_NAMES[a] ?? a).join(', ')
  const parts = [`<solicitacao>${request}</solicitacao>`]
  if (areaNames) parts.push(`<areas>${areaNames}</areas>`)
  if (context && Object.keys(context).length > 0) {
    parts.push(`<contexto>${JSON.stringify(context)}</contexto>`)
  }
  if (contextDetail && contextDetail.questions.length > 0) {
    const answeredQA = contextDetail.questions
      .filter(q => q.answer.trim())
      .map(q => `P: ${q.question}\nR: ${q.answer}`)
      .join('\n\n')
    if (answeredQA) {
      parts.push(
        '<detalhamento_contexto>',
        `<analise_preliminar>${contextDetail.analysis_summary}</analise_preliminar>`,
        `<perguntas_respostas>\n${answeredQA}\n</perguntas_respostas>`,
        '</detalhamento_contexto>',
      )
    }
  }
  parts.push('Analise a solicitação e extraia as informações. Responda APENAS em JSON.')
  return parts.join('\n')
}

function buildRedatorSystem(
  docType: string,
  tema: string,
  profile?: UserProfileForGeneration | null,
  customStructure?: string,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const profileBlock = buildProfileBlock(profile)
  return [
    `Você é REDATOR JURÍDICO SÊNIOR com vasta experiência, especialista em ${typeName}.`,
    profileBlock,
    '',
    '<regra_absoluta>',
    `CADA parágrafo deve tratar de "${tema}". Conteúdo genérico = REJEITADO.`,
    `O documento deve ser PERSUASIVO — escrito para CONVENCER o julgador.`,
    'A fundamentação deve ser DENSA e PROFUNDA, com citações precisas e detalhadas.',
    'O nível de qualidade deve ser equivalente ao de peça produzida por escritório de excelência.',
    '</regra_absoluta>',
    '',
    '<anti_alucinacao>',
    'NUNCA invente leis, artigos, jurisprudência ou números de processo.',
    'Lei 8.666/93 REVOGADA — use 14.133/21.',
    'CPC/1973 REVOGADO — use CPC/2015.',
    'CC/1916 REVOGADO — use CC/2002.',
    'Use APENAS leis notórias que você sabe que existem.',
    'Para jurisprudência: use "conforme jurisprudência consolidada do STF/STJ"',
    '— NUNCA invente número de REsp, RE, MS ou relator.',
    '</anti_alucinacao>',
    '',
    '<estrutura>',
    `Redija ${typeName} COMPLETO com:`,
    '- Qualificação das partes (use dados fornecidos ou ___ como placeholder)',
    '- Dos Fatos (narração cronológica, mínimo 4 parágrafos)',
    '- Do Direito (fundamentação legal robusta, mínimo 3 subseções)',
    '- Dos Pedidos (claros, determinados, específicos)',
    '- Valor da causa (se aplicável)',
    'CPC/1973 REVOGADO — use CPC/2015 (Lei 13.105/15).',
    'CC/1916 REVOGADO — use CC/2002 (Lei 10.406/02).',
    'CLT: considere a reforma trabalhista (Lei 13.467/17).',
    'Lei de Improbidade (Lei 8.429/92): considere alterações pela Lei 14.230/21.',
    'Use APENAS leis notórias que você sabe que existem.',
    'Para jurisprudência: cite súmulas por número e tribunal (ex: "Súmula 331 do TST"),',
    'teses fixadas (ex: "Tema 1.046 de repercussão geral do STF"),',
    'ou posição genérica (ex: "conforme jurisprudência consolidada do STJ").',
    'NUNCA invente número de REsp, RE, MS, AgInt ou relator.',
    '</anti_alucinacao>',
    '',
    '<citacoes_obrigatorias>',
    'O documento DEVE conter, NO MÍNIMO:',
    '',
    'LEGISLAÇÃO (mínimo 8 referências):',
    '- Artigos da CF/88 com inciso, alínea e TEXTO TRANSCRITO entre aspas',
    '  Exemplo: "Nos termos do art. 5º, XXXV, da CF/88: \'a lei não excluirá',
    '  da apreciação do Poder Judiciário lesão ou ameaça a direito\'."',
    '- Artigos de lei com número, ano, dispositivo e TEXTO TRANSCRITO',
    '  Exemplo: "Dispõe o art. 186 do CC/2002: \'Aquele que, por ação ou omissão',
    '  voluntária, negligência ou imprudência, violar direito e causar dano a',
    '  outrem, ainda que exclusivamente moral, comete ato ilícito.\'',
    '- Legislação especial pertinente com dispositivos transcritos',
    '',
    'JURISPRUDÊNCIA (mínimo 5 referências):',
    '- Súmulas com número e ENUNCIADO COMPLETO transcrito',
    '  Exemplo: "Nesse sentido, a Súmula 479 do STJ: \'As instituições financeiras',
    '  respondem objetivamente pelos danos gerados por fortuito interno relativo',
    '  a fraudes e delitos praticados por terceiros no âmbito de operações',
    '  bancárias.\'"',
    '- Temas de repercussão geral/repetitivos com NÚMERO e TESE FIRMADA',
    '  Exemplo: "O STF, no Tema 725, fixou a seguinte tese: \'É constitucional...\'"',
    '- Entendimentos consolidados dos tribunais superiores',
    '',
    'DOUTRINA (mínimo 3 referências):',
    '- Autor com NOME COMPLETO, OBRA e, preferencialmente, EDITORA',
    '- POSIÇÃO do autor sobre o tema específico',
    '  Exemplo: "Conforme leciona Hely Lopes Meirelles (Direito Administrativo',
    '  Brasileiro, Malheiros): \'o ato administrativo...\'."',
    '',
    'PRINCÍPIOS (mínimo 2):',
    '- Princípio com fundamento constitucional (artigo + texto)',
    '- Aplicação concreta ao caso',
    '',
    'Integre TODAS as citações NATURALMENTE no texto, como em peça jurídica real.',
    'TRANSCREVA os dispositivos legais e enunciados de súmula entre aspas.',
    '</citacoes_obrigatorias>',
    '',
    '<estrutura>',
    ...(customStructure
      ? [
          `Redija ${typeName} COMPLETO seguindo OBRIGATORIAMENTE a estrutura abaixo definida pelo administrador:`,
          '',
          customStructure,
        ]
      : [
          `Redija ${typeName} COMPLETO com:`,
          '- Qualificação das partes (use dados fornecidos ou ___ como placeholder)',
          '- Dos Fatos (narração cronológica, mínimo 4 parágrafos densos):',
          '  * Contextualize com referências legais quando pertinente',
          '  * Destaque os fatos juridicamente relevantes',
          '- Do Direito (fundamentação legal robusta, mínimo 4 subseções DENSAS):',
          '  * DA FUNDAMENTAÇÃO CONSTITUCIONAL:',
          '    - Princípios e direitos fundamentais aplicáveis',
          '    - TRANSCREVA artigos da CF/88',
          '  * DA FUNDAMENTAÇÃO LEGAL:',
          '    - Artigos da legislação infraconstitucional TRANSCRITOS',
          '    - Interpretação sistemática e teleológica',
          '    - Subsunção dos fatos à norma',
          '  * DA FUNDAMENTAÇÃO JURISPRUDENCIAL:',
          '    - Súmulas com ENUNCIADO COMPLETO transcrito',
          '    - Temas de repercussão geral/repetitivos com TESE FIRMADA',
          '    - Entendimentos consolidados dos tribunais',
          '  * DA FUNDAMENTAÇÃO DOUTRINÁRIA:',
          '    - Autores de referência com OBRA e POSIÇÃO',
          '    - Trechos doutrinários relevantes entre aspas',
          '- Dos Pedidos (claros, determinados, específicos, com base legal para cada pedido)',
          '- Valor da causa (se aplicável)',
        ]),
    '</estrutura>',
    '',
    '<conectivos>',
    'USE conectivos VARIADOS. Cada conectivo NO MÁXIMO 2x:',
    'Nesse sentido | Outrossim | Com efeito | Nessa esteira | Dessa sorte |',
    'Ademais | Importa destacar | Cumpre observar | De outro lado | Por sua vez |',
    'Destarte | Vale dizer | Convém ressaltar | Sob essa ótica | Ante o exposto',
    'Destarte | Vale dizer | Convém ressaltar | Sob essa ótica | Ante o exposto |',
    'Nessa toada | É cediço que | Data maxima venia | Salvo melhor juízo |',
    'De igual modo | Por conseguinte | Sendo assim | In casu',
    '</conectivos>',
    '',
    '<formato>',
    'Texto PURO. Sem markdown. Títulos em MAIÚSCULAS.',
    'Parágrafos separados por duas quebras de linha.',
    'NÃO inclua endereçamento, fecho ("Nestes termos, pede deferimento"),',
    'data ou assinatura — esses elementos são adicionados externamente.',
    '</formato>',
  ].join('\n')
}

function buildRedatorUser(
  docType: string,
  request: string,
  triagem: string,
  areas: string[],
  context?: Record<string, unknown> | null,
  pesquisa?: string,
  tesesVerificadas?: string,
  plano?: string,
  contextDetail?: ContextDetailData | null,
  acervoBase?: string,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const areaNames = areas.map(a => AREA_NAMES[a] ?? a).join(', ')
  const parts = [
    `<tipo>${typeName}</tipo>`,
    `<solicitacao>${request}</solicitacao>`,
    `<triagem>${triagem}</triagem>`,
  ]
  if (areaNames) parts.push(`<areas>${areaNames}</areas>`)
  if (context && Object.keys(context).length > 0) {
    parts.push(`<contexto>${JSON.stringify(context)}</contexto>`)
  }
  if (contextDetail && contextDetail.questions.length > 0) {
    const answeredQA = contextDetail.questions
      .filter(q => q.answer.trim())
      .map(q => `P: ${q.question}\nR: ${q.answer}`)
      .join('\n\n')
    if (answeredQA) {
      parts.push(
        '<detalhamento_contexto>',
        'O usuário forneceu as seguintes informações adicionais que DEVEM ser consideradas na redação:',
        `<analise_preliminar>${contextDetail.analysis_summary}</analise_preliminar>`,
        `<perguntas_respostas>\n${answeredQA}\n</perguntas_respostas>`,
        '</detalhamento_contexto>',
      )
    }
  }
  if (pesquisa) parts.push(`<pesquisa>${pesquisa}</pesquisa>`)
  if (tesesVerificadas) parts.push(`<teses_verificadas>${tesesVerificadas}</teses_verificadas>`)
  if (plano) parts.push(`<plano>${plano}</plano>`)
  if (acervoBase) {
    parts.push(
      '<documento_base_acervo>',
      'IMPORTANTE: O texto abaixo é um documento base compilado a partir do acervo do usuário.',
      'Este texto contém a fundamentação jurídica consolidada pelo usuário em trabalhos anteriores.',
      'Você DEVE usar este texto como REFERÊNCIA PRINCIPAL para a redação.',
      'PRESERVE as citações, fundamentações e argumentações existentes.',
      'Adapte ao novo caso conforme necessário, mas NÃO descarte o conteúdo base.',
      'Preencha as seções marcadas com [COMPLEMENTAR] usando a pesquisa e teses fornecidas.',
      acervoBase,
      '</documento_base_acervo>',
    )
  }
  parts.push(
    `Redija ${typeName} COMPLETO sobre o tema indicado na triagem.`,
    acervoBase
      ? 'Use o documento base do acervo como REFERÊNCIA PRINCIPAL. Preserve sua fundamentação e estilo. Complemente apenas onde necessário ([COMPLEMENTAR]).'
      : 'Siga a estrutura exigida. Texto puro, sem markdown.',
    'OBRIGATÓRIO: TRANSCREVA entre aspas todos os artigos de lei citados.',
    'OBRIGATÓRIO: TRANSCREVA entre aspas todos os enunciados de súmulas citadas.',
    'OBRIGATÓRIO: Para cada referência doutrinária, inclua autor, obra e posição.',
    'A fundamentação deve ser DENSA, PROFUNDA e com citações PRECISAS.',
    'Separe cada parágrafo com linha em branco.',
    'Texto puro, sem markdown.',
  )
  return parts.join('\n')
}

// ── Acervo-based pre-generation agents ────────────────────────────────────────

/**
 * Buscador de Acervo — Ranks acervo documents by relevance to the new request.
 * Uses triage output (tema, keywords, subtopics) to find the most relevant
 * prior documents. Returns a JSON array of selected document IDs.
 */
function buildAcervoBuscadorSystem(): string {
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
    '   - CONTEXTO: circunstâncias fáticas do caso',
    '4. Selecione APENAS documentos cujas tags/ementa se enquadram no contexto da solicitação.',
    '5. Priorize: (a) MESMA NATUREZA e ÁREA, (b) MESMO ASSUNTO, (c) mais ESPECÍFICOS, (d) mais RECENTES.',
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

function buildAcervoBuscadorUser(
  triagem: string,
  request: string,
  docType: string,
  acervoDocs: Array<{ id: string; filename: string; summary: string; created_at: string; natureza?: string; area_direito?: string[]; assuntos?: string[]; contexto?: string[] }>,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const docsListStr = acervoDocs.map((d, i) => {
    const parts = [
      `[${i + 1}] ID: ${d.id}`,
      `    Arquivo: ${d.filename}`,
      `    Data: ${d.created_at}`,
      `    Ementa: ${d.summary}`,
    ]
    if (d.natureza) parts.push(`    Natureza: ${d.natureza}`)
    if (d.area_direito?.length) parts.push(`    Áreas: ${d.area_direito.join(', ')}`)
    if (d.assuntos?.length) parts.push(`    Assuntos: ${d.assuntos.join(', ')}`)
    if (d.contexto?.length) parts.push(`    Contexto: ${d.contexto.join('; ')}`)
    return parts.join('\n')
  }).join('\n\n')

  return [
    `<tipo_documento>${typeName}</tipo_documento>`,
    `<solicitacao>${request}</solicitacao>`,
    `<triagem>${triagem}</triagem>`,
    '',
    `<acervo_disponivel>`,
    `Total de documentos: ${acervoDocs.length}`,
    '',
    docsListStr,
    `</acervo_disponivel>`,
    '',
    'Selecione SOMENTE documentos cuja ementa se enquadra no contexto desta solicitação.',
    'Máximo de 3 documentos. Se houver muitos candidatos, escolha os mais específicos e mais recentes.',
  ].join('\n')
}

/**
 * Compilador de Base — Merges selected acervo documents into a unified base document.
 */
function buildAcervoCompiladorSystem(
  docType: string,
  tema: string,
  profile?: UserProfileForGeneration | null,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const profileBlock = buildProfileBlock(profile)
  return [
    `Você é um COMPILADOR JURÍDICO ESPECIALISTA, responsável por criar um documento base a partir de documentos anteriores do acervo do usuário.`,
    profileBlock,
    '',
    `<objetivo>`,
    `Criar um ${typeName} BASE sobre o tema "${tema}" a partir dos documentos de referência fornecidos.`,
    `O usuário reutiliza fundamentações de documentos anteriores — sua tarefa é compilar e unificar.`,
    `</objetivo>`,
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

function buildAcervoCompiladorUser(
  request: string,
  triagem: string,
  docType: string,
  selectedDocs: Array<{ filename: string; text_content: string; created_at: string }>,
): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const docsStr = selectedDocs.map((d, i) =>
    `<documento_referencia_${i + 1}>\nArquivo: ${d.filename}\nData: ${d.created_at}\n\n${d.text_content}\n</documento_referencia_${i + 1}>`,
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

/**
 * Revisor de Base — Reviews the compiled base document for coherence and completeness.
 */
function buildAcervoRevisorSystem(
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
    `<objetivo>`,
    `Revisar o documento base compilado sobre "${tema}" e entregá-lo pronto para as etapas seguintes do pipeline de geração.`,
    `</objetivo>`,
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

function buildAcervoRevisorUser(
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

// ── Ementa generation ─────────────────────────────────────────────────────────

/**
 * Generate a structured ementa for an acervo document.
 * Called once per document (at upload or in batch).
 */
export async function generateAcervoEmenta(
  apiKey: string,
  filename: string,
  textContent: string,
  model = 'anthropic/claude-3.5-haiku',
): Promise<{ ementa: string; keywords: string[] }> {
  const systemPrompt = [
    'Você é um indexador de documentos jurídicos.',
    'Sua tarefa é gerar uma ementa estruturada para indexação e busca.',
    '',
    '<formato>',
    'Responda APENAS com JSON puro (sem markdown), no formato:',
    '{',
    '  "tipo": "Parecer|Petição|ACP|Sentença|Recurso|Outro",',
    '  "assunto": "Tema principal em 1-2 palavras (ex: Nepotismo, Licitação, Improbidade)",',
    '  "sintese": "Síntese do caso em 1-2 frases curtas",',
    '  "areas": ["Direito Administrativo", "Direito Constitucional"],',
    '  "topicos": ["Súmula Vinculante 13", "Princípios da Administração", "União Estável"],',
    '  "conclusao": "Conclusão em 1 frase",',
    '  "keywords": ["nepotismo", "cargo político", "união estável", "súmula vinculante 13"]',
    '}',
    '</formato>',
    '',
    'IMPORTANTE: As keywords devem incluir TODAS as palavras-chave relevantes para busca,',
    'incluindo sinônimos e termos relacionados. Mínimo 5, máximo 20 keywords.',
  ].join('\n')

  const sourceText = textContent.slice(0, MAX_EMENTA_SOURCE_CHARS)
  const userPrompt = `Arquivo: ${filename}\n\n<texto>\n${sourceText}\n</texto>\n\nGere a ementa e keywords para este documento.`

  const result = await callLLM(apiKey, systemPrompt, userPrompt, model, 1000, 0.1)

  let jsonStr = result.content.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]

  const parsed = JSON.parse(jsonStr)

  const ementaParts = [
    `Tipo: ${parsed.tipo || 'N/A'}`,
    `Assunto: ${parsed.assunto || 'N/A'}`,
    `Síntese: ${parsed.sintese || 'N/A'}`,
    `Áreas: ${(parsed.areas || []).join(', ')}`,
    `Tópicos: ${(parsed.topicos || []).join(', ')}`,
    `Conclusão: ${parsed.conclusao || 'N/A'}`,
  ]

  const keywords = (parsed.keywords || []).map((k: string) => k.toLowerCase().trim())
  // Also extract keywords from filename
  const filenameKeywords = filename
    .replace(/\d{8}\s*-\s*/, '')
    .replace(/\.docx?$/i, '')
    .split(/[.\s,;]+/)
    .filter(w => w.length > 2)
    .map(w => w.toLowerCase())

  const allKeywords = [...new Set([...keywords, ...filenameKeywords])]

  return { ementa: ementaParts.join(' | '), keywords: allKeywords }
}

/**
 * NATUREZA options with their descriptions (for type-safe classification).
 */
export const NATUREZA_OPTIONS = [
  { value: 'consultivo' as const, label: 'Consultivo', description: 'Emissão de opinião: parecer, informativo, manifestação, nota técnica' },
  { value: 'executorio' as const, label: 'Executório', description: 'Movimentação processual ativa: petições iniciais, denúncias, recursos' },
  { value: 'transacional' as const, label: 'Transacional', description: 'Acordos e transações: ANPC, ANPP, TAC, acordo processual' },
  { value: 'negocial' as const, label: 'Negocial', description: 'Relação contratual: minutas de contrato, edital, termo de referência' },
  { value: 'doutrinario' as const, label: 'Doutrinário', description: 'Produção teórica: artigos, livros, teses acadêmicas' },
  { value: 'decisorio' as const, label: 'Decisório', description: 'Atos decisórios: sentenças, acórdãos, despachos, jurisprudência' },
] as const

export type NaturezaValue = typeof NATUREZA_OPTIONS[number]['value']

/**
 * Generate classification tags for an acervo document.
 * Returns structured tags for: natureza, área do direito, assuntos, and contexto.
 */
export async function generateAcervoTags(
  apiKey: string,
  filename: string,
  textContent: string,
  model = 'anthropic/claude-3.5-haiku',
): Promise<{
  natureza: NaturezaValue
  area_direito: string[]
  assuntos: string[]
  contexto: string[]
}> {
  const systemPrompt = [
    'Você é um classificador especializado em documentos jurídicos.',
    'Sua tarefa é gerar tags de classificação estruturadas para indexação e busca.',
    '',
    '<categorias_natureza>',
    'Classifique o documento em UMA das seguintes naturezas:',
    '- "consultivo": Documentos de emissão de opinião (parecer, informativo, manifestação, nota técnica, consulta)',
    '- "executorio": Documentos de movimentação processual ativa (petição inicial, denúncia, recurso, contrarrazões, impugnação, agravo)',
    '- "transacional": Documentos de acordo ou transação (ANPC, ANPP, TAC, acordo processual, termo de compromisso)',
    '- "negocial": Documentos de relação contratual (minuta de contrato, edital, termo de referência, aditivo contratual)',
    '- "doutrinario": Documentos de produção teórica ou acadêmica (artigo, livro, tese, monografia, estudo)',
    '- "decisorio": Documentos de atos decisórios (sentença, acórdão, jurisprudência, despacho, decisão interlocutória)',
    '</categorias_natureza>',
    '',
    '<formato>',
    'Responda APENAS com JSON puro (sem markdown), no formato:',
    '{',
    '  "natureza": "consultivo|executorio|transacional|negocial|doutrinario|decisorio",',
    '  "area_direito": ["Direito Administrativo", "Direito Constitucional"],',
    '  "assuntos": ["Licitação", "Contratação direta", "Dispensa de licitação"],',
    '  "contexto": ["Município celebrou contrato sem licitação", "Empresa questionou dispensa"]',
    '}',
    '</formato>',
    '',
    'REGRAS:',
    '- "natureza": Deve ser EXATAMENTE um dos 6 valores acima.',
    '- "area_direito": Liste 1 a 5 áreas do direito relacionadas ao conteúdo.',
    '- "assuntos": Liste 2 a 8 matérias/temas objeto da fundamentação do documento.',
    '- "contexto": Liste 1 a 5 circunstâncias fáticas tratadas no caso.',
  ].join('\n')

  const sourceText = textContent.slice(0, MAX_EMENTA_SOURCE_CHARS)
  const userPrompt = `Arquivo: ${filename}\n\n<texto>\n${sourceText}\n</texto>\n\nGere as tags de classificação para este documento.`

  const result = await callLLM(apiKey, systemPrompt, userPrompt, model, 800, 0.1)

  let jsonStr = result.content.trim()
  const jsonMatch = jsonStr.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]

  const parsed = JSON.parse(jsonStr)

  const validNaturezas: NaturezaValue[] = ['consultivo', 'executorio', 'transacional', 'negocial', 'doutrinario', 'decisorio']
  const natureza: NaturezaValue = validNaturezas.includes(parsed.natureza) ? parsed.natureza : 'consultivo'

  return {
    natureza,
    area_direito: Array.isArray(parsed.area_direito) ? parsed.area_direito.map((s: string) => String(s).trim()).filter(Boolean) : [],
    assuntos: Array.isArray(parsed.assuntos) ? parsed.assuntos.map((s: string) => String(s).trim()).filter(Boolean) : [],
    contexto: Array.isArray(parsed.contexto) ? parsed.contexto.map((s: string) => String(s).trim()).filter(Boolean) : [],
  }
}

/**
 * Pre-filter acervo documents by keyword matching against filenames and ementas.
 * Returns documents sorted by relevance (most keyword matches first).
 */
function preFilterAcervoDocs(
  docs: Array<{ id: string; filename: string; created_at: string; ementa?: string; ementa_keywords?: string[]; natureza?: string; area_direito?: string[]; assuntos?: string[]; contexto?: string[] }>,
  searchKeywords: string[],
): typeof docs {
  if (searchKeywords.length === 0) return docs.slice(0, MAX_PREFILTERED_DOCS)

  const normalizedSearch = searchKeywords.map(k => k.toLowerCase().trim())

  const scored = docs.map(d => {
    let score = 0
    const filenameLower = d.filename.toLowerCase()
    const ementaLower = (d.ementa || '').toLowerCase()
    const areasLower = (d.area_direito || []).map(a => a.toLowerCase())
    const assuntosLower = (d.assuntos || []).map(a => a.toLowerCase())
    const contextoLower = (d.contexto || []).map(c => c.toLowerCase())

    for (const keyword of normalizedSearch) {
      // Filename match (high weight — filenames are curated by user)
      if (filenameLower.includes(keyword)) score += 3
      // Ementa keyword match (medium weight)
      if (d.ementa_keywords?.some(ek => ek.includes(keyword) || keyword.includes(ek))) score += 2
      // Ementa text match (lower weight)
      if (ementaLower.includes(keyword)) score += 1
      // Tag-based matches (high relevance)
      if (areasLower.some(a => a.includes(keyword) || keyword.includes(a))) score += 2
      if (assuntosLower.some(a => a.includes(keyword) || keyword.includes(a))) score += 2
      if (contextoLower.some(c => c.includes(keyword) || keyword.includes(c))) score += 1
    }

    return { ...d, score }
  })

  return scored
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PREFILTERED_DOCS)
}

/**
 * Extract search keywords from triage result for pre-filtering.
 */
function extractSearchKeywords(triageContent: string, request: string): string[] {
  const keywords: string[] = []

  // Try to parse triage JSON for structured keywords
  try {
    const triage = JSON.parse(triageContent)
    if (triage.tema) keywords.push(...triage.tema.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3))
    if (triage.subtemas) {
      for (const sub of triage.subtemas) {
        keywords.push(...sub.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3))
      }
    }
    if (triage.palavras_chave) {
      for (const kw of triage.palavras_chave) {
        keywords.push(kw.toLowerCase().trim())
      }
    }
  } catch {
    // Not JSON, extract from raw text
    keywords.push(...triageContent.toLowerCase().split(/\s+/).filter(w => w.length > 4))
  }

  // Also extract main keywords from the request itself
  const requestWords = request.toLowerCase()
    .replace(/[.,;:!?()"]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4)
    .filter(w => !['sobre', 'entre', 'sendo', 'quando', 'como', 'para', 'com', 'qual', 'quais', 'possível', 'prática', 'envolvendo', 'municipal'].includes(w))
  keywords.push(...requestWords)

  // Deduplicate
  return [...new Set(keywords)]
}

// ── Advanced agent prompt builders ────────────────────────────────────────────

function buildPesquisadorSystem(docType: string, tema: string, profile?: UserProfileForGeneration | null): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const profileBlock = buildProfileBlock(profile)
  return [
    `Você é PESQUISADOR JURÍDICO SÊNIOR, preparando material aprofundado para ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    profileBlock,
    '',
    'Sua função é produzir uma PESQUISA JURÍDICA EXAUSTIVA e DETALHADA.',
    'O material que você produzir será a BASE para toda a fundamentação do documento.',
    'Portanto, seja EXTREMAMENTE minucioso e completo.',
    '',
    '1. LEGISLAÇÃO APLICÁVEL (mínimo 8 referências):',
    '   - Cite artigos ESPECÍFICOS da Constituição Federal/1988 com inciso, alínea e parágrafo',
    '   - TRANSCREVA o texto literal dos artigos mais importantes entre aspas',
    '     Exemplo: Art. 5º, XXXV, CF: "a lei não excluirá da apreciação do Poder Judiciário lesão ou ameaça a direito"',
    '   - Leis federais e estaduais aplicáveis com número completo, ano e dispositivo',
    '     Exemplo: Lei 14.133/2021, art. 5º, II — cite o texto do dispositivo',
    '   - Decretos regulamentadores, resoluções, portarias pertinentes',
    '   - Súmulas vinculantes com número e enunciado COMPLETO',
    '     Exemplo: Súmula Vinculante 13: "A nomeação de cônjuge, companheiro ou parente..."',
    '   - Súmulas do STF e STJ com número e texto integral',
    '',
    '2. JURISPRUDÊNCIA CONSOLIDADA (mínimo 5 referências):',
    '   - Teses fixadas em repercussão geral: cite o TEMA por número e a tese completa',
    '     Exemplo: "Tema 725/STF: É constitucional a imposição de..."',
    '   - Teses firmadas em recursos repetitivos do STJ: cite o TEMA e a tese',
    '   - Súmulas vinculantes e súmulas do STJ/STF aplicáveis (citar número e ENUNCIADO COMPLETO)',
    '   - Posições consolidadas: "conforme jurisprudência pacífica do STF" ou "segundo entendimento consolidado do STJ"',
    '   - Para cada referência jurisprudencial, EXPLIQUE como se aplica ao caso',
    '   - NUNCA invente números de processo, recurso ou relator',
    '',
    '3. DOUTRINA RELEVANTE (mínimo 3 referências):',
    '   - Cite autores reconhecidos com NOME COMPLETO, OBRA e EDITORA quando possível',
    '   - Inclua a POSIÇÃO DOUTRINÁRIA de cada autor sobre o tema',
    '   - Transcreva trechos relevantes entre aspas quando citar posição específica',
    '   - Autores de referência por área:',
    '     * Direito Administrativo: Hely Lopes Meirelles, Celso Antônio Bandeira de Mello, Maria Sylvia Di Pietro',
    '     * Direito Constitucional: Luís Roberto Barroso, Gilmar Mendes, José Afonso da Silva',
    '     * Direito Civil: Caio Mário da Silva Pereira, Pontes de Miranda, Flávio Tartuce, Pablo Stolze',
    '     * Processo Civil: Fredie Didier Jr., Nelson Nery Jr., Daniel Amorim Assumpção Neves, Humberto Theodoro Jr.',
    '     * Direito Penal: Cezar Roberto Bitencourt, Rogério Greco, Cleber Masson',
    '     * Direito do Trabalho: Maurício Godinho Delgado, Sérgio Pinto Martins',
    '     * Direito Tributário: Eduardo Sabbag, Hugo de Brito Machado, Roque Carrazza',
    '     * Direito do Consumidor: Cláudia Lima Marques, Nelson Nery Jr., Rizzatto Nunes',
    '',
    '4. PRINCÍPIOS CONSTITUCIONAIS E GERAIS DO DIREITO (mínimo 3):',
    '   - Princípios diretamente aplicáveis ao caso (legalidade, proporcionalidade, etc.)',
    '   - Fundamente CADA princípio com artigo constitucional ESPECÍFICO e TEXTO do dispositivo',
    '   - Mostre como cada princípio se aplica concretamente ao caso',
    '   - Inclua princípios infraconstitucionais da legislação especial aplicável',
    '',
    '5. ANÁLISE COMPARATIVA (quando pertinente):',
    '   - Como tribunais diferentes tratam a questão',
    '   - Evolução jurisprudencial sobre o tema',
    '   - Divergências doutrinárias relevantes',
    '',
    'REGRA ABSOLUTA: NUNCA invente leis, artigos, números de processo ou autores.',
    'Use APENAS referências notórias que você tem certeza de que existem.',
    'Se receber um banco de teses ou acervo de referência, INCORPORE as teses relevantes ao tema,',
    'VALIDANDO e ENRIQUECENDO-as com legislação, jurisprudência e doutrina adicionais.',
    'Responda em texto estruturado com seções claras e bem fundamentadas.',
    'Para cada citação, TRANSCREVA o dispositivo legal ou enunciado de súmula entre aspas.',
  ].join('\n')
}

function buildJuristaSystem(docType: string, tema: string, profile?: UserProfileForGeneration | null): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const profileBlock = buildProfileBlock(profile)
  return [
    `Você é JURISTA SÊNIOR com décadas de experiência, desenvolvendo teses para ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    profileBlock,
    '',
    'Desenvolva 3 a 5 teses jurídicas ROBUSTAS e BEM FUNDAMENTADAS.',
    'As teses devem ter PROFUNDIDADE DOUTRINÁRIA e JURISPRUDENCIAL equivalente',
    'a uma peça produzida por escritório de advocacia de excelência.',
    '',
    'Para CADA tese, inclua OBRIGATORIAMENTE todos os elementos:',
    '',
    '1. TÍTULO claro e objetivo da tese',
    '',
    '2. FUNDAMENTO CONSTITUCIONAL (quando aplicável):',
    '   - Cite o artigo da CF/88 com inciso, alínea e parágrafo',
    '   - TRANSCREVA o texto do dispositivo entre aspas',
    '   - Explique a interpretação constitucional que sustenta a tese',
    '',
    '3. FUNDAMENTO LEGAL específico:',
    '   - Cite lei, artigo, inciso, alínea e parágrafo',
    '   - TRANSCREVA o texto integral do dispositivo entre aspas',
    '     Exemplo: "Art. 186, CC/2002: \'Aquele que, por ação ou omissão voluntária,',
    '     negligência ou imprudência, violar direito e causar dano a outrem, ainda',
    '     que exclusivamente moral, comete ato ilícito.\'"',
    '   - Demonstre como o dispositivo se aplica ao caso concreto',
    '',
    '4. ARGUMENTAÇÃO jurídica aprofundada (mínimo 3 parágrafos densos):',
    '   - Interpretação teleológica, sistemática e histórica da norma',
    '   - Subsunção dos fatos à norma jurídica',
    '   - Demonstração lógica do enquadramento',
    '',
    '5. JURISPRUDÊNCIA de apoio (obrigatório para cada tese):',
    '   - Súmulas: cite NÚMERO e ENUNCIADO COMPLETO',
    '     Exemplo: "Súmula 479/STJ: \'As instituições financeiras respondem',
    '     objetivamente pelos danos gerados por fortuito interno relativo',
    '     a fraudes e delitos praticados por terceiros.\'"',
    '   - Temas de repercussão geral: cite NÚMERO DO TEMA e TESE FIRMADA',
    '   - Entendimento consolidado com menção ao tribunal',
    '   - NUNCA invente números de REsp, RE, MS, AgInt, HC ou relator',
    '',
    '6. DOUTRINA favorável (obrigatório para cada tese):',
    '   - Cite AUTOR COMPLETO, OBRA e EDITORA',
    '   - Inclua a POSIÇÃO do autor sobre o tema específico',
    '   - Transcreva trecho doutrinário relevante entre aspas quando possível',
    '     Exemplo: "Conforme leciona Fredie Didier Jr. (Curso de Direito',
    '     Processual Civil, JusPodivm): \'a tutela provisória...\'"',
    '',
    '7. PRINCÍPIOS constitucionais que sustentam a tese:',
    '   - Princípio com fundamento constitucional (artigo da CF/88)',
    '   - Aplicação concreta do princípio ao caso',
    '',
    'As teses devem ser COMPLEMENTARES, não redundantes.',
    'Ordene da mais forte (principal) para a subsidiária.',
    'Considere teses processuais E de mérito.',
    'Cada tese deve ser suficiente para sustentar o pedido sozinha.',
    '',
    'NUNCA invente leis, jurisprudência, números de processo ou autores.',
    'Use apenas referências notórias e verificáveis.',
    'Lei 8.666/93 REVOGADA — use 14.133/21.',
    'CPC/1973 REVOGADO — use CPC/2015 (Lei 13.105/15).',
  ].join('\n')
}

function buildAdvogadoDiaboSystem(tema: string, profile?: UserProfileForGeneration | null): string {
  const profileBlock = buildProfileBlock(profile)
  return [
    'Você é ADVOGADO DO DIABO — crítico implacável de argumentos jurídicos.',
    '',
    `Tema: "${tema}"`,
    '',
    'Analise as teses apresentadas e:',
    '1. Identifique FRAQUEZAS em cada argumento',
    '2. Aponte possíveis contra-argumentos da parte adversa',
    '3. Verifique se há leis revogadas ou jurisprudência superada',
    '4. Sugira MELHORIAS específicas para fortalecer cada tese',
    profileBlock,
    '',
    'Analise as teses apresentadas com RIGOR ABSOLUTO:',
    '',
    '1. Para CADA tese, verifique:',
    '   - O fundamento legal está correto e atualizado?',
    '   - Os artigos transcritos são fiéis ao texto legal?',
    '   - A jurisprudência citada é pertinente e atual?',
    '   - A doutrina citada é reconhecida na área?',
    '   - A subsunção dos fatos à norma é logicamente sólida?',
    '',
    '2. Identifique FRAQUEZAS em cada argumento:',
    '   - Lacunas na fundamentação',
    '   - Pontos vulneráveis à impugnação',
    '   - Argumentos circulares ou falaciosos',
    '',
    '3. Aponte possíveis CONTRA-ARGUMENTOS da parte adversa:',
    '   - Teses contrárias com fundamento legal',
    '   - Jurisprudência desfavorável',
    '   - Entendimentos divergentes',
    '',
    '4. Verifique se há leis REVOGADAS ou jurisprudência SUPERADA:',
    '   - Lei 8.666/93 → deve ser Lei 14.133/21',
    '   - CPC/1973 → deve ser CPC/2015',
    '   - Súmulas canceladas ou teses revisadas',
    '',
    '5. Sugira MELHORIAS ESPECÍFICAS para fortalecer cada tese:',
    '   - Artigos adicionais que devem ser citados (com texto do dispositivo)',
    '   - Súmulas e temas de repercussão geral que reforçam o argumento',
    '   - Doutrina adicional que pode ser mencionada',
    '   - Princípios constitucionais não explorados',
    '',
    'Seja rigoroso mas construtivo. O objetivo é fortalecer o documento.',
  ].join('\n')
}

function buildJuristaV2System(docType: string, tema: string, profile?: UserProfileForGeneration | null): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const profileBlock = buildProfileBlock(profile)
  return [
    `Você é JURISTA SÊNIOR (revisão final), refinando teses para ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    profileBlock,
    '',
    'Com base nas teses originais E nas críticas do advogado do diabo:',
    '',
    '1. FORTALEÇA cada tese incorporando as sugestões válidas:',
    '   - Adicione fundamentação legal que estava faltando',
    '   - TRANSCREVA artigos de lei entre aspas quando citados',
    '   - Reforce a jurisprudência com súmulas (número + enunciado completo)',
    '   - Inclua temas de repercussão geral (número + tese firmada)',
    '   - Adicione referências doutrinárias (autor + obra + posição)',
    '',
    '2. DESCARTE teses que não resistiram à crítica',
    '',
    '3. ADICIONE novas teses se necessário para cobrir lacunas identificadas',
    '',
    '4. Garanta que CADA tese tenha TODOS os elementos:',
    '   - Fundamento constitucional (artigo CF + texto)',
    '   - Fundamento legal (artigo + texto transcrito entre aspas)',
    '   - Jurisprudência (súmula com enunciado OU tema de repercussão com tese)',
    '   - Doutrina (autor + obra + posição)',
    '   - Aplicação ao caso concreto (subsunção detalhada)',
    '',
    '5. Verifique a COERÊNCIA entre as teses:',
    '   - As teses não devem se contradizer',
    '   - Cada tese deve reforçar as demais',
    '   - A argumentação em cascata deve ser lógica',
    '',
    'NUNCA invente leis ou jurisprudência. Use apenas referências notórias.',
    'Lei 8.666/93 REVOGADA — use 14.133/21.',
    'CPC/1973 REVOGADO — use CPC/2015 (Lei 13.105/15).',
    'CC/1916 REVOGADO — use CC/2002 (Lei 10.406/02).',
  ].join('\n')
}

function buildFactCheckerSystem(): string {
  return [
    'Você é FACT-CHECKER JURÍDICO com rigor máximo e expertise em legislação brasileira vigente.',
    '',
    'Verifique as teses jurídicas apresentadas com EXTREMO RIGOR.',
    'Uma citação falsa pode causar sanções processuais e responsabilidade disciplinar.',
    '',
    '1. Para CADA lei/artigo citado:',
    '   - CONFIRME se a lei existe e está VIGENTE (não revogada)',
    '   - Verifique se o artigo citado EXISTE nessa lei e trata do assunto referido',
    '   - Se um artigo foi TRANSCRITO, verifique se o texto está correto',
    '   - Identifique se houve alterações recentes no dispositivo',
    '   - Verifique incisos, alíneas e parágrafos específicos',
    '',
    '2. Para CADA referência jurisprudencial:',
    '   - Verifique se a súmula citada existe e seu conteúdo é pertinente',
    '   - Se o enunciado da súmula foi transcrito, verifique se está correto',
    '   - Verifique se o entendimento mencionado é atual (não superado)',
    '   - Identifique se houve superação ou revisão de tese',
    '   - Confirme que temas de repercussão geral existem com o número indicado',
    '',
    '3. Para CADA referência doutrinária:',
    '   - Verifique se o autor é reconhecido na área',
    '   - Verifique se a obra citada existe',
    '   - Confirme que a posição atribuída ao autor é plausível',
    '',
    '4. ENRIQUEÇA a fundamentação quando necessário:',
    '   - Se faltam transcrições de artigos de lei, ADICIONE o texto do dispositivo',
    '   - Se faltam enunciados de súmula, ADICIONE o enunciado completo',
    '   - Se a doutrina é fraca, SUGIRA autores adicionais pertinentes',
    '   - Se princípios constitucionais não foram vinculados a artigo da CF, ADICIONE',
    '',
    'Leis sabidamente REVOGADAS (verificar sempre):',
    '- Lei 8.666/93 → usar Lei 14.133/21 (Nova Lei de Licitações)',
    '- CPC/1973 (Lei 5.869/73) → usar CPC/2015 (Lei 13.105/15)',
    '- CC/1916 → usar CC/2002 (Lei 10.406/02)',
    '- CLT: verificar reformas de 2017 (Lei 13.467/17)',
    '- Lei 11.101/05: verificar alterações pela Lei 14.112/20',
    '- CDC (Lei 8.078/90): verificar atualizações',
    '- Lei de Improbidade (Lei 8.429/92): verificar alterações pela Lei 14.230/21',
    '',
    'Retorne as teses CORRIGIDAS e ENRIQUECIDAS:',
    '- [VERIFICADO] para citações corretas mantidas',
    '- [CORRIGIDO: motivo] para citações alteradas',
    '- [ADICIONADO] para novas citações incluídas para enriquecer a fundamentação',
    '- [REMOVIDO: motivo] para citações eliminadas',
  ].join('\n')
}

function buildModeradorSystem(docType: string, tema: string, profile?: UserProfileForGeneration | null, customStructure?: string): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const profileBlock = buildProfileBlock(profile)
  const structureBlock = customStructure
    ? [
        '',
        '<estrutura_obrigatoria>',
        'O administrador definiu a seguinte estrutura que DEVE ser seguida rigorosamente:',
        '',
        customStructure,
        '</estrutura_obrigatoria>',
        '',
        `Com base em toda a pesquisa e teses verificadas, elabore um PLANO DETALHADO para ${typeName} seguindo a estrutura acima:`,
      ]
    : [
        '',
        `Com base em toda a pesquisa e teses verificadas, elabore um PLANO DETALHADO para ${typeName}:`,
        '',
        '1. ESTRUTURA do documento (seções e subseções com títulos descritivos)',
      ]
  return [
    `Você é MODERADOR/PLANEJADOR especialista em ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    profileBlock,
    ...structureBlock,
    '',
    '2. Para CADA seção, especifique:',
    '   a) Quais argumentos e teses usar',
    '   b) Quais artigos de lei citar — inclua o TEXTO do dispositivo a ser transcrito',
    '   c) Quais súmulas mencionar — inclua NÚMERO e ENUNCIADO a ser transcrito',
    '   d) Quais temas de repercussão geral citar — inclua NÚMERO e TESE FIRMADA',
    '   e) Qual doutrina referenciar — inclua AUTOR + OBRA + POSIÇÃO a ser citada',
    '   f) Quais princípios constitucionais invocar — inclua ARTIGO DA CF + TEXTO',
    '   g) Tom e linguagem adequados à seção',
    '',
    '3. ORDEM de apresentação (do mais forte ao subsidiário)',
    '',
    '4. CONEXÕES lógicas entre seções (como cada parte reforça a seguinte)',
    '',
    '5. CITAÇÕES MÍNIMAS OBRIGATÓRIAS por seção:',
    '   - Dos Fatos: 1-2 referências legais contextuais',
    '   - Do Direito / Fundamentação (cada subseção):',
    '     * 3-5 artigos de lei (com texto transcrito)',
    '     * 2-3 referências jurisprudenciais (súmulas com enunciado ou temas com tese)',
    '     * 1-2 referências doutrinárias (autor + obra + posição)',
    '     * 1-2 princípios constitucionais (com artigo da CF)',
    '   - Dos Pedidos: referência legal ESPECÍFICA para cada pedido',
    '',
    '6. CHECKLIST de fundamentação:',
    '   - Toda tese tem artigo de lei transcrito? ✓',
    '   - Toda tese tem jurisprudência de apoio? ✓',
    '   - Toda tese tem referência doutrinária? ✓',
    '   - Há subsunção fato-norma em cada tese? ✓',
    '   - Os pedidos decorrem logicamente das teses? ✓',
    '',
    'O plano deve ser COMPLETO e DETALHADO — o redator seguirá este roteiro.',
    'Priorize PROFUNDIDADE e PRECISÃO nas referências legais.',
    'O documento final deve ter qualidade de peça jurídica de excelência.',
  ].join('\n')
}

// ── Main generation function ──────────────────────────────────────────────────

/**
 * Generate a legal document using OpenRouter LLM — full multi-agent pipeline.
 *
 * Pipeline stages:
 * 1. Triagem (Haiku) → structured extraction
 * 2. Pesquisador (Sonnet) → legal research
 * 3. Jurista (Sonnet) → initial theses
 * 4. Advogado do Diabo (Sonnet) → critique
 * 5. Jurista v2 (Sonnet) → refined theses
 * 6. Fact-checker (Haiku) → verify citations
 * 7. Moderador (Sonnet) → document plan
 * 8. Redator (Sonnet) → final document text
 */
export async function generateDocument(
  uid: string,
  docId: string,
  docType: string,
  request: string,
  areas: string[],
  context?: Record<string, unknown> | null,
  onProgress?: ProgressCallback,
  profile?: UserProfileForGeneration | null,
  contextDetail?: ContextDetailData | null,
): Promise<void> {
  if (!firestore) throw new Error('Firestore não configurado')

  const docRef = doc(firestore, 'users', uid, 'documents', docId)

  // Update status to "processando"
  await updateDoc(docRef, {
    status: 'processando',
    updated_at: new Date().toISOString(),
  })

  try {
    // 1. Get API key and model configuration
    onProgress?.({ phase: 'config', message: 'Carregando configurações...', percent: 2 })
    const apiKey = await getOpenRouterKey()
    const agentModels: AgentModelMap = await loadAgentModels()

    // Model shortcuts — use admin-configured models, falling back to defaults
    const modelTriagem      = agentModels.triagem       ?? 'anthropic/claude-3.5-haiku'
    const modelPesquisador  = agentModels.pesquisador    ?? 'anthropic/claude-sonnet-4'
    const modelJurista      = agentModels.jurista        ?? 'anthropic/claude-sonnet-4'
    const modelAdvDiabo     = agentModels.advogado_diabo ?? 'anthropic/claude-sonnet-4'
    const modelJuristaV2    = agentModels.jurista_v2     ?? 'anthropic/claude-sonnet-4'
    const modelFactChecker  = agentModels.fact_checker   ?? 'anthropic/claude-3.5-haiku'
    const modelModerador    = agentModels.moderador      ?? 'anthropic/claude-sonnet-4'
    const modelRedator      = agentModels.redator        ?? 'anthropic/claude-sonnet-4'
    const modelAcervoBuscador    = agentModels.acervo_buscador    ?? 'anthropic/claude-3.5-haiku'
    const modelAcervoCompilador  = agentModels.acervo_compilador  ?? 'anthropic/claude-sonnet-4'
    const modelAcervoRevisor     = agentModels.acervo_revisor     ?? 'anthropic/claude-sonnet-4'

    // Load admin-configured document type structure template (if defined)
    let customStructure: string | undefined
    try {
      const adminDocTypes = await loadAdminDocumentTypes()
      const adminDocType = adminDocTypes.find(dt => dt.id === docType)
      const trimmedStructure = adminDocType?.structure?.trim()
      if (trimmedStructure) {
        customStructure = trimmedStructure
      }
    } catch (e) {
      console.warn('Failed to load admin document type structure:', e)
    }

    // 2. Triage — extract structured info from the request
    onProgress?.({ phase: 'triagem', message: 'Analisando solicitação...', percent: 5 })
    const triageResult = await callLLM(
      apiKey,
      buildTriageSystem(docType),
      buildTriageUser(request, areas, context, contextDetail),
      modelTriagem, 800, 0.1,
    )

    // Extract tema from triage JSON
    let tema = ''
    try {
      const triageJson = JSON.parse(triageResult.content)
      tema = triageJson.tema || request.slice(0, 100)
    } catch {
      tema = request.slice(0, 100)
    }
    await updateDoc(docRef, { tema })

    // ── 2b. Acervo-based pre-generation agents ──────────────────────────────
    // Two-layer search:
    // Layer 1 (zero-cost): Pre-filter by keywords from triage against filenames/ementas
    // Layer 2 (cheap LLM): Buscador ranks pre-filtered ementas, selects top docs
    // Then: Compilador + Revisor process full text of selected docs

    let acervoBase = '' // Will hold the compiled base document (if any)
    let buscadorResult: Awaited<ReturnType<typeof callLLM>> | null = null
    let compiladorResult: Awaited<ReturnType<typeof callLLM>> | null = null
    let revisorBaseResult: Awaited<ReturnType<typeof callLLM>> | null = null

    try {
      const allAcervoDocs = await getAllAcervoDocumentsForSearch(uid)
      console.log(`[Acervo Pipeline] Found ${allAcervoDocs.length} indexed documents in acervo`)

      if (allAcervoDocs.length > 0) {
        onProgress?.({ phase: 'acervo_buscador', message: 'Buscando documentos similares no acervo...', percent: 8 })

        // ── Layer 1: Zero-cost keyword pre-filter ──
        const searchKeywords = extractSearchKeywords(triageResult.content, request)
        console.log(`[Acervo Pre-filter] Search keywords:`, searchKeywords)

        const preFiltered = preFilterAcervoDocs(allAcervoDocs, searchKeywords)
        console.log(`[Acervo Pre-filter] ${allAcervoDocs.length} docs → ${preFiltered.length} candidates after keyword filter`)

        // Generate ementas for pre-filtered docs that don't have one yet (async, non-blocking for future runs)
        const docsNeedingEmenta = preFiltered.filter(d => !d.ementa)
        if (docsNeedingEmenta.length > 0) {
          console.log(`[Acervo Ementa] ${docsNeedingEmenta.length} of ${preFiltered.length} pre-filtered docs need ementa generation`)
          // Generate ementas in background for up to 10 docs (don't block generation)
          const ementaPromises = docsNeedingEmenta.slice(0, 10).map(async d => {
            try {
              const fullDoc = allAcervoDocs.find(ad => ad.id === d.id)
              if (!fullDoc) return
              const { ementa, keywords } = await generateAcervoEmenta(apiKey, d.filename, fullDoc.text_content, modelAcervoBuscador)
              await updateAcervoEmenta(uid, d.id, ementa, keywords)
              // Update in-memory reference
              d.ementa = ementa
              d.ementa_keywords = keywords
              console.log(`[Acervo Ementa] Generated ementa for "${d.filename}": ${ementa.slice(0, 100)}...`)
            } catch (err) {
              console.warn(`[Acervo Ementa] Failed for "${d.filename}":`, err)
            }
          })
          await Promise.all(ementaPromises)
        }

        if (preFiltered.length > 0) {
          // ── Layer 2: LLM Buscador ranks pre-filtered ementas ──
          const docSummaries = preFiltered.map(d => ({
            id: d.id,
            filename: d.filename,
            summary: d.ementa || d.filename, // Use ementa if available, otherwise just filename
            created_at: d.created_at,
            natureza: d.natureza,
            area_direito: d.area_direito,
            assuntos: d.assuntos,
            contexto: d.contexto,
          }))

          buscadorResult = await callLLM(
            apiKey,
            buildAcervoBuscadorSystem(),
            buildAcervoBuscadorUser(triageResult.content, request, docType, docSummaries),
            modelAcervoBuscador, 2000, 0.1,
          )

          // Parse buscador response
          let selectedIds: string[] = []
          try {
            let jsonStr = buscadorResult.content.trim()
            const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
            if (jsonMatch) jsonStr = jsonMatch[1].trim()
            const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
            if (braceMatch) jsonStr = braceMatch[0]

            const parsed = JSON.parse(jsonStr)
            const allSelected = parsed.selected || []
            console.log(`[Acervo Buscador] LLM selected ${allSelected.length} from ${preFiltered.length} candidates:`,
              allSelected.map((s: { id: string; score?: number; reason?: string }) =>
                `${s.id.slice(0, 8)}... (score: ${s.score}, ${s.reason?.slice(0, 50)})`,
              ))

            selectedIds = allSelected
              .filter((s: { score?: number }) => (s.score ?? 0) >= 0.15)
              .slice(0, MAX_ACERVO_SELECTED_DOCS)
              .map((s: { id: string }) => s.id)
          } catch (parseErr) {
            console.warn('[Acervo Buscador] Parse error:', parseErr, 'Raw:', buscadorResult.content.slice(0, 300))
          }

          if (selectedIds.length > 0) {
            const selectedDocs = allAcervoDocs
              .filter(d => selectedIds.includes(d.id))
              .map(d => ({
                filename: d.filename,
                text_content: d.text_content.slice(0, Math.floor(MAX_ACERVO_COMPILADOR_CHARS / selectedIds.length)),
                created_at: d.created_at,
              }))

            console.log(`[Acervo Compilador] Compiling from ${selectedDocs.length} docs:`,
              selectedDocs.map(d => `${d.filename} (${d.text_content.length} chars)`))

            if (selectedDocs.length > 0) {
              // ── Agent 2: Compilador ──
              onProgress?.({ phase: 'acervo_compilador', message: `Compilando base a partir de ${selectedDocs.length} documento(s)...`, percent: 12 })
              compiladorResult = await callLLM(
                apiKey,
                buildAcervoCompiladorSystem(docType, tema, profile),
                buildAcervoCompiladorUser(request, triageResult.content, docType, selectedDocs),
                modelAcervoCompilador, 12000, 0.2,
              )

              // ── Agent 3: Revisor ──
              onProgress?.({ phase: 'acervo_revisor', message: 'Revisando documento base compilado...', percent: 16 })
              revisorBaseResult = await callLLM(
                apiKey,
                buildAcervoRevisorSystem(docType, tema, profile),
                buildAcervoRevisorUser(request, triageResult.content, docType, compiladorResult.content),
                modelAcervoRevisor, 12000, 0.2,
              )

              acervoBase = revisorBaseResult.content
              console.log(`[Acervo Revisor] Base document compiled: ${acervoBase.length} chars`)
            }
          } else {
            console.log('[Acervo Buscador] No relevant documents selected from acervo')
          }
        } else {
          console.log('[Acervo Pre-filter] No documents matched keywords, skipping acervo agents')
        }
      }
    } catch (e) {
      console.warn('Acervo pre-generation agents failed (non-fatal, proceeding without base):', e)
    }

    // ── 2c. Load knowledge base — theses + acervo excerpts ──────────────────
    onProgress?.({ phase: 'pesquisador', message: 'Carregando base de conhecimento...', percent: 18 })
    let knowledgeBase = ''

    // Load relevant theses from thesis bank
    try {
      const thesesByArea = areas.length > 0
        ? await Promise.all(areas.map(area => listTheses(uid, { legalAreaId: area, limit: MAX_THESES_PER_AREA })))
        : [await listTheses(uid, { limit: MAX_THESES_FALLBACK })]
      const allTheses: ThesisData[] = []
      const seenIds = new Set<string>()
      for (const result of thesesByArea) {
        for (const t of result.items) {
          if (t.id && !seenIds.has(t.id)) {
            seenIds.add(t.id)
            allTheses.push(t)
          }
        }
      }
      if (allTheses.length > 0) {
        const thesesText = allTheses
          .slice(0, MAX_THESES_INJECTED)
          .map(t => `• ${t.title}\n  ${t.content}${t.summary ? `\n  Resumo: ${t.summary}` : ''}`)
          .join('\n\n')
        knowledgeBase += `<banco_de_teses>\n${thesesText}\n</banco_de_teses>\n\n`
      }
    } catch (e) {
      console.warn('Failed to load thesis bank:', e)
    }

    // Load acervo excerpts (lightweight context — separate from the full acervo base above)
    if (!acervoBase) {
      // Only load excerpts if acervo agents didn't produce a compiled base
      try {
        const acervoContext = await getAcervoContext(uid, MAX_ACERVO_CONTEXT_CHARS)
        if (acervoContext) {
          knowledgeBase += `<acervo_referencia>\n${acervoContext}\n</acervo_referencia>\n\n`
        }
      } catch (e) {
        console.warn('Failed to load acervo context:', e)
      }
    }

    // 3. Pesquisador — legal research synthesis
    onProgress?.({ phase: 'pesquisador', message: 'Pesquisando legislação e jurisprudência...', percent: 22 })
    const pesquisadorUserParts = [
      `<triagem>${triageResult.content}</triagem>`,
      `<solicitacao>${request}</solicitacao>`,
    ]
    if (acervoBase) {
      pesquisadorUserParts.push(
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
      pesquisadorUserParts.push(
        '<base_conhecimento>',
        'Use as teses e documentos de referência abaixo como material COMPLEMENTAR à sua pesquisa.',
        'Incorpore as teses relevantes, mas SEMPRE verifique e enriqueça com suas próprias referências.',
        knowledgeBase,
        '</base_conhecimento>',
      )
    }
    pesquisadorUserParts.push(
      acervoBase
        ? 'Realize pesquisa jurídica COMPLEMENTAR ao documento base do acervo. Foque nas lacunas marcadas com [COMPLEMENTAR]. TRANSCREVA artigos de lei entre aspas. Inclua legislação, jurisprudência e doutrina que COMPLEMENTEM a fundamentação já existente.'
        : 'Realize pesquisa jurídica EXAUSTIVA sobre o tema. TRANSCREVA artigos de lei entre aspas. Inclua legislação com texto dos dispositivos, jurisprudência com enunciados de súmulas, doutrina com autor e obra, e princípios constitucionais.',
    )
    const pesquisaResult = await callLLM(
      apiKey,
      buildPesquisadorSystem(docType, tema, profile),
      pesquisadorUserParts.join('\n'),
      modelPesquisador, 6000, 0.3,
    )

    // 4. Jurista — initial thesis development
    onProgress?.({ phase: 'jurista', message: 'Desenvolvendo teses jurídicas...', percent: 28 })
    const juristaResult = await callLLM(
      apiKey,
      buildJuristaSystem(docType, tema, profile),
      `<triagem>${triageResult.content}</triagem>\n<pesquisa>${pesquisaResult.content}</pesquisa>\nDesenvolva teses jurídicas ROBUSTAS e BEM FUNDAMENTADAS. Para cada tese: TRANSCREVA os artigos de lei citados entre aspas, cite súmulas com enunciado completo, mencione doutrina com autor e obra, e faça subsunção detalhada dos fatos à norma.`,
      modelJurista, 6000, 0.3,
    )

    // 5. Advogado do Diabo — critique
    onProgress?.({ phase: 'advogado_diabo', message: 'Analisando contra-argumentos...', percent: 40 })
    const criticaResult = await callLLM(
      apiKey,
      buildAdvogadoDiaboSystem(tema, profile),
      `<teses>${juristaResult.content}</teses>\nCritique estas teses rigorosamente. Verifique se os artigos foram transcritos corretamente, se as súmulas existem, se a doutrina é pertinente. Identifique fraquezas e sugira melhorias específicas com referências legais concretas.`,
      modelAdvDiabo, 3000, 0.4,
    )

    // 6. Jurista v2 — refined theses
    onProgress?.({ phase: 'jurista_v2', message: 'Refinando teses após crítica...', percent: 52 })
    const juristaV2Result = await callLLM(
      apiKey,
      buildJuristaV2System(docType, tema, profile),
      `<teses_originais>${juristaResult.content}</teses_originais>\n<criticas>${criticaResult.content}</criticas>\nRefine as teses incorporando as críticas válidas. Fortaleça a fundamentação: TRANSCREVA artigos de lei, cite enunciados completos de súmulas, inclua referências doutrinárias com autor e obra.`,
      modelJuristaV2, 6000, 0.3,
    )

    // 7. Fact-checker — verify legal citations
    onProgress?.({ phase: 'fact_checker', message: 'Verificando citações legais...', percent: 62 })
    const factCheckResult = await callLLM(
      apiKey,
      buildFactCheckerSystem(),
      `<teses>${juristaV2Result.content}</teses>\nVerifique TODAS as citações legais. Corrija imprecisões. ADICIONE transcrições de artigos que foram citados sem texto. ADICIONE enunciados de súmulas que foram citadas sem texto completo. Enriqueça a fundamentação.`,
      modelFactChecker, 6000, 0.1,
    )

    // 8. Moderador — document plan
    onProgress?.({ phase: 'moderador', message: 'Planejando estrutura do documento...', percent: 72 })
    const planoResult = await callLLM(
      apiKey,
      buildModeradorSystem(docType, tema, profile, customStructure),
      `<pesquisa>${pesquisaResult.content}</pesquisa>\n<teses_verificadas>${factCheckResult.content}</teses_verificadas>\nElabore plano DETALHADO. Para cada seção, especifique: artigos de lei a TRANSCREVER, súmulas com ENUNCIADO COMPLETO, doutrina com AUTOR e OBRA, princípios com ARTIGO DA CF.`,
      modelModerador, 3000, 0.2,
    )

    // 9. Redator — write the full document
    onProgress?.({ phase: 'redacao', message: 'Redigindo documento completo...', percent: 82 })
    const docResult = await callLLM(
      apiKey,
      buildRedatorSystem(docType, tema, profile, customStructure),
      buildRedatorUser(
        docType, request, triageResult.content, areas, context,
        pesquisaResult.content, factCheckResult.content, planoResult.content,
        contextDetail, acervoBase || undefined,
      ),
      modelRedator, 12000, 0.3,
    )

    // Accumulate LLM usage across all pipeline agents for Dashboard metrics
    const llmExecutions = [
      // Include context detail execution if available (pre-generation step)
      ...(contextDetail?.llm_execution ? [{
        ...contextDetail.llm_execution,
        source_id: docId,
        document_type_id: docType,
        document_type_label: DOC_TYPE_NAMES[docType] ?? docType,
      }] : []),
      createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'triagem',
        agent_name: 'Triagem',
        model: triageResult.model,
        tokens_in: triageResult.tokens_in,
        tokens_out: triageResult.tokens_out,
        cost_usd: triageResult.cost_usd,
        duration_ms: triageResult.duration_ms,
        document_type_id: docType,
      }),
      // Acervo agents (conditionally included)
      ...(buscadorResult ? [createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'acervo_buscador',
        agent_name: 'Buscador de Acervo',
        model: buscadorResult.model,
        tokens_in: buscadorResult.tokens_in,
        tokens_out: buscadorResult.tokens_out,
        cost_usd: buscadorResult.cost_usd,
        duration_ms: buscadorResult.duration_ms,
        document_type_id: docType,
      })] : []),
      ...(compiladorResult ? [createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'acervo_compilador',
        agent_name: 'Compilador de Base',
        model: compiladorResult.model,
        tokens_in: compiladorResult.tokens_in,
        tokens_out: compiladorResult.tokens_out,
        cost_usd: compiladorResult.cost_usd,
        duration_ms: compiladorResult.duration_ms,
        document_type_id: docType,
      })] : []),
      ...(revisorBaseResult ? [createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'acervo_revisor',
        agent_name: 'Revisor de Base',
        model: revisorBaseResult.model,
        tokens_in: revisorBaseResult.tokens_in,
        tokens_out: revisorBaseResult.tokens_out,
        cost_usd: revisorBaseResult.cost_usd,
        duration_ms: revisorBaseResult.duration_ms,
        document_type_id: docType,
      })] : []),
      createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'pesquisador',
        agent_name: 'Pesquisador',
        model: pesquisaResult.model,
        tokens_in: pesquisaResult.tokens_in,
        tokens_out: pesquisaResult.tokens_out,
        cost_usd: pesquisaResult.cost_usd,
        duration_ms: pesquisaResult.duration_ms,
        document_type_id: docType,
      }),
      createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'jurista',
        agent_name: 'Jurista',
        model: juristaResult.model,
        tokens_in: juristaResult.tokens_in,
        tokens_out: juristaResult.tokens_out,
        cost_usd: juristaResult.cost_usd,
        duration_ms: juristaResult.duration_ms,
        document_type_id: docType,
      }),
      createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'advogado_diabo',
        agent_name: 'Advogado do Diabo',
        model: criticaResult.model,
        tokens_in: criticaResult.tokens_in,
        tokens_out: criticaResult.tokens_out,
        cost_usd: criticaResult.cost_usd,
        duration_ms: criticaResult.duration_ms,
        document_type_id: docType,
      }),
      createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'jurista_v2',
        agent_name: 'Jurista v2',
        model: juristaV2Result.model,
        tokens_in: juristaV2Result.tokens_in,
        tokens_out: juristaV2Result.tokens_out,
        cost_usd: juristaV2Result.cost_usd,
        duration_ms: juristaV2Result.duration_ms,
        document_type_id: docType,
      }),
      createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'fact_checker',
        agent_name: 'Fact-checker',
        model: factCheckResult.model,
        tokens_in: factCheckResult.tokens_in,
        tokens_out: factCheckResult.tokens_out,
        cost_usd: factCheckResult.cost_usd,
        duration_ms: factCheckResult.duration_ms,
        document_type_id: docType,
      }),
      createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'moderador',
        agent_name: 'Moderador',
        model: planoResult.model,
        tokens_in: planoResult.tokens_in,
        tokens_out: planoResult.tokens_out,
        cost_usd: planoResult.cost_usd,
        duration_ms: planoResult.duration_ms,
        document_type_id: docType,
      }),
      createUsageExecutionRecord({
        source_type: 'document_generation',
        source_id: docId,
        phase: 'redacao',
        agent_name: 'Redator',
        model: docResult.model,
        tokens_in: docResult.tokens_in,
        tokens_out: docResult.tokens_out,
        cost_usd: docResult.cost_usd,
        duration_ms: docResult.duration_ms,
        document_type_id: docType,
      }),
    ]
    const allResults = [
      triageResult,
      ...(buscadorResult ? [buscadorResult] : []),
      ...(compiladorResult ? [compiladorResult] : []),
      ...(revisorBaseResult ? [revisorBaseResult] : []),
      pesquisaResult, juristaResult, criticaResult,
      juristaV2Result, factCheckResult, planoResult, docResult,
    ]
    const llm_tokens_in  = allResults.reduce((s, r) => s + r.tokens_in,  0)
    const llm_tokens_out = allResults.reduce((s, r) => s + r.tokens_out, 0)
    const llm_cost_usd   = parseFloat(allResults.reduce((s, r) => s + r.cost_usd, 0).toFixed(6))
    const usage_summary = buildUsageSummary(llmExecutions)

    // 10. Quality evaluation — run document-type-specific rules
    onProgress?.({ phase: 'qualidade', message: 'Avaliando qualidade do documento...', percent: 93 })
    const qualityResult = evaluateQuality(docResult.content, docType, { tema })
    const quality_score = qualityResult.score

    // 11. Save the generated text
    onProgress?.({ phase: 'salvando', message: 'Salvando documento...', percent: 95 })
    await updateDoc(docRef, {
      texto_completo: docResult.content,
      status: 'concluido',
      quality_score,
      llm_tokens_in,
      llm_tokens_out,
      llm_cost_usd,
      llm_executions: llmExecutions,
      usage_summary,
      updated_at: new Date().toISOString(),
    })

    onProgress?.({ phase: 'concluido', message: 'Documento gerado com sucesso!', percent: 100 })
  } catch (err) {
    // Update status to error
    await updateDoc(docRef, {
      status: 'erro',
      updated_at: new Date().toISOString(),
    }).catch(() => {}) // Ignore update errors
    throw err
  }
}

// ── Context Detail — AI-assisted context enrichment ──────────────────────────

/**
 * Generate targeted context questions for a document request.
 *
 * This is an optional pre-generation step where an AI agent analyses
 * the request, document type and legal areas to produce 3-10 clarifying
 * questions that help the user refine the document brief.
 *
 * @returns Object with analysis_summary, questions array, and LLM usage record
 */
export async function generateContextQuestions(
  docType: string,
  request: string,
  areas: string[],
): Promise<{ analysis_summary: string; questions: ContextDetailQuestion[]; llm_execution: UsageExecutionRecord }> {
  const apiKey = await getOpenRouterKey()
  const contextDetailModels = await loadContextDetailModels()
  const model = contextDetailModels.context_detail ?? 'anthropic/claude-sonnet-4'

  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const areaNames = areas.map(a => AREA_NAMES[a] ?? a).filter(Boolean).join(', ')

  const systemPrompt = [
    `Você é um ANALISTA JURÍDICO SÊNIOR especialista em ${typeName}.`,
    '',
    'Sua função é realizar uma análise preliminar abrangente da solicitação do usuário,',
    'considerando o tipo de documento, as áreas do direito envolvidas e todos os aspectos',
    'jurídicos relevantes. A partir dessa análise, você deve formular perguntas direcionadas',
    'ao usuário para esclarecer pontos fundamentais que impactarão a qualidade do documento.',
    '',
    'INSTRUÇÕES:',
    '1. Analise a solicitação identificando TODOS os pontos jurídicos relevantes',
    '2. Identifique os caminhos de fundamentação possíveis',
    '3. Formule entre 3 e 10 perguntas OBJETIVAS e RELEVANTES',
    '4. Cada pergunta deve abordar um ponto específico que pode alterar o rumo da fundamentação',
    '5. As perguntas devem ser claras e diretas, facilitando a resposta do usuário',
    '6. Considere aspectos como: fatos específicos do caso, enquadramento legal,',
    '   princípios aplicáveis, jurisprudência relevante, resultados esperados,',
    '   circunstâncias atenuantes/agravantes, e quaisquer nuances que possam ser relevantes',
    '',
    'Responda APENAS em JSON válido no seguinte formato:',
    '{',
    '  "analysis_summary": "Resumo da análise preliminar em 2-4 frases, explicando os principais pontos identificados",',
    '  "questions": [',
    '    {',
    '      "id": "q1",',
    '      "question": "Texto da pergunta objetiva e clara"',
    '    }',
    '  ]',
    '}',
  ].join('\n')

  const userPrompt = [
    `<tipo_documento>${typeName}</tipo_documento>`,
    areaNames ? `<areas_direito>${areaNames}</areas_direito>` : '',
    `<solicitacao>${request}</solicitacao>`,
    '',
    'Realize a análise preliminar e formule as perguntas conforme instruído.',
    'Responda APENAS em JSON válido.',
  ].filter(Boolean).join('\n')

  const result = await callLLM(apiKey, systemPrompt, userPrompt, model, 3000, 0.3)

  // Parse the JSON response
  let analysis_summary = ''
  let questions: ContextDetailQuestion[] = []

  try {
    // Strip markdown code fences if present
    let content = result.content.trim()
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    }
    const parsed = JSON.parse(content)
    analysis_summary = parsed.analysis_summary || ''
    if (Array.isArray(parsed.questions)) {
      questions = parsed.questions
        .filter((q: { id?: string; question?: string }) => q && q.question)
        .map((q: { id?: string; question?: string }, idx: number) => ({
          id: q.id || `q${idx + 1}`,
          question: q.question!,
          answer: '',
        }))
    }
  } catch {
    // If JSON parsing fails, try to extract questions from plain text
    analysis_summary = 'Análise realizada (formato simplificado).'
    const lines = result.content.split('\n').filter(l => l.trim())
    questions = lines
      .filter(l => l.match(/^\d+[\.\)]/))
      .slice(0, 10)
      .map((l, idx) => ({
        id: `q${idx + 1}`,
        question: l.replace(/^\d+[\.\)]\s*/, '').trim(),
        answer: '',
      }))
  }

  // Ensure at least 3 questions
  if (questions.length < 3) {
    throw new Error(`O agente gerou apenas ${questions.length} pergunta(s), mas são necessárias pelo menos 3. Tente novamente.`)
  }

  const llm_execution = createUsageExecutionRecord({
    source_type: 'context_detail',
    source_id: 'pre_generation',
    phase: 'context_detail',
    agent_name: 'Detalhamento de Contexto',
    model: result.model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    cost_usd: result.cost_usd,
    duration_ms: result.duration_ms,
  })

  return { analysis_summary, questions, llm_execution }
}
