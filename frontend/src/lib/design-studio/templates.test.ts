import { describe, expect, it } from 'vitest'
import {
  DESIGN_ARTIFACT_KINDS,
  buildDesignPreview,
  deriveTitle,
  derivePoints,
  describeDesignArtifactKind,
  designExportFileName,
  escapeHtml,
  isDesignArtifactKind,
  type DesignArtifactKind,
} from './templates'

describe('design-studio templates', () => {
  it('exposes the full artifact catalog', () => {
    expect(DESIGN_ARTIFACT_KINDS.map((entry) => entry.kind)).toEqual([
      'slides',
      'site',
      'app',
      'wireframe',
      'document',
      'animation',
    ])
  })

  it('validates artifact kinds', () => {
    expect(isDesignArtifactKind('slides')).toBe(true)
    expect(isDesignArtifactKind('unknown')).toBe(false)
    expect(isDesignArtifactKind(42)).toBe(false)
    expect(describeDesignArtifactKind('app')).toBe('App (mobile)')
  })

  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<script>"x" & \'y\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    )
  })

  it('derives a concise title and falls back when empty', () => {
    expect(deriveTitle('  Landing page para escritório jurídico. Detalhes...  ')).toBe(
      'Landing page para escritório jurídico',
    )
    expect(deriveTitle('   ')).toBe('Projeto de design')
  })

  it('derives de-duplicated points capped at the maximum', () => {
    const points = derivePoints('um; dois; dois; três; quatro; cinco; seis', 3)
    expect(points).toEqual(['um', 'dois', 'três'])
  })

  it('builds a self-contained, safely-escaped HTML document for every kind', () => {
    for (const { kind } of DESIGN_ARTIFACT_KINDS) {
      const html = buildDesignPreview('<b>Painel</b> de controle jurídico', kind as DesignArtifactKind)
      expect(html.startsWith('<!doctype html>')).toBe(true)
      expect(html).toContain('</html>')
      // The raw brief must never be injected unescaped.
      expect(html).not.toContain('<b>Painel</b>')
      expect(html).toContain('&lt;b&gt;Painel&lt;/b&gt;')
    }
  })

  it('generates a filesystem-safe export name', () => {
    expect(designExportFileName('Página inicial — Ação!', 'site')).toBe('pagina-inicial-acao-site.html')
    expect(designExportFileName('   ', 'slides')).toBe('projeto-de-design-slides.html')
  })
})
