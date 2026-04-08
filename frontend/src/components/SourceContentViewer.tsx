/**
 * SourceContentViewer — Draggable, resizable, collapsible panel for viewing
 * notebook source / acervo document text with proper formatting.
 *
 * Supports:
 * - Structured documents (section headings + paragraphs)
 * - Jurisprudência sources (rich legal document rendering with Síntese + Processos tabs)
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

/** Format a date string (YYYY-MM-DD or ISO) to dd/mm/yyyy. */
function fmtDate(d: string): string {
  if (!d) return ''
  const parts = d.split('T')[0].split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
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

/** Parse results_raw JSON safely. */
function parseResultsRaw(raw: string | undefined): DataJudResult[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DataJudResult[]) : []
  } catch {
    return []
  }
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
 * Card displaying a single DataJud process result with ementa and inteiro teor.
 */
function ProcessCard({ result, index }: { result: DataJudResult; index: number }) {
  const [expandedEmenta, setExpandedEmenta] = useState(false)
  const [expandedTeor, setExpandedTeor] = useState(false)

  const EMENTA_PREVIEW = 300
  const TEOR_PREVIEW = 400

  const ementaShort = result.ementa && result.ementa.length > EMENTA_PREVIEW
  const teorShort = result.inteiroTeor && result.inteiroTeor.length > TEOR_PREVIEW

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                #{index + 1}
              </span>
              <span className="text-xs font-semibold text-gray-800 truncate">{result.tribunal}</span>
              {result.classe && (
                <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{result.classe}</span>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1 font-mono">{result.numeroProcesso}</p>
          </div>
          {result.dataAjuizamento && (
            <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">{fmtDate(result.dataAjuizamento)}</span>
          )}
        </div>
        {result.orgaoJulgador && (
          <p className="text-[11px] text-gray-500 mt-1">{result.orgaoJulgador}</p>
        )}
      </div>

      {/* Assuntos */}
      {result.assuntos && result.assuntos.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-1.5">
          {result.assuntos.slice(0, 4).map((a, i) => (
            <span key={i} className="text-[11px] text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
              {a}
            </span>
          ))}
          {result.assuntos.length > 4 && (
            <span className="text-[11px] text-gray-400 self-center">+{result.assuntos.length - 4}</span>
          )}
        </div>
      )}

      {/* Ementa */}
      {result.ementa && (
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <span className="w-1.5 h-3 bg-emerald-400 rounded-full inline-block" />
            Ementa
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">
            {ementaShort && !expandedEmenta
              ? result.ementa.slice(0, EMENTA_PREVIEW) + '…'
              : result.ementa}
          </p>
          {ementaShort && (
            <button
              onClick={() => setExpandedEmenta(e => !e)}
              className="mt-1.5 text-[11px] text-emerald-600 hover:text-emerald-800 flex items-center gap-0.5"
            >
              {expandedEmenta ? <><ChevronUp className="w-3 h-3" /> Ver menos</> : <><ChevronDown className="w-3 h-3" /> Ver ementa completa</>}
            </button>
          )}
        </div>
      )}

      {/* Inteiro teor */}
      {result.inteiroTeor && (
        <div className="px-4 py-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <span className="w-1.5 h-3 bg-blue-400 rounded-full inline-block" />
            Inteiro Teor
          </p>
          <p className="text-sm text-gray-600 leading-relaxed font-mono text-[12px]">
            {teorShort && !expandedTeor
              ? result.inteiroTeor.slice(0, TEOR_PREVIEW) + '…'
              : result.inteiroTeor}
          </p>
          {teorShort && (
            <button
              onClick={() => setExpandedTeor(e => !e)}
              className="mt-1.5 text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
            >
              {expandedTeor ? <><ChevronUp className="w-3 h-3" /> Ver menos</> : <><ChevronDown className="w-3 h-3" /> Ver inteiro teor</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Rich jurisprudence document viewer.
 * Shows two tabs: "Síntese" (LLM synthesis) and "Processos" (individual cases from results_raw).
 */
function JurisprudenceViewer({ source, plain }: { source: NotebookSource; plain: string }) {
  const sections = useMemo(() => parseJurisprudenceText(plain), [plain])
  const results = useMemo(() => parseResultsRaw(source.results_raw), [source.results_raw])
  const query = source.reference || ''
  const [tab, setTab] = useState<'sintese' | 'processos'>('sintese')
  const hasProcessos = results.length > 0

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

      {/* Tabs — only shown when there are individual results stored */}
      {hasProcessos && (
        <div className="flex border-b border-gray-200 mb-4">
          <button
            onClick={() => setTab('sintese')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'sintese'
                ? 'border-emerald-500 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Síntese
          </button>
          <button
            onClick={() => setTab('processos')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === 'processos'
                ? 'border-emerald-500 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Processos
            <span className="text-[11px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
              {results.length}
            </span>
          </button>
        </div>
      )}

      {/* Tab content */}
      {(!hasProcessos || tab === 'sintese') && (
        <div>
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
        </div>
      )}

      {hasProcessos && tab === 'processos' && (
        <div className="space-y-4">
          {results.map((r, i) => (
            <ProcessCard key={i} result={r} index={i} />
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

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {charCount === 0 ? (
            <p className="text-sm text-gray-400 italic">Nenhum conteúdo de texto disponível para este documento.</p>
          ) : isJurisprudencia ? (
            /* Rich jurisprudence viewer with Síntese + Processos tabs */
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

