/**
 * SourceContentViewer — Draggable, resizable, collapsible panel for viewing
 * notebook source / acervo document text with proper formatting.
 *
 * Supports:
 * - Structured documents (section headings + paragraphs)
 * - Jurisprudência sources (rich legal document rendering with Síntese+Processos tabs)
 * - Plain text fallback
 */
import { useMemo, useState } from 'react'
import { Copy, Check, FileText, Download, Scale, BookOpen, ChevronDown, ChevronUp, FileSearch, ThumbsUp, ThumbsDown, Minus } from 'lucide-react'
import DraggablePanel from './DraggablePanel'
import type { NotebookSource } from '../lib/firestore-service'
import type { DataJudResult } from '../lib/datajud-service'
import { classifyResult } from '../lib/datajud-service'
import { AREA_LABELS, AREA_COLORS } from '../lib/constants'
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
/** @internal exported for unit testing only */
export function fmtChars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

/** Format an ISO date string to a localised short date. */
/** @internal exported for unit testing only */
export function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

/**
 * Parse jurisprudência synthesis text into structured blocks.
 * The text follows Markdown-ish format with bold headers (## or **).
 */
export interface JurisprudenceSection {
  heading?: string
  body: string
}

/** @internal exported for unit testing only */
export function parseJurisprudenceText(text: string): JurisprudenceSection[] {
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

/**
 * Page-like document viewer for structured acervo / uploaded documents.
 * Renders section headings and paragraphs in a white-page-on-gray-canvas layout.
 */
function DocumentPageViewer({ sections, meta, plain }: {
  sections: StructuredDocumentSection[] | null
  meta: StructuredDocumentMeta | null
  plain: string
}) {
  const hasRealSections = sections && sections.length > 0

  return (
    <div className="bg-gray-100 -mx-6 -mt-0 px-6 py-8 min-h-full">
      <div className="bg-white shadow-md rounded-sm mx-auto max-w-2xl px-10 py-12 border border-gray-200">

        {/* Document metadata header (if available) */}
        {meta && (meta.format || meta.pages) && (
          <div className="mb-8 pb-4 border-b border-gray-200 text-center">
            <div className="flex justify-center gap-4 text-xs text-gray-400">
              {meta.format && <span className="uppercase tracking-widest font-semibold">{meta.format}</span>}
              {meta.pages && <span>· {meta.pages} página{meta.pages > 1 ? 's' : ''}</span>}
              {meta.paragraphs > 0 && <span>· {meta.paragraphs} parágrafos</span>}
            </div>
          </div>
        )}

        {/* Content */}
        {hasRealSections ? (
          <div className="space-y-8">
            {sections!.map((sec, i) => (
              <section key={i}>
                {sec.title && sec.title !== 'Documento' && (
                  <h2
                    className={`font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200 ${
                      i === 0 ? 'text-xl text-center border-b-2' : 'text-base'
                    }`}
                  >
                    {sec.title}
                  </h2>
                )}
                <div className="space-y-4">
                  {sec.paragraphs.map((p, pi) => {
                    const isSubheading =
                      (p.length < 80 && p === p.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÇÃ]{3,}/.test(p)) ||
                      /^[IVXLC]+\.\s/.test(p) ||
                      /^\d+(\.\d+)?\s/.test(p)
                    return isSubheading ? (
                      <h3 key={pi} className="text-sm font-semibold text-gray-800 mt-5 mb-2 uppercase tracking-wide">
                        {p}
                      </h3>
                    ) : (
                      <p key={pi} className="text-[13.5px] text-gray-800 leading-[1.8] text-justify hyphens-auto indent-8">
                        {p}
                      </p>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {plain.split(/\n{2,}/).map((block, i) => {
              const trimmed = block.trim()
              if (!trimmed) return null
              const isHeading =
                (trimmed.length < 100 && trimmed === trimmed.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÇÃ]{3,}/.test(trimmed)) ||
                /^[IVXLC]+\.\s/.test(trimmed) ||
                /^\d+(\.\d+)?\s/.test(trimmed)
              return isHeading ? (
                <h3 key={i} className="text-sm font-semibold text-gray-800 mt-6 mb-1 uppercase tracking-wide">
                  {trimmed}
                </h3>
              ) : (
                <p key={i} className="text-[13.5px] text-gray-800 leading-[1.8] text-justify hyphens-auto indent-8">
                  {trimmed}
                </p>
              )
            })}
          </div>
        )}
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
 * Rich jurisprudence document viewer.
 * Renders the LLM-synthesized jurisprudence text as a structured legal document.
 */
function JurisprudenceViewer({ source, plain }: { source: NotebookSource; plain: string }) {
  const sections = useMemo(() => parseJurisprudenceText(plain), [plain])
  const query = source.reference || ''

  // Parse raw results for the Processos tab
  const results: DataJudResult[] = useMemo(() => {
    if (!source.results_raw) return []
    try { return JSON.parse(source.results_raw) as DataJudResult[] } catch { return [] }
  }, [source.results_raw])

  const [activeTab, setActiveTab] = useState<'sintese' | 'processos'>('sintese')

  return (
    <article className="max-w-none h-full flex flex-col">
      {/* Document header */}
      <div className="mb-4 pb-3 border-b-2 border-emerald-200 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Scale className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
            Pesquisa de Jurisprudência — DataJud / CNJ
          </span>
        </div>
        {query && (
          <div className="mt-1.5 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
            <span className="text-xs text-emerald-600 font-medium">Consulta: </span>
            <span className="text-sm text-emerald-800 font-semibold">{query}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => setActiveTab('sintese')}
          className={`px-4 py-2 text-xs font-medium rounded-t-md transition-colors ${
            activeTab === 'sintese'
              ? 'bg-white border border-b-white border-gray-200 text-emerald-700 -mb-px z-10'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Síntese
        </button>
        {results.length > 0 && (
          <button
            onClick={() => setActiveTab('processos')}
            className={`px-4 py-2 text-xs font-medium rounded-t-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'processos'
                ? 'bg-white border border-b-white border-gray-200 text-emerald-700 -mb-px z-10'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <FileSearch className="w-3.5 h-3.5" />
            Processos ({results.length})
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'sintese' ? (
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
        ) : (
          <div className="space-y-4">
            {results.map((r, i) => (
              <ProcessCard key={i} result={r} index={i} />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

/** Card for a single DataJud process result. */
function ProcessCard({ result: r, index }: { result: DataJudResult; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const area = classifyResult(r)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Card header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
              {index + 1}. {r.classe}
            </span>
            <span className="text-xs text-gray-500 font-mono truncate">{r.numeroProcesso}</span>
            {/* Stance indicator */}
            {r.stance === 'favoravel' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200" title="Favorável à tese">
                <ThumbsUp className="w-2.5 h-2.5" /> Favorável
              </span>
            )}
            {r.stance === 'desfavoravel' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200" title="Desfavorável à tese">
                <ThumbsDown className="w-2.5 h-2.5" /> Desfavorável
              </span>
            )}
            {r.stance === 'neutro' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200" title="Neutro / inconclusivo">
                <Minus className="w-2.5 h-2.5" /> Neutro
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="font-medium">{r.tribunalName || r.tribunal}</span>
            {r.orgaoJulgador && <span className="text-gray-500">· {r.orgaoJulgador}</span>}
            {r.grau && <span className="text-gray-400">· {r.grau}</span>}
            {r.dataAjuizamento && (
              <span className="text-gray-400">· {formatDate(r.dataAjuizamento)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {/* Relevance score */}
          {r.relevanceScore != null && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              r.relevanceScore >= 70 ? 'bg-green-50 text-green-700' :
              r.relevanceScore >= 40 ? 'bg-yellow-50 text-yellow-700' :
              'bg-gray-50 text-gray-500'
            }`} title={`Relevância: ${r.relevanceScore}/100`}>
              {r.relevanceScore}/100
            </span>
          )}
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            {r.ementa && (
              <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 font-medium border border-sky-100">
                Ementa
              </span>
            )}
            {r.inteiroTeor && (
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium border border-amber-100">
                Inteiro Teor
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Area classification + Assuntos */}
      {(area || r.assuntos.length > 0) && (
        <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100">
          <div className="flex flex-wrap gap-1">
            {area && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${AREA_COLORS[area] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {AREA_LABELS[area] || area}
              </span>
            )}
            {r.assuntos.slice(0, 6).map((a, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600">{a}</span>
            ))}
            {r.assuntos.length > 6 && (
              <span className="text-[10px] text-gray-400">+{r.assuntos.length - 6}</span>
            )}
          </div>
        </div>
      )}

      {/* Ementa */}
      {r.ementa && (
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 mb-1.5">Ementa</p>
          <p className="text-sm text-gray-800 leading-relaxed italic">{r.ementa}</p>
        </div>
      )}

      {/* Inteiro Teor — collapsible */}
      {r.inteiroTeor && (
        <div className="px-4 py-2">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Ocultar inteiro teor' : 'Ver inteiro teor'}
            <span className="text-gray-400 font-normal">
              ({fmtChars(r.inteiroTeor.length)} chars)
            </span>
          </button>
          {expanded && (
            <div className="mt-2 p-3 bg-amber-50/60 rounded-lg border border-amber-100">
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
                {r.inteiroTeor}
              </p>
            </div>
          )}
        </div>
      )}

      {/* No ementa, no inteiro teor */}
      {!r.ementa && !r.inteiroTeor && (
        <div className="px-4 py-2 text-xs text-gray-400 italic">
          Ementa e inteiro teor não disponíveis para este processo no DataJud.
        </div>
      )}
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
      initialHeight={640}
      minWidth={420}
      minHeight={320}
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
            {!isJurisprudencia && <MetaBadges meta={meta} charCount={charCount} />}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <CopyBtn text={plain} />
            <DownloadBtn text={plain} filename={source.name || 'documento'} />
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {charCount === 0 ? (
            <p className="text-sm text-gray-400 italic">Nenhum conteúdo de texto disponível para este documento.</p>
          ) : isJurisprudencia ? (
            /* Rich jurisprudence viewer with tabs */
            <JurisprudenceViewer source={source} plain={plain} />
          ) : (
            /* Page-like document viewer for acervo/uploaded docs */
            <DocumentPageViewer sections={sections} meta={meta} plain={plain} />
          )}
        </div>
      </div>
    </DraggablePanel>
  )
}
