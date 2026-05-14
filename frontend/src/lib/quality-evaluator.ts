/**
 * Client-side document quality evaluator.
 *
 * Mirrors the backend quality rules from each document_type quality_rules.py
 * so that documents generated via the frontend pipeline get realistic scores
 * instead of a hardcoded placeholder.
 *
 * Each document type has its own set of weighted rules. The final score is
 * computed as: (earned_weight / total_weight) × 100.
 */

import type { PresentationV2Deck, PresentationV2Slide } from './firestore-types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QualityRule {
  id: string
  description: string
  check: (text: string, ctx: EvalContext) => boolean
  weight: number
}

export interface EvalContext {
  tema?: string
  [key: string]: unknown
}

export interface QualityResult {
  score: number
  passed: string[]
  failed: string[]
}

export type PresentationV2RepairAgent =
  | 'presentation_v2_slide_writer'
  | 'presentation_v2_content_architect'
  | 'presentation_v2_visual_director'
  | 'presentation_v2_data_diagrammer'

export interface PresentationV2RubricCategoryScore {
  key: 'completeness' | 'density' | 'transition' | 'clarity' | 'objective_coverage' | 'audience_fit' | 'speaker_notes' | 'narrative_consistency' | 'repetition'
  label: string
  score: number
  reasons: string[]
}

export interface PresentationV2SlideQualityResult {
  slideNumber: number
  score: number
  status: 'ok' | 'repair' | 'critical'
  strengths: string[]
  warnings: string[]
  repairHints: string[]
  recommendedAgents: PresentationV2RepairAgent[]
  categories: PresentationV2RubricCategoryScore[]
}

export interface PresentationV2DeckQualityResult {
  score: number
  status: 'ok' | 'repair' | 'critical'
  strengths: string[]
  warnings: string[]
  slideThreshold: number
  deckThreshold: number
  slidesBelowThreshold: number[]
  repairableSlides: number[]
  repairTargets: PresentationV2SlideQualityResult[]
  slideRubric: PresentationV2SlideQualityResult[]
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function checkConnectives(text: string): boolean {
  const conectivos = [
    'nesse sentido', 'outrossim', 'com efeito', 'nessa esteira',
    'dessa sorte', 'ademais', 'importa destacar', 'cumpre observar',
    'de outro lado', 'por sua vez', 'nessa perspectiva', 'destarte',
    'vale dizer', 'em suma', 'assim sendo', 'convém ressaltar',
    'sob essa ótica', 'de igual modo',
  ]
  const lower = text.toLowerCase()
  return !conectivos.some(c => countOccurrences(lower, c) > 2)
}

function checkTemaRelevance(text: string, ctx: EvalContext): boolean {
  const tema = ctx.tema ?? ''
  if (!tema) return true
  const words = tema.split(/\s+/).filter(w => w.length > 3).map(w => w.toLowerCase())
  if (words.length === 0) return true
  const lower = text.toLowerCase()
  const matches = words.filter(w => lower.includes(w)).length
  return matches >= words.length * 0.5
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++
    pos += needle.length
  }
  return count
}

function hasAny(text: string, terms: string[], caseSensitive = false): boolean {
  const t = caseSensitive ? text : text.toLowerCase()
  return terms.some(term => t.includes(caseSensitive ? term : term.toLowerCase()))
}

function hasAnyUpper(text: string, terms: string[]): boolean {
  const upper = text.toUpperCase()
  return terms.some(term => upper.includes(term))
}

// ── Parecer rules ─────────────────────────────────────────────────────────────

function checkNoInventedJurisprudence(text: string): boolean {
  const pattern = /\b(?:REsp|RE|MS|HC|RMS|AgRg)\s+[\d.]+\/[A-Z]{2}/g
  const suspicious = text.match(pattern) ?? []
  const sourcesCount = countOccurrences(text, '[Fonte:')
  return !(suspicious.length > 2 && sourcesCount === 0)
}

const PARECER_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'Parecer deve ter pelo menos 3000 caracteres',
    check: (text) => text.length >= 3000,
    weight: 10,
  },
  {
    id: 'has_relatorio',
    description: 'Deve conter seção RELATÓRIO',
    check: (text) => hasAnyUpper(text, ['RELATÓRIO', 'RELATORIO']),
    weight: 10,
  },
  {
    id: 'has_fundamentacao',
    description: 'Deve conter seção FUNDAMENTAÇÃO JURÍDICA',
    check: (text) => hasAnyUpper(text, ['FUNDAMENTAÇÃO', 'FUNDAMENTACAO']),
    weight: 10,
  },
  {
    id: 'has_conclusao',
    description: 'Deve conter seção CONCLUSÃO',
    check: (text) => hasAnyUpper(text, ['CONCLUSÃO', 'CONCLUSAO']),
    weight: 10,
  },
  {
    id: 'has_closing',
    description: "Deve terminar com 'É o parecer, salvo melhor juízo.'",
    check: (text) => text.toLowerCase().includes('salvo melhor juízo'),
    weight: 8,
  },
  {
    id: 'has_legal_basis',
    description: 'Deve citar base legal (art., lei, decreto, CF, súmula)',
    check: (text) => hasAny(text, ['art.', 'lei ', 'decreto', 'constituição', 'súmula', 'inciso']),
    weight: 12,
  },
  {
    id: 'no_lei_8666',
    description: 'Lei 8.666/93 está REVOGADA — não deve ser citada',
    check: (text) => !text.includes('8.666'),
    weight: 10,
  },
  {
    id: 'no_truncation',
    description: 'Sem frases truncadas no final',
    check: (text) => { const t = text.trimEnd(); return !t.endsWith('...') && !t.endsWith('…') },
    weight: 5,
  },
  {
    id: 'has_sources',
    description: 'Deve conter pelo menos 3 referências [Fonte:]',
    check: (text) => countOccurrences(text, '[Fonte:') >= 3,
    weight: 10,
  },
  {
    id: 'connective_variety',
    description: 'Conectivos variados (nenhum repetido 3+ vezes)',
    check: (text) => checkConnectives(text),
    weight: 5,
  },
  {
    id: 'proper_paragraphs',
    description: 'Deve ter pelo menos 8 parágrafos',
    check: (text) => countOccurrences(text, '\n\n') >= 8,
    weight: 5,
  },
  {
    id: 'tema_relevance',
    description: 'Tema deve aparecer no texto (relevância)',
    check: (text, ctx) => checkTemaRelevance(text, ctx),
    weight: 10,
  },
  {
    id: 'no_invented_jurisprudence',
    description: 'Não deve conter jurisprudência com padrão suspeito',
    check: (text) => checkNoInventedJurisprudence(text),
    weight: 5,
  },
]

// ── Petição Inicial rules ─────────────────────────────────────────────────────

function checkQualificacao(text: string): boolean {
  const lower = text.toLowerCase()
  const hasAuthor = hasAny(lower, ['autor', 'requerente', 'demandante', 'suplicante', 'postulante'])
  const hasData = hasAny(lower, ['cpf', 'cnpj', 'inscrito', 'portador', 'residente', 'domiciliado',
    'nacionalidade', 'estado civil', 'profissão', 'profissao'])
  return hasAuthor && hasData
}

