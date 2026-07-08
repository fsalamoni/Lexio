import { describe, expect, it } from 'vitest'
import { buildPreviewHtml } from './preview'
import { projectFromFiles } from './project'

describe('buildPreviewHtml', () => {
  it('returns a placeholder when there is no HTML entry point', () => {
    const result = buildPreviewHtml(projectFromFiles([{ path: 'api/server.js', content: 'x' }]))
    expect(result.hasPreview).toBe(false)
    expect(result.html).toContain('Pré-visualização indisponível')
    expect(result.note).toContain('back-end')
  })

  it('inlines a local stylesheet and script into the entry HTML', () => {
    const project = projectFromFiles([
      { path: 'index.html', content: '<html><head><link rel="stylesheet" href="style.css"></head><body><script src="app.js"></script></body></html>' },
      { path: 'style.css', content: 'body{color:red}' },
      { path: 'app.js', content: 'console.log(1)' },
    ])
    const result = buildPreviewHtml(project)
    expect(result.hasPreview).toBe(true)
    expect(result.html).toContain('<style data-src="style.css">')
    expect(result.html).toContain('body{color:red}')
    expect(result.html).toContain('<script data-src="app.js">')
    expect(result.html).toContain('console.log(1)')
    expect(result.html).not.toContain('href="style.css"')
  })

  it('leaves external references untouched', () => {
    const project = projectFromFiles([
      { path: 'index.html', content: '<link rel="stylesheet" href="https://cdn.example.com/a.css"><script src="https://cdn.example.com/b.js"></script>' },
    ])
    const result = buildPreviewHtml(project)
    expect(result.html).toContain('https://cdn.example.com/a.css')
    expect(result.html).toContain('https://cdn.example.com/b.js')
  })

  it('neutralises a closing tag inside injected script to prevent breakout', () => {
    const project = projectFromFiles([
      { path: 'index.html', content: '<script src="x.js"></script>' },
      { path: 'x.js', content: 'const s = "</script><img src=x onerror=alert(1)>"' },
    ])
    const result = buildPreviewHtml(project)
    // The raw closing tag must not appear verbatim inside the injected content.
    expect(result.html).toContain('<\\/script')
  })

  it('inlines a binary data-URI asset referenced by an <img>', () => {
    const dataUri = 'data:image/png;base64,AAAA'
    const project = projectFromFiles([
      { path: 'index.html', content: '<img src="hero.png">' },
      { path: 'hero.png', content: dataUri, binary: true },
    ])
    const result = buildPreviewHtml(project)
    expect(result.html).toContain(`src="${dataUri}"`)
  })

  it('flags projects that use ES modules as a preview limitation', () => {
    const project = projectFromFiles([
      { path: 'index.html', content: '<script type="module" src="main.js"></script>' },
      { path: 'main.js', content: 'import { x } from "./x.js"; export const y = 1' },
    ])
    const result = buildPreviewHtml(project)
    expect(result.note).toContain('módulos ES')
  })
})
