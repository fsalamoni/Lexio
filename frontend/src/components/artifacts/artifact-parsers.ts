/**
 * Artifact Parsers — typed JSON parsing for structured artifacts.
 *
 * Each visual/interactive artifact type has a JSON schema that the LLM is
 * instructed to follow.  These parsers extract that JSON from raw content
 * (which may include Markdown fences or preamble) and validate the shape.
 * On failure they return `null` so the caller can fall back to Markdown.
 */

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Try to extract a JSON block from content that may include ```json fences or preamble text */
function extractJSON(raw: string): string | null {
  // Try ```json ... ``` fence first
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()

  // Try first { ... } or [ ... ] block
  const braceStart = raw.indexOf('{')
  const bracketStart = raw.indexOf('[')
  if (braceStart === -1 && bracketStart === -1) return null

  const start = braceStart === -1 ? bracketStart
    : bracketStart === -1 ? braceStart
    : Math.min(braceStart, bracketStart)

  const openChar = raw[start]
  const closeChar = openChar === '{' ? '}' : ']'

  // Find matching close
  let depth = 0
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === openChar) depth++
    else if (raw[i] === closeChar) depth--
    if (depth === 0) return raw.slice(start, i + 1)
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

// ── Type definitions ────────────────────────────────────────────────────────

// -- Presentation
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

// -- Mind Map
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

// -- Flashcards
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

// -- Quiz
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

// -- Data Table
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

// -- Infographic
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

// -- Audio Script
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

// -- Video Script
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

// ── Union type ──────────────────────────────────────────────────────────────

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

// ── Individual parsers ──────────────────────────────────────────────────────

function parsePresentation(raw: string): ParsedPresentation | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.slides)) return null
  const slides: ParsedSlide[] = obj.slides.map((s: Record<string, unknown>, i: number) => ({
    number: (s.number as number) ?? i + 1,
    title: String(s.title ?? `Slide ${i + 1}`),
    bullets: Array.isArray(s.bullets) ? s.bullets.map(String) : [],
    speakerNotes: String(s.speakerNotes ?? s.speaker_notes ?? ''),
    visualSuggestion: s.visualSuggestion ? String(s.visualSuggestion) : s.visual_suggestion ? String(s.visual_suggestion) : undefined,
    renderedImageUrl: s.renderedImageUrl ? String(s.renderedImageUrl) : s.rendered_image_url ? String(s.rendered_image_url) : undefined,
    renderedImageStoragePath: s.renderedImageStoragePath ? String(s.renderedImageStoragePath) : s.rendered_image_storage_path ? String(s.rendered_image_storage_path) : undefined,
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

  function mapNode(n: Record<string, unknown>): MindMapNode {
    return {
      label: String(n.label ?? ''),
      icon: n.icon ? String(n.icon) : undefined,
      color: n.color ? String(n.color) : undefined,
      children: Array.isArray(n.children) ? n.children.map((c: Record<string, unknown>) => mapNode(c)) : undefined,
    }
  }
  return {
    centralNode,
    branches: branches.map((b: Record<string, unknown>) => mapNode(b)),
    renderedImageUrl: obj.renderedImageUrl ? String(obj.renderedImageUrl) : obj.rendered_image_url ? String(obj.rendered_image_url) : undefined,
    renderedImageStoragePath: obj.renderedImageStoragePath ? String(obj.renderedImageStoragePath) : obj.rendered_image_storage_path ? String(obj.rendered_image_storage_path) : undefined,
  }
}

function parseFlashcards(raw: string): ParsedFlashcards | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.categories)) return null
  const categories: ParsedFlashcardCategory[] = obj.categories.map((c: Record<string, unknown>) => ({
    name: String(c.name ?? 'Geral'),
    cards: Array.isArray(c.cards) ? c.cards.map((card: Record<string, unknown>) => ({
      front: String(card.front ?? card.frente ?? ''),
      back: String(card.back ?? card.verso ?? ''),
      difficulty: card.difficulty ? String(card.difficulty) : card.dificuldade ? String(card.dificuldade) : undefined,
      tip: card.tip ? String(card.tip) : card.dica ? String(card.dica) : undefined,
    })) : [],
  }))
  const totalCards = categories.reduce((sum, c) => sum + c.cards.length, 0)
  if (totalCards === 0) return null
  return { title: obj.title ? String(obj.title) : undefined, categories }
}

function parseQuiz(raw: string): ParsedQuiz | null {
  const obj = safeParse(raw) as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.questions)) return null
  const questions: ParsedQuizQuestion[] = obj.questions.map((q: Record<string, unknown>, i: number) => ({
    number: (q.number as number) ?? i + 1,
    type: String(q.type ?? q.tipo ?? 'multipla_escolha'),
    text: String(q.text ?? q.texto ?? ''),
    options: Array.isArray(q.options) ? q.options.map((o: Record<string, unknown>) => ({
      label: String(o.label ?? o.letra ?? ''),
      text: String(o.text ?? o.texto ?? ''),
    })) : undefined,
    pairs: Array.isArray(q.pairs) ? q.pairs.map((p: Record<string, unknown>) => ({
      left: String(p.left ?? p.esquerda ?? ''),
      right: String(p.right ?? p.direita ?? ''),
    })) : undefined,
    answer: String(q.answer ?? q.resposta ?? ''),
    explanation: String(q.explanation ?? q.explicacao ?? ''),
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
  const columns: ParsedTableColumn[] = obj.columns.map((c: Record<string, unknown>) => ({
    key: String(c.key ?? ''),
    label: String(c.label ?? c.key ?? ''),
    align: (['left', 'right', 'center'].includes(String(c.align ?? '')) ? String(c.align) : 'left') as 'left' | 'right' | 'center',
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
  const sections: InfographicSection[] = obj.sections.map((s: Record<string, unknown>) => ({
    icon: s.icon ? String(s.icon) : undefined,
    title: String(s.title ?? s.titulo ?? ''),
    content: String(s.content ?? s.conteudo ?? ''),
    highlight: s.highlight ? String(s.highlight) : undefined,
    stats: Array.isArray(s.stats) ? s.stats.map((st: Record<string, unknown>) => ({
      label: String(st.label ?? ''),
      value: (st.value ?? st.valor ?? '') as string | number,
      unit: st.unit ? String(st.unit) : undefined,
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
  const segments: AudioSegment[] = obj.segments.map((s: Record<string, unknown>) => ({
    time: String(s.time ?? s.tempo ?? '00:00'),
    type: String(s.type ?? s.tipo ?? 'narracao'),
    speaker: s.speaker ? String(s.speaker) : s.locutor ? String(s.locutor) : undefined,
    text: String(s.text ?? s.texto ?? ''),
    notes: s.notes ? String(s.notes) : s.notas ? String(s.notas) : undefined,
  }))
  return {
    title: String(obj.title ?? obj.titulo ?? 'Resumo em Áudio'),
    duration: obj.duration ? String(obj.duration) : obj.duracao ? String(obj.duracao) : undefined,
    segments,
    productionNotes: Array.isArray(obj.productionNotes ?? obj.notas_producao)
      ? (obj.productionNotes as string[] ?? obj.notas_producao as string[]).map(String)
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
  const scenes: VideoScene[] = obj.scenes.map((s: Record<string, unknown>, i: number) => ({
    number: (s.number as number) ?? (s.numero as number) ?? i + 1,
    time: String(s.time ?? s.tempo ?? '00:00'),
    narration: String(s.narration ?? s.narracao ?? ''),
    visual: String(s.visual ?? ''),
    transition: s.transition ? String(s.transition) : s.transicao ? String(s.transicao) : undefined,
    broll: s.broll ? String(s.broll) : s.b_roll ? String(s.b_roll) : undefined,
    lowerThird: s.lowerThird ? String(s.lowerThird) : s.lower_third ? String(s.lower_third) : undefined,
    notes: s.notes ? String(s.notes) : s.notas ? String(s.notas) : undefined,
  }))
  return {
    title: String(obj.title ?? obj.titulo ?? 'Vídeo'),
    duration: obj.duration ? String(obj.duration) : obj.duracao ? String(obj.duracao) : undefined,
    scenes,
    postProductionNotes: Array.isArray(obj.postProductionNotes ?? obj.notas_pos_producao)
      ? (obj.postProductionNotes as string[] ?? obj.notas_pos_producao as string[]).map(String)
      : undefined,
    renderedVideoUrl: obj.renderedVideoUrl ? String(obj.renderedVideoUrl) : obj.rendered_video_url ? String(obj.rendered_video_url) : undefined,
    renderedVideoStoragePath: obj.renderedVideoStoragePath ? String(obj.renderedVideoStoragePath) : obj.rendered_video_storage_path ? String(obj.rendered_video_storage_path) : undefined,
  }
}

// ── Main parser ─────────────────────────────────────────────────────────────

import type { StudioArtifactType } from '../../lib/firestore-service'

const JSON_ARTIFACT_TYPES: StudioArtifactType[] = [
  'apresentacao', 'mapa_mental', 'cartoes_didaticos', 'teste',
  'tabela_dados', 'infografico', 'audio_script', 'video_script',
]

/**
 * Parse raw artifact content into a typed structure.
 * Returns `{ kind: 'markdown', data: raw }` as fallback for text artifacts
 * or when JSON parsing fails.
 */
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

/** Check whether an artifact type should produce structured JSON output */
export function isStructuredArtifactType(type: StudioArtifactType): boolean {
  return JSON_ARTIFACT_TYPES.includes(type)
}