function checkArgumentativeStructure(text: string): boolean {
  const markers = [
    'portanto', 'dessa forma', 'assim', 'logo', 'consequentemente',
    'por conseguinte', 'ante o exposto', 'diante do exposto',
    'posto isso', 'nesse contexto', 'sendo assim',
  ]
  const lower = text.toLowerCase()
  return markers.filter(m => lower.includes(m)).length >= 2
}

const PETICAO_INICIAL_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'Petição deve ter pelo menos 3000 caracteres',
    check: (text) => text.length >= 3000,
    weight: 10,
  },
  {
    id: 'has_qualificacao_partes',
    description: 'Deve conter qualificação das partes (autor/réu)',
    check: (text) => checkQualificacao(text),
    weight: 12,
  },
  {
    id: 'has_competencia',
    description: 'Deve fundamentar a competência do juízo',
    check: (text) => hasAnyUpper(text, ['COMPETÊNCIA', 'COMPETENCIA', 'COMPETENTE']),
    weight: 8,
  },
  {
    id: 'has_valor_causa',
    description: 'Deve indicar valor da causa (CPC art. 292)',
    check: (text) => hasAnyUpper(text, [
      'VALOR DA CAUSA', 'DÁ-SE À CAUSA O VALOR', 'DA-SE A CAUSA O VALOR',
      'ATRIBUI-SE À CAUSA', 'ATRIBUI-SE A CAUSA',
    ]),
    weight: 10,
  },
  {
    id: 'has_fatos',
    description: 'Deve conter seção DOS FATOS ou DA NARRATIVA FÁTICA',
    check: (text) => hasAnyUpper(text, [
      'DOS FATOS', 'DA NARRATIVA FÁTICA', 'DA NARRATIVA FATICA',
      'DOS FATOS E FUNDAMENTOS', 'DA SÍNTESE FÁTICA', 'DA SINTESE FATICA',
    ]),
    weight: 10,
  },
  {
    id: 'has_direito',
    description: 'Deve conter seção DO DIREITO ou DA FUNDAMENTAÇÃO JURÍDICA',
    check: (text) => hasAnyUpper(text, [
      'DO DIREITO', 'DA FUNDAMENTAÇÃO JURÍDICA', 'DA FUNDAMENTACAO JURIDICA',
      'DOS FUNDAMENTOS JURÍDICOS', 'DOS FUNDAMENTOS JURIDICOS',
    ]),
    weight: 10,
  },
  {
    id: 'has_pedidos',
    description: 'Deve conter seção DOS PEDIDOS com pedidos claros',
    check: (text) => hasAnyUpper(text, ['DOS PEDIDOS', 'DO PEDIDO', 'REQUER', 'REQUERER']),
    weight: 12,
  },
  {
    id: 'has_legal_basis',
    description: 'Deve citar base legal (art., lei, CPC, CF)',
    check: (text) => hasAny(text, ['art.', 'lei ', 'decreto', 'constituição', 'súmula', 'cpc']),
    weight: 10,
  },
  {
    id: 'has_cpc_reference',
    description: 'Deve referenciar o CPC/2015 (arts. 319-320)',
    check: (text) => hasAny(text, ['cpc', 'código de processo civil', 'codigo de processo civil']),
    weight: 5,
  },
  {
    id: 'has_closing',
    description: 'Deve conter fecho (Termos em que pede deferimento)',
    check: (text) => hasAny(text, ['pede deferimento', 'nestes termos', 'termos em que']),
    weight: 8,
  },
  {
    id: 'no_lei_8666',
    description: 'Lei 8.666/93 está REVOGADA — não deve ser citada',
    check: (text) => !text.includes('8.666'),
    weight: 10,
  },
  {
    id: 'no_truncation',
    description: 'Sem frases truncadas no final',
    check: (text) => { const t = text.trimEnd(); return !t.endsWith('...') && !t.endsWith('…') },
    weight: 5,
  },
  {
    id: 'has_sources',
    description: 'Deve conter pelo menos 2 referências [Fonte:]',
    check: (text) => countOccurrences(text, '[Fonte:') >= 2,
    weight: 8,
  },
  {
    id: 'connective_variety',
    description: 'Conectivos variados (nenhum repetido 3+ vezes)',
    check: (text) => checkConnectives(text),
    weight: 5,
  },
  {
    id: 'proper_paragraphs',
    description: 'Deve ter pelo menos 8 parágrafos separados',
    check: (text) => countOccurrences(text, '\n\n') >= 8,
    weight: 5,
  },
  {
    id: 'argumentative_structure',
    description: 'Deve ter estrutura argumentativa lógica',
    check: (text) => checkArgumentativeStructure(text),
    weight: 8,
  },
  {
    id: 'tema_relevance',
    description: 'Tema deve aparecer no texto (relevância)',
    check: (text, ctx) => checkTemaRelevance(text, ctx),
    weight: 5,
  },
]

// ── Contestação rules ─────────────────────────────────────────────────────────

function checkImpugnacaoEspecifica(text: string): boolean {
  const markers = [
    'impugna', 'nega', 'refuta', 'rebate', 'contesta',
    'não procede', 'nao procede', 'sem fundamento',
    'carece de veracidade', 'inverídico', 'inveridico',
    'não corresponde', 'nao corresponde', 'alegação improcedente',
    'alegacao improcedente', 'ponto a ponto', 'especificamente',
    'impugnação específica', 'impugnacao especifica',
  ]
  const lower = text.toLowerCase()
  return markers.filter(m => lower.includes(m)).length >= 3
}

function checkCpcDefenseArticles(text: string): boolean {
  const lower = text.toLowerCase()
  return [335, 336, 337, 338, 339, 340, 341, 342].some(n =>
    new RegExp(`art\\.?\\s*${n}`).test(lower),
  )
}

