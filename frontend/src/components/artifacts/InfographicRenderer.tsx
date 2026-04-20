/**
 * InfographicRenderer — magazine-style infographic display with animated
 * stat counters, colored section cards, and a clean editorial layout.
 */

import { useState, useEffect, useRef } from 'react'
import { BookOpen, Quote } from 'lucide-react'
import type { ParsedInfographic, InfographicStat } from './artifact-parsers'

// ── Section background palette ─────────────────────────────────────────────

const SECTION_BG = [
  'bg-teal-50 border-teal-200',
  'bg-blue-50 border-blue-200',
  'bg-purple-50 border-purple-200',
  'bg-amber-50 border-amber-200',
  'bg-emerald-50 border-emerald-200',
  'bg-rose-50 border-rose-200',
  'bg-cyan-50 border-cyan-200',
  'bg-indigo-50 border-indigo-200',
]

const HIGHLIGHT_COLOR = [
  'text-teal-700',
  'text-blue-700',
  'text-purple-700',
  'text-amber-700',
  'text-emerald-700',
  'text-rose-700',
  'text-cyan-700',
  'text-indigo-700',
]

const STAT_BG = [
  'bg-teal-100 text-teal-800',
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-800',
  'bg-rose-100 text-rose-800',
]

// ── Animated counter ───────────────────────────────────────────────────────

function AnimatedStat({ stat, colorClass }: { stat: InfographicStat; colorClass: string }) {
  const numericValue = typeof stat.value === 'number' ? stat.value : parseFloat(String(stat.value))
  const isNumeric = !isNaN(numericValue)
  const [displayValue, setDisplayValue] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (!isNumeric || hasAnimated.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true
          const duration = 1200
          const startTime = performance.now()
          const target = numericValue

          function tick(now: number) {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3)
            setDisplayValue(Math.round(target * eased))
            if (progress < 1) requestAnimationFrame(tick)
          }

          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.3 }
    )

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [isNumeric, numericValue])

  return (
    <div ref={ref} className={`flex flex-col items-center p-4 rounded-xl ${colorClass}`}>
      <span className="text-3xl font-extrabold tabular-nums leading-none">
        {isNumeric ? displayValue.toLocaleString('pt-BR') : String(stat.value)}
        {stat.unit && <span className="text-base font-semibold ml-1">{stat.unit}</span>}
      </span>
      <span className="text-xs font-medium mt-1.5 opacity-80 text-center">{stat.label}</span>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

interface InfographicRendererProps {
  data: ParsedInfographic
}

export default function InfographicRenderer({ data }: InfographicRendererProps) {
  if (data.sections.length === 0) {
    return <div className="text-center py-12" style={{ color: 'var(--v2-ink-faint)' }}>Infografico sem conteudo.</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {data.renderedImageUrl && (
        <div className="rounded-3xl overflow-hidden border shadow-sm bg-white" style={{ borderColor: 'var(--v2-line-soft)' }}>
          <img src={data.renderedImageUrl} alt={data.title} className="w-full h-auto object-cover" />
        </div>
      )}

      {/* Title section */}
      <div className="text-center space-y-2 pb-4 border-b" style={{ borderColor: 'var(--v2-line-soft)' }}>
        <h1 className="text-2xl sm:text-3xl font-bold leading-tight" style={{ color: 'var(--v2-ink-strong)', fontFamily: 'var(--v2-font-sans)' }}>
          {data.title}
        </h1>
        {data.subtitle && (
          <p className="text-base sm:text-lg max-w-2xl mx-auto" style={{ color: 'var(--v2-ink-faint)' }}>
            {data.subtitle}
          </p>
        )}
      </div>

      {/* Sections grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {data.sections.map((section, idx) => {
          const bgClass = SECTION_BG[idx % SECTION_BG.length]
          const highlightClass = HIGHLIGHT_COLOR[idx % HIGHLIGHT_COLOR.length]

          return (
            <div
              key={idx}
              className={`rounded-2xl border p-6 ${bgClass} transition-shadow hover:shadow-md`}
            >
              {/* Icon + Title */}
              <div className="flex items-start gap-3 mb-3">
                {section.icon && (
                  <span className="text-2xl leading-none flex-shrink-0" aria-hidden>
                    {section.icon}
                  </span>
                )}
                <h3 className="text-lg font-bold leading-snug" style={{ color: 'var(--v2-ink-strong)' }}>
                  {section.title}
                </h3>
              </div>

              {/* Content */}
              <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--v2-ink-soft)' }}>
                {section.content}
              </p>

              {/* Highlight */}
              {section.highlight && (
                <p className={`mt-3 text-sm font-semibold italic ${highlightClass}`}>
                  {section.highlight}
                </p>
              )}

              {/* Stats */}
              {section.stats && section.stats.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {section.stats.map((stat, si) => (
                    <AnimatedStat
                      key={si}
                      stat={stat}
                      colorClass={STAT_BG[(idx * 2 + si) % STAT_BG.length]}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Conclusion */}
      {data.conclusion && (
        <div className="w-full bg-gray-900 text-white rounded-2xl p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <Quote className="w-6 h-6 text-gray-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Conclusao
              </h3>
              <p className="text-base sm:text-lg leading-relaxed">{data.conclusion}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sources */}
      {data.sources && data.sources.length > 0 && (
        <div className="pt-4 border-t" style={{ borderColor: 'var(--v2-line-soft)' }}>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--v2-ink-faint)' }} />
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--v2-ink-faint)' }}>
              Fontes
            </span>
          </div>
          <ul className="space-y-1">
            {data.sources.map((source, i) => (
              <li key={i} className="text-xs text-gray-500 leading-relaxed">
                {source}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
