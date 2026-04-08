/**
 * ReportViewer — Markdown document viewer with auto-generated Table of Contents
 * and scroll spy. Used for resumo, relatorio, documento, guia_estruturado.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { List, ChevronRight } from 'lucide-react'

// ── Markdown → HTML (same as ArtifactViewerModal but richer) ────────────────

function renderMarkdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-100 rounded-lg p-3 my-2 overflow-x-auto"><code>$2</code></pre>')
  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-brand-300 pl-4 my-3 italic text-gray-600">$1</blockquote>')
  // Headers with IDs for scroll-spy
  html = html.replace(/^#### (.+)$/gm, (_m, t) => `<h4 id="${slugify(t)}" class="text-sm font-bold mt-4 mb-1 scroll-mt-4">${t}</h4>`)
  html = html.replace(/^### (.+)$/gm, (_m, t) => `<h3 id="${slugify(t)}" class="text-base font-bold mt-5 mb-2 scroll-mt-4">${t}</h3>`)
  html = html.replace(/^## (.+)$/gm, (_m, t) => `<h2 id="${slugify(t)}" class="text-lg font-bold mt-6 mb-2 scroll-mt-4">${t}</h2>`)
  html = html.replace(/^# (.+)$/gm, (_m, t) => `<h1 id="${slugify(t)}" class="text-xl font-bold mt-6 mb-3 scroll-mt-4">${t}</h1>`)
  // Bold / Italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-brand-600 underline hover:text-brand-700">$1</a>')
  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (_m, row) => {
    const cells = row.split('|').map((c: string) => c.trim())
    const tds = cells.map((c: string) => `<td class="border border-gray-200 px-3 py-2 text-sm">${c}</td>`).join('')
    return `<tr>${tds}</tr>`
  })
  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-4 border-gray-200" />')
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p class="my-2 leading-relaxed">')
  html = `<p class="my-2 leading-relaxed">${html}</p>`

  return html
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// ── TOC extraction ──────────────────────────────────────────────────────────

interface TocItem {
  id: string
  text: string
  level: number
}

function extractToc(md: string): TocItem[] {
  const items: TocItem[] = []
  const lines = md.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].replace(/\*\*/g, '').trim()
      items.push({ id: slugify(text), text, level })
    }
  }
  return items
}

// ── Main Component ──────────────────────────────────────────────────────────

interface ReportViewerProps {
  content: string
  title?: string
  /**
   * When true, the content is displayed in a page-canvas layout:
   * a white card on a gray background, mimicking a printed document.
   * Used for 'documento' artifacts to give a formal document feel.
   */
  pageMode?: boolean
}

export default function ReportViewer({ content, title, pageMode = false }: ReportViewerProps) {
  const [showToc, setShowToc] = useState(true)
  const [activeId, setActiveId] = useState<string>('')
  const contentRef = useRef<HTMLDivElement>(null)

  const toc = useMemo(() => extractToc(content), [content])
  const html = useMemo(() => renderMarkdownToHtml(content), [content])
  const hasToc = toc.length > 2

  // Scroll spy
  useEffect(() => {
    if (!hasToc || !contentRef.current) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      { root: contentRef.current, rootMargin: '-10% 0px -80% 0px', threshold: 0 }
    )

    const headings = contentRef.current.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')
    headings.forEach(h => observer.observe(h))

    return () => observer.disconnect()
  }, [hasToc, html])

  const scrollTo = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Page-canvas layout: gray background + white centered card (like a printed document)
  if (pageMode) {
    return (
      <div className="flex h-full gap-4 bg-gray-100 overflow-y-auto">
        {/* TOC sidebar (floats over gray bg) */}
        {hasToc && showToc && (
          <nav className="w-52 flex-shrink-0 overflow-y-auto pl-4 pr-2 py-6">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Índice</h4>
            <ul className="space-y-0.5">
              {toc.map((item, i) => (
                <li key={i}>
                  <button
                    onClick={() => scrollTo(item.id)}
                    className={`w-full text-left text-xs py-1.5 px-2 rounded-md transition-colors truncate ${
                      activeId === item.id
                        ? 'bg-white text-brand-700 font-medium shadow-sm'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
                    }`}
                    style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                  >
                    {item.level > 1 && <ChevronRight className="w-3 h-3 inline mr-1 opacity-40" />}
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Page canvas */}
        <div className="flex-1 min-w-0 py-8 pr-6">
          {hasToc && (
            <button
              onClick={() => setShowToc(s => !s)}
              className={`mb-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showToc ? 'bg-white text-brand-600 shadow-sm' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              {showToc ? 'Ocultar índice' : 'Mostrar índice'}
            </button>
          )}

          {/* White card — mimics a printed page */}
          <div className="bg-white rounded-lg shadow-sm mx-auto" style={{ maxWidth: 720 }}>
            <div className="px-14 py-12">
              {title && <h1 className="text-2xl font-bold text-gray-900 mb-8 pb-4 border-b border-gray-200">{title}</h1>}
              <div
                ref={contentRef}
                className="prose prose-sm max-w-none text-gray-800 leading-7
                           [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-3
                           [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2
                           [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2
                           [&_strong]:font-semibold [&_a]:text-brand-600 [&_a]:underline
                           [&_pre]:my-2 [&_code]:text-xs [&_table]:w-full [&_table]:border-collapse"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-full">
      {/* TOC sidebar */}
      {hasToc && showToc && (
        <nav className="w-56 flex-shrink-0 overflow-y-auto pr-3 border-r border-gray-100">
          <div className="sticky top-0 bg-white pb-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Índice</h4>
          </div>
          <ul className="space-y-0.5">
            {toc.map((item, i) => (
              <li key={i}>
                <button
                  onClick={() => scrollTo(item.id)}
                  className={`w-full text-left text-xs py-1.5 px-2 rounded-md transition-colors truncate ${
                    activeId === item.id
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                  style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                >
                  {item.level > 1 && <ChevronRight className="w-3 h-3 inline mr-1 opacity-40" />}
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* TOC toggle */}
        {hasToc && (
          <button
            onClick={() => setShowToc(s => !s)}
            className={`mb-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showToc ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            {showToc ? 'Ocultar índice' : 'Mostrar índice'}
          </button>
        )}

        {title && <h1 className="text-2xl font-bold text-gray-900 mb-6">{title}</h1>}

        <div
          ref={contentRef}
          className="prose prose-sm max-w-none text-gray-700 [&_strong]:font-semibold [&_a]:text-brand-600 [&_a]:underline [&_pre]:my-2 [&_code]:text-xs [&_table]:w-full [&_table]:border-collapse"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
