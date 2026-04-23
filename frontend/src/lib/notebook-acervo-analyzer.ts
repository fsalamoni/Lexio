/**
 * Notebook Acervo Analyzer — Multi-agent pipeline for intelligent acervo analysis.
 *
 * Searches the user's acervo for documents relevant to the notebook's topic,
 * using the same pattern as the document generation pipeline:
 *
 * Pipeline stages:
 *  1. Triagem     — Extract keywords, areas and context from notebook topic
 *  2. Buscador    — Pre-filter + LLM ranking of acervo documents
 *  3. Analista    — Deep relevance analysis of selected docs
 *  4. Curador     — Final curation with summaries and recommendations
 */

import { callLLM, ModelUnavailableError, TransientLLMError } from './llm-client'
import { formatCostBadge } from './currency-utils'
import { getAllAcervoDocumentsForSearch, updateAcervoEmenta, type AcervoDocumentData } from './firestore-service'
import { getOpenRouterKey, generateAcervoEmenta } from './generation-service'
import { loadNotebookAcervoModels, type NotebookAcervoModelMap } from './model-config'
import { createUsageExecutionRecord, type UsageExecutionRecord } from './cost-analytics'
import {
  buildRuntimeProfileKey,
  formatAdaptiveConcurrency,
  formatRuntimeHints,
  getRuntimeConcurrencyHints,
  resolveAdaptiveConcurrencyWithDiagnostics,
  type AdaptiveConcurrencyDiagnostics,
  type RuntimeConcurrencyHints,
} from './runtime-concurrency'
import { normalizeInFlightPercent } from './pipeline-execution-contract'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AcervoAnalysisProgress {
  phase: string
  message: string
  percent: number
  stageMeta?: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackReason?: string
}

export interface AnalyzedDocument {
  id: string
  filename: string
  score: number
  reason: string
  summary: string
  text_content: string
  created_at: string
  content_type?: string
  size_bytes?: number
}

export interface AcervoAnalysisResult {
  documents: AnalyzedDocument[]
  executions: UsageExecutionRecord[]
  totalDuration: number
}

type ProgressCallback = (p: AcervoAnalysisProgress) => void

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Operação cancelada pelo usuário.', 'AbortError')
  }
}

function formatUsd(costUsd: number): string {
  return formatCostBadge(costUsd)
}

function buildAcervoStageMeta(options: {
  model?: string
  runtimeMeta?: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  fallbackReason?: string
}): string | undefined {
  const parts: string[] = []
  if (options.model) parts.push(options.model.split('/').pop() || options.model)
  if (options.runtimeMeta) parts.push(options.runtimeMeta)
  if (options.fallbackReason) parts.push(options.fallbackReason)
  if ((options.retryCount ?? 0) > 0) {
    const retries = options.retryCount ?? 0
    parts.push(`${retries} ${retries === 1 ? 'retry' : 'retries'}`)
  }
  if ((options.durationMs ?? 0) > 0) {
    parts.push(`${Math.max(1, Math.round((options.durationMs ?? 0) / 1000))}s`)
  }
  if ((options.costUsd ?? 0) > 0) {
    parts.push(formatUsd(options.costUsd ?? 0))
  }
  return parts.length > 0 ? parts.join(' • ') : undefined
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_PREFILTERED_DOCS = 30
const MAX_SELECTED_DOCS = 8
const MAX_ANALISTA_DOCS_PER_BATCH = 2
const DEFAULT_ANALISTA_BATCH_CONCURRENCY = 2
const MIN_ANALISTA_BATCH_CONCURRENCY = 1
const MAX_ANALISTA_BATCH_CONCURRENCY = 4
const MAX_ANALISTA_CHARS_PER_DOC = 8_000
const MAX_ANALISTA_INPUT_CHARS = 16_000
const MIN_CHARS_PER_ANALISTA_DOC = 2_500
const MIN_HIGH_RELEVANCE_SCORE = 0.7
const MIN_MEDIUM_RELEVANCE_SCORE = 0.4
const MAX_FALLBACK_TRIAGE_CHARS = 600
const MAX_REUSABLE_CONTENT_CHARS = 500
const ANALISTA_SCORE_WEIGHT = 0.7
const BUSCADOR_SCORE_WEIGHT = 0.3
const MIN_SCORE_FOR_LOW_RELEVANCE = 0.45
const ANALISTA_MAX_TOKENS = 2200
const ANALISTA_TEMPERATURE = 0.15
const CURADOR_MAX_TOKENS = 1800
const CURADOR_TEMPERATURE = 0.15
const PREFILTER_TEXT_SAMPLE_CHARS = 20_000
const DEFAULT_BUSCADOR_SUMMARY_TEMPLATE = 'Documento "%s" selecionado pelo Buscador como referência potencial para a pesquisa.'
const DEFAULT_ANALISTA_SUMMARY_TEMPLATE = 'Documento "%s" potencialmente útil para a pesquisa, com base na aderência temática identificada pelo Buscador.'

function resolveAnalistaBatchConcurrency(
  hints: RuntimeConcurrencyHints,
): AdaptiveConcurrencyDiagnostics {
  return resolveAdaptiveConcurrencyWithDiagnostics({
    envValue: import.meta.env.VITE_NB_ACERVO_ANALISTA_CONCURRENCY as string | undefined,
    fallback: DEFAULT_ANALISTA_BATCH_CONCURRENCY,
    min: MIN_ANALISTA_BATCH_CONCURRENCY,
    max: MAX_ANALISTA_BATCH_CONCURRENCY,
    hints,
  })
}

function extractJsonPayload(raw: string): string {
  let jsonStr = raw.trim()
  const fencedMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch) jsonStr = fencedMatch[1].trim()
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (objectMatch) jsonStr = objectMatch[0]
  return jsonStr
}

