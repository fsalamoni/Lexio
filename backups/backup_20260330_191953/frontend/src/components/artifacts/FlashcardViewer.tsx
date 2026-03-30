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
    return <div className="text-center py-12 text-gray-500">Nenhum cartão encontrado.</div>
  }

  // End state
  if (totalCards === 0 && studyMode) {
    return (
      <div className="text-center py-16 space-y-4">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
        <h3 className="text-xl font-bold text-gray-900">Parabéns!</h3>
        <p className="text-gray-600">Você acertou todos os {allCards.length} cartões!</p>
        <div className="flex justify-center gap-3">
          <button onClick={handleReset} className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors">
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
          <span className="text-gray-500">
            {currentIndex + 1} / {totalCards}
          </span>
          {results.size > 0 && (
            <>
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> {correctCount}
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <XCircle className="w-3.5 h-3.5" /> {incorrectCount}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`p-2 rounded-lg transition-colors ${showFilters ? 'bg-brand-50 text-brand-600' : 'hover:bg-gray-100 text-gray-500'}`}
            title="Filtros"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={handleShuffle}
            className={`p-2 rounded-lg transition-colors ${shuffled ? 'bg-purple-50 text-purple-600' : 'hover:bg-gray-100 text-gray-500'}`}
            title="Embaralhar"
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setStudyMode(m => !m)}
            className={`p-2 rounded-lg transition-colors ${studyMode ? 'bg-amber-50 text-amber-600' : 'hover:bg-gray-100 text-gray-500'}`}
            title={studyMode ? 'Mostrar todos' : 'Modo revisão (só erros)'}
          >
            {studyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={handleReset}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="Reiniciar"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-2xl h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 transition-all duration-300"
          style={{ width: `${totalCards > 0 ? ((currentIndex + 1) / totalCards) * 100 : 0}%` }}
        />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="w-full max-w-2xl flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl">
          <span className="text-xs font-medium text-gray-500 self-center mr-2">Categoria:</span>
          <button
            onClick={() => { setFilterCategory(null); setCurrentIndex(0); setIsFlipped(false) }}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${!filterCategory ? 'bg-brand-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
          >
            Todas
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => { setFilterCategory(cat); setCurrentIndex(0); setIsFlipped(false) }}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${filterCategory === cat ? 'bg-brand-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
            >
              {cat}
            </button>
          ))}
          <div className="w-px h-6 bg-gray-200 mx-1 self-center" />
          <span className="text-xs font-medium text-gray-500 self-center mr-2">Nível:</span>
          {['basico', 'intermediario', 'avancado'].map(d => (
            <button
              key={d}
              onClick={() => { setFilterDifficulty(filterDifficulty === d ? null : d); setCurrentIndex(0); setIsFlipped(false) }}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${filterDifficulty === d ? 'bg-brand-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
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
                className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-lg border-2 border-gray-100"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-gray-400 font-medium">{currentCard.category}</span>
                  <DifficultyBadge difficulty={currentCard.difficulty} />
                </div>
                <p className="text-lg text-center text-gray-900 font-medium leading-relaxed">
                  {currentCard.front}
                </p>
                <p className="mt-6 text-xs text-gray-400">Clique ou pressione Espaço para virar</p>
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-brand-50 rounded-2xl shadow-lg border-2 border-brand-200"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <p className="text-base text-center text-gray-800 leading-relaxed">
                  {currentCard.back}
                </p>
                {currentCard.tip && (
                  <div className="mt-4 px-4 py-2 bg-white/60 rounded-lg">
                    <p className="text-xs text-brand-700">💡 {currentCard.tip}</p>
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
          className="p-3 rounded-xl hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
          className="p-3 rounded-xl hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-[10px] text-gray-400 text-center">
        ← → navegar · Espaço virar · 1 sei · 2 não sei
      </p>
    </div>
  )
}
