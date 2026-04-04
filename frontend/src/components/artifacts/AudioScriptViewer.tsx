/**
 * AudioScriptViewer — professional podcast/audio script viewer with a
 * vertical timeline, color-coded segment types, and collapsible production notes.
 */

import { useState, useCallback } from 'react'
import {
  Clock, Mic, ChevronDown, ChevronUp, Volume2,
  Music, Pause, Radio, Sparkles, Play,
} from 'lucide-react'
import type { ParsedAudioScript, AudioSegment } from './artifact-parsers'

// ── Segment type config ────────────────────────────────────────────────────

interface SegmentStyle {
  bg: string
  border: string
  badge: string
  text: string
  icon: React.ReactNode
  label: string
}

const SEGMENT_STYLES: Record<string, SegmentStyle> = {
  narracao: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    badge: 'bg-blue-100 text-blue-700',
    text: 'text-blue-900',
    icon: <Mic className="w-3.5 h-3.5" />,
    label: 'Narracao',
  },
  transicao: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    badge: 'bg-purple-100 text-purple-700',
    text: 'text-purple-900',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    label: 'Transicao',
  },
  efeito: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    badge: 'bg-amber-100 text-amber-700',
    text: 'text-amber-900',
    icon: <Volume2 className="w-3.5 h-3.5" />,
    label: 'Efeito',
  },
  vinheta: {
    bg: 'bg-pink-50',
    border: 'border-pink-300',
    badge: 'bg-pink-100 text-pink-700',
    text: 'text-pink-900',
    icon: <Radio className="w-3.5 h-3.5" />,
    label: 'Vinheta',
  },
  musica: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    badge: 'bg-green-100 text-green-700',
    text: 'text-green-900',
    icon: <Music className="w-3.5 h-3.5" />,
    label: 'Musica',
  },
  pausa: {
    bg: 'bg-gray-50',
    border: 'border-gray-300',
    badge: 'bg-gray-100 text-gray-600',
    text: 'text-gray-700',
    icon: <Pause className="w-3.5 h-3.5" />,
    label: 'Pausa',
  },
}

function getStyle(type: string): SegmentStyle {
  return SEGMENT_STYLES[type] || SEGMENT_STYLES.narracao
}

// ── Segment card ───────────────────────────────────────────────────────────

interface SegmentCardProps {
  segment: AudioSegment
  index: number
  isActive: boolean
  onSelect: (index: number) => void
}

function SegmentCard({ segment, index, isActive, onSelect }: SegmentCardProps) {
  const style = getStyle(segment.type)

  return (
    <button
      onClick={() => onSelect(index)}
      className={`
        w-full text-left flex gap-4 group transition-all duration-200
        ${isActive ? 'scale-[1.01]' : 'hover:scale-[1.005]'}
      `}
    >
      {/* Time badge + vertical line */}
      <div className="flex flex-col items-center flex-shrink-0 w-16">
        <span
          className={`
            text-xs font-mono font-semibold px-2 py-1 rounded-md
            ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}
            transition-colors
          `}
        >
          {segment.time}
        </span>
        <div className="w-px flex-1 bg-gray-200 mt-2 min-h-[16px]" />
      </div>

      {/* Content card */}
      <div
        className={`
          flex-1 rounded-xl border-l-4 p-4 mb-3 transition-all
          ${style.bg} ${style.border}
          ${isActive ? 'ring-2 ring-gray-900/10 shadow-md' : 'shadow-sm hover:shadow'}
        `}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${style.badge}`}>
            {style.icon}
            {style.label}
          </span>
          {segment.speaker && (
            <span className="text-xs font-medium text-gray-700 bg-white/70 px-2 py-0.5 rounded-full">
              {segment.speaker}
            </span>
          )}
          {isActive && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-gray-500">
              <Play className="w-3 h-3" /> Selecionado
            </span>
          )}
        </div>

        {/* Text */}
        <p className={`text-sm leading-relaxed whitespace-pre-line ${style.text}`}>
          {segment.text}
        </p>

        {/* Production notes */}
        {segment.notes && (
          <p className="mt-2 text-xs text-gray-500 italic border-t border-gray-200/60 pt-2">
            {segment.notes}
          </p>
        )}
      </div>
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

interface AudioScriptViewerProps {
  data: ParsedAudioScript
}

export default function AudioScriptViewer({ data }: AudioScriptViewerProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)

  const handleSelect = useCallback((index: number) => {
    setActiveIndex(prev => (prev === index ? null : index))
  }, [])

  if (data.segments.length === 0) {
    return <div className="text-center py-12 text-gray-500">Roteiro sem segmentos.</div>
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-gray-200">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{data.title}</h1>
          <p className="text-sm text-gray-500">
            {data.segments.length} segmento{data.segments.length !== 1 ? 's' : ''}
          </p>
        </div>
        {data.duration && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 flex-shrink-0">
            <Clock className="w-4 h-4 text-gray-400" />
            {data.duration}
          </div>
        )}
      </div>

      {data.audioUrl && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2">
            Audio literal gerado
          </p>
          <audio controls preload="metadata" className="w-full">
            <source src={data.audioUrl} type={data.audioMimeType || 'audio/mpeg'} />
            Seu navegador nao suporta reproducao de audio.
          </audio>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(SEGMENT_STYLES).map(([key, style]) => (
          <span key={key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${style.badge}`}>
            {style.icon}
            {style.label}
          </span>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex flex-col">
        {data.segments.map((segment, idx) => (
          <SegmentCard
            key={idx}
            segment={segment}
            index={idx}
            isActive={activeIndex === idx}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* Production notes (collapsible) */}
      {data.productionNotes && data.productionNotes.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setNotesOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="text-sm font-semibold text-gray-700">
              Notas de Producao ({data.productionNotes.length})
            </span>
            {notesOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {notesOpen && (
            <div className="px-5 py-4 space-y-2 bg-white">
              {data.productionNotes.map((note, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 font-mono mt-0.5 flex-shrink-0">
                    {String(i + 1).padStart(2, '0')}.
                  </span>
                  <p className="text-sm text-gray-600 leading-relaxed">{note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