function isRecoverableAgentError(err: unknown): boolean {
  if (err instanceof ModelUnavailableError || err instanceof TransientLLMError) return true
  if (!(err instanceof Error)) return false
  const message = err.message.toLowerCase()
  return (
    message.includes('timeout')
    || message.includes('tempo limite')
    || message.includes('empty response')
    || message.includes('no endpoints')
  )
}

type SelectedDocForAnalista = {
  id: string
  filename: string
  text_content: string
  created_at: string
  buscadorScore: number
  buscadorReason: string
}

type AnalistaAnalysis = {
  id: string
  relevance: 'alta' | 'media' | 'baixa'
  score: number
  summary: string
  key_points: string[]
  reusable_content: string
}

type CuratedRecommendation = {
  id: string
  score: number
  summary: string
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0))
}

function inferRelevance(score: number): AnalistaAnalysis['relevance'] {
  if (score >= MIN_HIGH_RELEVANCE_SCORE) return 'alta'
  if (score >= MIN_MEDIUM_RELEVANCE_SCORE) return 'media'
  return 'baixa'
}

function normalizeRelevance(value: unknown, fallbackScore: number): AnalistaAnalysis['relevance'] {
  if (value === 'alta' || value === 'media' || value === 'baixa') return value
  if (value === 'média') return 'media'
  return inferRelevance(fallbackScore)
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new Error(`chunkSize inválido: ${chunkSize}`)
  }
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

function buildCompactTriageContext(triageContent: string, topic: string): string {
  try {
    const triage = JSON.parse(extractJsonPayload(triageContent)) as Record<string, unknown>
    const parts: string[] = []
    const tema = typeof triage.tema === 'string' ? triage.tema.trim() : topic
    if (tema) parts.push(`Tema: ${tema}`)
    const subtemas = Array.isArray(triage.subtemas)
      ? triage.subtemas.filter((value): value is string => typeof value === 'string').slice(0, 5)
      : []
    if (subtemas.length > 0) parts.push(`Subtemas: ${subtemas.join('; ')}`)
    const areas = Array.isArray(triage.areas_direito)
      ? triage.areas_direito.filter((value): value is string => typeof value === 'string').slice(0, 5)
      : []
    if (areas.length > 0) parts.push(`Áreas: ${areas.join('; ')}`)
    const keywords = Array.isArray(triage.palavras_chave)
      ? triage.palavras_chave.filter((value): value is string => typeof value === 'string').slice(0, 8)
      : []
    if (keywords.length > 0) parts.push(`Palavras-chave: ${keywords.join('; ')}`)
    return parts.join('\n') || `Tema: ${topic}`
  } catch {
    return `Tema: ${topic}\nTriagem: ${triageContent.slice(0, MAX_FALLBACK_TRIAGE_CHARS)}`
  }
}

function buildSelectedDocsForAnalista(
  selectedIds: Array<{ id: string; score: number; reason: string }>,
  allAcervoDocs: Array<{ id: string; filename: string; text_content: string; created_at: string }>,
): SelectedDocForAnalista[] {
  const distributedCharsPerDoc = Math.floor(MAX_ANALISTA_INPUT_CHARS / Math.max(1, selectedIds.length))
  const charsPerDoc = Math.min(
    MAX_ANALISTA_CHARS_PER_DOC,
    Math.max(MIN_CHARS_PER_ANALISTA_DOC, distributedCharsPerDoc),
  )

  return selectedIds
    .map(sel => {
      const full = allAcervoDocs.find(d => d.id === sel.id)
      if (!full) return null
      return {
        id: full.id,
        filename: full.filename,
        text_content: full.text_content.slice(0, charsPerDoc),
        created_at: full.created_at,
        buscadorScore: sel.score,
        buscadorReason: sel.reason,
      }
    })
    .filter((d): d is SelectedDocForAnalista => d !== null)
}

function buildAnalistaFallbackAnalyses(selectedDocs: SelectedDocForAnalista[]): AnalistaAnalysis[] {
  return selectedDocs.map((doc) => ({
    id: doc.id,
    relevance: inferRelevance(doc.buscadorScore),
    score: clampScore(doc.buscadorScore),
    summary: doc.buscadorReason || DEFAULT_ANALISTA_SUMMARY_TEMPLATE.replace('%s', doc.filename),
    key_points: [],
    reusable_content: '',
  }))
}

function parseAnalistaAnalyses(
  rawContent: string,
  selectedDocs: SelectedDocForAnalista[],
): AnalistaAnalysis[] {
  const fallbackById = new Map(buildAnalistaFallbackAnalyses(selectedDocs).map((analysis) => [analysis.id, analysis]))
  const parsed = JSON.parse(extractJsonPayload(rawContent)) as Record<string, unknown>
  const rawAnalyses = Array.isArray(parsed.analyses) ? parsed.analyses : []

  return rawAnalyses
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const id = typeof item.id === 'string' ? item.id : ''
      const fallback = fallbackById.get(id)
      if (!fallback) return null
      const parsedScore = typeof item.score === 'number' ? item.score : fallback.score
      const score = clampScore(parsedScore)
      const relevance = normalizeRelevance(item.relevance, score)
      return {
        id,
        relevance,
        score,
        summary: typeof item.summary === 'string' && item.summary.trim().length > 0
          ? item.summary.trim()
          : fallback.summary,
        key_points: Array.isArray(item.key_points)
          ? item.key_points.filter((value): value is string => typeof value === 'string').slice(0, 5)
          : [],
        reusable_content: typeof item.reusable_content === 'string'
          ? item.reusable_content.trim().slice(0, MAX_REUSABLE_CONTENT_CHARS)
          : '',
      } satisfies AnalistaAnalysis
    })
    .filter((analysis): analysis is AnalistaAnalysis => analysis !== null)
}

