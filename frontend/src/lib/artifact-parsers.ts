/**
 * Artifact Parsers — typed JSON parsing for structured artifacts.
 *
 * This module belongs to the business/data layer and must stay free of React/UI
 * dependencies so pipelines, renderers and viewers can share the same parsing
 * logic without crossing layer boundaries.
 */

import type { StudioArtifactType } from './firestore-service'

function extractJSON(raw: string): string | null {
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()

  const braceStart = raw.indexOf('{')
  const bracketStart = raw.indexOf('[')
  if (braceStart === -1 && bracketStart === -1) return null

  const start = braceStart === -1 ? bracketStart
    : bracketStart === -1 ? braceStart
    : Math.min(braceStart, bracketStart)

  const openChar = raw[start]
  const closeChar = openChar === '{' ? '}' : ']'

  let depth = 0
  for (let index = start; index < raw.length; index++) {
    if (raw[index] === openChar) depth++
    else if (raw[index] === closeChar) depth--
    if (depth === 0) return raw.slice(start, index + 1)
  }
  return raw.slice(start)
}

function safeParse(raw: string): unknown | null {
  const json = extractJSON(raw)
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export interface ParsedSlide {
  number: number
  title: string
  bullets: string[]
  speakerNotes: string
  visualSuggestion?: string
  renderedImageUrl?: string
  renderedImageStoragePath?: string
}

export interface ParsedPresentation {
  title?: string
  slides: ParsedSlide[]
}

export interface MindMapNode {
  label: string
  icon?: string
  color?: string
  children?: MindMapNode[]
}

export interface ParsedMindMap {
  centralNode: string
  branches: MindMapNode[]
  renderedImageUrl?: string
  renderedImageStoragePath?: string
}

export interface ParsedFlashcard {
  front: string
  back: string
  difficulty?: 'basico' | 'intermediario' | 'avancado' | string
  tip?: string
}

export interface ParsedFlashcardCategory {
  name: string
  cards: ParsedFlashcard[]
}

export interface ParsedFlashcards {
  title?: string
  categories: ParsedFlashcardCategory[]
}

export interface ParsedQuizOption {
  label: string
  text: string
}

export interface ParsedQuizQuestion {
  number: number
  type: 'multipla_escolha' | 'verdadeiro_falso' | 'dissertativa' | 'caso_pratico' | 'associacao' | string
  text: string
  options?: ParsedQuizOption[]
  pairs?: { left: string; right: string }[]
  answer: string
  explanation: string
}

export interface ParsedQuiz {
  title: string
  difficulty?: string
  estimatedTime?: string
  questions: ParsedQuizQuestion[]
  scoring?: { total: number; perQuestion?: number }
}

export interface ParsedTableColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
}

export interface ParsedDataTable {
  title: string
  columns: ParsedTableColumn[]
  rows: Record<string, string | number>[]
  summary?: Record<string, string | number>
  legend?: string
  footnotes?: string[]
  renderedImageUrl?: string
  renderedImageStoragePath?: string
}

export interface InfographicStat {
  label: string
  value: string | number
  unit?: string
}

export interface InfographicSection {
  icon?: string
  title: string
  content: string
  highlight?: string
  stats?: InfographicStat[]
}

export interface ParsedInfographic {
  title: string
  subtitle?: string
  sections: InfographicSection[]
  conclusion?: string
  sources?: string[]
  renderedImageUrl?: string
  renderedImageStoragePath?: string
}

export interface AudioSegment {
  time: string
  type: 'narracao' | 'transicao' | 'efeito' | 'vinheta' | 'musica' | 'pausa' | string
  speaker?: string
  text: string
  notes?: string
}

export interface ParsedAudioScript {
  title: string
  duration?: string
  segments: AudioSegment[]
  productionNotes?: string[]
  audioUrl?: string
  audioStoragePath?: string
  audioMimeType?: string
}

export interface VideoScene {
  number: number
  time: string
  narration: string
  visual: string
  transition?: string
  broll?: string
  lowerThird?: string
  notes?: string
}

export interface ParsedVideoScript {
  title: string
  duration?: string
  scenes: VideoScene[]
  postProductionNotes?: string[]
  renderedVideoUrl?: string
  renderedVideoStoragePath?: string
}

