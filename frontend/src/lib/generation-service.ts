/**
 * Client-side document generation service — Multi-agent pipeline.
 *
 * When IS_FIREBASE = true (no backend), this service handles the full
 * document generation pipeline directly in the browser via OpenRouter:
 *
 * Pipeline stages (mirrors backend orchestrator):
 * 1. Triagem       — Extract structured info (Haiku, fast)
 * 2. Pesquisador   — Legal research synthesis (Sonnet)
 * 3. Jurista       — Initial thesis development (Sonnet)
 * 4. Advogado Diabo — Counter-arguments critique (Sonnet)
 * 5. Jurista v2    — Refined theses after critique (Sonnet)
 * 6. Fact-checker  — Verify legal citations (Haiku, strict)
 * 7. Moderador     — Outline/plan the final document (Sonnet)
 * 8. Redator       — Write the full document (Sonnet, 10k tokens)
 *
 * The API key is read from Firestore /settings/platform (admin-only).
 */

import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { firestore } from './firebase'
import { callLLM } from './llm-client'
import { loadAgentModels, type AgentModelMap } from './model-config'
import { listTheses, getAcervoContext, type ThesisData } from './firestore-service'
import { extractAndStoreTheses } from './thesis-extractor'

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
): string {
  const areaNames = areas.map(a => AREA_NAMES[a] ?? a).join(', ')
  const parts = [`<solicitacao>${request}</solicitacao>`]
  if (areaNames) parts.push(`<areas>${areaNames}</areas>`)
  if (context && Object.keys(context).length > 0) {
    parts.push(`<contexto>${JSON.stringify(context)}</contexto>`)
  }
  parts.push('Analise a solicitação e extraia as informações. Responda APENAS em JSON.')
  return parts.join('\n')
}

function buildRedatorSystem(
  docType: string,
  tema: string,
  profile?: UserProfileForGeneration | null,
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
    '</estrutura>',
    '',
    '<conectivos>',
    'USE conectivos VARIADOS. Cada conectivo NO MÁXIMO 2x:',
    'Nesse sentido | Outrossim | Com efeito | Nessa esteira | Dessa sorte |',
    'Ademais | Importa destacar | Cumpre observar | De outro lado | Por sua vez |',
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
  if (pesquisa) parts.push(`<pesquisa>${pesquisa}</pesquisa>`)
  if (tesesVerificadas) parts.push(`<teses_verificadas>${tesesVerificadas}</teses_verificadas>`)
  if (plano) parts.push(`<plano>${plano}</plano>`)
  parts.push(
    `Redija ${typeName} COMPLETO sobre o tema indicado na triagem.`,
    'Siga a estrutura exigida. Texto puro, sem markdown.',
    'OBRIGATÓRIO: TRANSCREVA entre aspas todos os artigos de lei citados.',
    'OBRIGATÓRIO: TRANSCREVA entre aspas todos os enunciados de súmulas citadas.',
    'OBRIGATÓRIO: Para cada referência doutrinária, inclua autor, obra e posição.',
    'A fundamentação deve ser DENSA, PROFUNDA e com citações PRECISAS.',
    'Separe cada parágrafo com linha em branco.',
  )
  return parts.join('\n')
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

function buildModeradorSystem(docType: string, tema: string, profile?: UserProfileForGeneration | null): string {
  const typeName = DOC_TYPE_NAMES[docType] ?? docType
  const profileBlock = buildProfileBlock(profile)
  return [
    `Você é MODERADOR/PLANEJADOR especialista em ${typeName}.`,
    '',
    `Tema: "${tema}"`,
    profileBlock,
    '',
    `Com base em toda a pesquisa e teses verificadas, elabore um PLANO DETALHADO para ${typeName}:`,
    '',
    '1. ESTRUTURA do documento (seções e subseções com títulos descritivos)',
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

    // 2. Triage — extract structured info from the request
    onProgress?.({ phase: 'triagem', message: 'Analisando solicitação...', percent: 5 })
    const triageResult = await callLLM(
      apiKey,
      buildTriageSystem(docType),
      buildTriageUser(request, areas, context),
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

    // 2b. Load knowledge base — theses + acervo documents
    onProgress?.({ phase: 'pesquisador', message: 'Carregando base de conhecimento...', percent: 10 })
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

    // Load acervo reference documents
    try {
      const acervoContext = await getAcervoContext(uid, MAX_ACERVO_CONTEXT_CHARS)
      if (acervoContext) {
        knowledgeBase += `<acervo_referencia>\n${acervoContext}\n</acervo_referencia>\n\n`
      }
    } catch (e) {
      console.warn('Failed to load acervo context:', e)
    }

    // 3. Pesquisador — legal research synthesis
    onProgress?.({ phase: 'pesquisador', message: 'Pesquisando legislação e jurisprudência...', percent: 15 })
    const pesquisadorUserParts = [
      `<triagem>${triageResult.content}</triagem>`,
      `<solicitacao>${request}</solicitacao>`,
    ]
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
      'Realize pesquisa jurídica EXAUSTIVA sobre o tema. TRANSCREVA artigos de lei entre aspas. Inclua legislação com texto dos dispositivos, jurisprudência com enunciados de súmulas, doutrina com autor e obra, e princípios constitucionais.',
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
      buildModeradorSystem(docType, tema, profile),
      `<pesquisa>${pesquisaResult.content}</pesquisa>\n<teses_verificadas>${factCheckResult.content}</teses_verificadas>\nElabore plano DETALHADO. Para cada seção, especifique: artigos de lei a TRANSCREVER, súmulas com ENUNCIADO COMPLETO, doutrina com AUTOR e OBRA, princípios com ARTIGO DA CF.`,
      modelModerador, 3000, 0.2,
    )

    // 9. Redator — write the full document
    onProgress?.({ phase: 'redacao', message: 'Redigindo documento completo...', percent: 82 })
    const docResult = await callLLM(
      apiKey,
      buildRedatorSystem(docType, tema, profile),
      buildRedatorUser(
        docType, request, triageResult.content, areas, context,
        pesquisaResult.content, factCheckResult.content, planoResult.content,
      ),
      modelRedator, 12000, 0.3,
    )

    // 10. Save the generated text
    onProgress?.({ phase: 'salvando', message: 'Salvando documento...', percent: 95 })
    await updateDoc(docRef, {
      texto_completo: docResult.content,
      status: 'concluido',
      quality_score: 80,
      updated_at: new Date().toISOString(),
    })

    // 11. Auto-extract theses from the generated document (fire-and-forget)
    extractAndStoreTheses(apiKey, uid, docResult.content, {
      legalAreaId: areas[0] || 'geral',
      documentTypeId: docType,
      sourceType: 'auto_extracted',
    }).then(result => {
      if (result.created > 0 || result.merged > 0) {
        console.info(`Auto-extracted theses from document ${docId}: ${result.created} new, ${result.merged} merged`)
      }
    }).catch(err => {
      console.warn('Auto thesis extraction failed (non-fatal):', err)
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