function buildFallbackRecommendations(
  selectedDocs: SelectedDocForAnalista[],
  analyses: AnalistaAnalysis[],
): CuratedRecommendation[] {
  const analysesById = new Map(analyses.map((analysis) => [analysis.id, analysis]))

  return selectedDocs
    .map((doc) => {
      const analysis = analysesById.get(doc.id)
      const score = clampScore(
        analysis
          ? (analysis.score * ANALISTA_SCORE_WEIGHT) + (doc.buscadorScore * BUSCADOR_SCORE_WEIGHT)
          : doc.buscadorScore,
      )
      const summary = analysis?.summary || doc.buscadorReason || DEFAULT_BUSCADOR_SUMMARY_TEMPLATE.replace('%s', doc.filename)
      return {
        id: doc.id,
        score,
        summary,
      }
    })
    .filter((item) => inferRelevance(item.score) !== 'baixa' || item.score >= MIN_SCORE_FOR_LOW_RELEVANCE)
    .sort((a, b) => b.score - a.score)
    .map(({ id, score, summary }) => ({ id, score, summary }))
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildTriagemSystem(): string {
  return [
    'Você é um ESPECIALISTA EM ANÁLISE TEMÁTICA JURÍDICA.',
    'Sua função é analisar o tema de um caderno de pesquisa e extrair informações estruturadas.',
    '',
    '<regras>',
    '1. Extraia o TEMA PRINCIPAL em poucas palavras.',
    '2. Liste SUBTEMAS relevantes (máximo 5).',
    '3. Liste PALAVRAS-CHAVE para busca no acervo (máximo 15).',
    '4. Identifique ÁREAS DO DIREITO envolvidas.',
    '5. Identifique TIPOS DE DOCUMENTO que seriam úteis (parecer, petição, sentença, etc.).',
    '6. Identifique CONTEXTOS FÁTICOS relevantes.',
    '</regras>',
    '',
    '<formato_resposta>',
    'Responda APENAS com JSON puro (sem markdown, sem ```):',
    '{"tema": "...", "subtemas": ["..."], "palavras_chave": ["..."], "areas_direito": ["..."], "tipos_documento": ["..."], "contextos": ["..."]}',
    '</formato_resposta>',
  ].join('\n')
}

function buildTriagemUser(topic: string, description: string, existingSources: string[]): string {
  const sourcesStr = existingSources.length > 0
    ? `\n<fontes_existentes>\n${existingSources.join('\n')}\n</fontes_existentes>`
    : ''

  return [
    `<tema_caderno>${topic}</tema_caderno>`,
    description ? `<descricao>${description}</descricao>` : '',
    sourcesStr,
    '',
    'Analise o tema acima e extraia informações estruturadas para busca no acervo.',
    'Considere as fontes já existentes para evitar redundância.',
  ].filter(Boolean).join('\n')
}

function buildBuscadorSystem(): string {
  return [
    'Você é um ESPECIALISTA EM RECUPERAÇÃO DE DOCUMENTOS JURÍDICOS para cadernos de pesquisa.',
    'Sua função é selecionar documentos do acervo mais relevantes para o tema de pesquisa.',
    '',
    '<regras>',
    '1. Analise o NOME DO ARQUIVO — contém o tema principal.',
    '2. Analise a EMENTA — contém tipo, assunto, síntese, áreas jurídicas.',
    '3. Analise as TAGS DE CLASSIFICAÇÃO:',
    '   - NATUREZA: consultivo, executório, transacional, negocial, doutrinário, decisório',
    '   - ÁREA DO DIREITO: disciplinas jurídicas do conteúdo',
    '   - ASSUNTOS: matérias da fundamentação',
    '   - TIPO: classificação do tipo documental',
    '   - CONTEXTO: circunstâncias fáticas',
    '4. Para cadernos de pesquisa, a seleção é mais AMPLA — inclua documentos que:',
    '   - Tratem do MESMO TEMA ou temas RELACIONADOS',
    '   - Contenham FUNDAMENTAÇÃO JURÍDICA reutilizável (legislação, jurisprudência, doutrina)',
    '   - Abordem questões SIMILARES mesmo em contextos diferentes',
    '   - Sejam úteis como REFERÊNCIA para a pesquisa',
    '5. Máximo de 8 documentos.',
    '6. Score >= 0.3 para incluir (limiar mais baixo que geração de documentos).',
    '7. Priorize: (a) MESMA ÁREA, (b) MESMO ASSUNTO, (c) mais ESPECÍFICOS, (d) mais RECENTES.',
    '</regras>',
    '',
    '<formato_resposta>',
    'Responda APENAS com JSON puro (sem markdown, sem ```):',
    '{"selected": [{"id": "doc_id_exato", "score": 0.95, "reason": "Motivo da seleção"}]}',
    'O campo "id" deve conter o ID EXATO do documento.',
    'Se nenhum for relevante: {"selected": []}',
    '</formato_resposta>',
  ].join('\n')
}

function buildBuscadorUser(
  triagem: string,
  topic: string,
  description: string,
  acervoDocs: Array<{ id: string; filename: string; summary: string; created_at: string; natureza?: string; area_direito?: string[]; assuntos?: string[]; tipo_documento?: string; contexto?: string[] }>,
): string {
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
    if (d.tipo_documento) parts.push(`    Tipo: ${d.tipo_documento}`)
    if (d.contexto?.length) parts.push(`    Contexto: ${d.contexto.join('; ')}`)
    return parts.join('\n')
  }).join('\n\n')

  return [
    `<tema_pesquisa>${topic}</tema_pesquisa>`,
    description ? `<descricao>${description}</descricao>` : '',
    `<triagem>${triagem}</triagem>`,
    '',
    '<acervo_disponivel>',
    `Total de documentos: ${acervoDocs.length}`,
    '',
    docsListStr,
    '</acervo_disponivel>',
    '',
    'Selecione documentos relevantes para este CADERNO DE PESQUISA.',
    'Lembre-se: a seleção pode ser mais ampla que para geração de documentos.',
    'Inclua qualquer documento que possa servir como referência valiosa.',
  ].filter(Boolean).join('\n')
}

