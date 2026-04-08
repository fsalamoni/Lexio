import { describe, it, expect } from 'vitest'
import { renderMarkdownToHtml, extractToc, A4_PAGE_MIN_HEIGHT } from './ReportViewer'

// ── A4_PAGE_MIN_HEIGHT (pageMode constant) ────────────────────────────────────

describe('A4_PAGE_MIN_HEIGHT (pageMode)', () => {
  it('matches expected A4 height string for page-canvas layout', () => {
    expect(A4_PAGE_MIN_HEIGHT).toBe('29.7cm')
  })
})

// ── extractToc ────────────────────────────────────────────────────────────────

describe('extractToc', () => {
  it('returns empty array for content with no headings', () => {
    expect(extractToc('Parágrafo simples sem cabeçalho.')).toEqual([])
    expect(extractToc('')).toEqual([])
  })

  it('extracts H1, H2, H3 and H4 headings with correct levels', () => {
    const md = `# Título\n## Seção\n### Subseção\n#### Detalhe`
    const toc = extractToc(md)
    expect(toc).toHaveLength(4)
    expect(toc[0]).toMatchObject({ text: 'Título', level: 1 })
    expect(toc[1]).toMatchObject({ text: 'Seção', level: 2 })
    expect(toc[2]).toMatchObject({ text: 'Subseção', level: 3 })
    expect(toc[3]).toMatchObject({ text: 'Detalhe', level: 4 })
  })

  it('generates slugified IDs from heading text', () => {
    const md = `## Fundamentação Jurídica`
    const [item] = extractToc(md)
    expect(item.id).toBe('fundamentao-jurdica')
  })

  it('strips bold markers from heading text', () => {
    const md = `## **Seção Importante**`
    const [item] = extractToc(md)
    expect(item.text).toBe('Seção Importante')
    expect(item.text).not.toContain('**')
  })

  it('ignores non-heading lines', () => {
    const md = `# Cabeçalho\nTexto normal\n- Item de lista\n## Outro`
    const toc = extractToc(md)
    expect(toc).toHaveLength(2)
  })
})

// ── renderMarkdownToHtml ──────────────────────────────────────────────────────

describe('renderMarkdownToHtml', () => {
  it('escapes HTML special characters', () => {
    const html = renderMarkdownToHtml('A & B < C > D')
    expect(html).toContain('&amp;')
    expect(html).toContain('&lt;')
    expect(html).toContain('&gt;')
  })

  it('renders H1–H4 headings with IDs', () => {
    const html = renderMarkdownToHtml('# Meu Título')
    expect(html).toContain('<h1')
    expect(html).toContain('id=')
    expect(html).toContain('Meu Título')
  })

  it('renders H2 heading', () => {
    const html = renderMarkdownToHtml('## Seção')
    expect(html).toContain('<h2')
    expect(html).toContain('Seção')
  })

  it('renders bold text', () => {
    const html = renderMarkdownToHtml('**negrito**')
    expect(html).toContain('<strong')
    expect(html).toContain('negrito')
  })

  it('renders italic text', () => {
    const html = renderMarkdownToHtml('*itálico*')
    expect(html).toContain('<em>')
    expect(html).toContain('itálico')
  })

  it('renders unordered list items', () => {
    const html = renderMarkdownToHtml('- item um\n- item dois')
    expect(html).toContain('<li')
    expect(html).toContain('item um')
  })

  it('renders ordered list items', () => {
    const html = renderMarkdownToHtml('1. primeiro\n2. segundo')
    expect(html).toContain('list-decimal')
    expect(html).toContain('primeiro')
  })

  it('renders inline code', () => {
    const html = renderMarkdownToHtml('use `const x = 1`')
    expect(html).toContain('<code')
    expect(html).toContain('const x = 1')
  })

  it('renders blockquotes', () => {
    const html = renderMarkdownToHtml('> citação importante')
    expect(html).toContain('<blockquote')
    expect(html).toContain('citação importante')
  })

  it('renders hyperlinks', () => {
    const html = renderMarkdownToHtml('[STF](https://stf.jus.br)')
    expect(html).toContain('<a href="https://stf.jus.br"')
    expect(html).toContain('STF')
  })

  it('renders horizontal rules', () => {
    const html = renderMarkdownToHtml('---')
    expect(html).toContain('<hr')
  })

  it('wraps output in paragraph tags', () => {
    const html = renderMarkdownToHtml('texto simples')
    expect(html).toContain('<p')
    expect(html).toContain('texto simples')
  })
})