const CONTESTACAO_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'Contestação deve ter pelo menos 3000 caracteres',
    check: (text) => text.length >= 3000,
    weight: 10,
  },
  {
    id: 'has_sintese_inicial',
    description: 'Deve conter seção DA SÍNTESE DA INICIAL ou DOS FATOS',
    check: (text) => hasAnyUpper(text, ['SÍNTESE DA INICIAL', 'SINTESE DA INICIAL', 'DOS FATOS']),
    weight: 10,
  },
  {
    id: 'has_preliminares',
    description: 'Deve conter seção DAS PRELIMINARES (art. 337 CPC)',
    check: (text) => text.toUpperCase().includes('PRELIMINAR'),
    weight: 8,
  },
  {
    id: 'has_merito',
    description: 'Deve conter seção DO MÉRITO',
    check: (text) => hasAnyUpper(text, ['MÉRITO', 'MERITO']),
    weight: 12,
  },
  {
    id: 'has_pedidos',
    description: 'Deve conter seção DOS PEDIDOS ou DO PEDIDO',
    check: (text) => text.toUpperCase().includes('PEDIDO'),
    weight: 10,
  },
  {
    id: 'impugnacao_especifica',
    description: 'Deve conter impugnação específica dos fatos (art. 341 CPC)',
    check: (text) => checkImpugnacaoEspecifica(text),
    weight: 12,
  },
  {
    id: 'has_legal_basis',
    description: 'Deve citar base legal (art., lei, CPC, CF, CC, CDC)',
    check: (text) => hasAny(text, ['art.', 'lei ', 'código de processo civil', 'cpc', 'constituição', 'súmula']),
    weight: 12,
  },
  {
    id: 'cpc_reference',
    description: 'Deve fazer referência ao CPC/2015 (arts. 335-342)',
    check: (text) => checkCpcDefenseArticles(text),
    weight: 8,
  },
  {
    id: 'has_closing_request',
    description: 'Deve conter pedido de improcedência dos pedidos do autor',
    check: (text) => hasAny(text, [
      'improcedência', 'improcedencia',
      'julgar improcedente', 'total improcedência',
      'improcedentes os pedidos',
    ]),
    weight: 10,
  },
  {
    id: 'no_lei_8666',
    description: 'Lei 8.666/93 está REVOGADA — não deve ser citada',
    check: (text) => !text.includes('8.666'),
    weight: 10,
  },
  {
    id: 'no_truncation',
    description: 'Sem frases truncadas no final',
    check: (text) => { const t = text.trimEnd(); return !t.endsWith('...') && !t.endsWith('…') },
    weight: 5,
  },
  {
    id: 'has_sources',
    description: 'Deve conter pelo menos 2 referências [Fonte:]',
    check: (text) => countOccurrences(text, '[Fonte:') >= 2,
    weight: 8,
  },
  {
    id: 'connective_variety',
    description: 'Conectivos variados (nenhum repetido 3+ vezes)',
    check: (text) => checkConnectives(text),
    weight: 5,
  },
  {
    id: 'proper_paragraphs',
    description: 'Deve ter pelo menos 8 parágrafos separados',
    check: (text) => countOccurrences(text, '\n\n') >= 8,
    weight: 5,
  },
  {
    id: 'counter_evidence',
    description: 'Deve conter referências a provas ou evidências de defesa',
    check: (text) => hasAny(text, [
      'prova', 'documento', 'testemunha', 'perícia',
      'evidência', 'evidencia', 'comprovação', 'comprovacao',
    ]),
    weight: 8,
  },
  {
    id: 'tema_relevance',
    description: 'Tema deve aparecer no texto (relevância)',
    check: (text, ctx) => checkTemaRelevance(text, ctx),
    weight: 5,
  },
]

// ── Recurso rules ─────────────────────────────────────────────────────────────

function checkLegalCitations(text: string): boolean {
  const lower = text.toLowerCase()
  const patterns = [
    /art\.\s*\d+/,
    /artigo\s+\d+/,
    /lei\s+(?:n[.ºo°]\s*)?\d+/,
    /súmula\s+(?:n[.ºo°]\s*)?\d+/,
    /sumula\s+(?:n[.ºo°]\s*)?\d+/,
    /constituição\s+federal/,
    /constituicao\s+federal/,
    /decreto/,
  ]
  return patterns.filter(p => p.test(lower)).length >= 2
}

function checkPrequestionamento(text: string): boolean {
  const upper = text.toUpperCase()
  const targetsSuperior = ['STF', 'STJ', 'RECURSO ESPECIAL', 'RECURSO EXTRAORDINÁRIO', 'RECURSO EXTRAORDINARIO']
    .some(t => upper.includes(t))
  if (!targetsSuperior) return true
  return hasAny(text, ['prequestion', 'prequestiona', 'prequestionamento'])
}

const RECURSO_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'Recurso deve ter pelo menos 2500 caracteres',
    check: (text) => text.length >= 2500,
    weight: 10,
  },
  {
    id: 'identifies_recurso_type',
    description: 'Deve identificar o tipo de recurso',
    check: (text) => hasAnyUpper(text, ['APELAÇÃO', 'APELACAO', 'AGRAVO', 'EMBARGOS']),
    weight: 12,
  },
  {
    id: 'has_tempestividade',
    description: 'Deve abordar tempestividade do recurso',
    check: (text) => hasAny(text, [
      'tempestiv', 'prazo', 'intempestiv',
      'dentro do prazo', 'no prazo legal',
      'dias úteis', 'dias uteis',
    ]),
    weight: 10,
  },
  {
    id: 'has_preparo',
    description: 'Deve fazer referência ao preparo recursal ou dispensa',
    check: (text) => hasAny(text, [
      'preparo', 'custas recursais', 'custas recursa',
      'guia de recolhimento', 'isento de preparo',
      'dispensado o preparo', 'gratuidade',
      'justiça gratuita', 'assistência judiciária',
    ]),
    weight: 8,
  },
  {
    id: 'demonstrates_error',
    description: 'Deve demonstrar erro na decisão recorrida',
    check: (text) => hasAny(text, [
      'erro', 'equívoco', 'equivoco',
      'decisão recorrida', 'sentença recorrida',
      'merece reforma', 'deve ser reformad',
      'mal apreciou', 'não observou',
      'violação', 'violacao', 'afronta',
      'contrari', 'ilegalidade',
    ]),
    weight: 12,
  },
  {
    id: 'has_prequestionamento',
    description: 'Deve conter prequestionamento quando aplicável',
    check: (text) => checkPrequestionamento(text),
    weight: 8,
  },
  {
    id: 'has_legal_citations',
    description: 'Deve citar dispositivos legais de fundamentação',
    check: (text) => checkLegalCitations(text),
    weight: 12,
  },
  {
    id: 'has_dos_fatos',
    description: 'Deve conter seção DOS FATOS ou equivalente',
    check: (text) => hasAnyUpper(text, [
      'DOS FATOS', 'DA SÍNTESE FÁTICA', 'DA SINTESE FATICA',
      'BREVE RELATO', 'DO RELATÓRIO', 'DO RELATORIO',
    ]),
    weight: 10,
  },
  {
    id: 'has_cabimento',
    description: 'Deve conter seção DO CABIMENTO ou DO DIREITO',
    check: (text) => hasAnyUpper(text, [
      'DO CABIMENTO', 'DA ADMISSIBILIDADE',
      'DO DIREITO', 'DAS RAZÕES', 'DAS RAZOES',
    ]),
    weight: 10,
  },
  {
    id: 'has_pedidos',
    description: 'Deve conter seção DOS PEDIDOS com requerimento de provimento',
    check: (text) => hasAnyUpper(text, ['DOS PEDIDOS', 'DO PEDIDO', 'REQUER', 'PROVIMENTO', 'PREQUESTIONA']),
    weight: 10,
  },
  {
    id: 'has_provimento_request',
    description: 'Deve conter pedido de provimento ou reforma explícito',
    check: (text) => hasAny(text, [
      'dar provimento', 'seja dado provimento',
      'reforma da', 'reformar a',
      'anular a', 'anulação da',
      'cassar a', 'cassação da',
      'seja reformada', 'seja anulada', 'seja cassada',
    ]),
    weight: 10,
  },
  {
    id: 'no_truncation',
    description: 'Sem frases truncadas no final',
    check: (text) => { const t = text.trimEnd(); return !t.endsWith('...') && !t.endsWith('…') },
    weight: 5,
  },
  {
    id: 'has_sources',
    description: 'Deve conter pelo menos 2 referências [Fonte:]',
    check: (text) => countOccurrences(text, '[Fonte:') >= 2,
    weight: 8,
  },
  {
    id: 'connective_variety',
    description: 'Conectivos variados (nenhum repetido 3+ vezes)',
    check: (text) => checkConnectives(text),
    weight: 5,
  },
  {
    id: 'proper_paragraphs',
    description: 'Deve ter pelo menos 6 parágrafos separados',
    check: (text) => countOccurrences(text, '\n\n') >= 6,
    weight: 5,
  },
  {
    id: 'no_lei_8666',
    description: 'Lei 8.666/93 está REVOGADA — não deve ser citada',
    check: (text) => !text.includes('8.666'),
    weight: 10,
  },
  {
    id: 'cpc_reference',
    description: 'Deve referenciar CPC/2015',
    check: (text) => hasAny(text, [
      'cpc', 'código de processo civil', 'codigo de processo civil',
      'lei 13.105', 'lei n. 13.105', 'lei nº 13.105',
    ]),
    weight: 8,
  },
  {
    id: 'tema_relevance',
    description: 'Tema deve aparecer no texto (relevância)',
    check: (text, ctx) => checkTemaRelevance(text, ctx),
    weight: 5,
  },
]