export type ParsedArtifact =
  | { kind: 'presentation'; data: ParsedPresentation }
  | { kind: 'mindmap'; data: ParsedMindMap }
  | { kind: 'flashcards'; data: ParsedFlashcards }
  | { kind: 'quiz'; data: ParsedQuiz }
  | { kind: 'datatable'; data: ParsedDataTable }
  | { kind: 'infographic'; data: ParsedInfographic }
  | { kind: 'audio_script'; data: ParsedAudioScript }
  | { kind: 'video_script'; data: ParsedVideoScript }
  | { kind: 'markdown'; data: string }

function parsePresentation(raw: string): ParsedPresentation | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.slides)) return null
  const slides: ParsedSlide[] = obj.slides.map((slide: Record<string, unknown>, index: number) => ({
    number: (slide.number as number) ?? index + 1,
    title: String(slide.title ?? `Slide ${index + 1}`),
    bullets: Array.isArray(slide.bullets) ? slide.bullets.map(String) : [],
    speakerNotes: String(slide.speakerNotes ?? slide.speaker_notes ?? ''),
    visualSuggestion: slide.visualSuggestion ? String(slide.visualSuggestion) : slide.visual_suggestion ? String(slide.visual_suggestion) : undefined,
    renderedImageUrl: slide.renderedImageUrl ? String(slide.renderedImageUrl) : slide.rendered_image_url ? String(slide.rendered_image_url) : undefined,
    renderedImageStoragePath: slide.renderedImageStoragePath ? String(slide.renderedImageStoragePath) : slide.rendered_image_storage_path ? String(slide.rendered_image_storage_path) : undefined,
  }))
  if (slides.length === 0) return null
  return { title: obj.title ? String(obj.title) : undefined, slides }
}

function parseMindMap(raw: string): ParsedMindMap | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj) return null
  const centralNode = String(obj.centralNode ?? obj.central_node ?? '')
  if (!centralNode) return null
  const branches = Array.isArray(obj.branches) ? obj.branches : []
  if (branches.length === 0) return null

  function mapNode(node: Record<string, unknown>): MindMapNode {
    return {
      label: String(node.label ?? ''),
      icon: node.icon ? String(node.icon) : undefined,
      color: node.color ? String(node.color) : undefined,
      children: Array.isArray(node.children) ? node.children.map((child: Record<string, unknown>) => mapNode(child)) : undefined,
    }
  }

  return {
    centralNode,
    branches: branches.map((branch: Record<string, unknown>) => mapNode(branch)),
    renderedImageUrl: obj.renderedImageUrl ? String(obj.renderedImageUrl) : obj.rendered_image_url ? String(obj.rendered_image_url) : undefined,
    renderedImageStoragePath: obj.renderedImageStoragePath ? String(obj.renderedImageStoragePath) : obj.rendered_image_storage_path ? String(obj.rendered_image_storage_path) : undefined,
  }
}

function parseFlashcards(raw: string): ParsedFlashcards | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.categories)) return null
  const categories: ParsedFlashcardCategory[] = obj.categories.map((category: Record<string, unknown>) => ({
    name: String(category.name ?? 'Geral'),
    cards: Array.isArray(category.cards) ? category.cards.map((card: Record<string, unknown>) => ({
      front: String(card.front ?? card.frente ?? ''),
      back: String(card.back ?? card.verso ?? ''),
      difficulty: card.difficulty ? String(card.difficulty) : card.dificuldade ? String(card.dificuldade) : undefined,
      tip: card.tip ? String(card.tip) : card.dica ? String(card.dica) : undefined,
    })) : [],
  }))
  const totalCards = categories.reduce((sum, category) => sum + category.cards.length, 0)
  if (totalCards === 0) return null
  return { title: obj.title ? String(obj.title) : undefined, categories }
}

function parseQuiz(raw: string): ParsedQuiz | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.questions)) return null
  const questions: ParsedQuizQuestion[] = obj.questions.map((question: Record<string, unknown>, index: number) => ({
    number: (question.number as number) ?? index + 1,
    type: String(question.type ?? question.tipo ?? 'multipla_escolha'),
    text: String(question.text ?? question.texto ?? ''),
    options: Array.isArray(question.options) ? question.options.map((option: Record<string, unknown>) => ({
      label: String(option.label ?? option.letra ?? ''),
      text: String(option.text ?? option.texto ?? ''),
    })) : undefined,
    pairs: Array.isArray(question.pairs) ? question.pairs.map((pair: Record<string, unknown>) => ({
      left: String(pair.left ?? pair.esquerda ?? ''),
      right: String(pair.right ?? pair.direita ?? ''),
    })) : undefined,
    answer: String(question.answer ?? question.resposta ?? ''),
    explanation: String(question.explanation ?? question.explicacao ?? ''),
  }))
  if (questions.length === 0) return null
  return {
    title: String(obj.title ?? obj.titulo ?? 'Quiz'),
    difficulty: obj.difficulty ? String(obj.difficulty) : obj.dificuldade ? String(obj.dificuldade) : undefined,
    estimatedTime: obj.estimatedTime ? String(obj.estimatedTime) : obj.tempo_estimado ? String(obj.tempo_estimado) : undefined,
    questions,
    scoring: obj.scoring as ParsedQuiz['scoring'] ?? undefined,
  }
}