function buildAnalistaSystem(): string {
  return [
    'Você é um ANALISTA JURÍDICO SÊNIOR especializado em avaliação de documentos para pesquisa.',
    'Sua função é analisar documentos selecionados do acervo e avaliar sua relevância e utilidade.',
    '',
    '<regras>',
    '1. Para cada documento, avalie:',
    '   - RELEVÂNCIA para o tema (alta/média/baixa)',
    '   - CONTEÚDO REUTILIZÁVEL: legislação, jurisprudência, doutrina citadas',
    '   - PONTOS-CHAVE: argumentos e teses principais',
    '   - RESUMO: síntese objetiva do valor para a pesquisa',
    '2. Seja objetivo e preciso.',
    '3. Identifique conexões entre os documentos.',
    '4. Destaque fundamentações jurídicas fortes que podem ser reaproveitadas.',
    '</regras>',
    '',
    '<formato_resposta>',
    'Responda APENAS com JSON puro (sem markdown, sem ```):',
    '{"analyses": [{"id": "doc_id", "relevance": "alta|media|baixa", "score": 0.95, "summary": "resumo do valor para pesquisa", "key_points": ["ponto 1", "ponto 2"], "reusable_content": "legislação/jurisprudência reutilizável"}]}',
    '</formato_resposta>',
  ].join('\n')
}

function buildAnalistaUser(
  topic: string,
  triagem: string,
  selectedDocs: Array<{ id: string; filename: string; text_content: string; created_at: string }>,
): string {
  const docsStr = selectedDocs.map((d, i) =>
    `<documento_${i + 1}>\nID: ${d.id}\nArquivo: ${d.filename}\nData: ${d.created_at}\n\n${d.text_content}\n</documento_${i + 1}>`,
  ).join('\n\n')

  return [
    `<tema_pesquisa>${topic}</tema_pesquisa>`,
    `<triagem>${buildCompactTriageContext(triagem, topic)}</triagem>`,
    '',
    '<documentos_selecionados>',
    docsStr,
    '</documentos_selecionados>',
    '',
    'Analise cada documento e avalie sua relevância e utilidade para a pesquisa sobre o tema acima.',
    'Seja conciso, focado em utilidade prática e cite só o essencial.',
  ].join('\n')
}

function buildCuradorSystem(): string {
  return [
    'Você é um CURADOR DE PESQUISA JURÍDICA. Sua função é fazer a seleção final de documentos',
    'do acervo para incorporar como fontes em um caderno de pesquisa.',
    '',
    '<regras>',
    '1. Revise as análises do Analista e faça a curadoria final.',
    '2. Ordene documentos do mais relevante ao menos relevante.',
    '3. Para cada documento recomendado, forneça:',
    '   - Um SCORE final de 0.0 a 1.0',
    '   - Um RESUMO conciso de por que foi selecionado (máx 100 palavras)',
    '   - Tags de CATEGORIA (legislação, jurisprudência, doutrina, modelo, referência)',
    '4. Exclua documentos com relevância baixa.',
    '5. O resultado será apresentado ao usuário para decisão final — seja claro e informativo.',
    '</regras>',
    '',
    '<formato_resposta>',
    'Responda APENAS com JSON puro (sem markdown, sem ```):',
    '{"recommended": [{"id": "doc_id", "score": 0.95, "summary": "Por que este documento é útil...", "categories": ["legislação", "jurisprudência"]}]}',
    'Ordene por score decrescente.',
    '</formato_resposta>',
  ].join('\n')
}

function buildCuradorUser(
  topic: string,
  triagem: string,
  selectedDocs: SelectedDocForAnalista[],
  analistaAnalyses: AnalistaAnalysis[],
): string {
  const analysesById = new Map(analistaAnalyses.map((analysis) => [analysis.id, analysis]))
  const docsStr = selectedDocs.map((doc, index) => {
    const analysis = analysesById.get(doc.id)
    const parts = [
      `[${index + 1}] ID: ${doc.id}`,
      `Arquivo: ${doc.filename}`,
      `Data: ${doc.created_at}`,
      `Score do Buscador: ${doc.buscadorScore.toFixed(2)}`,
      `Motivo do Buscador: ${doc.buscadorReason || DEFAULT_BUSCADOR_SUMMARY_TEMPLATE.replace('%s', doc.filename)}`,
    ]
    if (analysis) {
      parts.push(`Relevância do Analista: ${analysis.relevance}`)
      parts.push(`Score do Analista: ${analysis.score.toFixed(2)}`)
      parts.push(`Resumo do Analista: ${analysis.summary}`)
      if (analysis.key_points.length > 0) parts.push(`Pontos-chave: ${analysis.key_points.join('; ')}`)
      if (analysis.reusable_content) parts.push(`Conteúdo reutilizável: ${analysis.reusable_content}`)
    }
    return parts.join('\n')
  }).join('\n\n')

  return [
    `<tema_pesquisa>${topic}</tema_pesquisa>`,
    `<triagem>${buildCompactTriageContext(triagem, topic)}</triagem>`,
    '',
    '<documentos_analisados>',
    docsStr,
    '</documentos_analisados>',
    '',
    'Faça a curadoria final dos documentos analisados.',
    'Ordene por relevância. Exclua documentos com baixa relevância.',
    'Forneça resumos claros que ajudem o usuário a decidir se quer adicionar cada documento.',
  ].join('\n')
}