// ── Sentença rules ────────────────────────────────────────────────────────────

function checkRelatorioCompleto(text: string): boolean {
  const lower = text.toLowerCase()
  const hasParties = hasAny(lower, [
    'autor', 'autora', 'requerente', 'réu', 'ré', 'requerido', 'requerida',
  ])
  const hasContext = hasAny(lower, [
    'ação', 'inicial', 'contestação', 'pretensão', 'autos', 'processo',
  ])
  return hasParties && hasContext
}

function checkFundamentacaoAdequada(text: string): boolean {
  const lower = text.toLowerCase()
  const hasApplication = hasAny(lower, [
    'no caso concreto', 'no caso em tela', 'na hipótese',
    'in casu', 'aplica-se', 'verifica-se que', 'constata-se',
    'na espécie', 'no presente caso',
  ])
  const hasNorms = /art\.\s*\d+/.test(lower)
  return hasApplication && hasNorms
}

function checkDispositivoClaro(text: string): boolean {
  return hasAny(text, [
    'julgo procedente', 'julgo improcedente',
    'julgo parcialmente procedente', 'julgo extinto',
    'acolho o pedido', 'rejeito o pedido',
    'condeno', 'declaro', 'determino',
    'julgo procedentes', 'julgo improcedentes',
  ])
}

function checkCoerencia(text: string): boolean {
  const lower = text.toLowerCase()
  const fundPositive = hasAny(lower, ['restou comprovado', 'logrou êxito', 'demonstrou', 'ficou provado'])
  const dispPositive = hasAny(lower, ['julgo procedente', 'acolho', 'condeno'])
  const fundNegative = hasAny(lower, ['não comprovou', 'não demonstrou', 'não logrou', 'não restou'])
  const dispNegative = hasAny(lower, ['julgo improcedente', 'rejeito', 'julgo extinto'])
  if (fundPositive && dispNegative && !fundNegative) return false
  if (fundNegative && dispPositive && !fundPositive) return false
  return true
}

const SENTENCA_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'Sentença deve ter pelo menos 3000 caracteres',
    check: (text) => text.length >= 3000,
    weight: 10,
  },
  {
    id: 'has_relatorio_completo',
    description: 'Deve conter seção RELATÓRIO com identificação das partes',
    check: (text) =>
      hasAnyUpper(text, ['RELATÓRIO', 'RELATORIO']) && checkRelatorioCompleto(text),
    weight: 12,
  },
  {
    id: 'has_fundamentacao_adequada',
    description: 'Deve conter FUNDAMENTAÇÃO com enfrentamento dos argumentos (art. 489 §1º CPC)',
    check: (text) =>
      hasAnyUpper(text, ['FUNDAMENTAÇÃO', 'FUNDAMENTACAO']) && checkFundamentacaoAdequada(text),
    weight: 15,
  },
  {
    id: 'has_dispositivo_claro',
    description: 'Deve conter DISPOSITIVO com comando decisório claro',
    check: (text) =>
      hasAnyUpper(text, ['DISPOSITIVO', 'DISPOSIÇÃO']) && checkDispositivoClaro(text),
    weight: 15,
  },
  {
    id: 'coerencia_fundamentacao_dispositivo',
    description: 'Fundamentação e dispositivo devem ser coerentes',
    check: (text) => checkCoerencia(text),
    weight: 12,
  },
  {
    id: 'referencia_provas',
    description: 'Deve fazer referência às provas dos autos',
    check: (text) => hasAny(text, [
      'prova', 'provas', 'documento', 'testemunha', 'perícia',
      'laudo', 'certidão', 'atestado', 'depoimento', 'fls.',
      'folhas', 'autos', 'instrução processual',
    ]),
    weight: 10,
  },
  {
    id: 'custas_honorarios',
    description: 'Deve conter condenação em custas e honorários advocatícios',
    check: (text) =>
      hasAny(text, ['custas processuais', 'custas', 'despesas processuais']) &&
      hasAny(text, ['honorários advocatícios', 'honorários', 'verba honorária']),
    weight: 10,
  },
  {
    id: 'has_legal_basis',
    description: 'Deve citar base legal (art., lei, CPC, CF)',
    check: (text) => hasAny(text, ['art.', 'lei ', 'código de processo civil', 'cpc', 'constituição', 'súmula']),
    weight: 10,
  },
  {
    id: 'no_lei_8666',
    description: 'Lei 8.666/93 está REVOGADA — não deve ser citada',
    check: (text) => !text.includes('8.666'),
    weight: 8,
  },
  {
    id: 'no_truncation',
    description: 'Sem frases truncadas no final',
    check: (text) => { const t = text.trimEnd(); return !t.endsWith('...') && !t.endsWith('…') },
    weight: 5,
  },
  {
    id: 'connective_variety',
    description: 'Conectivos variados (nenhum repetido 3+ vezes)',
    check: (text) => checkConnectives(text),
    weight: 5,
  },
  {
    id: 'proper_paragraphs',
    description: 'Deve ter pelo menos 8 parágrafos separados',
    check: (text) => countOccurrences(text, '\n\n') >= 8,
    weight: 5,
  },
  {
    id: 'tema_relevance',
    description: 'Tema deve aparecer no texto (relevância)',
    check: (text, ctx) => checkTemaRelevance(text, ctx),
    weight: 5,
  },
]

// ── Ação Civil Pública rules ──────────────────────────────────────────────────

function checkLegitimidadeAtiva(text: string): boolean {
  const lower = text.toLowerCase()
  const hasSection = hasAny(lower, [
    'legitimidade', 'legitimado', 'art. 5', 'artigo 5',
    'lei 7.347', 'ministério público',
  ])
  const hasEntity = hasAny(lower, [
    'ministério público', 'mp', 'promotor', 'procurador',
    'defensoria', 'união', 'estado', 'município',
    'autarquia', 'empresa pública', 'fundação',
    'associação', 'sociedade de economia mista',
  ])
  return hasSection && hasEntity
}

function checkInteresseTransindividual(text: string): boolean {
  return hasAny(text, [
    'interesse difuso', 'interesses difusos',
    'interesse coletivo', 'interesses coletivos',
    'individual homogêneo', 'individuais homogêneos',
    'direito difuso', 'direitos difusos',
    'direito coletivo', 'direitos coletivos',
    'transindividual', 'transindividuais',
    'metaindividual', 'metaindividuais',
  ])
}

function checkTutelaAdequada(text: string): boolean {
  return hasAny(text, [
    'obrigação de fazer', 'obrigação de não fazer',
    'condenação em dinheiro', 'condenação pecuniária',
    'tutela específica', 'tutela inibitória',
    'tutela de remoção do ilícito',
    'tutela de urgência', 'tutela antecipada',
    'liminar', 'medida cautelar',
  ])
}

