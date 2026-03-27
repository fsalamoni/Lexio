/**
 * QuizPlayer — interactive quiz/test player with multiple question types,
 * immediate feedback mode, scoring, and results summary.
 */

import { useState, useCallback, useMemo } from 'react'
import {
  CheckCircle2, XCircle, ChevronRight, ChevronLeft,
  Clock, Trophy, RotateCcw, Eye, Play,
} from 'lucide-react'
import type { ParsedQuiz, ParsedQuizQuestion } from './artifact-parsers'

// ── Types ───────────────────────────────────────────────────────────────────

interface UserAnswer {
  questionNumber: number
  answer: string
  isCorrect?: boolean
}

type QuizMode = 'preview' | 'exam' | 'study' | 'results'

// ── Question renderers ──────────────────────────────────────────────────────

function MultipleChoiceQuestion({
  question, userAnswer, onAnswer, showFeedback,
}: {
  question: ParsedQuizQuestion
  userAnswer?: string
  onAnswer: (answer: string) => void
  showFeedback: boolean
}) {
  return (
    <div className="space-y-3">
      {question.options?.map(opt => {
        const isSelected = userAnswer === opt.label
        const isCorrectAnswer = question.answer.toUpperCase().startsWith(opt.label.toUpperCase())
        let borderClass = 'border-gray-200 hover:border-brand-300 hover:bg-brand-50/30'
        if (isSelected && !showFeedback) borderClass = 'border-brand-500 bg-brand-50'
        if (showFeedback && isCorrectAnswer) borderClass = 'border-green-500 bg-green-50'
        if (showFeedback && isSelected && !isCorrectAnswer) borderClass = 'border-red-500 bg-red-50'

        return (
          <button
            key={opt.label}
            onClick={() => onAnswer(opt.label)}
            disabled={showFeedback}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${borderClass} disabled:cursor-default`}
          >
            <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              isSelected ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {opt.label}
            </span>
            <span className="text-sm text-gray-800 pt-1">{opt.text}</span>
            {showFeedback && isCorrectAnswer && <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-1 ml-auto" />}
            {showFeedback && isSelected && !isCorrectAnswer && <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-1 ml-auto" />}
          </button>
        )
      })}
    </div>
  )
}

function TrueFalseQuestion({
  question, userAnswer, onAnswer, showFeedback,
}: {
  question: ParsedQuizQuestion
  userAnswer?: string
  onAnswer: (answer: string) => void
  showFeedback: boolean
}) {
  const options = question.options?.length ? question.options : [
    { label: 'V', text: 'Verdadeiro' },
    { label: 'F', text: 'Falso' },
  ]
  return (
    <div className="flex gap-4">
      {options.map(opt => {
        const isSelected = userAnswer === opt.label
        const answerUpper = question.answer.toUpperCase()
        const isCorrectAnswer = answerUpper.startsWith(opt.label.toUpperCase()) || answerUpper === opt.text.toUpperCase()
        let cls = 'border-gray-200 hover:border-brand-300'
        if (isSelected && !showFeedback) cls = 'border-brand-500 bg-brand-50'
        if (showFeedback && isCorrectAnswer) cls = 'border-green-500 bg-green-50'
        if (showFeedback && isSelected && !isCorrectAnswer) cls = 'border-red-500 bg-red-50'

        return (
          <button
            key={opt.label}
            onClick={() => onAnswer(opt.label)}
            disabled={showFeedback}
            className={`flex-1 py-4 px-6 rounded-xl border-2 font-medium text-sm transition-all ${cls} disabled:cursor-default`}
          >
            {opt.text || opt.label}
          </button>
        )
      })}
    </div>
  )
}

function EssayQuestion({
  userAnswer, onAnswer, showFeedback,
}: {
  question: ParsedQuizQuestion
  userAnswer?: string
  onAnswer: (answer: string) => void
  showFeedback: boolean
}) {
  return (
    <textarea
      value={userAnswer || ''}
      onChange={e => onAnswer(e.target.value)}
      disabled={showFeedback}
      rows={5}
      placeholder="Digite sua resposta..."
      className="w-full p-4 border-2 border-gray-200 rounded-xl text-sm resize-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none disabled:bg-gray-50"
    />
  )
}

function AssociationQuestion({
  question, userAnswer, onAnswer, showFeedback,
}: {
  question: ParsedQuizQuestion
  userAnswer?: string
  onAnswer: (answer: string) => void
  showFeedback: boolean
}) {
  const pairs = question.pairs || []
  const userPairs: Record<string, string> = userAnswer ? JSON.parse(userAnswer) : {}

  const rightItems = useMemo(() => pairs.map(p => p.right), [pairs])

  const handleSelect = (left: string, right: string) => {
    const updated = { ...userPairs, [left]: right }
    onAnswer(JSON.stringify(updated))
  }

  return (
    <div className="space-y-3">
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="flex-1 p-3 bg-gray-50 rounded-lg text-sm font-medium text-gray-800">
            {pair.left}
          </div>
          <span className="text-gray-400">→</span>
          <select
            value={userPairs[pair.left] || ''}
            onChange={e => handleSelect(pair.left, e.target.value)}
            disabled={showFeedback}
            className={`flex-1 p-3 border-2 rounded-lg text-sm outline-none ${
              showFeedback
                ? userPairs[pair.left] === pair.right
                  ? 'border-green-500 bg-green-50'
                  : 'border-red-500 bg-red-50'
                : 'border-gray-200 focus:border-brand-500'
            } disabled:cursor-default`}
          >
            <option value="">Selecione...</option>
            {rightItems.map((r, j) => (
              <option key={j} value={r}>{r}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

// ── Question type badge ─────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  multipla_escolha: 'Múltipla Escolha',
  verdadeiro_falso: 'Verdadeiro/Falso',
  dissertativa: 'Dissertativa',
  caso_pratico: 'Caso Prático',
  associacao: 'Associação',
}

// ── Main Component ──────────────────────────────────────────────────────────

interface QuizPlayerProps {
  data: ParsedQuiz
}

export default function QuizPlayer({ data }: QuizPlayerProps) {
  const [mode, setMode] = useState<QuizMode>('preview')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<number, UserAnswer>>(new Map())

  const questions = data.questions
  const currentQ = questions[currentIndex] || null
  const totalQuestions = questions.length

  const currentAnswer = answers.get(currentQ?.number ?? -1)
  const isStudyMode = mode === 'study'

  // Calculate score
  const score = useMemo(() => {
    let correct = 0
    answers.forEach(a => { if (a.isCorrect) correct++ })
    return { correct, total: totalQuestions, percentage: Math.round((correct / totalQuestions) * 100) }
  }, [answers, totalQuestions])

  const handleAnswer = useCallback((questionNumber: number, answer: string) => {
    const q = questions.find(q => q.number === questionNumber)
    if (!q) return

    let isCorrect: boolean | undefined
    if (q.type === 'multipla_escolha' || q.type === 'verdadeiro_falso') {
      isCorrect = q.answer.toUpperCase().startsWith(answer.toUpperCase())
    } else if (q.type === 'associacao') {
      try {
        const userPairs = JSON.parse(answer) as Record<string, string>
        const pairs = q.pairs || []
        isCorrect = pairs.every(p => userPairs[p.left] === p.right)
      } catch { isCorrect = false }
    }
    // Dissertativa/caso_pratico: no auto-grading

    setAnswers(prev => new Map(prev).set(questionNumber, { questionNumber, answer, isCorrect }))
  }, [questions])

  const goNext = useCallback(() => setCurrentIndex(i => Math.min(i + 1, totalQuestions - 1)), [totalQuestions])
  const goPrev = useCallback(() => setCurrentIndex(i => Math.max(i - 1, 0)), [])

  const handleFinish = useCallback(() => setMode('results'), [])
  const handleRestart = useCallback(() => {
    setAnswers(new Map())
    setCurrentIndex(0)
    setMode('preview')
  }, [])

  const showFeedback = isStudyMode && !!currentAnswer?.answer

  // ── Preview screen ──────────────────────────────────────────────────────
  if (mode === 'preview') {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-6 py-8">
        <h2 className="text-2xl font-bold text-gray-900">{data.title}</h2>
        <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
          {data.difficulty && <span>Dificuldade: {data.difficulty}</span>}
          {data.estimatedTime && (
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {data.estimatedTime}</span>
          )}
          <span>{totalQuestions} questões</span>
        </div>

        {/* Question type breakdown */}
        <div className="flex flex-wrap justify-center gap-2">
          {Object.entries(
            questions.reduce((acc, q) => {
              acc[q.type] = (acc[q.type] || 0) + 1
              return acc
            }, {} as Record<string, number>)
          ).map(([type, count]) => (
            <span key={type} className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
              {TYPE_LABELS[type] || type}: {count}
            </span>
          ))}
        </div>

        <div className="flex justify-center gap-4 pt-4">
          <button
            onClick={() => setMode('study')}
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors font-medium"
          >
            <Eye className="w-4 h-4" /> Modo Estudo
          </button>
          <button
            onClick={() => setMode('exam')}
            className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-medium"
          >
            <Play className="w-4 h-4" /> Modo Prova
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Estudo: feedback imediato por questão · Prova: resultado apenas no final
        </p>
      </div>
    )
  }

  // ── Results screen ────────────────────────────────────────────────────────
  if (mode === 'results') {
    return (
      <div className="max-w-2xl mx-auto space-y-8 py-8">
        <div className="text-center space-y-4">
          <Trophy className={`w-16 h-16 mx-auto ${score.percentage >= 70 ? 'text-yellow-500' : 'text-gray-400'}`} />
          <h2 className="text-2xl font-bold text-gray-900">Resultado</h2>
          <div className="text-5xl font-bold text-brand-600">{score.percentage}%</div>
          <p className="text-gray-500">
            {score.correct} de {score.total} questões corretas
          </p>
        </div>

        {/* Question-by-question review */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Revisão</h3>
          {questions.map((q, i) => {
            const ua = answers.get(q.number)
            const isCorrect = ua?.isCorrect
            return (
              <div key={i} className={`p-4 rounded-xl border-2 ${
                isCorrect === true ? 'border-green-200 bg-green-50/50' :
                isCorrect === false ? 'border-red-200 bg-red-50/50' :
                'border-gray-200'
              }`}>
                <div className="flex items-start gap-3">
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCorrect === true ? 'bg-green-500 text-white' :
                    isCorrect === false ? 'bg-red-500 text-white' :
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {q.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 font-medium">{q.text}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Sua resposta: <span className="font-medium">{ua?.answer || '(sem resposta)'}</span>
                      {' · '}Correta: <span className="font-medium text-green-700">{q.answer}</span>
                    </p>
                    {q.explanation && (
                      <p className="text-xs text-gray-600 mt-2 p-2 bg-white/60 rounded-lg">{q.explanation}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-center">
          <button onClick={handleRestart} className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors font-medium">
            <RotateCcw className="w-4 h-4" /> Recomeçar
          </button>
        </div>
      </div>
    )
  }

  // ── Quiz playing (study or exam) ────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 font-medium">
          Questão {currentIndex + 1} de {totalQuestions}
        </span>
        <span className="text-xs px-2.5 py-1 bg-gray-100 rounded-full text-gray-500">
          {isStudyMode ? 'Modo Estudo' : 'Modo Prova'}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }} />
      </div>

      {/* Question */}
      {currentQ && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-medium text-gray-500">
              {TYPE_LABELS[currentQ.type] || currentQ.type}
            </span>
          </div>
          <p className="text-base font-medium text-gray-900 leading-relaxed">{currentQ.text}</p>

          {/* Render by type */}
          {(currentQ.type === 'multipla_escolha') && (
            <MultipleChoiceQuestion
              question={currentQ}
              userAnswer={currentAnswer?.answer}
              onAnswer={a => handleAnswer(currentQ.number, a)}
              showFeedback={showFeedback}
            />
          )}
          {currentQ.type === 'verdadeiro_falso' && (
            <TrueFalseQuestion
              question={currentQ}
              userAnswer={currentAnswer?.answer}
              onAnswer={a => handleAnswer(currentQ.number, a)}
              showFeedback={showFeedback}
            />
          )}
          {(currentQ.type === 'dissertativa' || currentQ.type === 'caso_pratico') && (
            <EssayQuestion
              question={currentQ}
              userAnswer={currentAnswer?.answer}
              onAnswer={a => handleAnswer(currentQ.number, a)}
              showFeedback={showFeedback}
            />
          )}
          {currentQ.type === 'associacao' && (
            <AssociationQuestion
              question={currentQ}
              userAnswer={currentAnswer?.answer}
              onAnswer={a => handleAnswer(currentQ.number, a)}
              showFeedback={showFeedback}
            />
          )}

          {/* Feedback (study mode) */}
          {showFeedback && currentQ.explanation && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-xs font-medium text-blue-700 mb-1">Explicação</p>
              <p className="text-sm text-blue-800">{currentQ.explanation}</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>

        {/* Question dots */}
        <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
          {questions.map((q, i) => {
            const ua = answers.get(q.number)
            let dotClass = 'bg-gray-200'
            if (i === currentIndex) dotClass = 'bg-brand-500 ring-2 ring-brand-200'
            else if (ua?.isCorrect === true) dotClass = 'bg-green-500'
            else if (ua?.isCorrect === false) dotClass = 'bg-red-500'
            else if (ua) dotClass = 'bg-brand-300'
            return (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${dotClass}`}
              />
            )
          })}
        </div>

        {currentIndex === totalQuestions - 1 ? (
          <button
            onClick={handleFinish}
            className="flex items-center gap-1 px-4 py-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors text-sm font-medium"
          >
            Finalizar <Trophy className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={goNext}
            className="flex items-center gap-1 px-4 py-2 rounded-xl hover:bg-gray-100 transition-colors text-sm"
          >
            Próxima <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
