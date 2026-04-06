import { describe, expect, it } from 'vitest'
import {
  SUPPORTED_TEXT_FILE_MIME_TYPES,
  getFileExtension,
  isSupportedTextFile,
} from './file-text-extractor'

describe('file-text-extractor', () => {
  it('extracts extension robustly for common edge cases', () => {
    expect(getFileExtension('arquivo.pdf')).toBe('.pdf')
    expect(getFileExtension('arquivo.final.v1.md')).toBe('.md')
    expect(getFileExtension('.env')).toBe('')
    expect(getFileExtension('semextensao')).toBe('')
    expect(getFileExtension('arquivo.')).toBe('')
    expect(getFileExtension('  Relatorio.LOG  ')).toBe('.log')
  })

  it('supports the full backend MIME compatibility set used in uploads', () => {
    const mimeTypesExpectedByBackend = [
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
      'application/x-yaml',
      'application/yaml',
      'text/yaml',
      'text/x-yaml',
      'text/html',
      'application/rtf',
      'text/rtf',
      'text/log',
      'text/x-log',
    ]
    for (const mime of mimeTypesExpectedByBackend) {
      expect(SUPPORTED_TEXT_FILE_MIME_TYPES).toContain(mime)
    }
  })

  it('accepts files by MIME even when extension is not in allowlist', () => {
    const file = new File(['{}'], 'arquivo.bin', { type: 'application/json' })
    expect(isSupportedTextFile(file)).toBe(true)
  })
})