function parseDataTable(raw: string): ParsedDataTable | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.columns) || !Array.isArray(obj.rows)) return null
  if (obj.columns.length === 0 || obj.rows.length === 0) return null
  const columns: ParsedTableColumn[] = obj.columns.map((column: Record<string, unknown>) => ({
    key: String(column.key ?? ''),
    label: String(column.label ?? column.key ?? ''),
    align: (['left', 'right', 'center'].includes(String(column.align ?? '')) ? String(column.align) : 'left') as 'left' | 'right' | 'center',
  }))
  return {
    title: String(obj.title ?? obj.titulo ?? 'Tabela'),
    columns,
    rows: obj.rows as Record<string, string | number>[],
    summary: obj.summary as Record<string, string | number> | undefined,
    legend: obj.legend ? String(obj.legend) : undefined,
    footnotes: Array.isArray(obj.footnotes) ? obj.footnotes.map(String) : undefined,
    renderedImageUrl: obj.renderedImageUrl ? String(obj.renderedImageUrl) : obj.rendered_image_url ? String(obj.rendered_image_url) : undefined,
    renderedImageStoragePath: obj.renderedImageStoragePath ? String(obj.renderedImageStoragePath) : obj.rendered_image_storage_path ? String(obj.rendered_image_storage_path) : undefined,
  }
}

function parseInfographic(raw: string): ParsedInfographic | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.sections)) return null
  if (obj.sections.length === 0) return null
  const sections: InfographicSection[] = obj.sections.map((section: Record<string, unknown>) => ({
    icon: section.icon ? String(section.icon) : undefined,
    title: String(section.title ?? section.titulo ?? ''),
    content: String(section.content ?? section.conteudo ?? ''),
    highlight: section.highlight ? String(section.highlight) : undefined,
    stats: Array.isArray(section.stats) ? section.stats.map((stat: Record<string, unknown>) => ({
      label: String(stat.label ?? ''),
      value: (stat.value ?? stat.valor ?? '') as string | number,
      unit: stat.unit ? String(stat.unit) : undefined,
    })) : undefined,
  }))
  return {
    title: String(obj.title ?? ''),
    subtitle: obj.subtitle ? String(obj.subtitle) : undefined,
    sections,
    conclusion: obj.conclusion ? String(obj.conclusion) : undefined,
    sources: Array.isArray(obj.sources) ? obj.sources.map(String) : undefined,
    renderedImageUrl: obj.renderedImageUrl ? String(obj.renderedImageUrl) : obj.rendered_image_url ? String(obj.rendered_image_url) : undefined,
    renderedImageStoragePath: obj.renderedImageStoragePath ? String(obj.renderedImageStoragePath) : obj.rendered_image_storage_path ? String(obj.rendered_image_storage_path) : undefined,
  }
}

function parseAudioScript(raw: string): ParsedAudioScript | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.segments)) return null
  if (obj.segments.length === 0) return null
  const segments: AudioSegment[] = obj.segments.map((segment: Record<string, unknown>) => ({
    time: String(segment.time ?? segment.tempo ?? '00:00'),
    type: String(segment.type ?? segment.tipo ?? 'narracao'),
    speaker: segment.speaker ? String(segment.speaker) : segment.locutor ? String(segment.locutor) : undefined,
    text: String(segment.text ?? segment.texto ?? ''),
    notes: segment.notes ? String(segment.notes) : segment.notas ? String(segment.notas) : undefined,
  }))
  return {
    title: String(obj.title ?? obj.titulo ?? 'Resumo em Áudio'),
    duration: obj.duration ? String(obj.duration) : obj.duracao ? String(obj.duracao) : undefined,
    segments,
    productionNotes: Array.isArray(obj.productionNotes ?? obj.notas_producao)
      ? ((obj.productionNotes as string[] | undefined) ?? (obj.notas_producao as string[] | undefined) ?? []).map(String)
      : undefined,
    audioUrl: obj.audioUrl ? String(obj.audioUrl) : obj.audio_url ? String(obj.audio_url) : undefined,
    audioStoragePath: obj.audioStoragePath ? String(obj.audioStoragePath) : obj.audio_storage_path ? String(obj.audio_storage_path) : undefined,
    audioMimeType: obj.audioMimeType ? String(obj.audioMimeType) : obj.audio_mime_type ? String(obj.audio_mime_type) : undefined,
  }
}

