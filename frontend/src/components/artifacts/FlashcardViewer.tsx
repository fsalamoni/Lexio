/**
 * FlashcardViewer — interactive flashcard study mode with flip animations,
 * category filtering, difficulty badges, and progress tracking.
 * Inspired by Anki/Quizlet.
 */

import { useState, useCallback, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Shuffle, RotateCcw,
  CheckCircle2, XCircle, Filter, Eye, EyeOff,
} from 'lucide-react'
import type { ParsedFlashcards, ParsedFlashcard } from './artifact-parsers'

// ── Types ───────────────────────────────────────────────────────────────────

interface FlatCard extends ParsedFlashcard {
  category: string
  index: number
}

type StudyResult = 'correct' | 'incorrect' | null

// ── Difficulty badge ────────────────────────────────────────────────────────

const DIFFICULTY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  basico:        { bg: 'bg-green-100', text: 'text-green-700', label: 'Básico' },
  intermediario: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Intermediário' },
  avancado:      { bg: 'bg-red-100', text: 'text-red-700', label: 'Avançado' },
}

function DifficultyBadge({ difficulty }: { difficulty?: string }) {
  if (!difficulty) return null
  const style = DIFFICULTY_STYLES[difficulty] || { bg: 'bg-gray-100', text: 'text-gray-600', label: difficulty }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

interface FlashcardViewerProps {
  data: ParsedFlashcards
}

export default function FlashcardViewer({ data }: FlashcardViewerProps) {
  // Flatten all cards with category info
  const allCards = useMemo<FlatCard[]>(() => {
    let idx = 0
    return data.categories.flatMap(cat =>
      cat.cards.map(card => ({ ...card, category: cat.name, index: idx++ }))
    )
  }, [data])

  const categories = useMemo(() => data.categories.map(c => c.name), [data])

  // State
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterDifficulty, setFilterDifficulty] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [results, setResults] = useState<Map<number, StudyResult>>(new Map())
  const [studyMode, setStudyMode] = useState(false)
  const [shuffled, setShuffled] = useState(false)
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([])

  // Filtered cards
  const filteredCards = useMemo(() => {
    let cards = allCards
    if (filterCategory) cards = cards.filter(c => c.category === filterCategory)
    if (filterDifficulty) cards = cards.filter(c => c.difficulty === filterDifficulty)
    if (studyMode) {
      // In review mode, only show incorrect or unanswered
      cards = cards.filter(c => results.get(c.index) !== 'correct')
    }
    if (shuffled && shuffleOrder.length > 0) {
      const indexSet = new Set(cards.map(c => c.index))
      return shuffleOrder.filter(i => indexSet.has(i)).map(i => cards.find(c => c.index === i)!)
    }
    return cards
  }, [allCards, filterCategory, filterDifficulty, studyMode, results, shuffled, shuffleOrder])

  const currentCard = filteredCards[currentIndex] || null
  const totalCards = filteredCards.length
  const correctCount = Array.from(results.values()).filter(r => r === 'correct').length
  const incorrectCount = Array.from(results.values()).filter(r => r === 'incorrect').length

  // Navigation
  const goNext = useCallback(() => {
    setIsFlipped(false)
    setCurrentIndex(prev => Math.min(prev + 1, totalCards - 1))
  }, [totalCards])

  const goPrev = useCallback(() => {
    setIsFlipped(false)
    setCurrentIndex(prev => Math.max(prev - 1, 0))
  }, [])

  const handleShuffle = useCallback(() => {
    const order = allCards.map(c => c.index)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]]
    }
    setShuffleOrder(order)
    setShuffled(true)
    setCurrentIndex(0)
    setIsFlipped(false)
  }, [allCards])

  const handleReset = useCallback(() => {
    setResults(new Map())
    setCurrentIndex(0)
    setIsFlipped(false)
    setStudyMode(false)
    setShuffled(false)
  }, [])

  const markResult = useCallback((result: StudyResult) => {
    if (!currentCard) return
    setResults(prev => new Map(prev).set(currentCard.index, result))
    goNext()
  }, [currentCard, goNext])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault()
        setIsFlipped(f => !f)
        break
      case 'ArrowRight':
        goNext()
        break
      case 'ArrowLeft':
        goPrev()
        break
      case '1':
        if (isFlipped) markResult('correct')
        break
      case '2':
        if (isFlipped) markResult('incorrect')
        break
    }
  }, [goNext, goPrev, isFlipped, markResult])

  if (allCards.length === 0) {
    return <div className="text-center py-12" style={{ color: 'var(--v2-ink-faint)' }}>Nenhum cartão encontrado.</div>
  }

  // End state
  if (totalCards === 0 && studyMode) {
    return (
      <div className="text-center py-16 space-y-4">
        <CheckCircle2 className="w-16 h-16 mx-auto" style={{ color: 'var(--v2-accent-strong)' }} />
        <h3 className="text-xl font-bold" style={{ color: 'var(--v2-ink-strong)' }}>Parabéns!</h3>
        <p style={{ color: 'var(--v2-ink-soft)' }}>Você acertou todos os {allCards.length} cartões!</p>
        <div className="flex justify-center gap-3">
          <button onClick={handleReset} className="px-4 py-2 text-white rounded-lg transition-colors" style={{ background: 'var(--v2-accent-strong)' }}>
            Recomeçar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Stats bar */}
      <div className="w-full max-w-2xl flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span style={{ color: 'var(--v2-ink-faint)' }}>
            {currentIndex + 1} / {totalCards}
          </span>
          {results.size > 0 && (
            <>
              <span className="flex items-center gap-1" style={{ color: '#16a34a' }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> {correctCount}
              </span>
              <span className="flex items-center gap-1" style={{ color: '#dc2626' }}>
                <XCircle className="w-3.5 h-3.5" /> {incorrectCount}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className="p-2 rounded-lg transition-colors"
            style={showFilters
              ? { background: 'rgba(15,118,110,0.10)', color: 'var(--v2-accent-strong)' }
              : { color: 'var(--v2-ink-faint)' }}
            title="Filtros"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={handleShuffle}
            className="p-2 rounded-lg transition-colors"
            style={shuffled
              ? { background: 'rgba(124,58,237,0.10)', color: '#7c3aed' }
              : { color: 'var(--v2-ink-faint)' }}
            title="Embaralhar"
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setStudyMode(m => !m)}
            className="p-2 rounded-lg transition-colors"
            style={studyMode
              ? { background: 'rgba(217,119,6,0.10)', color: '#d97706' }
              : { color: 'var(--v2-ink-faint)' }}
            title={studyMode ? 'Mostrar todos' : 'Modo revisão (só erros)'}
          >
            {studyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={handleReset}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--v2-ink-faint)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title="Reiniciar"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-2xl h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(15,23,42,0.08)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${totalCards > 0 ? ((currentIndex + 1) / totalCards) * 100 : 0}%`, background: 'var(--v2-accent-strong)' }}
        />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="w-full max-w-2xl flex flex-wrap gap-2 p-3 rounded-xl" style={{ background: 'rgba(15,23,42,0.04)', border: '1px solid var(--v2-line-soft)' }}>
          <span className="text-xs font-medium self-center mr-2" style={{ color: 'var(--v2-ink-faint)' }}>Categoria:</span>
          <button
            onClick={() => { setFilterCategory(null); setCurrentIndex(0); setIsFlipped(false) }}
            className="px-2.5 py-1 text-xs rounded-full transition-colors"
            style={!filterCategory
              ? { background: 'var(--v2-accent-strong)', color: '#fff' }
              : { background: '#fff', border: '1px solid var(--v2-line-soft)', color: 'var(--v2-ink-soft)' }}
          >
            Todas
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => { setFilterCategory(cat); setCurrentIndex(0); setIsFlipped(false) }}
              className="px-2.5 py-1 text-xs rounded-full transition-colors"
              style={filterCategory === cat
                ? { background: 'var(--v2-accent-strong)', color: '#fff' }
                : { background: '#fff', border: '1px solid var(--v2-line-soft)', color: 'var(--v2-ink-soft)' }}
            >
              {cat}
            </button>
          ))}
          <div className="w-px h-6 mx-1 self-center" style={{ background: 'var(--v2-line-soft)' }} />
          <span className="text-xs font-medium self-center mr-2" style={{ color: 'var(--v2-ink-faint)' }}>Nível:</span>
          {['basico', 'intermediario', 'avancado'].map(d => (
            <button
              key={d}
              onClick={() => { setFilterDifficulty(filterDifficulty === d ? null : d); setCurrentIndex(0); setIsFlipped(false) }}
              className="px-2.5 py-1 text-xs rounded-full transition-colors"
              style={filterDifficulty === d
                ? { background: 'var(--v2-accent-strong)', color: '#fff' }
                : { background: '#fff', border: '1px solid var(--v2-line-soft)', color: 'var(--v2-ink-soft)' }}
            >
              {DIFFICULTY_STYLES[d]?.label || d}
            </button>
          ))}
        </div>
      )}

      {/* Card */}
      {currentCard && (
        <div className="w-full max-w-2xl perspective-1000">
          <div
            onClick={() => setIsFlipped(f => !f)}
            className="relative w-full min-h-[320px] cursor-pointer"
            style={{ perspective: '1000px' }}
          >
            <div
              className="relative w-full h-full transition-transform duration-500"
              style={{
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
            >
              {/* Front */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-2xl shadow-lg"
                style={{ background: '#fff', border: '2px solid var(--v2-line-soft)', backfaceVisibility: 'hidden' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-medium" style={{ color: 'var(--v2-ink-faint)' }}>{currentCard.category}</span>
                  <DifficultyBadge difficulty={currentCard.difficulty} />
                </div>
                <p className="text-lg text-center font-medium leading-relaxed" style={{ color: 'var(--v2-ink-strong)' }}>
                  {currentCard.front}
                </p>
                <p className="mt-6 text-xs" style={{ color: 'var(--v2-ink-faint)' }}>Clique ou pressione Espaço para virar</p>
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-2xl shadow-lg"
                style={{ background: 'rgba(15,118,110,0.06)', border: '2px solid rgba(15,118,110,0.25)', backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <p className="text-base text-center leading-relaxed" style={{ color: 'var(--v2-ink-strong)' }}>
                  {currentCard.back}
                </p>
                {currentCard.tip && (
                  <div className="mt-4 px-4 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.7)' }}>
                    <p className="text-xs" style={{ color: 'var(--v2-accent-strong)' }}>💡 {currentCard.tip}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation + Study buttons */}
      <div className="w-full max-w-2xl flex items-center justify-between">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="p-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          style={{ color: 'var(--v2-ink-soft)' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(15,23,42,0.07)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {isFlipped && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => markResult('incorrect')}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors font-medium text-sm"
            >
              <XCircle className="w-4 h-4" /> Não sei (2)
            </button>
            <button
              onClick={() => markResult('correct')}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors font-medium text-sm"
            >
              <CheckCircle2 className="w-4 h-4" /> Sei (1)
            </button>
          </div>
        )}

        <button
          onClick={goNext}
          disabled={currentIndex >= totalCards - 1}
          className="p-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          style={{ color: 'var(--v2-ink-soft)' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(15,23,42,0.07)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-[10px] text-center" style={{ color: 'var(--v2-ink-faint)' }}>
        ← → navegar · Espaço virar · 1 sei · 2 não sei
      </p>
    </div>
  )
}
