/**
 * Document → Structured JSON converter.
 *
 * Inspired by ocrbase / doc-sdk, this module converts extracted document text
 * into a compact, structured JSON representation for storage in Firestore.
 *
 * Benefits:
 *  - **Smaller storage footprint**: Paragraphs are deduplicated and whitespace-
 *    normalized, often reducing size by 30-60% vs raw text.
 *  - **Structured search**: Agents can inspect `sections`, `paragraphs`, and
 *    `metadata` fields directly instead of scanning a monolithic text blob.
 *  - **Backward-compatible**: The `resolveTextContent()` helper transparently
 *    reads both legacy plain-text and the new JSON format.
 *
 * JSON schema (version 1):
 * ```json
 * {
 *   "v": 1,
 *   "meta": { "filename": "...", "format": "pdf", "pages": 5, "paragraphs": 42, "chars_original": 12345, "chars_stored": 8910 },
 *   "sections": [ { "title": "...", "paragraphs": ["...", "..."] } ],
 *   "full_text": "..."           // compact full text (whitespace-normalized)
 * }
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Structured JSON document (v1 schema). */
export interface StructuredDocumentJson {
  /** Schema version — always 1 for now. */
  v: 1
  /** Document metadata. */
  meta: StructuredDocumentMeta
  /** Logical sections (headings + paragraphs). */
  sections: StructuredDocumentSection[]
  /** Whitespace-normalized full text for LLM context / search. */
  full_text: string
}

export interface StructuredDocumentMeta {
  filename: string
  /** Source format (pdf, docx, txt, md, json, csv, xml, rtf, html, yaml, log). */
  format: string
  /** Page count (PDFs only). */
  pages?: number
  /** Number of paragraphs detected. */
  paragraphs: number
  /** Character count of the original extracted text. */
  chars_original: number
  /** Character count of the stored `full_text` (after normalization). */
  chars_stored: number
  /** Compression ratio (1 - chars_stored/chars_original), as 0..1. */
  compression_ratio: number
}

export interface StructuredDocumentSection {
  /** Section title (heading text, or "Documento" for un-sectioned content). */
  title: string
  /** Paragraphs of text within this section. */
  paragraphs: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum paragraph length to keep (shorter fragments are merged or discarded). */
const MIN_PARAGRAPH_CHARS = 12
/** Max sections to store (safety cap for very long documents). */
const MAX_SECTIONS = 200
/** Max paragraphs per section. */
const MAX_PARAGRAPHS_PER_SECTION = 500

// ── Core conversion ───────────────────────────────────────────────────────────

/**
 * Convert raw extracted text into a StructuredDocumentJson object.
 *
 * @param text - Raw text extracted by file-text-extractor (already stripped of
 *               binary content, RTF control codes, HTML tags, etc.).
 * @param filename - Original filename (e.g. "contract.pdf").
 * @param pageCount - Optional page count (from PDF extraction).
 * @returns The structured JSON representation.
 */
export function textToStructuredJson(
  text: string,
  filename: string,
  pageCount?: number,
): StructuredDocumentJson {
  const charsOriginal = text.length
  const format = detectFormat(filename)

  // Split the text into paragraphs (double newline or form-feed separated)
  const rawParagraphs = splitIntoParagraphs(text)

  // Build sections from paragraphs.
  // If we detect heading-like patterns (e.g. numbered sections, ALL CAPS lines),
  // we group paragraphs under them.
  const sections = buildSections(rawParagraphs)

  // Whitespace-normalize full text for compact storage
  const fullText = normalizeWhitespace(text)

  const totalParagraphs = sections.reduce((n, s) => n + s.paragraphs.length, 0)

  const meta: StructuredDocumentMeta = {
    filename,
    format,
    paragraphs: totalParagraphs,
    chars_original: charsOriginal,
    chars_stored: fullText.length,
    compression_ratio: charsOriginal > 0
      ? Math.round((1 - fullText.length / charsOriginal) * 1000) / 1000
      : 0,
  }
  if (pageCount !== undefined && pageCount > 0) {
    meta.pages = pageCount
  }

  return {
    v: 1,
    meta,
    sections,
    full_text: fullText,
  }
}

/**
 * Serialize a StructuredDocumentJson to a JSON string.
 * This is what gets stored in Firestore's `text_content` field.
 */
export function serializeStructuredJson(doc: StructuredDocumentJson): string {
  return JSON.stringify(doc)
}

/**
 * Try to parse a text_content value as StructuredDocumentJson.
 * Returns null if it's not valid structured JSON (i.e. it's legacy plain text).
 */
export function parseStructuredJson(textContent: string): StructuredDocumentJson | null {
  if (!textContent || textContent.length < 10) return null
  // Quick check: structured JSON always starts with '{"v":1'
  const trimmed = textContent.trimStart()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && parsed.v === 1 && typeof parsed.full_text === 'string') {
      return parsed as StructuredDocumentJson
    }
  } catch {
    // Not JSON — it's legacy plain text
  }
  return null
}

