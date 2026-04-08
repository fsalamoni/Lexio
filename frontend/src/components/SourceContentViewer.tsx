/**
 * SourceContentViewer — Draggable, resizable, collapsible panel for viewing
 * notebook source / acervo document text with proper formatting.
 *
 * Supports:
 * - Structured documents (section headings + paragraphs) — page-canvas layout
 * - Jurisprudência sources — tabs: Síntese (LLM text) + Processos (ProcessCard)
 * - Plain text fallback
 */
import { useMemo, useState } from 'react'
import { Copy, Check, FileText, Download, Scale, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import DraggablePanel from './DraggablePanel'
import type { NotebookSource } from '../lib/firestore-service'
import type { DataJudResult } from '../lib/datajud-service'
import {
  getStructuredSections,
  getStructuredMeta,
  resolveTextContent,
  type StructuredDocumentSection,
  type StructuredDocumentMeta,
} from '../lib/document-json-converter'

// ── Page-canvas layout constants ──────────────────────────────────────────────
const PAGE_CANVAS_MAX_WIDTH = 680
const PAGE_CANVAS_PADDING_H = 48
const PAGE_CANVAS_PADDING_V = 40

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

/** Parse results_raw JSON into DataJudResult[]. Returns [] on failure. */
function parseResultsRaw(raw: string | undefined): DataJudResult[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DataJudResult[]) : []
  } catch {
    return []
  }
}

/** Format a character count for display. */
function fmtChars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/**
 * Parse jurisprudência synthesis text into structured blocks.
 * The text follows Markdown-ish format with bold headers (## or **).
 */
interface JurisprudenceSection {
  heading?: string
  body: string
}

function parseJurisprudenceText(text: string): JurisprudenceSection[] {
  if (!text.trim()) return []
  // Split on Markdown headings (## Heading or **Heading**) or numbered headings
  const lines = text.split('\n')
  const sections: JurisprudenceSection[] = []
  let current: JurisprudenceSection = { body: '' }

  for (const line of lines) {
    // Detect Markdown heading or bold-only line (likely a section title)
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/) || line.match(/^\*{2}(.+)\*{2}\s*$/)
    const numberedMatch = line.match(/^(\d+)\.\s+\*{0,2}(.+?)\*{0,2}:?\s*$/)

    if (headingMatch || numberedMatch) {
      if (current.body.trim() || current.heading) {
        sections.push({ ...current, body: current.body.trim() })
      }
      // headingMatch[1] is the heading text; numberedMatch[2] is the heading after "N. "
      const title = headingMatch ? headingMatch[1] : (numberedMatch?.[2] ?? line)
      current = { heading: title, body: '' }
    } else {
      const cleaned = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
      current.body += (current.body ? '\n' : '') + cleaned
    }
  }
  if (current.body.trim() || current.heading) {
    sections.push({ ...current, body: current.body.trim() })
  }
  return sections.filter(s => s.body || s.heading)
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
    a.download = filename.replace(/\.[^.]+$/, '') + '.txt'
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