function checkDanoMoralColetivo(text: string, ctx: EvalContext): boolean {
  if (hasAny(text, [
    'dano moral coletivo', 'danos morais coletivos',
    'dano extrapatrimonial coletivo', 'indenização por dano moral',
  ])) return true
  const tema = (ctx.tema ?? '').toLowerCase()
  const requires = hasAny(tema, [
    'ambiental', 'meio ambiente', 'poluição', 'contaminação',
    'consumidor', 'propaganda enganosa', 'produto defeituoso',
    'saúde pública', 'patrimônio',
  ])
  return !requires
}

const ACP_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'ACP deve ter pelo menos 4000 caracteres',
    check: (text) => text.length >= 4000,
    weight: 10,
  },
  {
    id: 'legitimidade_ativa',
    description: 'Deve demonstrar legitimidade ativa do autor (art. 5º Lei 7.347/85)',
    check: (text) => checkLegitimidadeAtiva(text),
    weight: 15,
  },
  {
    id: 'competencia',
    description: 'Deve indicar a competência do juízo',
    check: (text) => hasAny(text, ['competência', 'competente', 'foro', 'comarca', 'art. 2', 'local do dano', 'juízo']),
    weight: 10,
  },
  {
    id: 'interesse_identificado',
    description: 'Deve identificar interesse difuso, coletivo ou individual homogêneo',
    check: (text) => checkInteresseTransindividual(text),
    weight: 15,
  },
  {
    id: 'inquerito_civil_reference',
    description: 'Deve fazer referência ao inquérito civil',
    check: (text) => hasAny(text, [
      'inquérito civil', 'inquerito civil',
      'ic n', 'ic nº',
      'procedimento preparatório', 'procedimento administrativo',
      'procedimento investigatório', 'notícia de fato',
    ]),
    weight: 10,
  },
  {
    id: 'tutela_adequada',
    description: 'Deve conter pedido de tutela adequada',
    check: (text) => checkTutelaAdequada(text),
    weight: 12,
  },
  {
    id: 'dano_moral_coletivo',
    description: 'Deve avaliar pedido de dano moral coletivo quando aplicável',
    check: (text, ctx) => checkDanoMoralColetivo(text, ctx),
    weight: 8,
  },
  {
    id: 'has_fatos',
    description: 'Deve conter seção DOS FATOS',
    check: (text) => hasAnyUpper(text, ['DOS FATOS', 'DA SITUAÇÃO FÁTICA', 'DO CONTEXTO FÁTICO']),
    weight: 10,
  },
  {
    id: 'has_direito',
    description: 'Deve conter seção DO DIREITO com fundamentação legal',
    check: (text) => hasAnyUpper(text, ['DO DIREITO', 'DA FUNDAMENTAÇÃO JURÍDICA', 'DO FUNDAMENTO JURÍDICO']),
    weight: 10,
  },
  {
    id: 'has_pedidos',
    description: 'Deve conter seção DOS PEDIDOS',
    check: (text) => text.toUpperCase().includes('PEDIDO'),
    weight: 12,
  },
  {
    id: 'has_legal_basis_acp',
    description: 'Deve citar Lei 7.347/85 (LACP)',
    check: (text) => text.includes('7.347'),
    weight: 12,
  },
  {
    id: 'has_cf_art129',
    description: 'Deve citar CF art. 129',
    check: (text) => text.includes('129') && hasAny(text, ['constituição', 'cf']),
    weight: 8,
  },
  {
    id: 'no_lei_8666',
    description: 'Lei 8.666/93 está REVOGADA — não deve ser citada',
    check: (text) => !text.includes('8.666'),
    weight: 8,
  },
  {
    id: 'no_truncation',
    description: 'Sem frases truncadas no final',
    check: (text) => { const t = text.trimEnd(); return !t.endsWith('...') && !t.endsWith('…') },
    weight: 5,
  },
  {
    id: 'has_sources',
    description: 'Deve conter pelo menos 2 referências [Fonte:]',
    check: (text) => countOccurrences(text, '[Fonte:') >= 2,
    weight: 8,
  },
  {
    id: 'connective_variety',
    description: 'Conectivos variados (nenhum repetido 3+ vezes)',
    check: (text) => checkConnectives(text),
    weight: 5,
  },
  {
    id: 'proper_paragraphs',
    description: 'Deve ter pelo menos 10 parágrafos separados',
    check: (text) => countOccurrences(text, '\n\n') >= 10,
    weight: 5,
  },
  {
    id: 'tema_relevance',
    description: 'Tema deve aparecer no texto (relevância)',
    check: (text, ctx) => checkTemaRelevance(text, ctx),
    weight: 5,
  },
]

// ── Agravo rules ──────────────────────────────────────────────────────────────

const AGRAVO_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'Agravo deve ter pelo menos 2500 caracteres',
    check: (text) => text.length >= 2500,
    weight: 10,
  },
  {
    id: 'has_decisao_agravada',
    description: 'Deve indicar decisão agravada',
    check: (text) => hasAnyUpper(text, ['DECISÃO AGRAVADA', 'DECISÃO RECORRIDA', 'DECISÃO INTERLOCUTÓRIA']),
    weight: 12,
  },
  {
    id: 'has_cabimento',
    description: 'Deve demonstrar cabimento (art. 1.015 CPC)',
    check: (text) => text.includes('1.015') || hasAnyUpper(text, ['CABIMENTO', 'HIPÓTESE']),
    weight: 12,
  },
  {
    id: 'has_fundamentacao',
    description: 'Deve conter fundamentação',
    check: (text) => hasAnyUpper(text, ['FUNDAMENTAÇÃO', 'RAZÕES', 'DO DIREITO']),
    weight: 10,
  },
  {
    id: 'has_pedido_efeito',
    description: 'Deve pedir efeito suspensivo ou antecipação de tutela recursal',
    check: (text) => hasAnyUpper(text, ['EFEITO SUSPENSIVO', 'TUTELA RECURSAL', 'ANTECIPAÇÃO']),
    weight: 10,
  },
  {
    id: 'has_pedido_provimento',
    description: 'Deve pedir provimento do recurso',
    check: (text) => hasAnyUpper(text, ['PROVIMENTO', 'REFORMA', 'CASSAÇÃO']),
    weight: 8,
  },
]

// ── Habeas Corpus rules ───────────────────────────────────────────────────────

const HC_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'HC deve ter pelo menos 2000 caracteres',
    check: (text) => text.length >= 2000,
    weight: 10,
  },
  {
    id: 'has_paciente',
    description: 'Deve identificar o paciente',
    check: (text) => text.toUpperCase().includes('PACIENTE'),
    weight: 15,
  },
  {
    id: 'has_autoridade_coatora',
    description: 'Deve indicar autoridade coatora',
    check: (text) => hasAnyUpper(text, ['AUTORIDADE COATORA', 'IMPETRADO']),
    weight: 12,
  },
  {
    id: 'has_constrangimento',
    description: 'Deve demonstrar constrangimento ilegal',
    check: (text) => hasAnyUpper(text, ['CONSTRANGIMENTO ILEGAL', 'ILEGALIDADE', 'COAÇÃO ILEGAL']),
    weight: 15,
  },
  {
    id: 'has_fundamento_legal',
    description: 'Deve citar fundamento legal',
    check: (text) => hasAnyUpper(text, ['ART.']) || hasAnyUpper(text, ['CPP', 'CF']) || text.includes('5º'),
    weight: 10,
  },
  {
    id: 'has_pedido_liminar',
    description: 'Deve conter pedido (liminar)',
    check: (text) => hasAnyUpper(text, ['LIMINAR', 'ORDEM', 'SALVO-CONDUTO']),
    weight: 8,
  },
]

