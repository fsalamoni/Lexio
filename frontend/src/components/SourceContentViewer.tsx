/**
 * SourceContentViewer — Draggable, resizable, collapsible panel for viewing
 * notebook source / acervo document text with proper formatting.
 *
 * Uses DraggablePanel for the window chrome, and renders structured documents
 * with section headings + paragraphs, falling back to formatted plain text.
 */
import { useMemo, useState } from 'react'
import { Copy, Check, FileText, Download } from 'lucide-react'
import DraggablePanel from './DraggablePanel'
import type { NotebookSource } from '../lib/firestore-service'
import {
  getStructuredSections,
  getStructuredMeta,
  resolveTextContent,
  type StructuredDocumentSection,
  type StructuredDocumentMeta,
} from '../lib/document-json-converter'

// ── Props ─────────────────────────────────────────────────────────────────────

interface SourceContentViewerProps {
  /** The source whose content to display (null / undefined = hidden). */
  source: NotebookSource | null
  /** Called when the user closes the viewer. */
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve raw source text_content → { plain, sections, meta } */
function resolveSource(source: NotebookSource) {
  const raw = source.text_content ?? ''
  const plain = resolveTextContent(raw) || raw
  const sections = getStructuredSections(raw)
  const meta = getStructuredMeta(raw)
  return { plain, sections, meta }
}

/** Format a character count for display. */
function fmtChars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Copy-to-clipboard button with check animation. */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                 bg-white border border-gray-200 text-gray-600
                 hover:bg-gray-50 hover:text-gray-800 transition-colors"
      title="Copiar texto"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

/** Download as plain text file. */
function DownloadBtn({ text, filename }: { text: string; filename: string }) {
  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.replace(/\.\w+$/, '') + '.txt'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
                 bg-white border border-gray-200 text-gray-600
                 hover:bg-gray-50 hover:text-gray-800 transition-colors"
      title="Baixar como texto"
    >
      <Download className="w-3.5 h-3.5" />
      Baixar
    </button>
  )
}

/** Render a single section (heading + paragraphs). */
function SectionBlock({ section, idx }: { section: StructuredDocumentSection; idx: number }) {
  return (
    <div className={idx > 0 ? 'mt-6' : ''}>
      {section.title && section.title !== 'Documento' && (
        <h3 className="text-base font-semibold text-gray-900 mb-3 pb-1.5 border-b border-gray-100">
          {section.title}
        </h3>
      )}
      <div className="space-y-3">
        {section.paragraphs.map((p, i) => (
          <p key={i} className="text-sm text-gray-700 leading-relaxed">
            {p}
          </p>
        ))}
      </div>
    </div>
  )
}

/** Metadata pill badges. */
function MetaBadges({ meta, charCount }: { meta: StructuredDocumentMeta | null; charCount: number }) {
  const badges: { label: string; value: string }[] = []
  if (meta) {
    if (meta.format) badges.push({ label: 'Formato', value: meta.format.toUpperCase() })
    if (meta.pages) badges.push({ label: 'Páginas', value: String(meta.pages) })
    badges.push({ label: 'Parágrafos', value: String(meta.paragraphs) })
  }
  badges.push({ label: 'Caracteres', value: fmtChars(charCount) })
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map(b => (
        <span key={b.label} className="inline-flex items-center gap-1 text-[11px] bg-gray-100 text-gray-500 rounded-full px-2.5 py-0.5">
          <span className="font-medium text-gray-600">{b.label}:</span> {b.value}
        </span>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SourceContentViewer({ source, onClose }: SourceContentViewerProps) {
  const { plain, sections, meta } = useMemo(
    () => (source ? resolveSource(source) : { plain: '', sections: null, meta: null }),
    [source],
  )

  if (!source) return null

  const hasSections = sections && sections.length > 0
  const charCount = plain.length

  return (
    <DraggablePanel
      open={!!source}
      onClose={onClose}
      title={source.name || 'Documento'}
      icon={<FileText size={16} />}
      initialWidth={700}
      initialHeight={560}
      minWidth={380}
      minHeight={280}
    >
      <div className="flex flex-col h-full">
        {/* ── Toolbar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
          <MetaBadges meta={meta} charCount={charCount} />
          <div className="flex items-center gap-2 flex-shrink-0">
            <CopyBtn text={plain} />
            <DownloadBtn text={plain} filename={source.name || 'documento'} />
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {charCount === 0 ? (
            <p className="text-sm text-gray-400 italic">Nenhum conteúdo de texto disponível para este documento.</p>
          ) : hasSections ? (
            /* Structured view — section headings + paragraphs */
            <article className="space-y-1">
              {sections!.map((sec, i) => (
                <SectionBlock key={i} section={sec} idx={i} />
              ))}
            </article>
          ) : (
            /* Fallback — formatted plain text */
            <article className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {plain}
            </article>
          )}
        </div>
      </div>
    </DraggablePanel>
  )
}
