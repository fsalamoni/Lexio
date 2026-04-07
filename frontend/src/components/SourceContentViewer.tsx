/**
 * SourceContentViewer — Draggable, resizable, collapsible panel for viewing
 * notebook source / acervo document text with proper formatting.
 *
 * Supports:
 * - Structured documents (section headings + paragraphs)
 * - Jurisprudência sources (rich legal document rendering)
 *   - Tab "Síntese": LLM-synthesised text as structured sections
 *   - Tab "Processos": individual DataJudResult cards with ementa + inteiro teor
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

/**
 * Rich jurisprudence document viewer.
 * Renders the LLM-synthesized jurisprudence text as a structured legal document.
 */
function JurisprudenceViewer({ source, plain }: { source: NotebookSource; plain: string }) {
  const sections = useMemo(() => parseJurisprudenceText(plain), [plain])
  const query = source.reference || ''

  return (
    <article className="max-w-none">
      {/* Document header */}
      <div className="mb-6 pb-4 border-b-2 border-emerald-200">
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

      {/* Synthesis sections */}
      {sections.length > 0 ? (
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
      )}
    </article>
  )
}

/**
 * Card for an individual DataJud process result.
 * Shows processo number, tribunal, classe, ementa (expandable), and inteiro teor (expandable).
 */
function ProcessCard({ result, index }: { result: DataJudResult; index: number }) {
  const [showEmenta, setShowEmenta] = useState(false)
  const [showTeor, setShowTeor] = useState(false)

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">#{index + 1}</span>
            {result.tribunal && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                {result.tribunal}
              </span>
            )}
            {result.classe && (
              <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                {result.classe}
              </span>
            )}
            {result.dataAjuizamento && (
              <span className="text-[11px] text-gray-400">{result.dataAjuizamento}</span>
            )}
          </div>
          {result.numeroProcesso && (
            <p className="text-[12px] font-mono text-gray-600 mt-1 truncate" title={result.numeroProcesso}>
              {result.numeroProcesso}
            </p>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {result.ementa && (
            <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded px-1.5 py-0.5">
              Ementa ✓
            </span>
          )}
          {result.inteiroTeor && (
            <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-100 rounded px-1.5 py-0.5">
              Inteiro Teor ✓
            </span>
          )}
        </div>
      </div>

      {/* Ementa */}
      {result.ementa && (
        <div className="px-4 py-3 border-b border-gray-100">
          <button
            className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 uppercase tracking-wide mb-1.5 hover:text-blue-900"
            onClick={() => setShowEmenta(p => !p)}
          >
            {showEmenta ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Ementa
          </button>
          {showEmenta ? (
            <p className="text-sm text-gray-700 leading-relaxed italic border-l-2 border-blue-200 pl-3">
              {result.ementa}
            </p>
          ) : (
            <p className="text-xs text-gray-500 line-clamp-2 italic cursor-pointer" onClick={() => setShowEmenta(true)}>
              {result.ementa}
            </p>
          )}
        </div>
      )}

      {/* Inteiro Teor */}
      {result.inteiroTeor && (
        <div className="px-4 py-3">
          <button
            className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 uppercase tracking-wide mb-1.5 hover:text-purple-900"
            onClick={() => setShowTeor(p => !p)}
          >
            {showTeor ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Inteiro Teor
          </button>
          {showTeor ? (
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border-l-2 border-purple-200 pl-3 max-h-64 overflow-y-auto">
              {result.inteiroTeor}
            </div>
          ) : (
            <p className="text-xs text-gray-500 line-clamp-2 cursor-pointer" onClick={() => setShowTeor(true)}>
              {result.inteiroTeor}
            </p>
          )}
        </div>
      )}

      {/* Assuntos */}
      {result.assuntos && result.assuntos.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {result.assuntos.map((a, i) => (
            <span key={i} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
              {a}
            </span>
          ))}
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

  // Tab state for jurisprudência sources that have results_raw
  const [activeTab, setActiveTab] = useState<'sintese' | 'processos'>('sintese')

  // Parse results_raw (JSON string) into DataJudResult[]
  const rawResults = useMemo<DataJudResult[]>(() => {
    if (!source?.results_raw) return []
    try {
      return JSON.parse(source.results_raw) as DataJudResult[]
    } catch {
      return []
    }
  }, [source?.results_raw])

  if (!source) return null

  const isJurisprudencia = source.type === 'jurisprudencia'
  const hasRawResults = rawResults.length > 0
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
      initialWidth={720}
      initialHeight={580}
      minWidth={380}
      minHeight={280}
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

        {/* ── Tabs (jurisprudência with raw results only) ───────────────── */}
        {isJurisprudencia && hasRawResults && (
          <div className="flex border-b border-gray-100 bg-white flex-shrink-0">
            {([
              { key: 'sintese' as const, label: 'Síntese' },
              { key: 'processos' as const, label: `Processos (${rawResults.length})` },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {charCount === 0 && !hasRawResults ? (
            <p className="text-sm text-gray-400 italic">Nenhum conteúdo de texto disponível para este documento.</p>
          ) : isJurisprudencia && hasRawResults && activeTab === 'processos' ? (
            /* Individual DataJud process cards */
            <div className="space-y-4">
              {rawResults.map((result, i) => (
                <ProcessCard key={result.numeroProcesso || i} result={result} index={i} />
              ))}
            </div>
          ) : isJurisprudencia ? (
            /* Rich jurisprudence synthesis viewer */
            <JurisprudenceViewer source={source} plain={plain} />
          ) : hasSections ? (
            /* Structured view — section headings + paragraphs */
            <article>
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