// ── Embargos de Declaração rules ──────────────────────────────────────────────

const EMBARGOS_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'Embargos devem ter pelo menos 1500 caracteres',
    check: (text) => text.length >= 1500,
    weight: 10,
  },
  {
    id: 'has_decisao_embargada',
    description: 'Deve indicar decisão embargada',
    check: (text) => hasAnyUpper(text, ['DECISÃO EMBARGADA', 'ACÓRDÃO', 'SENTENÇA EMBARGADA']),
    weight: 12,
  },
  {
    id: 'has_vicio',
    description: 'Deve apontar omissão, contradição ou obscuridade',
    check: (text) => hasAnyUpper(text, ['OMISSÃO', 'CONTRADIÇÃO', 'OBSCURIDADE']),
    weight: 15,
  },
  {
    id: 'has_fundamentacao',
    description: 'Deve conter fundamentação',
    check: (text) => hasAnyUpper(text, ['FUNDAMENTAÇÃO']) || text.includes('1.022'),
    weight: 10,
  },
  {
    id: 'has_pedido',
    description: 'Deve conter pedido de sanação',
    check: (text) => hasAnyUpper(text, ['SANAR', 'ESCLARECER', 'SUPRIR', 'PEDIDO']),
    weight: 10,
  },
  {
    id: 'has_prequestionamento',
    description: 'Deve conter prequestionamento (se aplicável)',
    check: (text) => hasAnyUpper(text, ['PREQUESTIONAMENTO', 'PREQUESTIONAR']) || text.includes('1.025'),
    weight: 5,
  },
]

// ── Mandado de Segurança rules ────────────────────────────────────────────────

const MS_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'Mandado deve ter pelo menos 2500 caracteres',
    check: (text) => text.length >= 2500,
    weight: 10,
  },
  {
    id: 'has_direito_liquido_certo',
    description: 'Deve demonstrar direito líquido e certo',
    check: (text) => hasAnyUpper(text, ['DIREITO LÍQUIDO E CERTO', 'LÍQUIDO E CERTO', 'LIQUIDEZ E CERTEZA']),
    weight: 15,
  },
  {
    id: 'has_autoridade_coatora',
    description: 'Deve identificar autoridade coatora',
    check: (text) => hasAnyUpper(text, ['AUTORIDADE COATORA', 'IMPETRADO', 'AUTORIDADE IMPETRADA']),
    weight: 12,
  },
  {
    id: 'has_fundamentacao',
    description: 'Deve conter fundamentação jurídica',
    check: (text) => hasAnyUpper(text, ['FUNDAMENTAÇÃO', 'FUNDAMENTOS', 'DO DIREITO']),
    weight: 12,
  },
  {
    id: 'has_pedido_liminar',
    description: 'Deve conter pedido (liminar e mérito)',
    check: (text) => hasAnyUpper(text, ['LIMINAR', 'MEDIDA LIMINAR', 'PEDIDO']),
    weight: 10,
  },
  {
    id: 'cites_lei_12016',
    description: 'Deve citar Lei 12.016/09 ou art. 5º LXIX CF',
    check: (text) => text.includes('12.016') || hasAnyUpper(text, ['LXIX', 'MANDADO DE SEGURANÇA']),
    weight: 8,
  },
]

// ── Default / fallback rules ──────────────────────────────────────────────────

const DEFAULT_RULES: QualityRule[] = [
  {
    id: 'min_length',
    description: 'Documento deve ter pelo menos 1500 caracteres',
    check: (text) => text.length >= 1500,
    weight: 15,
  },
  {
    id: 'has_structure',
    description: 'Documento deve ter seções estruturadas',
    check: (text) => hasAnyUpper(text, ['RELATÓRIO', 'FUNDAMENTAÇÃO', 'CONCLUSÃO', 'DISPOSITIVO']),
    weight: 15,
  },
  {
    id: 'has_legal_basis',
    description: 'Documento deve citar base legal',
    check: (text) => hasAny(text, ['art.', 'lei ', 'decreto', 'constituição', 'súmula']),
    weight: 20,
  },
  {
    id: 'no_hallucination_markers',
    description: 'Sem marcadores de alucinação',
    check: (text) => !text.toLowerCase().includes('lei 8.666'),
    weight: 20,
  },
  {
    id: 'no_truncation',
    description: 'Sem frases truncadas',
    check: (text) => { const t = text.trimEnd(); return !t.endsWith('...') && !t.endsWith('…') },
    weight: 10,
  },
  {
    id: 'has_sources',
    description: 'Deve conter referências a fontes',
    check: (text) => text.includes('[Fonte:') || text.toLowerCase().includes('jurisprudência'),
    weight: 10,
  },
  {
    id: 'proper_paragraphs',
    description: 'Deve ter parágrafos separados',
    check: (text) => countOccurrences(text, '\n\n') >= 3,
    weight: 10,
  },
]

// ── Rule registry ─────────────────────────────────────────────────────────────

const RULES_BY_DOCTYPE: Record<string, QualityRule[]> = {
  parecer: PARECER_RULES,
  peticao_inicial: PETICAO_INICIAL_RULES,
  contestacao: CONTESTACAO_RULES,
  recurso: RECURSO_RULES,
  sentenca: SENTENCA_RULES,
  acao_civil_publica: ACP_RULES,
  agravo: AGRAVO_RULES,
  habeas_corpus: HC_RULES,
  embargos_declaracao: EMBARGOS_RULES,
  mandado_seguranca: MS_RULES,
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate document quality using document-type-specific rules.
 *
 * @param text          The full generated document text.
 * @param docType       The document_type_id (e.g. "parecer", "sentenca").
 * @param ctx           Context with optional `tema` for relevance checks.
 * @returns             Object with numeric score (0–100), passed and failed rule IDs.
 */
export function evaluateQuality(text: string, docType: string, ctx: EvalContext = {}): QualityResult {
  const rules = RULES_BY_DOCTYPE[docType] ?? DEFAULT_RULES
  const totalWeight = rules.reduce((sum, r) => sum + r.weight, 0)
  if (totalWeight === 0) return { score: 0, passed: [], failed: [] }

  const passed: string[] = []
  const failed: string[] = []
  let earned = 0

  for (const rule of rules) {
    try {
      if (rule.check(text, ctx)) {
        passed.push(rule.id)
        earned += rule.weight
      } else {
        failed.push(rule.id)
      }
    } catch {
      failed.push(rule.id)
    }
  }

  const score = Math.round((earned / totalWeight) * 100)
  return { score, passed, failed }
}

const PRESENTATION_V2_STOPWORDS = new Set([
  'para', 'com', 'sem', 'uma', 'umas', 'uns', 'que', 'como', 'sobre', 'entre', 'pelo', 'pela',
  'pelos', 'pelas', 'este', 'esta', 'esse', 'essa', 'isso', 'aquela', 'aquele', 'depois', 'antes',
  'mais', 'menos', 'muito', 'muita', 'ser', 'estar', 'tem', 'tudo', 'todas', 'todos', 'sobre',
  'direito', 'juridica', 'juridico', 'juridicos', 'juridicas', 'slide', 'slides', 'deck',
  'apresentacao', 'apresentação', 'tema', 'principal', 'objetivo', 'estrategia', 'estratégia',
])

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function normalizePresentationText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

function wordCount(value?: string): number {
  if (!value) return 0
  const normalized = normalizePresentationText(value)
  return normalized ? normalized.split(' ').filter(Boolean).length : 0
}

function tokenizePresentationKeywords(...values: Array<string | undefined>): string[] {
  const tokens = values
    .map(value => normalizePresentationText(value || ''))
    .join(' ')
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 5 && !PRESENTATION_V2_STOPWORDS.has(token))
  return uniqueStrings(tokens)
}

