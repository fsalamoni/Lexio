/**
 * Shared file text extraction utilities for Acervo and Caderno de Pesquisa.
 * Supports common legal research formats and extracts plain text client-side.
 */

// Vite-specific `?url` import for worker asset resolution in production builds.
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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
  'application/json',
  'text/json',
  'text/csv',
  'application/xml',
  'text/xml',
  'application/rtf',
  'text/rtf',
  'text/html',
  'application/x-yaml',
  'text/yaml',
]

export function getFileExtension(filename: string): string {
  return '.' + (filename.split('.').pop()?.toLowerCase() ?? '')
}

export function isSupportedTextFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return SUPPORTED_TEXT_FILE_EXTENSIONS.includes(ext) || SUPPORTED_TEXT_FILE_MIME_TYPES.includes(file.type)
}

async function extractPdfText(file: File): Promise<string> {
  ;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfWorker
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await (pdfjsLib as any).getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ')
    pages.push(pageText)
  }
  return pages.join('\n').trim()
}

export async function extractFileText(file: File): Promise<string> {
  const ext = getFileExtension(file.name)

  if (ext === '.docx' || ext === '.doc') {
    const arrayBuffer = await file.arrayBuffer()
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value.trim()
  }

  if (ext === '.pdf' || file.type === 'application/pdf') {
    return extractPdfText(file)
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.trim() : '')
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.readAsText(file, 'UTF-8')
  })
}
