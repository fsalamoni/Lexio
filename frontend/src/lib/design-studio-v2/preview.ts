/**
 * Design Studio v2 — live preview bundler.
 *
 * Assembles a self-contained HTML document from the virtual project so it can
 * be rendered in a sandboxed `<iframe srcdoc>`. For a static site (HTML + CSS +
 * JS + data-URI assets) it inlines every local reference so the preview works
 * with no network and under a strict CSP. Projects without an HTML entry point
 * (e.g. a pure backend) get a friendly placeholder that lists the files.
 *
 * This is intentionally a resolver, not a bundler: local `<link>`, `<script>`
 * and asset references are inlined, but a module graph (import chains between
 * source files) is not resolved — that is a documented limitation surfaced to
 * the user, matching what a zero-build in-browser preview can honestly do.
 */

import type { DesignStudioProject } from './types'
import { guessPreviewEntry, normalizeProjectPath } from './project'

export interface PreviewResult {
  html: string
  hasPreview: boolean
  note?: string
}

/** Resolve a reference relative to a base file's directory into a project path. */
function resolveRelative(basePath: string, ref: string): string {
  const cleanRef = ref.trim().replace(/^\.\//, '')
  if (/^(https?:)?\/\//i.test(cleanRef) || cleanRef.startsWith('data:') || cleanRef.startsWith('#') || cleanRef.startsWith('mailto:')) {
    return '' // external / non-file reference — leave untouched
  }
  if (cleanRef.startsWith('/')) return normalizeProjectPath(cleanRef)
  const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : ''
  const segments = `${baseDir ? `${baseDir}/` : ''}${cleanRef}`.split('/')
  const stack: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') stack.pop()
    else stack.push(segment)
  }
  return stack.join('/')
}

/** Prevent injected content from breaking out of its <style>/<script> host. */
function neutralizeClosingTag(content: string, tag: 'style' | 'script'): string {
  const re = new RegExp(`</(${tag})`, 'gi')
  return content.replace(re, '<\\/$1')
}

function htmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function placeholderDocument(project: DesignStudioProject, message: string): string {
  const paths = Object.keys(project.files).sort()
  const list = paths.length
    ? `<ul>${paths.map((p) => `<li><code>${htmlEscape(p)}</code></li>`).join('')}</ul>`
    : '<p class="muted">Nenhum arquivo no projeto ainda.</p>'
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:#0b0f14; color:#e6edf3; display:flex; min-height:100vh; }
  .wrap { margin:auto; max-width:640px; padding:40px 28px; }
  h1 { font-size:1.05rem; font-weight:650; margin:0 0 6px; }
  p { margin:0 0 14px; line-height:1.5; color:#9fb0c0; font-size:.9rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:.82rem; color:#7ee3c7; }
  ul { margin:8px 0 0; padding-left:18px; }
  li { margin:2px 0; font-size:.85rem; }
  .muted { color:#6b7a8a; }
</style></head><body><div class="wrap">
  <h1>Pré-visualização indisponível</h1>
  <p>${htmlEscape(message)}</p>
  ${list}
</div></body></html>`
}

/**
 * Build the preview document for a project. Returns the HTML string to feed an
 * iframe's `srcdoc`, whether a real preview was produced and an optional note.
 */
export function buildPreviewHtml(project: DesignStudioProject): PreviewResult {
  const entry = project.previewEntry && project.files[project.previewEntry]
    ? project.previewEntry
    : guessPreviewEntry(project)

  if (!entry || !project.files[entry]) {
    return {
      hasPreview: false,
      note: 'Este projeto ainda não tem um arquivo HTML de entrada (ex.: index.html). Projetos de back-end ou de código puro não têm pré-visualização web.',
      html: placeholderDocument(project, 'Adicione um index.html (ou peça ao estúdio para criar uma página) para ver a pré-visualização ao vivo.'),
    }
  }

  let html = project.files[entry].content
  let inlinedModuleGraph = false

  // Inline local stylesheets: <link rel="stylesheet" href="...">
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) return tag
    const resolved = resolveRelative(entry, hrefMatch[1])
    const file = resolved && project.files[resolved]
    if (!file) return tag
    return `<style data-src="${htmlEscape(resolved)}">\n${neutralizeClosingTag(file.content, 'style')}\n</style>`
  })

  // Inline local scripts: <script src="..."></script>
  html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, attrs: string) => {
    const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i)
    if (!srcMatch) return tag
    const resolved = resolveRelative(entry, srcMatch[1])
    const file = resolved && project.files[resolved]
    if (!file) return tag
    if (/\bimport\b|\bexport\b/.test(file.content)) inlinedModuleGraph = true
    const isModule = /type\s*=\s*["']module["']/i.test(attrs)
    return `<script${isModule ? ' type="module"' : ''} data-src="${htmlEscape(resolved)}">\n${neutralizeClosingTag(file.content, 'script')}\n</script>`
  })

  // Inline local <img src>, <source src> and generic asset references that
  // resolve to a binary (data-URI) file in the project.
  html = html.replace(/\b(src|href)\s*=\s*["']([^"']+)["']/gi, (whole, attr: string, ref: string) => {
    const resolved = resolveRelative(entry, ref)
    const file = resolved && project.files[resolved]
    if (!file || !file.binary) return whole
    return `${attr}="${file.content}"`
  })

  const notes: string[] = []
  if (inlinedModuleGraph) {
    notes.push('Este projeto usa módulos ES (import/export). A pré-visualização inline resolve apenas referências diretas — cadeias de import entre arquivos podem não carregar sem um passo de build. Aplique ao repositório para rodar com o bundler real.')
  }

  return {
    hasPreview: true,
    html,
    note: notes.length ? notes.join(' ') : undefined,
  }
}
