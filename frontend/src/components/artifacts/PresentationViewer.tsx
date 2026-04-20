/**
 * PresentationViewer — slide presentation viewer with navigation, speaker notes,
 * fullscreen mode, thumbnail strip, and keyboard shortcuts.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  StickyNote, Image, Pencil, Check,
} from 'lucide-react'
import type { ParsedPresentation, ParsedSlide } from './artifact-parsers'

// ── Props ──────────────────────────────────────────────────────────────────

interface PresentationViewerProps {
  data: ParsedPresentation
  onChange?: (data: ParsedPresentation) => void
}

// ── Slide Content (reused in main view and fullscreen) ─────────────────────

function SlideContent({ slide, large }: { slide: ParsedSlide; large?: boolean }) {
  if (slide.renderedImageUrl) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="relative flex-1 min-h-0 overflow-hidden bg-gray-100">
          <img
            src={slide.renderedImageUrl}
            alt={slide.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-6 sm:px-10 py-6 text-left text-white">
            <h2 className={`${large ? 'text-3xl sm:text-5xl' : 'text-xl sm:text-3xl'} font-bold leading-tight`}>
              {slide.title}
            </h2>
            {slide.bullets.length > 0 && (
              <ul className={`mt-4 space-y-2 ${large ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'}`}>
                {slide.bullets.slice(0, 4).map((bullet, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.9)' }} />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 sm:px-12 py-8 text-center">
      <h2
        className={`font-bold leading-tight mb-6 ${
          large ? 'text-3xl sm:text-5xl' : 'text-xl sm:text-3xl'
        }`}
      >
        {slide.title}
      </h2>

      {slide.bullets.length > 0 && (
        <ul className={`text-left space-y-3 max-w-2xl w-full ${large ? 'text-lg sm:text-2xl' : 'text-sm sm:text-base'}`}>
          {slide.bullets.map((bullet, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: 'var(--v2-accent-strong)' }} />
              <span style={{ color: 'var(--v2-ink-strong)' }}>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {slide.visualSuggestion && (
        <div className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: 'rgba(15,118,110,0.08)', color: 'var(--v2-accent-strong)' }}>
          <Image className="h-3.5 w-3.5" />
          {slide.visualSuggestion}
        </div>
      )}
    </div>
  )
}

// ── Thumbnail ──────────────────────────────────────────────────────────────

function Thumbnail({
  slide,
  isActive,
  onClick,
}: {
  slide: ParsedSlide
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg overflow-hidden transition-all focus:outline-none"
      style={{
        border: isActive ? `2px solid var(--v2-accent-strong)` : '2px solid var(--v2-line-soft)',
        opacity: isActive ? 1 : 0.65,
        boxShadow: isActive ? '0 2px 8px rgba(15,118,110,0.20)' : 'none',
      }}
      aria-label={`Ir para slide ${slide.number}`}
    >
      <div className="aspect-video flex flex-col items-center justify-center p-2 text-center overflow-hidden" style={{ background: 'var(--v2-panel-strong)' }}>
        {slide.renderedImageUrl ? (
          <img src={slide.renderedImageUrl} alt={slide.title} className="h-full w-full object-cover" />
        ) : (
          <>
            <p className="text-[10px] font-semibold leading-tight line-clamp-2" style={{ color: 'var(--v2-ink-strong)' }}>
              {slide.title}
            </p>
            {slide.bullets.length > 0 && (
              <p className="text-[8px] mt-1 line-clamp-1" style={{ color: 'var(--v2-ink-faint)' }}>
                {slide.bullets[0]}
              </p>
            )}
          </>
        )}
      </div>
      <div className="text-[9px] text-center py-0.5" style={{ background: 'rgba(15,23,42,0.04)', color: 'var(--v2-ink-faint)' }}>
        {slide.number}
      </div>
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PresentationViewer({ data, onChange }: PresentationViewerProps) {
  const { slides } = data
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showNotes, setShowNotes] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fadeKey, setFadeKey] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [editedSlides, setEditedSlides] = useState<ParsedSlide[]>(() => slides.map(s => ({ ...s, bullets: [...s.bullets] })))
  const thumbnailRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const slide = editMode ? editedSlides[currentIndex] : slides[currentIndex]
  const total = slides.length

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, total - 1))
      if (clamped !== currentIndex) {
        setCurrentIndex(clamped)
        setFadeKey((k) => k + 1)
      }
    },
    [currentIndex, total],
  )

  const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex])
  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex])
  const toggleNotes = useCallback(() => setShowNotes((v) => !v), [])
  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), [])

  // Scroll active thumbnail into view
  useEffect(() => {
    if (!thumbnailRef.current) return
    const active = thumbnailRef.current.children[currentIndex] as HTMLElement | undefined
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [currentIndex])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Skip if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          goPrev()
          break
        case 'ArrowRight':
          e.preventDefault()
          goNext()
          break
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'n':
        case 'N':
          e.preventDefault()
          toggleNotes()
          break
        case 'Escape':
          if (isFullscreen) {
            e.preventDefault()
            setIsFullscreen(false)
          }
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goPrev, goNext, toggleFullscreen, toggleNotes, isFullscreen])

  // Prevent body scroll when fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isFullscreen])

  if (total === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--v2-ink-faint)' }}>
        Nenhum slide encontrado na apresentacao.
      </div>
    )
  }

  // ── Fullscreen overlay ───────────────────────────────────────────────────

  if (isFullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 bg-gray-900 flex flex-col"
        role="dialog"
        aria-label="Apresentacao em tela cheia"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 text-white/80 text-sm">
          <span className="font-medium truncate max-w-[60%]">
            {data.title || slide.title}
          </span>
          <div className="flex items-center gap-3">
            <span>
              {currentIndex + 1} / {total}
            </span>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              aria-label="Sair da tela cheia"
            >
              <Minimize2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Slide area */}
        <div className="flex-1 flex items-center justify-center relative px-4">
          {/* Prev button */}
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="absolute left-2 sm:left-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-colors z-10"
            aria-label="Slide anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div
            key={fadeKey}
            className="w-full max-w-5xl aspect-video bg-white rounded-xl shadow-2xl overflow-hidden animate-fade-in"
            style={{ animation: 'fadeIn 300ms ease-out' }}
          >
            <SlideContent slide={slide} large />
          </div>

          {/* Next button */}
          <button
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className="absolute right-2 sm:right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-colors z-10"
            aria-label="Proximo slide"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>

        {/* Speaker notes in fullscreen */}
        {showNotes && slide.speakerNotes && (
          <div className="px-6 py-3 bg-gray-800 border-t border-gray-700 max-h-32 overflow-y-auto">
            <p className="text-sm text-gray-300 leading-relaxed">{slide.speakerNotes}</p>
          </div>
        )}

        {/* Bottom controls */}
        <div className="flex items-center justify-center gap-2 px-4 py-2">
          <button
            onClick={toggleNotes}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              showNotes
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            }`}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Notas
          </button>
        </div>

        {/* Inline keyframes */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.98); }
            to   { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    )
  }

  // ── Normal view ──────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {/* Title */}
      {data.title && (
        <h3 className="text-lg font-semibold px-1" style={{ color: 'var(--v2-ink-strong)', fontFamily: 'var(--v2-font-sans)' }}>{data.title}</h3>
      )}

      {/* Main area: vertical thumbnail panel (left) + slide content (right) */}
      <div className="flex gap-3 items-start">
        {/* Vertical thumbnail strip */}
        {total > 1 && (
          <div
            ref={thumbnailRef}
            className="flex flex-col gap-1.5 overflow-y-auto"
            style={{ width: '108px', flexShrink: 0, maxHeight: '480px' }}
          >
            {slides.map((s, i) => (
              <Thumbnail
                key={i}
                slide={s}
                isActive={i === currentIndex}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        )}

        {/* Slide area */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="relative rounded-xl border overflow-hidden" style={{ background: 'var(--v2-panel-strong)', borderColor: 'var(--v2-line-soft)', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
            {/* Controls bar */}
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ background: 'rgba(255,255,255,0.6)', borderColor: 'var(--v2-line-soft)' }}>
              <div className="flex items-center gap-1">
                <button
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className="p-1.5 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  style={{ color: 'var(--v2-ink-soft)' }}
                  aria-label="Slide anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-medium tabular-nums min-w-[4rem] text-center" style={{ color: 'var(--v2-ink-faint)' }}>
                  {currentIndex + 1} / {total}
                </span>
                <button
                  onClick={goNext}
                  disabled={currentIndex === total - 1}
                  className="p-1.5 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  style={{ color: 'var(--v2-ink-soft)' }}
                  aria-label="Proximo slide"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                {onChange && (
                  <button
                    onClick={() => {
                      if (editMode && onChange) onChange({ ...data, slides: editedSlides })
                      setEditMode(m => !m)
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                    style={editMode
                      ? { background: 'rgba(15,118,110,0.10)', color: 'var(--v2-accent-strong)' }
                      : { color: 'var(--v2-ink-faint)' }}
                    aria-label={editMode ? 'Salvar edições' : 'Editar slide'}
                  >
                    {editMode ? <><Check className="h-3.5 w-3.5" /><span className="hidden sm:inline">Salvar</span></> : <><Pencil className="h-3.5 w-3.5" /><span className="hidden sm:inline">Editar</span></>}
                  </button>
                )}
                <button
                  onClick={toggleNotes}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                  style={showNotes ? { background: 'rgba(37,99,235,0.10)', color: '#2563eb' } : { color: 'var(--v2-ink-faint)' }}
                  aria-label={showNotes ? 'Ocultar notas' : 'Mostrar notas'}
                >
                  <StickyNote className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Notas</span>
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                  style={{ color: 'var(--v2-ink-faint)' }}
                  aria-label="Tela cheia"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Tela cheia</span>
                </button>
              </div>
            </div>

            {/* Current slide */}
            <div
              key={fadeKey}
              className="aspect-video"
              style={{ background: 'var(--v2-panel-strong)', animation: 'fadeIn 250ms ease-out' }}
            >
              <SlideContent slide={slide} />
            </div>
          </div>

          {/* Edit panel */}
          {editMode && onChange && (
            <div className="rounded-xl border p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.6)', borderColor: 'var(--v2-line-soft)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--v2-ink-faint)' }}>Editar slide {currentIndex + 1}</p>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--v2-ink-soft)' }}>Título</label>
                <input
                  type="text"
                  value={editedSlides[currentIndex]?.title ?? ''}
                  onChange={e => {
                    const updated = editedSlides.map((s, i) => i === currentIndex ? { ...s, title: e.target.value } : s)
                    setEditedSlides(updated)
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg outline-none"
                  style={{ border: '1px solid var(--v2-line-soft)', background: 'var(--v2-panel-strong)', color: 'var(--v2-ink-strong)', fontFamily: 'var(--v2-font-sans)' }}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--v2-ink-soft)' }}>Tópicos (um por linha)</label>
                <textarea
                  value={(editedSlides[currentIndex]?.bullets ?? []).join('\n')}
                  onChange={e => {
                    const updated = editedSlides.map((s, i) => i === currentIndex ? { ...s, bullets: e.target.value.split('\n') } : s)
                    setEditedSlides(updated)
                  }}
                  rows={4}
                  className="w-full px-3 py-2 text-sm rounded-lg outline-none resize-none"
                  style={{ border: '1px solid var(--v2-line-soft)', background: 'var(--v2-panel-strong)', color: 'var(--v2-ink-strong)', fontFamily: 'var(--v2-font-sans)' }}
                />
              </div>
            </div>
          )}

          {/* Speaker notes panel */}
          {showNotes && (
            <div className="rounded-lg border px-4 py-3" style={{ background: 'rgba(37,99,235,0.04)', borderColor: 'rgba(37,99,235,0.2)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: '#2563eb' }}>Notas do apresentador</p>
              {slide.speakerNotes ? (
                <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--v2-ink-strong)' }}>
                  {slide.speakerNotes}
                </p>
              ) : (
                <p className="text-sm italic" style={{ color: 'var(--v2-ink-faint)' }}>Nenhuma nota para este slide.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard hints */}
      <p className="text-[10px] text-center" style={{ color: 'var(--v2-ink-faint)' }}>
        Atalhos: <kbd className="px-1 py-0.5 rounded border text-[9px]" style={{ borderColor: 'var(--v2-line-soft)', background: 'rgba(15,23,42,0.04)' }}>&#8592;</kbd>{' '}
        <kbd className="px-1 py-0.5 rounded border text-[9px]" style={{ borderColor: 'var(--v2-line-soft)', background: 'rgba(15,23,42,0.04)' }}>&#8594;</kbd> navegar{' '}
        <kbd className="px-1 py-0.5 rounded border text-[9px]" style={{ borderColor: 'var(--v2-line-soft)', background: 'rgba(15,23,42,0.04)' }}>F</kbd> tela cheia{' '}
        <kbd className="px-1 py-0.5 rounded border text-[9px]" style={{ borderColor: 'var(--v2-line-soft)', background: 'rgba(15,23,42,0.04)' }}>N</kbd> notas{' '}
        <kbd className="px-1 py-0.5 rounded border text-[9px]" style={{ borderColor: 'var(--v2-line-soft)', background: 'rgba(15,23,42,0.04)' }}>Esc</kbd> sair
      </p>

      {/* Inline keyframes for fade animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
