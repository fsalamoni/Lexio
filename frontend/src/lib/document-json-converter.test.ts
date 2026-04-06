/**
 * Tests for the document-json-converter module.
 */

import { describe, it, expect } from 'vitest'
import {
  textToStructuredJson,
  serializeStructuredJson,
  parseStructuredJson,
  resolveTextContent,
  getStructuredMeta,
  getStructuredSections,
} from './document-json-converter'

describe('document-json-converter', () => {
  const SAMPLE_TEXT = `CAPÍTULO I — DOS DIREITOS FUNDAMENTAIS

Art. 1º Todo cidadão tem direito à vida, à liberdade e à igualdade.

Art. 2º São direitos sociais a educação, a saúde e o trabalho.

CAPÍTULO II — DAS GARANTIAS

Art. 3º O Estado garante a todos o acesso à justiça.

Este parágrafo trata dos procedimentos legais aplicáveis em casos de violação dos direitos fundamentais elencados no capítulo anterior.`

  it('converts text to structured JSON with correct schema', () => {
    const result = textToStructuredJson(SAMPLE_TEXT, 'constituicao.pdf', 5)
    expect(result.v).toBe(1)
    expect(result.meta.filename).toBe('constituicao.pdf')
    expect(result.meta.format).toBe('pdf')
    expect(result.meta.pages).toBe(5)
    expect(result.meta.paragraphs).toBeGreaterThan(0)
    expect(result.meta.chars_original).toBe(SAMPLE_TEXT.length)
    expect(result.meta.chars_stored).toBeGreaterThan(0)
    expect(result.meta.compression_ratio).toBeGreaterThanOrEqual(0)
    expect(result.sections.length).toBeGreaterThan(0)
    expect(result.full_text).toBeTruthy()
  })

  it('detects section headings (ALL CAPS, articles)', () => {
    const result = textToStructuredJson(SAMPLE_TEXT, 'doc.pdf')
    const titles = result.sections.map(s => s.title)
    // Should detect at least one section heading
    expect(titles.length).toBeGreaterThanOrEqual(2)
    // The first section should be the chapter heading
    expect(titles.some(t => t.includes('CAPÍTULO'))).toBe(true)
  })

  it('normalizes whitespace in full_text', () => {
    const messy = 'Hello   world.\n\n\n\n\nSecond   paragraph.\n\n\nThird.'
    const result = textToStructuredJson(messy, 'test.txt')
    // Should collapse multiple spaces and excess newlines
    expect(result.full_text).not.toContain('   ')
    expect(result.full_text).not.toMatch(/\n{3,}/)
  })

  it('produces smaller output than raw text for real documents', () => {
    // Simulate a document with repetitive whitespace
    const longText = Array(50).fill(
      'Este é um parágrafo de um documento jurídico com bastante    espaço   e\n' +
      'quebras de linha    desnecessárias   que podem ser compactadas.\n\n\n\n',
    ).join('')
    const result = textToStructuredJson(longText, 'documento.docx')
    const jsonStr = serializeStructuredJson(result)
    // The JSON should store normalized text smaller than raw
    expect(result.meta.compression_ratio).toBeGreaterThan(0)
    // But the JSON itself includes structure overhead, so verify full_text is smaller
    expect(result.meta.chars_stored).toBeLessThan(result.meta.chars_original)
  })

  it('serializes and parses round-trip correctly', () => {
    const original = textToStructuredJson(SAMPLE_TEXT, 'test.pdf', 3)
    const serialized = serializeStructuredJson(original)
    const parsed = parseStructuredJson(serialized)
    expect(parsed).not.toBeNull()
    expect(parsed!.v).toBe(1)
    expect(parsed!.meta.filename).toBe('test.pdf')
    expect(parsed!.full_text).toBe(original.full_text)
    expect(parsed!.sections.length).toBe(original.sections.length)
  })

  it('parseStructuredJson returns null for plain text', () => {
    expect(parseStructuredJson('This is plain text')).toBeNull()
    expect(parseStructuredJson('')).toBeNull()
    expect(parseStructuredJson('{"v":2,"other":"data"}')).toBeNull()
    expect(parseStructuredJson('{"name":"test"}')).toBeNull()
  })

  it('resolveTextContent returns full_text for structured JSON', () => {
    const doc = textToStructuredJson(SAMPLE_TEXT, 'test.txt')
    const serialized = serializeStructuredJson(doc)
    const resolved = resolveTextContent(serialized)
    expect(resolved).toBe(doc.full_text)
  })

  it('resolveTextContent returns plain text as-is for legacy content', () => {
    const plain = 'This is legacy plain text content.'
    expect(resolveTextContent(plain)).toBe(plain)
  })

  it('getStructuredMeta returns metadata for JSON docs', () => {
    const doc = textToStructuredJson(SAMPLE_TEXT, 'memo.md')
    const serialized = serializeStructuredJson(doc)
    const meta = getStructuredMeta(serialized)
    expect(meta).not.toBeNull()
    expect(meta!.format).toBe('md')
    expect(meta!.filename).toBe('memo.md')
  })

  it('getStructuredMeta returns null for legacy plain text', () => {
    expect(getStructuredMeta('Just plain text')).toBeNull()
  })

  it('getStructuredSections returns sections for JSON docs', () => {
    const doc = textToStructuredJson(SAMPLE_TEXT, 'lei.pdf')
    const serialized = serializeStructuredJson(doc)
    const sections = getStructuredSections(serialized)
    expect(sections).not.toBeNull()
    expect(sections!.length).toBeGreaterThan(0)
    expect(sections![0]).toHaveProperty('title')
    expect(sections![0]).toHaveProperty('paragraphs')
  })

  it('handles empty text gracefully', () => {
    const result = textToStructuredJson('', 'empty.txt')
    expect(result.meta.paragraphs).toBe(0)
    expect(result.sections.length).toBeGreaterThanOrEqual(0)
    expect(result.full_text).toBe('')
  })

  it('detects format correctly from various extensions', () => {
    expect(textToStructuredJson('x', 'a.pdf').meta.format).toBe('pdf')
    expect(textToStructuredJson('x', 'b.docx').meta.format).toBe('docx')
    expect(textToStructuredJson('x', 'c.md').meta.format).toBe('md')
    expect(textToStructuredJson('x', 'd.json').meta.format).toBe('json')
    expect(textToStructuredJson('x', 'e.csv').meta.format).toBe('csv')
    expect(textToStructuredJson('x', 'f.xml').meta.format).toBe('xml')
    expect(textToStructuredJson('x', 'g.yaml').meta.format).toBe('yaml')
    expect(textToStructuredJson('x', 'h.html').meta.format).toBe('html')
    expect(textToStructuredJson('x', 'i.rtf').meta.format).toBe('rtf')
    expect(textToStructuredJson('x', 'j.log').meta.format).toBe('log')
    expect(textToStructuredJson('x', 'k.unknown').meta.format).toBe('txt')
  })
})