function parseVideoScript(raw: string): ParsedVideoScript | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.scenes)) return null
  if (obj.scenes.length === 0) return null
  const scenes: VideoScene[] = obj.scenes.map((scene: Record<string, unknown>, index: number) => ({
    number: (scene.number as number) ?? (scene.numero as number) ?? index + 1,
    time: String(scene.time ?? scene.tempo ?? '00:00'),
    narration: String(scene.narration ?? scene.narracao ?? ''),
    visual: String(scene.visual ?? ''),
    transition: scene.transition ? String(scene.transition) : scene.transicao ? String(scene.transicao) : undefined,
    broll: scene.broll ? String(scene.broll) : scene.b_roll ? String(scene.b_roll) : undefined,
    lowerThird: scene.lowerThird ? String(scene.lowerThird) : scene.lower_third ? String(scene.lower_third) : undefined,
    notes: scene.notes ? String(scene.notes) : scene.notas ? String(scene.notas) : undefined,
  }))
  return {
    title: String(obj.title ?? obj.titulo ?? 'Vídeo'),
    duration: obj.duration ? String(obj.duration) : obj.duracao ? String(obj.duracao) : undefined,
    scenes,
    postProductionNotes: Array.isArray(obj.postProductionNotes ?? obj.notas_pos_producao)
      ? ((obj.postProductionNotes as string[] | undefined) ?? (obj.notas_pos_producao as string[] | undefined) ?? []).map(String)
      : undefined,
    renderedVideoUrl: obj.renderedVideoUrl ? String(obj.renderedVideoUrl) : obj.rendered_video_url ? String(obj.rendered_video_url) : undefined,
    renderedVideoStoragePath: obj.renderedVideoStoragePath ? String(obj.renderedVideoStoragePath) : obj.rendered_video_storage_path ? String(obj.rendered_video_storage_path) : undefined,
  }
}

const JSON_ARTIFACT_TYPES: StudioArtifactType[] = [
  'apresentacao', 'mapa_mental', 'cartoes_didaticos', 'teste',
  'tabela_dados', 'infografico', 'audio_script', 'video_script',
]

export function parseArtifactContent(type: StudioArtifactType, raw: string): ParsedArtifact {
  if (!JSON_ARTIFACT_TYPES.includes(type)) {
    return { kind: 'markdown', data: raw }
  }

  switch (type) {
    case 'apresentacao': {
      const data = parsePresentation(raw)
      return data ? { kind: 'presentation', data } : { kind: 'markdown', data: raw }
    }
    case 'mapa_mental': {
      const data = parseMindMap(raw)
      return data ? { kind: 'mindmap', data } : { kind: 'markdown', data: raw }
    }
    case 'cartoes_didaticos': {
      const data = parseFlashcards(raw)
      return data ? { kind: 'flashcards', data } : { kind: 'markdown', data: raw }
    }
    case 'teste': {
      const data = parseQuiz(raw)
      return data ? { kind: 'quiz', data } : { kind: 'markdown', data: raw }
    }
    case 'tabela_dados': {
      const data = parseDataTable(raw)
      return data ? { kind: 'datatable', data } : { kind: 'markdown', data: raw }
    }
    case 'infografico': {
      const data = parseInfographic(raw)
      return data ? { kind: 'infographic', data } : { kind: 'markdown', data: raw }
    }
    case 'audio_script': {
      const data = parseAudioScript(raw)
      return data ? { kind: 'audio_script', data } : { kind: 'markdown', data: raw }
    }
    case 'video_script': {
      const data = parseVideoScript(raw)
      return data ? { kind: 'video_script', data } : { kind: 'markdown', data: raw }
    }
    default:
      return { kind: 'markdown', data: raw }
  }
}

export function isStructuredArtifactType(type: StudioArtifactType): boolean {
  return JSON_ARTIFACT_TYPES.includes(type)
}