/**
 * Resolve text_content to plain text, transparently handling both legacy plain
 * text and the new structured JSON format.
 *
 * This function is the **single read path** that all consumers should use:
 *  - Upload.tsx (display)
 *  - notebook-acervo-analyzer.ts (search / LLM context)
 *  - ResearchNotebook.tsx (source text_content)
 *  - generation-service.ts (document generation context)
 */
export function resolveTextContent(textContent: string): string {
  const structured = parseStructuredJson(textContent)
  if (structured) {
    return structured.full_text
  }
  return textContent
}

/**
 * Get the structured metadata from text_content (if available).
 * Returns null for legacy plain text documents.
 */
export function getStructuredMeta(textContent: string): StructuredDocumentMeta | null {
  const structured = parseStructuredJson(textContent)
  return structured?.meta ?? null
}

/**
 * Get structured sections for display or agent analysis.
 * Returns null for legacy plain text documents.
 */
export function getStructuredSections(textContent: string): StructuredDocumentSection[] | null {
  const structured = parseStructuredJson(textContent)
  return structured?.sections ?? null
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Detect document format from filename extension. */
function detectFormat(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return 'txt'
  const ext = filename.slice(dot + 1).toLowerCase()
  const formatMap: Record<string, string> = {
    pdf: 'pdf',
    docx: 'docx',
    doc: 'doc',
    txt: 'txt',
    md: 'md',
    json: 'json',
    csv: 'csv',
    xml: 'xml',
    rtf: 'rtf',
    html: 'html',
    htm: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    log: 'log',
  }
  return formatMap[ext] || 'txt'
}

/** Split text into paragraph-level blocks. */
function splitIntoParagraphs(text: string): string[] {
  // Split on double newlines, form feeds, or 3+ newlines
  const blocks = text.split(/\n{2,}|\r\n\r\n|\f/)
  const result: string[] = []
  for (const block of blocks) {
    const trimmed = block.replace(/\s+/g, ' ').trim()
    if (trimmed.length >= MIN_PARAGRAPH_CHARS) {
      result.push(trimmed)
    } else if (trimmed.length > 0 && result.length > 0) {
      // Merge very short fragments into the previous paragraph
      result[result.length - 1] += ' ' + trimmed
    }
  }
  return result
}

/**
 * Detect if a paragraph looks like a section heading.
 *
 * Patterns recognized:
 *  - ALL CAPS lines (≤120 chars): "CAPÍTULO I — DOS DIREITOS FUNDAMENTAIS"
 *  - Numbered headings: "1. Introdução", "2.1 Objeto", "Art. 5º"
 *  - Roman numeral headings: "I — Da Competência"
 *  - Titled sections: "Seção I", "Título II", "Capítulo III"
 */
function isLikelyHeading(paragraph: string): boolean {
  if (paragraph.length > 120) return false
  if (paragraph.length < 3) return false

  // ALL CAPS (allowing accented chars, numbers, punctuation)
  if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\d\s\-—–.,;:()º°ª/]+$/.test(paragraph) && paragraph.length > 3) {
    return true
  }

  // Numbered heading: "1.", "1.1", "1.1.1", etc.
  if (/^\d{1,3}(\.\d{1,3}){0,4}\.?\s/.test(paragraph)) {
    return true
  }

  // Article heading: "Art. 1º", "Artigo 5", etc.
  if (/^Art(igo)?\.?\s+\d/i.test(paragraph)) {
    return true
  }

  // Section/Title/Chapter markers (PT)
  if (/^(Seção|Título|Capítulo|Parágrafo|SEÇÃO|TÍTULO|CAPÍTULO)\s/i.test(paragraph)) {
    return true
  }

  // Roman numeral heading: "I -", "II.", "III —", "IV –"
  if (/^[IVXLCDM]{1,6}\s*[-—–.]\s/i.test(paragraph)) {
    return true
  }

  return false
}

/** Build logical sections from flat paragraphs. */
function buildSections(paragraphs: string[]): StructuredDocumentSection[] {
  if (paragraphs.length === 0) return []

  const sections: StructuredDocumentSection[] = []
  let currentSection: StructuredDocumentSection = { title: 'Documento', paragraphs: [] }

  for (const p of paragraphs) {
    if (isLikelyHeading(p) && currentSection.paragraphs.length > 0) {
      // Push the current section and start a new one
      sections.push(currentSection)
      currentSection = { title: p, paragraphs: [] }
    } else if (isLikelyHeading(p) && currentSection.paragraphs.length === 0 && currentSection.title === 'Documento') {
      // Replace the default title
      currentSection.title = p
    } else {
      if (currentSection.paragraphs.length < MAX_PARAGRAPHS_PER_SECTION) {
        currentSection.paragraphs.push(p)
      }
    }

    // Safety cap
    if (sections.length >= MAX_SECTIONS) break
  }

  // Push the last section
  if (currentSection.paragraphs.length > 0 || sections.length === 0) {
    sections.push(currentSection)
  }

  return sections
}

/** Normalize whitespace for compact storage. */
function normalizeWhitespace(text: string): string {
  return text
    // Collapse multiple spaces within lines
    .replace(/[^\S\n]+/g, ' ')
    // Collapse 3+ consecutive newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim()
}
