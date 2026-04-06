/**
 * Shared file text extraction utilities for Acervo and Caderno de Pesquisa.
 * Supports common legal research formats and extracts plain text client-side.
 *
 * PDF extraction uses the local pdfjs-dist package (bundled by Vite) instead
 * of a CDN import, avoiding Content-Security-Policy script-src violations on
 * deployments that do not whitelist external CDN domains.
 */

import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Configure the worker once at module level.
// The ?url import tells Vite to emit the file as a static asset and return its URL.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

export const SUPPORTED_TEXT_FILE_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.xml',
  '.rtf',
  '.html',
  '.htm',
  '.yaml',
  '.yml',
  '.log',
]

export const SUPPORTED_TEXT_FILE_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'text/json',
  'application/ld+json',
  'application/x-ndjson',
  'text/csv',
  'application/vnd.ms-excel',
  'application/xml',
  'text/xml',
  'application/xhtml+xml',
  'application/rtf',
  'text/rtf',
  'text/html',
  'application/x-yaml',
  'application/yaml',
  'text/yaml',
  'text/x-yaml',
  'text/log',
  'text/x-log',
]

export function getFileExtension(filename: string): string {
  const trimmed = filename.trim()
  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return ''
  return trimmed.slice(dotIndex).toLowerCase()
}

export function isSupportedTextFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return SUPPORTED_TEXT_FILE_EXTENSIONS.includes(ext) || SUPPORTED_TEXT_FILE_MIME_TYPES.includes(file.type)
}

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
  const pdf = await loadingTask.promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item: { str?: string }) => ('str' in item ? item.str : ''))
        .join(' ')
      if (pageText.trim()) pages.push(pageText)
    } catch (pageErr) {
      console.warn(`Aviso: falha ao extrair texto da página ${i}/${pdf.numPages}`, pageErr)
    }
  }
  return pages.join('\n').trim()
}

export async function extractFileText(file: File): Promise<string> {
  const ext = getFileExtension(file.name)

  // DOCX / DOC — uses mammoth for raw text extraction
  if (ext === '.docx' || ext === '.doc') {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ arrayBuffer })
      return result.value.trim()
    } catch (err) {
      console.error(`Erro ao extrair texto de ${file.name} (${ext}):`, err)
      throw new Error(`Falha ao processar arquivo ${ext.toUpperCase()}: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }

  // PDF — uses bundled pdfjs-dist
  if (ext === '.pdf' || file.type === 'application/pdf') {
    try {
      return await extractPdfText(file)
    } catch (err) {
      console.error(`Erro ao extrair texto de ${file.name} (PDF):`, err)
      throw new Error(`Falha ao processar PDF: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }

  // RTF — extract text by stripping RTF control sequences
  if (ext === '.rtf' || file.type === 'application/rtf' || file.type === 'text/rtf') {
    try {
      const rawText = await readFileAsText(file)
      return stripRtf(rawText).trim()
    } catch (err) {
      console.error(`Erro ao extrair texto de ${file.name} (RTF):`, err)
      throw new Error(`Falha ao processar RTF: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }

  // HTML/HTM — extract text by stripping tags
  if (ext === '.html' || ext === '.htm' || file.type === 'text/html' || file.type === 'application/xhtml+xml') {
    try {
      const rawHtml = await readFileAsText(file)
      return stripHtml(rawHtml).trim()
    } catch (err) {
      console.error(`Erro ao extrair texto de ${file.name} (HTML):`, err)
      throw new Error(`Falha ao processar HTML: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
    }
  }

  // All other text-like formats: TXT, MD, JSON, CSV, XML, YAML, LOG, etc.
  try {
    return await readFileAsText(file)
  } catch (err) {
    console.error(`Erro ao ler arquivo ${file.name}:`, err)
    throw new Error(`Falha ao ler arquivo: ${err instanceof Error ? err.message : 'erro desconhecido'}`)
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Pre-compiled regex for RTF hex escapes (e.g. \'ab) */
const RTF_HEX_RE = /\\'[0-9a-f]{2}/gi

/** Read a file as text with UTF-8 encoding, falling back to Latin-1 on decode issues. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      // If UTF-8 produced replacement characters, try Latin-1
      if (text.includes('\uFFFD')) {
        const latin1Reader = new FileReader()
        latin1Reader.onload = () => resolve(typeof latin1Reader.result === 'string' ? latin1Reader.result.trim() : text.trim())
        latin1Reader.onerror = () => resolve(text.trim()) // Fall back to UTF-8 result
        latin1Reader.readAsText(file, 'ISO-8859-1')
        return
      }
      resolve(text.trim())
    }
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.readAsText(file, 'UTF-8')
  })
}

/** Strip RTF control sequences and return plain text.
 * Note: Nested RTF groups (e.g. {\fonttbl{\f0 Arial;}}) are handled iteratively —
 * the outer regex pass removes the innermost groups first, and repeated application
 * catches most nested structures. For legal documents this produces good results.
 */
function stripRtf(rtf: string): string {
  // Iteratively remove innermost RTF groups to handle nesting
  let text = rtf
  let prev = ''
  while (text !== prev) {
    prev = text
    text = text.replace(/\{\\[^{}]*\}/g, '')
  }
  text = text
    .replace(/\\[a-z]+[-]?\d*\s?/gi, ' ') // Remove control words like \par, \b0
    .replace(/[{}]/g, '')                  // Remove remaining braces
    .replace(/\\\\/g, '\\')               // Unescape backslashes
  text = text.replace(RTF_HEX_RE, '')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

/** Strip HTML tags and decode entities, returning plain text. */
function stripHtml(html: string): string {
  // DOMParser is always available in modern browsers.
  // We use it to safely extract text content without regex-based HTML parsing.
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      // Remove non-visible elements for cleaner text extraction
      doc.querySelectorAll('script, style, noscript, svg, head').forEach(el => el.remove())
      return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      // Fall through to basic text extraction
    }
  }
  // Minimal fallback: just strip angle-bracketed sequences (not a sanitizer — only for
  // text extraction in non-browser environments where DOMParser is unavailable).
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
