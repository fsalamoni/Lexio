import { describe, expect, it } from 'vitest'
import {
  DESIGN_TEMPLATE_EXTENSION,
  STARTER_DESIGN_TEMPLATES,
  coerceSpec,
  parseTemplateFile,
  renderSpec,
  renderSpecMarkdown,
  serializeTemplate,
  specFromBrief,
} from './design-spec'

describe('design-studio design-spec', () => {
  it('builds a spec from a brief with derived title and points', () => {
    const spec = specFromBrief('Landing trabalhista. Hero; três diferenciais', 'site', 'vibrant')
    expect(spec.kind).toBe('site')
    expect(spec.theme).toBe('vibrant')
    expect(spec.title).toBe('Landing trabalhista')
    expect(spec.points.length).toBeGreaterThan(0)
  })

  it('renders a spec to safe HTML and to Markdown', () => {
    const spec = specFromBrief('<b>Painel</b>; Métricas', 'document')
    const html = renderSpec(spec)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toContain('<b>Painel</b>')
    const md = renderSpecMarkdown(spec)
    expect(md.startsWith('# ')).toBe(true)
    expect(md).toContain('- ')
  })

  it('round-trips a template through serialize/parse', () => {
    const spec = specFromBrief('Deck de investimento', 'slides', 'corporate')
    const serialized = serializeTemplate('Meu deck', spec)
    const parsed = parseTemplateFile(serialized)
    expect(parsed).not.toBeNull()
    expect(parsed?.name).toBe('Meu deck')
    expect(parsed?.spec).toEqual(spec)
  })

  it('coerces malformed input into a valid, sanitised spec', () => {
    const spec = coerceSpec({ kind: 'not-a-kind', theme: 'bogus', points: ['a', 3, '  ', 'b'] })
    expect(spec).not.toBeNull()
    expect(spec?.kind).toBe('site')
    expect(spec?.theme).toBe('studio')
    expect(spec?.points).toEqual(['a', 'b'])
  })

  it('accepts a bare spec object and rejects non-JSON', () => {
    const bare = parseTemplateFile(JSON.stringify({ kind: 'app', theme: 'sunset', title: 'X', points: ['y'] }))
    expect(bare?.spec.kind).toBe('app')
    expect(parseTemplateFile('not json')).toBeNull()
    expect(parseTemplateFile('42')).toBeNull()
  })

  it('ships read-only starter templates and a stable file extension', () => {
    expect(STARTER_DESIGN_TEMPLATES.every((template) => template.builtIn)).toBe(true)
    expect(DESIGN_TEMPLATE_EXTENSION).toBe('lexio-design.json')
  })
})