/** Render a single section (heading + paragraphs) inside the page-canvas. */
function SectionBlock({ section, idx }: { section: StructuredDocumentSection; idx: number }) {
  return (
    <div className={idx > 0 ? 'mt-8' : ''}>
      {section.title && section.title !== 'Documento' && (
        <h3 className="text-base font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">
          {section.title}
        </h3>
      )}
      <div className="space-y-3">
        {section.paragraphs.map((p, i) => (
          <p key={i} className="text-sm text-gray-800 leading-7">
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

/**
 * Individual process card — displays one DataJudResult with expandable ementa
 * and inteiro teor.
 */
function ProcessCard({ result, idx }: { result: DataJudResult; idx: number }) {
  const [showEmenta, setShowEmenta] = useState(false)
  const [showTeor, setShowTeor] = useState(false)

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center">
            {idx + 1}
          </span>
          <span className="text-xs font-semibold text-gray-800 truncate">
            {result.numeroProcesso || '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {result.ementa && (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">
              Ementa ✓
            </span>
          )}
          {result.inteiroTeor && (
            <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
              Inteiro Teor ✓
            </span>
          )}
        </div>
      </div>

      {/* Metadata grid */}
      <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {result.tribunal && (
          <div><span className="text-gray-500">Tribunal:</span> <span className="text-gray-800 font-medium">{result.tribunal}</span></div>
        )}
        {result.classe && (
          <div><span className="text-gray-500">Classe:</span> <span className="text-gray-800">{result.classe}</span></div>
        )}
        {result.dataAjuizamento && (
          <div><span className="text-gray-500">Ajuizamento:</span> <span className="text-gray-800">{result.dataAjuizamento}</span></div>
        )}
        {result.assuntos && result.assuntos.length > 0 && (
          <div className="col-span-2">
            <span className="text-gray-500">Assuntos: </span>
            <span className="text-gray-800">{result.assuntos.slice(0, 3).join(', ')}{result.assuntos.length > 3 ? '…' : ''}</span>
          </div>
        )}
      </div>

      {/* Ementa expandable */}
      {result.ementa && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowEmenta(s => !s)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <span className="font-semibold">Ementa</span>
            {showEmenta ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showEmenta && (
            <div className="px-4 pb-3 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap bg-emerald-50/40 border-t border-emerald-100">
              {result.ementa}
            </div>
          )}
        </div>
      )}

      {/* Inteiro teor expandable */}
      {result.inteiroTeor && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowTeor(s => !s)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-blue-700 hover:bg-blue-50 transition-colors"
          >
            <span className="font-semibold">Inteiro Teor</span>
            {showTeor ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showTeor && (
            <div className="px-4 pb-3 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap bg-blue-50/40 border-t border-blue-100 max-h-64 overflow-y-auto">
              {result.inteiroTeor}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Rich jurisprudence document viewer with tabs:
 * - Síntese: LLM-synthesized text rendered as structured sections
 * - Processos: Individual process cards (ementa, inteiro teor, metadata)
 */
function JurisprudenceViewer({ source, plain }: { source: NotebookSource; plain: string }) {
  const [tab, setTab] = useState<'sintese' | 'processos'>('sintese')
  const sections = useMemo(() => parseJurisprudenceText(plain), [plain])
  const results = useMemo(() => parseResultsRaw(source.results_raw), [source.results_raw])
  const query = source.reference || ''

  return (
    <article className="max-w-none">
      {/* Document header */}
      <div className="mb-4 pb-4 border-b-2 border-emerald-200">
        <div className="flex items-center gap-2 mb-2">
          <Scale className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
            Pesquisa de Jurisprudência — DataJud / CNJ
          </span>
        </div>
        {query && (
          <div className="mt-2 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
            <span className="text-xs text-emerald-600 font-medium">Consulta: </span>
            <span className="text-sm text-emerald-800 font-semibold">{query}</span>
          </div>
        )}
      </div>

      {/* Tabs — only shown when results_raw is present */}
      {results.length > 0 && (
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {(['sintese', 'processos'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-emerald-500 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'sintese' ? 'Síntese' : `Processos (${results.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Síntese tab */}
      {(tab === 'sintese' || results.length === 0) && (
        sections.length > 0 ? (
          <div className="space-y-5">
            {sections.map((sec, i) => (
              <div key={i} className={i > 0 ? 'pt-4 border-t border-gray-100' : ''}>
                {sec.heading && (
                  <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-emerald-500 rounded-full flex-shrink-0" />
                    {sec.heading}
                  </h3>
                )}
                {sec.body && (
                  <div className="space-y-2">
                    {sec.body.split('\n').filter(l => l.trim()).map((para, pi) => (
                      <p key={pi} className="text-sm text-gray-700 leading-relaxed pl-3.5">
                        {para}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{plain}</p>
        )
      )}

      {/* Processos tab */}
      {tab === 'processos' && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <ProcessCard key={r.id ?? i} result={r} idx={i} />
          ))}
        </div>
      )}
    </article>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SourceContentViewer({ source, onClose }: SourceContentViewerProps) {
  const { plain, sections, meta } = useMemo(
    () => (source ? resolveSource(source) : { plain: '', sections: null, meta: null }),
    [source],
  )

  if (!source) return null

  const isJurisprudencia = source.type === 'jurisprudencia'
  const hasSections = sections && sections.length > 0
  const charCount = plain.length

  // Choose panel title icon based on source type
  const icon = isJurisprudencia ? <Scale size={16} /> : hasSections ? <BookOpen size={16} /> : <FileText size={16} />

  return (
    <DraggablePanel
      open={!!source}
      onClose={onClose}
      title={source.name || 'Documento'}
      icon={icon}
      initialWidth={760}
      initialHeight={600}
      minWidth={400}
      minHeight={300}
    >
      <div className="flex flex-col h-full">
        {/* ── Toolbar ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isJurisprudencia && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 flex-shrink-0">
                <Scale className="w-3 h-3" />
                Jurisprudência
              </span>
            )}
            <MetaBadges meta={meta} charCount={charCount} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <CopyBtn text={plain} />
            <DownloadBtn text={plain} filename={source.name || 'documento'} />
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        {charCount === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-sm text-gray-400 italic">Nenhum conteúdo de texto disponível para este documento.</p>
          </div>
        ) : isJurisprudencia ? (
          /* Rich jurisprudence viewer with tabs */
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <JurisprudenceViewer source={source} plain={plain} />
          </div>
        ) : hasSections ? (
          /* Structured document — page-canvas layout (gray bg + white card) */
          <div className="flex-1 overflow-y-auto bg-gray-100 py-8">
            <div
              className="mx-auto bg-white rounded-lg shadow-sm"
              style={{
                maxWidth: PAGE_CANVAS_MAX_WIDTH,
                paddingLeft: PAGE_CANVAS_PADDING_H,
                paddingRight: PAGE_CANVAS_PADDING_H,
                paddingTop: PAGE_CANVAS_PADDING_V,
                paddingBottom: PAGE_CANVAS_PADDING_V,
              }}
            >
              <article>
                {sections!.map((sec, i) => (
                  <SectionBlock key={i} section={sec} idx={i} />
                ))}
              </article>
            </div>
          </div>
        ) : (
          /* Fallback — formatted plain text */
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <article className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {plain}
            </article>
          </div>
        )}
      </div>
    </DraggablePanel>
  )
}