function countKeywordHits(text: string, keywords: string[]): number {
  const normalized = normalizePresentationText(text)
  return keywords.filter(keyword => normalized.includes(keyword)).length
}

function computeSlideOverlap(current: PresentationV2Slide, sibling?: PresentationV2Slide): number {
  if (!sibling) return 0
  const currentBullets = uniqueStrings(current.bullets.map(bullet => normalizePresentationText(bullet)).filter(Boolean))
  const siblingBullets = new Set(sibling.bullets.map(bullet => normalizePresentationText(bullet)).filter(Boolean))
  if (currentBullets.length === 0 || siblingBullets.size === 0) return 0
  const shared = currentBullets.filter(bullet => siblingBullets.has(bullet)).length
  return shared / Math.max(currentBullets.length, siblingBullets.size)
}

function makeCategoryScore(
  key: PresentationV2RubricCategoryScore['key'],
  label: string,
  score: number,
  reasons: string[],
): PresentationV2RubricCategoryScore {
  return {
    key,
    label,
    score: clampScore(score),
    reasons: uniqueStrings(reasons),
  }
}

function evaluatePresentationV2SlideQuality(
  deck: PresentationV2Deck,
  slide: PresentationV2Slide,
  index: number,
  slideThreshold: number,
): PresentationV2SlideQualityResult {
  const previousSlide = index > 0 ? deck.slides[index - 1] : undefined
  const objectiveKeywords = tokenizePresentationKeywords(deck.generationSpec.objective, deck.generationSpec.request)
  const audienceKeywords = tokenizePresentationKeywords(deck.generationSpec.audience, deck.generationSpec.tone)
  const slideText = [
    slide.title,
    slide.purpose,
    ...slide.bullets,
    slide.speakerNotes,
    slide.transition,
    slide.visualBrief,
  ].filter(Boolean).join(' ')
  const bulletWordCounts = slide.bullets.map(bullet => wordCount(bullet))
  const averageBulletWords = bulletWordCounts.length > 0 ? average(bulletWordCounts) : 0
  const totalBulletWords = bulletWordCounts.reduce((sum, value) => sum + value, 0)
  const speakerNotesWords = wordCount(slide.speakerNotes)
  const duplicateBullets = new Set(slide.bullets.map(bullet => normalizePresentationText(bullet)).filter(Boolean)).size !== slide.bullets.filter(Boolean).length
  const chartLikeAssets = (slide.assets || []).filter(asset => asset.type === 'chart' || asset.type === 'diagram')
  const layoutIsGeneric = !slide.layout || slide.layout === 'default'
  const overlapWithPrevious = computeSlideOverlap(slide, previousSlide)

  let completeness = 100
  const completenessReasons: string[] = []
  if (!slide.purpose?.trim()) {
    completeness -= 18
    completenessReasons.push('Falta propósito explícito do slide.')
  }
  if (slide.bullets.length === 0) {
    completeness -= 45
    completenessReasons.push('Slide sem bullets estruturados.')
  } else if (slide.bullets.length === 1) {
    completeness -= 15
    completenessReasons.push('Slide com apenas um bullet perde sustentação narrativa.')
  }
  if (!slide.visualBrief?.trim() && (!slide.designNotes || slide.designNotes.length === 0)) {
    completeness -= 12
    completenessReasons.push('Direção visual do slide ainda está rasa.')
  }
  if (chartLikeAssets.length > 0 && !slide.chartSpec) {
    completeness -= 15
    completenessReasons.push('Há asset de gráfico/diagrama sem spec de dados correspondente.')
  }

  let density = 100
  const densityReasons: string[] = []
  if (slide.bullets.length > 5) {
    density -= 28
    densityReasons.push('Há mais de 5 bullets; risco de sobrecarga cognitiva.')
  }
  if (averageBulletWords > 18) {
    density -= 22
    densityReasons.push('Os bullets estão longos demais para leitura executiva.')
  }
  if (averageBulletWords > 0 && averageBulletWords < 4) {
    density -= 12
    densityReasons.push('Os bullets estão curtos demais e soam telegráficos.')
  }
  if (totalBulletWords > 75) {
    density -= 18
    densityReasons.push('O volume total de texto em bullets está alto para um único slide.')
  }
  if (deck.generationSpec.depth === 'executiva' && totalBulletWords > 55) {
    density -= 10
    densityReasons.push('A profundidade executiva pede ainda mais síntese neste slide.')
  }

  let transition = 100
  const transitionReasons: string[] = []
  if (index < deck.slides.length - 1 && !slide.transition?.trim()) {
    transition -= 38
    transitionReasons.push('Falta transição explícita para o próximo slide.')
  } else if (slide.transition?.trim() && wordCount(slide.transition) < 4) {
    transition -= 12
    transitionReasons.push('A transição existe, mas ainda está genérica demais.')
  }

  let clarity = 100
  const clarityReasons: string[] = []
  if (/^slide\s+\d+$/i.test(slide.title.trim())) {
    clarity -= 35
    clarityReasons.push('Título ainda genérico demais.')
  }
  if (duplicateBullets) {
    clarity -= 20
    clarityReasons.push('Há bullets repetidos ou quase idênticos no mesmo slide.')
  }
  if (slide.bullets.some(bullet => bullet.trim().length > 180)) {
    clarity -= 15
    clarityReasons.push('Há bullet excessivamente longo para leitura em tela.')
  }

  let objectiveCoverage = 100
  const objectiveCoverageReasons: string[] = []
  if (objectiveKeywords.length > 0) {
    const objectiveHits = countKeywordHits(slideText, objectiveKeywords)
    if (objectiveHits === 0) {
      objectiveCoverage -= 40
      objectiveCoverageReasons.push('O slide não evidencia o objetivo central do deck.')
    } else if (objectiveHits < Math.max(1, Math.ceil(objectiveKeywords.length / 3))) {
      objectiveCoverage -= 18
      objectiveCoverageReasons.push('O vínculo com o objetivo do deck ainda está fraco.')
    }
  }

  let audienceFit = 100
  const audienceFitReasons: string[] = []
  if (audienceKeywords.length > 0) {
    const audienceHits = countKeywordHits(slideText, audienceKeywords)
    if (audienceHits === 0 && speakerNotesWords < 45) {
      audienceFit -= 22
      audienceFitReasons.push('Falta mediação explícita para o público-alvo informado.')
    }
  }
  if (deck.generationSpec.depth === 'tecnica' && speakerNotesWords < 45) {
    audienceFit -= 12
    audienceFitReasons.push('Profundidade técnica pede notas do apresentador mais robustas.')
  }

  let speakerNotes = 100
  const speakerNotesReasons: string[] = []
  if (speakerNotesWords < 25) {
    speakerNotes -= 55
    speakerNotesReasons.push('Speaker notes curtas demais para sustentar a fala.')
  } else if (speakerNotesWords < 50) {
    speakerNotes -= 24
    speakerNotesReasons.push('Speaker notes ainda superficiais para uma apresentação premium.')
  }

  let narrativeConsistency = 100
  const narrativeConsistencyReasons: string[] = []
  if (!slide.sectionId?.trim()) {
    narrativeConsistency -= 12
    narrativeConsistencyReasons.push('O slide está sem vínculo de seção explícito.')
  }
  if (previousSlide && normalizePresentationText(previousSlide.title) === normalizePresentationText(slide.title)) {
    narrativeConsistency -= 32
    narrativeConsistencyReasons.push('Título repetido em relação ao slide anterior.')
  }
  if (!slide.purpose?.trim()) {
    narrativeConsistency -= 15
    narrativeConsistencyReasons.push('Sem propósito, o slide perde função no arco narrativo.')
  }

  let repetition = 100
  const repetitionReasons: string[] = []
  if (overlapWithPrevious > 0.65) {
    repetition -= 42
    repetitionReasons.push('O slide repete conteúdo demais em relação ao anterior.')
  } else if (overlapWithPrevious > 0.45) {
    repetition -= 18
    repetitionReasons.push('Há sobreposição relevante com o slide anterior.')
  }

  const categories = [
    makeCategoryScore('completeness', 'Completude', completeness, completenessReasons),
    makeCategoryScore('density', 'Densidade', density, densityReasons),
    makeCategoryScore('transition', 'Transição', transition, transitionReasons),
    makeCategoryScore('clarity', 'Clareza', clarity, clarityReasons),
    makeCategoryScore('objective_coverage', 'Cobertura do objetivo', objectiveCoverage, objectiveCoverageReasons),
    makeCategoryScore('audience_fit', 'Aderência ao público', audienceFit, audienceFitReasons),
    makeCategoryScore('speaker_notes', 'Speaker notes', speakerNotes, speakerNotesReasons),
    makeCategoryScore('narrative_consistency', 'Consistência narrativa', narrativeConsistency, narrativeConsistencyReasons),
    makeCategoryScore('repetition', 'Ausência de repetição', repetition, repetitionReasons),
  ]
  const score = clampScore(average(categories.map(category => category.score)))

  const strengths = uniqueStrings(categories
    .filter(category => category.score >= 92)
    .slice(0, 3)
    .map(category => `${category.label}: acima do padrão esperado.`))
  const warnings = uniqueStrings(categories
    .flatMap(category => category.reasons.map(reason => `${category.label}: ${reason}`))
    .slice(0, 6))

  const recommendedAgents = new Set<PresentationV2RepairAgent>()
  if ([density, clarity, objectiveCoverage, speakerNotes].some(categoryScore => categoryScore < 80)) {
    recommendedAgents.add('presentation_v2_slide_writer')
  }
  if ([transition, narrativeConsistency].some(categoryScore => categoryScore < 80)) {
    recommendedAgents.add('presentation_v2_content_architect')
  }
  if ((!slide.visualBrief?.trim() && (!slide.designNotes || slide.designNotes.length === 0)) || layoutIsGeneric) {
    recommendedAgents.add('presentation_v2_visual_director')
  }
  if (chartLikeAssets.length > 0 && !slide.chartSpec) {
    recommendedAgents.add('presentation_v2_data_diagrammer')
  }
  if (recommendedAgents.size === 0 && score < slideThreshold) {
    recommendedAgents.add('presentation_v2_slide_writer')
  }

  const repairHints = uniqueStrings(Array.from(recommendedAgents).map((agent) => {
    switch (agent) {
      case 'presentation_v2_content_architect':
        return 'Revisar propósito e transição para recolocar o slide no arco narrativo.'
      case 'presentation_v2_visual_director':
        return 'Refinar layout, direção visual e hierarquia de design do slide.'
      case 'presentation_v2_data_diagrammer':
        return 'Materializar chartSpec/diagrama coerente com os assets planejados.'
      default:
        return 'Reescrever título, bullets e speaker notes para elevar clareza e densidade.'
    }
  }))

  return {
    slideNumber: slide.number,
    score,
    status: score < Math.max(55, slideThreshold - 12) ? 'critical' : score < slideThreshold ? 'repair' : 'ok',
    strengths,
    warnings,
    repairHints,
    recommendedAgents: Array.from(recommendedAgents),
    categories,
  }
}