// ── Pre-filter (zero-cost keyword matching) ───────────────────────────────────

function extractKeywordsFromTriage(triageContent: string, topic: string, description: string): string[] {
  const keywords: string[] = []

  try {
    const triage = JSON.parse(extractJsonPayload(triageContent)) as Record<string, unknown>
    if (typeof triage.tema === 'string') {
      keywords.push(...triage.tema.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3))
    }
    if (Array.isArray(triage.subtemas)) {
      for (const sub of triage.subtemas.filter((v): v is string => typeof v === 'string')) {
        keywords.push(...sub.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3))
      }
    }
    if (Array.isArray(triage.palavras_chave)) {
      for (const kw of triage.palavras_chave.filter((v): v is string => typeof v === 'string')) {
        keywords.push(kw.toLowerCase().trim())
      }
    }
    if (Array.isArray(triage.areas_direito)) {
      for (const area of triage.areas_direito.filter((v): v is string => typeof v === 'string')) {
        keywords.push(area.toLowerCase().trim())
      }
    }
  } catch {
    keywords.push(...triageContent.toLowerCase().split(/\s+/).filter(w => w.length > 4))
  }

  // Also extract from topic + description
  const stopWords = new Set(['sobre', 'entre', 'sendo', 'quando', 'como', 'para', 'com', 'qual', 'quais', 'possível', 'prática', 'envolvendo', 'municipal', 'direito', 'análise', 'estudo', 'pesquisa', 'caderno'])
  const textWords = `${topic} ${description}`.toLowerCase()
    .replace(/[.,;:!?()"]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
  keywords.push(...textWords)

  return [...new Set(keywords)]
}

type PreFilterDoc = {
  id: string
  filename: string
  created_at: string
  text_content: string
  ementa?: string
  ementa_keywords?: string[]
  natureza?: string
  area_direito?: string[]
  assuntos?: string[]
  tipo_documento?: string
  contexto?: string[]
  prefilter_text_sample?: string
}

function preFilterDocs(
  docs: PreFilterDoc[],
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
    const tipoLower = (d.tipo_documento || '').toLowerCase()
    const contextoLower = (d.contexto || []).map(c => c.toLowerCase())
    const textSample = d.prefilter_text_sample ?? ''

    for (const keyword of normalizedSearch) {
      if (filenameLower.includes(keyword)) score += 3
      if (d.ementa_keywords?.some(ek => ek.includes(keyword) || keyword.includes(ek))) score += 2
      if (ementaLower.includes(keyword)) score += 1
      if (areasLower.some(a => a.includes(keyword) || keyword.includes(a))) score += 2
      if (assuntosLower.some(a => a.includes(keyword) || keyword.includes(a))) score += 2
      if (tipoLower && (tipoLower.includes(keyword) || keyword.includes(tipoLower))) score += 2
      if (contextoLower.some(c => c.includes(keyword) || keyword.includes(c))) score += 1
      if (textSample.includes(keyword)) score += 1
    }

    return { ...d, score }
  })

  return scored
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PREFILTERED_DOCS)
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function analyzeNotebookAcervo(
  uid: string,
  notebookId: string,
  topic: string,
  description: string,
  existingSourceNames: string[],
  existingSourceIds: Set<string>,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<AcervoAnalysisResult> {
  throwIfAborted(signal)
  const startTime = Date.now()
  const executions: UsageExecutionRecord[] = []
  const emitProgress = (progress: AcervoAnalysisProgress): void => {
    onProgress?.({
      ...progress,
      percent: normalizeInFlightPercent(progress.percent),
    })
  }

  // Load API key and agent models
  const apiKey = await getOpenRouterKey()
  const agentModels: NotebookAcervoModelMap = await loadNotebookAcervoModels()

  const modelTriagem   = agentModels.nb_acervo_triagem
  const modelBuscador  = agentModels.nb_acervo_buscador
  const modelAnalista  = agentModels.nb_acervo_analista
  const modelCurador   = agentModels.nb_acervo_curador

  // Guard: ensure all agents have models configured
  const missingAgents = [
    !modelTriagem && 'Triagem', !modelBuscador && 'Buscador',
    !modelAnalista && 'Analista', !modelCurador && 'Curador',
  ].filter(Boolean)
  if (missingAgents.length > 0) {
    throw new Error(`Agente(s) sem modelo configurado: ${missingAgents.join(', ')}. Vá em Configurações e selecione modelos para os agentes do Acervo.`)
  }

  // ── 1. Load acervo ──
  onProgress?.({ phase: 'nb_acervo_triagem', message: 'Carregando documentos do acervo...', percent: 5 })
  const allAcervoDocs = await getAllAcervoDocumentsForSearch(uid)
  throwIfAborted(signal)
  console.log(`[Notebook Acervo] Found ${allAcervoDocs.length} indexed documents in acervo`)

  if (allAcervoDocs.length === 0) {
    return { documents: [], executions, totalDuration: Date.now() - startTime }
  }

  // Filter out docs already added as sources
  const availableDocs = allAcervoDocs.filter(d => !existingSourceIds.has(d.id))
  console.log(`[Notebook Acervo] ${availableDocs.length} docs available after excluding ${existingSourceIds.size} existing sources`)

  if (availableDocs.length === 0) {
    return { documents: [], executions, totalDuration: Date.now() - startTime }
  }

  // ── 2. Triagem — extract keywords from notebook topic ──
  onProgress?.({ phase: 'nb_acervo_triagem', message: 'Analisando tema do caderno...', percent: 10 })
  throwIfAborted(signal)

  const triageResult = await callLLM(
    apiKey,
    buildTriagemSystem(),
    buildTriagemUser(topic, description, existingSourceNames),
    modelTriagem, 800, 0.1,
    { signal },
  )

  executions.push(createUsageExecutionRecord({
    source_type: 'caderno_pesquisa',
    source_id: notebookId,
    phase: 'nb_acervo_triagem',
    agent_name: 'Triagem de Acervo',
    model: triageResult.model,
    tokens_in: triageResult.tokens_in,
    tokens_out: triageResult.tokens_out,
    cost_usd: triageResult.cost_usd,
    duration_ms: triageResult.duration_ms,
  }))

  console.log(`[Notebook Acervo Triagem] Result:`, triageResult.content.slice(0, 200))
  onProgress?.({
    phase: 'nb_acervo_triagem',
    message: 'Triagem do tema concluída.',
    percent: 18,
    stageMeta: buildAcervoStageMeta({
      model: triageResult.model,
      costUsd: triageResult.cost_usd,
      durationMs: triageResult.duration_ms,
      retryCount: triageResult.operational?.totalRetryCount,
    }),
    costUsd: triageResult.cost_usd,
    durationMs: triageResult.duration_ms,
    retryCount: triageResult.operational?.totalRetryCount,
  })

  // ── 3. Pre-filter (zero-cost) + Buscador (LLM ranking) ──
  onProgress?.({ phase: 'nb_acervo_buscador', message: 'Buscando documentos relevantes no acervo...', percent: 25 })
  throwIfAborted(signal)

  const searchKeywords = extractKeywordsFromTriage(triageResult.content, topic, description)
  console.log(`[Notebook Acervo Pre-filter] Keywords:`, searchKeywords)

  const prefilterPreparedDocs: PreFilterDoc[] = availableDocs.map((d) => ({
    ...d,
    prefilter_text_sample: (d.text_content || '').slice(0, PREFILTER_TEXT_SAMPLE_CHARS).toLowerCase(),
  }))
  const preFiltered = preFilterDocs(prefilterPreparedDocs, searchKeywords)
  console.log(`[Notebook Acervo Pre-filter] ${availableDocs.length} docs → ${preFiltered.length} candidates`)

  if (preFiltered.length === 0) {
    emitProgress({ phase: 'concluido', message: 'Nenhum documento relevante encontrado no acervo.', percent: 100 })
    return { documents: [], executions, totalDuration: Date.now() - startTime }
  }

  // Generate ementas for docs that don't have one yet (up to 10, non-blocking batch)
  const docsNeedingEmenta = preFiltered.filter(d => !d.ementa)
  if (docsNeedingEmenta.length > 0) {
    console.log(`[Notebook Acervo Ementa] ${docsNeedingEmenta.length} docs need ementa generation`)
    const ementaPromises = docsNeedingEmenta.slice(0, 10).map(async d => {
      try {
        throwIfAborted(signal)
        const fullDoc = availableDocs.find(ad => ad.id === d.id)
        if (!fullDoc) return
        const { ementa, keywords, llm_execution: ementaExec } = await generateAcervoEmenta(
          apiKey, d.filename, fullDoc.text_content, modelBuscador,
        )
        await updateAcervoEmenta(uid, d.id, ementa, keywords, [ementaExec])
        d.ementa = ementa
        d.ementa_keywords = keywords
      } catch (err) {
        console.warn(`[Notebook Acervo Ementa] Failed for "${d.filename}":`, err)
      }
    })
    await Promise.all(ementaPromises)
  }

  // LLM Buscador ranks pre-filtered docs
  const docSummaries = preFiltered.map(d => ({
    id: d.id,
    filename: d.filename,
    summary: d.ementa || d.filename,
    created_at: d.created_at,
    natureza: d.natureza,
    area_direito: d.area_direito,
    assuntos: d.assuntos,
    tipo_documento: d.tipo_documento,
    contexto: d.contexto,
  }))

  const buscadorResult = await callLLM(
    apiKey,
    buildBuscadorSystem(),
    buildBuscadorUser(triageResult.content, topic, description, docSummaries),
    modelBuscador, 2000, 0.1,
    { signal },
  )

  executions.push(createUsageExecutionRecord({
    source_type: 'caderno_pesquisa',
    source_id: notebookId,
    phase: 'nb_acervo_buscador',
    agent_name: 'Buscador de Acervo',
    model: buscadorResult.model,
    tokens_in: buscadorResult.tokens_in,
    tokens_out: buscadorResult.tokens_out,
    cost_usd: buscadorResult.cost_usd,
    duration_ms: buscadorResult.duration_ms,
  }))
  onProgress?.({
    phase: 'nb_acervo_buscador',
    message: 'Buscador concluiu a seleção inicial do acervo.',
    percent: 40,
    stageMeta: buildAcervoStageMeta({
      model: buscadorResult.model,
      costUsd: buscadorResult.cost_usd,
      durationMs: buscadorResult.duration_ms,
      retryCount: buscadorResult.operational?.totalRetryCount,
    }),
    costUsd: buscadorResult.cost_usd,
    durationMs: buscadorResult.duration_ms,
    retryCount: buscadorResult.operational?.totalRetryCount,
  })

  // Parse buscador result
  let selectedIds: Array<{ id: string; score: number; reason: string }> = []
  try {
    const parsed = JSON.parse(extractJsonPayload(buscadorResult.content)) as Record<string, unknown>
    const allSelected = Array.isArray(parsed.selected) ? parsed.selected : []
    console.log(`[Notebook Acervo Buscador] LLM selected ${allSelected.length} from ${preFiltered.length}`)

    selectedIds = allSelected
      .filter((s): s is { id?: string; score?: number; reason?: string } => !!s && typeof s === 'object')
      .filter((s) => typeof s.id === 'string' && s.id.length > 0)
      .filter((s) => (s.score ?? 0) >= 0.15)
      .slice(0, MAX_SELECTED_DOCS)
      .map((s) => ({
        id: String(s.id),
        score: s.score ?? 0,
        reason: typeof s.reason === 'string' ? s.reason : '',
      }))
  } catch (parseErr) {
    console.warn('[Notebook Acervo Buscador] Parse error:', parseErr)
  }

  if (selectedIds.length === 0) {
    emitProgress({ phase: 'concluido', message: 'Nenhum documento relevante encontrado.', percent: 100 })
    return { documents: [], executions, totalDuration: Date.now() - startTime }
  }

  // ── 4. Analista — deep analysis of selected docs ──
  onProgress?.({ phase: 'nb_acervo_analista', message: `Analisando ${selectedIds.length} documento(s) selecionado(s)...`, percent: 50 })
  throwIfAborted(signal)

  const selectedDocs = buildSelectedDocsForAnalista(selectedIds, allAcervoDocs)
  const analistaFallbackAnalyses = buildAnalistaFallbackAnalyses(selectedDocs)
  const analistaBatches = chunkArray(selectedDocs, MAX_ANALISTA_DOCS_PER_BATCH)
  const analistaAnalysesById = new Map(analistaFallbackAnalyses.map((analysis) => [analysis.id, analysis]))
  const totalAnalistaBatches = Math.max(1, analistaBatches.length)
  const analistaRuntimeHints = getRuntimeConcurrencyHints()
  const analistaConcurrencyDiagnostics = resolveAnalistaBatchConcurrency(analistaRuntimeHints)
  const resolvedAnalistaConcurrency = analistaConcurrencyDiagnostics.resolved
  const analistaRuntimeHintsLabel = formatRuntimeHints(analistaRuntimeHints)
  const analistaRuntimeMeta = `${formatAdaptiveConcurrency(analistaConcurrencyDiagnostics)} | ${analistaRuntimeHintsLabel}`
  const analistaRuntimeProfile = buildRuntimeProfileKey(analistaRuntimeHints, analistaConcurrencyDiagnostics)
  const analistaWorkerCount = Math.min(resolvedAnalistaConcurrency, analistaBatches.length)
  let usedAnalistaFallback = false
  let completedAnalistaBatches = 0
  let nextAnalistaBatchIndex = 0

  onProgress?.({
    phase: 'nb_acervo_analista',
    message: `Analista processando ${analistaBatches.length} lote(s) com até ${analistaWorkerCount} em paralelo (auto/adaptativo).`,
    percent: 50,
    stageMeta: buildAcervoStageMeta({ runtimeMeta: analistaRuntimeMeta }),
  })

  const emitAnalistaBatchProgress = (message: string, options?: Partial<AcervoAnalysisProgress>) => {
    completedAnalistaBatches += 1
    const percent = 50 + Math.round((completedAnalistaBatches / totalAnalistaBatches) * 15)
    onProgress?.({
      phase: 'nb_acervo_analista',
      message,
      percent,
      ...options,
    })
  }

  const processAnalistaBatch = async (batch: SelectedDocForAnalista[], batchIndex: number): Promise<void> => {
    throwIfAborted(signal)

    try {
      const analistaResult = await callLLM(
        apiKey,
        buildAnalistaSystem(),
        buildAnalistaUser(topic, triageResult.content, batch),
        modelAnalista, ANALISTA_MAX_TOKENS, ANALISTA_TEMPERATURE,
        { signal },
      )

      executions.push(createUsageExecutionRecord({
        source_type: 'caderno_pesquisa',
        source_id: notebookId,
        phase: 'nb_acervo_analista',
        agent_name: 'Analista de Acervo',
        model: analistaResult.model,
        tokens_in: analistaResult.tokens_in,
        tokens_out: analistaResult.tokens_out,
        cost_usd: analistaResult.cost_usd,
        duration_ms: analistaResult.duration_ms,
        runtime_profile: analistaRuntimeProfile,
        runtime_hints: analistaRuntimeHintsLabel,
        runtime_concurrency: analistaConcurrencyDiagnostics.resolved,
        runtime_cap: analistaConcurrencyDiagnostics.runtimeCap,
      }))

      const parsedBatch = parseAnalistaAnalyses(analistaResult.content, batch)
      if (parsedBatch.length === 0) {
        throw new TransientLLMError('Analista retornou JSON sem análises válidas')
      }
      for (const analysis of parsedBatch) {
        analistaAnalysesById.set(analysis.id, analysis)
      }

      emitAnalistaBatchProgress(`Analista concluiu o lote ${batchIndex + 1}/${analistaBatches.length}.`, {
        stageMeta: buildAcervoStageMeta({
          model: analistaResult.model,
          runtimeMeta: analistaRuntimeMeta,
          costUsd: analistaResult.cost_usd,
          durationMs: analistaResult.duration_ms,
          retryCount: analistaResult.operational?.totalRetryCount,
        }),
        costUsd: analistaResult.cost_usd,
        durationMs: analistaResult.duration_ms,
        retryCount: analistaResult.operational?.totalRetryCount,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (!isRecoverableAgentError(err)) throw err
      usedAnalistaFallback = true
      console.warn('[Notebook Acervo Analista] Falling back to buscador selection after recoverable error', {
        error: err instanceof Error ? err.message : String(err),
        notebookId,
        batchIndex,
        batchSize: batch.length,
      })
      for (const fallbackAnalysis of buildAnalistaFallbackAnalyses(batch)) {
        analistaAnalysesById.set(fallbackAnalysis.id, fallbackAnalysis)
      }

      emitAnalistaBatchProgress(
        `Analista em fallback no lote ${batchIndex + 1}/${analistaBatches.length}; seleção do Buscador preservada.`,
        {
          usedFallback: true,
          fallbackReason: 'Fallback seguro ativado',
          stageMeta: buildAcervoStageMeta({
            runtimeMeta: analistaRuntimeMeta,
            fallbackReason: 'Fallback seguro ativado',
          }),
        },
      )
    }
  }

  if (analistaWorkerCount > 0) {
    await Promise.all(Array.from({ length: analistaWorkerCount }, async () => {
      while (true) {
        const batchIndex = nextAnalistaBatchIndex++
        if (batchIndex >= analistaBatches.length) return
        await processAnalistaBatch(analistaBatches[batchIndex], batchIndex)
      }
    }))
  }

  const analistaAnalyses = selectedDocs
    .map((doc) => analistaAnalysesById.get(doc.id))
    .filter((analysis): analysis is AnalistaAnalysis => !!analysis)

  if (usedAnalistaFallback) {
    onProgress?.({
      phase: 'nb_acervo_analista',
      message: 'Analista parcialmente indisponível; concluído com fallback seguro.',
      percent: 65,
      stageMeta: buildAcervoStageMeta({
        runtimeMeta: analistaRuntimeMeta,
        fallbackReason: 'Fallback seguro ativado',
      }),
      usedFallback: true,
      fallbackReason: 'Fallback seguro ativado',
    })
  }

  // ── 5. Curador — final curation ──
  onProgress?.({ phase: 'nb_acervo_curador', message: 'Fazendo curadoria final dos documentos...', percent: 75 })
  throwIfAborted(signal)

  let curadorContent: string | null = null
  let recommended: CuratedRecommendation[] = buildFallbackRecommendations(selectedDocs, analistaAnalyses)
  try {
    const curadorResult = await callLLM(
      apiKey,
      buildCuradorSystem(),
      buildCuradorUser(topic, triageResult.content, selectedDocs, analistaAnalyses),
      modelCurador, CURADOR_MAX_TOKENS, CURADOR_TEMPERATURE,
      { signal },
    )

    executions.push(createUsageExecutionRecord({
      source_type: 'caderno_pesquisa',
      source_id: notebookId,
      phase: 'nb_acervo_curador',
      agent_name: 'Curador de Acervo',
      model: curadorResult.model,
      tokens_in: curadorResult.tokens_in,
      tokens_out: curadorResult.tokens_out,
      cost_usd: curadorResult.cost_usd,
      duration_ms: curadorResult.duration_ms,
    }))

    curadorContent = curadorResult.content
    onProgress?.({
      phase: 'nb_acervo_curador',
      message: 'Curadoria final concluída.',
      percent: 88,
      stageMeta: buildAcervoStageMeta({
        model: curadorResult.model,
        costUsd: curadorResult.cost_usd,
        durationMs: curadorResult.duration_ms,
        retryCount: curadorResult.operational?.totalRetryCount,
      }),
      costUsd: curadorResult.cost_usd,
      durationMs: curadorResult.duration_ms,
      retryCount: curadorResult.operational?.totalRetryCount,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    if (!isRecoverableAgentError(err)) throw err
    console.warn('[Notebook Acervo Curador] Falling back to buscador ranking after recoverable error', {
      error: err instanceof Error ? err.message : String(err),
      notebookId,
      selectedDocs: selectedDocs.length,
    })
    onProgress?.({
      phase: 'nb_acervo_curador',
      message: 'Curador indisponível no momento; usando ranking do Buscador.',
      percent: 85,
      stageMeta: buildAcervoStageMeta({ fallbackReason: 'Fallback para ranking do Buscador' }),
      usedFallback: true,
      fallbackReason: 'Fallback para ranking do Buscador',
    })
  }

  // ── 6. Build final result ──
  emitProgress({ phase: 'concluido', message: 'Análise do acervo concluída!', percent: 100 })

  // Parse curador result for final recommendations
  if (curadorContent) {
    try {
      const parsed = JSON.parse(extractJsonPayload(curadorContent)) as Record<string, unknown>
      const curated = (Array.isArray(parsed.recommended) ? parsed.recommended : [])
        .filter((r): r is { id?: string; score?: number; summary?: string } => !!r && typeof r === 'object')
        .filter((r) => typeof r.id === 'string' && r.id.length > 0)
        .map((r) => ({
          id: String(r.id),
          score: clampScore(r.score ?? 0),
          summary: typeof r.summary === 'string' ? r.summary : '',
        }))
      if (curated.length > 0) recommended = curated
    } catch {
      // Keep deterministic fallback recommendation.
    }
  }

  // Build final documents list
  const documents: AnalyzedDocument[] = recommended
    .map(rec => {
      const full = allAcervoDocs.find(d => d.id === rec.id)
      if (!full) return null
      return {
        id: full.id,
        filename: full.filename,
        score: rec.score,
        reason: rec.summary,
        summary: rec.summary,
        text_content: full.text_content,
        created_at: full.created_at,
        content_type: (full as AcervoDocumentData).content_type,
        size_bytes: (full as AcervoDocumentData).size_bytes,
      }
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => b.score - a.score)

  return {
    documents,
    executions,
    totalDuration: Date.now() - startTime,
  }
}
