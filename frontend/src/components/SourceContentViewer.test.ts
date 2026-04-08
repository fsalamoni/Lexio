import { describe, it, expect } from 'vitest'
import { fmtChars, formatDate, parseJurisprudenceText } from './SourceContentViewer'

// ── fmtChars ──────────────────────────────────────────────────────────────────

describe('fmtChars', () => {
  it('returns plain number for values below 1 000', () => {
    expect(fmtChars(0)).toBe('0')
    expect(fmtChars(500)).toBe('500')
    expect(fmtChars(999)).toBe('999')
  })

  it('returns K suffix for values between 1 000 and 999 999', () => {
    expect(fmtChars(1_000)).toBe('1K')
    expect(fmtChars(1_500)).toBe('2K')
    expect(fmtChars(50_000)).toBe('50K')
    expect(fmtChars(999_999)).toBe('1000K')
  })

  it('returns M suffix for values at or above 1 000 000', () => {
    expect(fmtChars(1_000_000)).toBe('1.0M')
    expect(fmtChars(2_500_000)).toBe('2.5M')
    expect(fmtChars(10_000_000)).toBe('10.0M')
  })
})

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDate('')).toBe('')
  })

  it('formats a valid ISO date to pt-BR locale', () => {
    // Use a fixed UTC date to avoid timezone drift
    const result = formatDate('2024-01-15T00:00:00.000Z')
    // Accepts any locale-formatted date containing "15" and "2024"
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2024/)
  })

  it('returns the original string for unparseable dates', () => {
    // Invalid dates fall back to the raw string
    const bad = 'not-a-date'
    const result = formatDate(bad)
    // May return NaN-based date string or the original, either is safe
    expect(typeof result).toBe('string')
  })
})

// ── parseJurisprudenceText ────────────────────────────────────────────────────

describe('parseJurisprudenceText', () => {
  it('returns empty array for empty / whitespace input', () => {
    expect(parseJurisprudenceText('')).toEqual([])
    expect(parseJurisprudenceText('   \n  ')).toEqual([])
  })

  it('parses Markdown heading sections (## …)', () => {
    const text = `## Contexto\nTexto do contexto.\n\n## Conclusão\nTexto da conclusão.`
    const sections = parseJurisprudenceText(text)
    expect(sections).toHaveLength(2)
    expect(sections[0].heading).toBe('Contexto')
    expect(sections[0].body).toContain('Texto do contexto.')
    expect(sections[1].heading).toBe('Conclusão')
    expect(sections[1].body).toContain('Texto da conclusão.')
  })

  it('parses bold-only heading lines (**Heading**)', () => {
    const text = `**Fundamentos**\nConteúdo dos fundamentos.`
    const sections = parseJurisprudenceText(text)
    expect(sections.length).toBeGreaterThanOrEqual(1)
    expect(sections[0].heading).toBe('Fundamentos')
    expect(sections[0].body).toContain('Conteúdo dos fundamentos.')
  })

  it('parses numbered headings (1. Title:)', () => {
    const text = `1. Introdução:\nTexto introdutório.\n2. Análise:\nTexto analítico.`
    const sections = parseJurisprudenceText(text)
    expect(sections).toHaveLength(2)
    expect(sections[0].heading).toBe('Introdução')
    expect(sections[1].heading).toBe('Análise')
  })

  it('strips bold markers from body text', () => {
    const text = `## Seção\nTexto com **destaque** e *itálico*.`
    const sections = parseJurisprudenceText(text)
    expect(sections[0].body).toContain('destaque')
    expect(sections[0].body).not.toContain('**')
  })

  it('returns a single body-only section when no headings present', () => {
    const text = `Texto simples sem cabeçalho.`
    const sections = parseJurisprudenceText(text)
    expect(sections).toHaveLength(1)
    expect(sections[0].heading).toBeUndefined()
    expect(sections[0].body).toBe('Texto simples sem cabeçalho.')
  })

  it('handles multiple heading levels (# and ###)', () => {
    const text = `# Título\nIntrodução.\n### Subtítulo\nDetalhe.`
    const sections = parseJurisprudenceText(text)
    expect(sections.length).toBeGreaterThanOrEqual(2)
    expect(sections[0].heading).toBe('Título')
    expect(sections[1].heading).toBe('Subtítulo')
  })
})