export function evaluatePresentationV2Quality(
  deck: PresentationV2Deck,
  options: { slideThreshold?: number; deckThreshold?: number } = {},
): PresentationV2DeckQualityResult {
  const slideThreshold = options.slideThreshold ?? 74
  const deckThreshold = options.deckThreshold ?? 82
  const slideRubric = deck.slides.map((slide, index) => evaluatePresentationV2SlideQuality(deck, slide, index, slideThreshold))
  const score = clampScore(average(slideRubric.map(slide => slide.score)))
  const slidesBelowThreshold = slideRubric
    .filter(slide => slide.score < slideThreshold)
    .map(slide => slide.slideNumber)
  const repairTargets = slideRubric.filter(slide => slide.status !== 'ok')

  const strengths = uniqueStrings([
    score >= deckThreshold ? 'A média global do deck ficou acima do limiar premium definido.' : '',
    slidesBelowThreshold.length === 0 ? 'Nenhum slide ficou abaixo do limiar mínimo da rubrica.' : '',
    slideRubric.some(slide => slide.strengths.length >= 2) ? 'Há slides com sinais claros de maturidade narrativa e operacional.' : '',
  ].filter(Boolean))

  const warnings = uniqueStrings([
    slidesBelowThreshold.length > 0
      ? `${slidesBelowThreshold.length} slide(s) ficaram abaixo do limiar ${slideThreshold}: ${slidesBelowThreshold.join(', ')}.`
      : '',
    slideRubric.some(slide => slide.recommendedAgents.includes('presentation_v2_content_architect'))
      ? 'Há lacunas de transição ou encaixe narrativo pedindo reparo estrutural.'
      : '',
    slideRubric.some(slide => slide.recommendedAgents.includes('presentation_v2_visual_director'))
      ? 'Há slides com direção visual ou layout ainda genéricos.'
      : '',
    slideRubric.some(slide => slide.recommendedAgents.includes('presentation_v2_data_diagrammer'))
      ? 'Há assets analíticos planejados sem spec suficiente para materialização consistente.'
      : '',
  ].filter(Boolean))

  const criticalSlides = slideRubric.filter(slide => slide.status === 'critical').length

  return {
    score,
    status: score < Math.max(60, deckThreshold - 10) || criticalSlides >= 2
      ? 'critical'
      : score < deckThreshold || slidesBelowThreshold.length > 0
        ? 'repair'
        : 'ok',
    strengths,
    warnings,
    slideThreshold,
    deckThreshold,
    slidesBelowThreshold,
    repairableSlides: repairTargets.map(slide => slide.slideNumber),
    repairTargets,
    slideRubric,
  }
}
